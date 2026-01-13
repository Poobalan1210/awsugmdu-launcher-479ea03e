import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  signIn as amplifySignIn, 
  signOut as amplifySignOut,
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  resendSignUpCode as amplifyResendSignUpCode,
  getCurrentUser,
  fetchAuthSession,
  type SignInOutput,
  type SignUpOutput,
} from 'aws-amplify/auth';
import { uploadData } from 'aws-amplify/storage';
import { User } from '@/data/mockData';
import { createUserProfile } from '@/lib/userProfile';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<SignUpOutput>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendConfirmationCode: (email: string) => Promise<void>;
  uploadProfilePhoto: (file: File, userId: string) => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user profile from DynamoDB
  const fetchUserProfile = async (userId: string, email: string): Promise<User | null> => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      
      // Get user attributes from Cognito
      const attributes = currentUser.signInDetails?.loginId 
        ? { email, name: currentUser.signInDetails.loginId }
        : { email, name: email.split('@')[0] };
      
      // TODO: Fetch full profile from DynamoDB via API
      // For now, return a basic user object
      return {
        id: userId,
        email: email,
        name: attributes.name || email.split('@')[0],
        avatar: '',
        points: 0,
        rank: 0,
        badges: [],
        joinedDate: new Date().toISOString(),
        role: 'participant',
      } as User;
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      return null;
    }
  };

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      
      if (currentUser && session.tokens) {
        const userId = currentUser.userId;
        const email = currentUser.signInDetails?.loginId || '';
        const profile = await fetchUserProfile(userId, email);
        setUser(profile);
      } else {
        setUser(null);
      }
    } catch (error) {
      // User is not authenticated
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const output = await amplifySignIn({ username: email, password });
      
      if (output.isSignedIn) {
        const currentUser = await getCurrentUser();
        const userId = currentUser.userId;
        const profile = await fetchUserProfile(userId, email);
        setUser(profile);
      }
    } catch (error: any) {
      console.error('Sign in error:', error);
      throw new Error(error.message || 'Failed to sign in');
    }
  };

  const signUp = async (email: string, password: string, name: string): Promise<SignUpOutput> => {
    try {
      const output = await amplifySignUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            name,
          },
        },
      });
      return output;
    } catch (error: any) {
      console.error('Sign up error:', error);
      throw new Error(error.message || 'Failed to sign up');
    }
  };

  const confirmSignUp = async (email: string, code: string) => {
    try {
      await amplifyConfirmSignUp({
        username: email,
        confirmationCode: code,
      });
    } catch (error: any) {
      console.error('Confirm sign up error:', error);
      throw new Error(error.message || 'Failed to confirm sign up');
    }
  };

  const signOut = async () => {
    try {
      await amplifySignOut();
      setUser(null);
    } catch (error: any) {
      console.error('Sign out error:', error);
      throw new Error(error.message || 'Failed to sign out');
    }
  };

  const resendConfirmationCode = async (email: string) => {
    try {
      await amplifyResendSignUpCode({ username: email });
    } catch (error: any) {
      console.error('Resend code error:', error);
      throw new Error(error.message || 'Failed to resend confirmation code');
    }
  };

  const uploadProfilePhoto = async (file: File, userId: string): Promise<string> => {
    try {
      // Check if user is authenticated
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        throw new Error('User must be authenticated to upload photos');
      }

      const fileName = `${userId}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      // Try to upload using Amplify Storage
      // Note: This requires Cognito Identity Pool to be configured
      // If it fails, we'll fall back to base64
      try {
        const result = await uploadData({
          key: `profiles/${fileName}`,
          data: file,
          options: {
            contentType: file.type,
            onProgress: ({ transferredBytes, totalBytes }) => {
              if (totalBytes) {
                const progress = (transferredBytes / totalBytes) * 100;
                console.log(`Upload progress: ${progress.toFixed(0)}%`);
              }
            },
          },
        }).result;

        const bucketName = import.meta.env.VITE_S3_BUCKET_NAME;
        const region = import.meta.env.VITE_AWS_REGION;
        const photoUrl = `https://${bucketName}.s3.${region}.amazonaws.com/profiles/${fileName}`;
        
        return photoUrl;
      } catch (storageError: any) {
        // If Storage upload fails (no Identity Pool), convert to base64
        console.warn('S3 upload failed, using base64:', storageError);
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      throw new Error(error.message || 'Failed to upload photo');
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    signIn,
    signUp,
    confirmSignUp,
    signOut,
    resendConfirmationCode,
    uploadProfilePhoto,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
