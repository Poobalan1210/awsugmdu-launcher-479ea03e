import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Eye, EyeOff, Mail, Lock, User, Building2, GraduationCap, 
  Briefcase, MapPin, Globe, ChevronRight, ChevronLeft, Check, 
  Loader2, Shield, Camera, Upload, ExternalLink, Users, XCircle,
  Linkedin, Github, Twitter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentUser } from 'aws-amplify/auth';
import logo from '@/assets/logo.png';
import { mockColleges } from '@/data/mockData';
import { submitMeetupVerification, normalizeMeetupProfileUrl, getMeetupGroupUrl } from '@/lib/meetup';
import { createUserProfile } from '@/lib/userProfile';

type UserType = 'student' | 'professional';

interface OnboardingData {
  name: string;
  email: string;
  password: string;
  profilePhoto: string;
  userType: UserType | '';
  meetupEmail: string;
  // Student fields
  collegeName: string;
  collegeCity: string;
  isCollegeChamp: boolean;
  champCollegeId: string;
  // Professional fields
  designation: string;
  companyName: string;
  companyCity: string;
  country: string;
  // Social media (optional for all users)
  linkedIn: string;
  github: string;
  twitter: string;
}

const STEPS = [
  { id: 1, title: 'Account', description: 'Create your account' },
  { id: 2, title: 'Verify', description: 'Verify your email' },
  { id: 3, title: 'Meetup', description: 'Verify Meetup membership' },
  { id: 4, title: 'Profile', description: 'Upload your photo & choose role' },
  { id: 5, title: 'Details', description: 'Complete your profile' },
];

export default function Signup() {
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [meetupVerified, setMeetupVerified] = useState(false);
  const [meetupPending, setMeetupPending] = useState(false);
  const [meetupVerifying, setMeetupVerifying] = useState(false);
  const [meetupError, setMeetupError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signUp, confirmSignUp, resendConfirmationCode, uploadProfilePhoto, signIn } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<OnboardingData>({
    name: '',
    email: '',
    password: '',
    profilePhoto: '',
    userType: '',
    meetupEmail: '',
    collegeName: '',
    collegeCity: '',
    isCollegeChamp: false,
    champCollegeId: '',
    designation: '',
    companyName: '',
    companyCity: '',
    country: '',
    linkedIn: '',
    github: '',
    twitter: '',
  });


  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    // Store photo as base64 data URL temporarily
    // Will upload to S3 after user signs in (in step 5)
    const reader = new FileReader();
    reader.onloadend = () => {
      updateFormData('profilePhoto', reader.result as string);
      toast({
        title: "Photo selected!",
        description: "Your photo will be uploaded after you complete signup.",
      });
    };
    reader.onerror = () => {
      toast({
        title: "Error",
        description: "Failed to read the image file.",
        variant: "destructive",
      });
    };
    reader.readAsDataURL(file);
  };

  const updateFormData = (field: keyof OnboardingData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSendOTP = async () => {
    if (!formData.name.trim() || !formData.email.trim() || formData.password.length < 8) {
      toast({
        title: "Validation error",
        description: "Please fill in all required fields with a password of at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const output = await signUp(formData.email, formData.password, formData.name);
      setUserId(output.userId);
      setOtpSent(true);
      toast({
        title: "Verification code sent!",
        description: `We've sent a 6-digit code to ${formData.email}`,
      });
    } catch (error: any) {
      toast({
        title: "Sign up failed",
        description: error.message || "Failed to create account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otpValue.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter a valid 6-digit code.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await confirmSignUp(formData.email, otpValue);
      setOtpVerified(true);
      toast({
        title: "Email verified!",
        description: "Your email has been successfully verified.",
      });
      // Auto-advance to next step (Meetup verification)
      setTimeout(() => setCurrentStep(3), 500);
    } catch (error: any) {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid verification code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitMeetupVerification = async () => {
    if (!formData.meetupEmail.trim()) {
      setMeetupError('Please provide your Meetup profile URL or username.');
      return;
    }

    setMeetupVerifying(true);
    setMeetupError(null);
    
    try {
      // Normalize the Meetup profile URL
      const normalizedUrl = normalizeMeetupProfileUrl(formData.meetupEmail);
      
      const result = await submitMeetupVerification(
        formData.email,
        normalizedUrl
      );
      
      if (result.isPending) {
        setMeetupPending(true);
        setMeetupVerified(true); // Allow them to proceed with pending status
        toast({
          title: "Verification submitted!",
          description: "Your Meetup profile has been submitted for admin review. You can continue with signup, but your account will be pending verification.",
        });
        setTimeout(() => setCurrentStep(4), 500);
      } else if (result.isMember) {
        setMeetupVerified(true);
        toast({
          title: "Meetup membership verified!",
          description: `Welcome, ${result.meetupName || 'member'}!`,
        });
        setTimeout(() => setCurrentStep(4), 500);
      } else {
        setMeetupError(result.error || 'Please provide a valid Meetup profile URL.');
        toast({
          title: "Invalid profile URL",
          description: result.error || 'Please check your Meetup profile URL and try again.',
          variant: "destructive",
        });
      }
    } catch (error) {
      setMeetupError(error instanceof Error ? error.message : 'Verification failed');
      toast({
        title: "Verification error",
        description: "An error occurred while submitting your verification.",
        variant: "destructive",
      });
    } finally {
      setMeetupVerifying(false);
    }
  };

  const handleSubmit = async () => {
    if (!userId) {
      toast({
        title: "Error",
        description: "User ID not found. Please start over.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Sign in first to get authentication token for API calls
      await signIn(formData.email, formData.password);

      // Wait a moment for auth session to be ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // Now create user profile in DynamoDB (with auth token)
      // Photo is stored as base64 (works without S3 credentials)
      // Can be uploaded to S3 later from profile page if needed
      try {
        await createUserProfile({
          userId,
          email: formData.email,
          name: formData.name,
          avatar: formData.profilePhoto, // Base64 data URL
          userType: formData.userType as 'student' | 'professional',
          meetupEmail: formData.meetupEmail,
          collegeName: formData.collegeName || undefined,
          collegeCity: formData.collegeCity || undefined,
          isCollegeChamp: formData.isCollegeChamp || undefined,
          champCollegeId: formData.champCollegeId || undefined,
          designation: formData.designation || undefined,
          companyName: formData.companyName || undefined,
          companyCity: formData.companyCity || undefined,
          country: formData.country || undefined,
          linkedIn: formData.linkedIn || undefined,
          github: formData.github || undefined,
          twitter: formData.twitter || undefined,
        });
      } catch (profileError: any) {
        // If profile creation fails, log but don't block signup
        // User is already signed in, profile can be created/updated later
        console.error('Profile creation failed:', profileError);
        toast({
          title: "Profile creation warning",
          description: "You're signed in, but profile creation failed. You can complete your profile later.",
          variant: "default",
        });
      }

      toast({
        title: "Welcome to AWS User Group!",
        description: "Your account has been created successfully.",
      });

      // Navigate to home
      navigate('/');
    } catch (error: any) {
      console.error('Signup error:', error);
      const errorMessage = error.message || "Failed to create your account. Please try again.";
      toast({
        title: "Account creation failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.name.trim() && formData.email.trim() && formData.password.length >= 8;
      case 2:
        return otpVerified;
      case 3:
        return meetupVerified || meetupPending;
      case 4:
        return formData.userType !== '' && formData.profilePhoto !== '';
      case 5:
        if (formData.userType === 'student') {
          if (formData.isCollegeChamp) {
            return formData.champCollegeId !== '';
          }
          return formData.collegeName.trim() && formData.collegeCity.trim();
        } else {
          return formData.designation.trim() && formData.companyName.trim() && formData.companyCity.trim() && formData.country.trim();
        }
      default:
        return false;
    }
  };

  const nextStep = () => {
    if (currentStep < 5) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <Card className="w-full max-w-lg glass-card overflow-hidden">
        <CardHeader className="text-center pb-4">
          <Link to="/" className="inline-flex justify-center mb-4">
            <img src={logo} alt="AWS User Group" className="h-14 w-auto" />
          </Link>
          <CardTitle className="text-2xl">Join AWS User Group</CardTitle>
          <CardDescription>
            {STEPS[currentStep - 1].description}
          </CardDescription>
          
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    currentStep > step.id
                      ? 'bg-primary text-primary-foreground'
                      : currentStep === step.id
                      ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {currentStep > step.id ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.id
                  )}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`w-8 h-0.5 mx-1 transition-colors ${
                      currentStep > step.id ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </CardHeader>
        
        <CardContent className="px-6 pb-6">
          <AnimatePresence mode="wait" custom={currentStep}>
            <motion.div
              key={currentStep}
              custom={currentStep}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              {/* Step 1: Basic Info */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="name"
                        type="text"
                        placeholder="John Doe"
                        value={formData.name}
                        onChange={(e) => updateFormData('name', e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={formData.email}
                        onChange={(e) => updateFormData('email', e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => updateFormData('password', e.target.value)}
                        className="pl-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Must be at least 8 characters
                    </p>
                  </div>
                </div>
              )}

              {/* Step 2: Email Verification */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                      <Shield className="h-8 w-8 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      We need to verify your email address: <span className="font-medium text-foreground">{formData.email}</span>
                    </p>
                  </div>

                  {!otpSent ? (
                    <Button 
                      onClick={handleSendOTP} 
                      className="w-full" 
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send Verification Code'
                      )}
                    </Button>
                  ) : !otpVerified ? (
                    <div className="space-y-4">
                      <div className="flex flex-col items-center gap-4">
                        <Label>Enter the 6-digit code</Label>
                        <InputOTP
                          maxLength={6}
                          value={otpValue}
                          onChange={setOtpValue}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                      <Button 
                        onClick={handleVerifyOTP} 
                        className="w-full" 
                        disabled={isLoading || otpValue.length !== 6}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          'Verify Code'
                        )}
                      </Button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await resendConfirmationCode(formData.email);
                            toast({
                              title: "Code resent!",
                              description: "A new verification code has been sent to your email.",
                            });
                          } catch (error: any) {
                            toast({
                              title: "Failed to resend",
                              description: error.message || "Please try again.",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="w-full text-sm text-muted-foreground hover:text-primary"
                        disabled={isLoading}
                      >
                        Didn't receive the code? Resend
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
                        <Check className="h-8 w-8 text-green-500" />
                      </div>
                      <p className="text-green-600 font-medium">Email verified successfully!</p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Meetup Membership Verification */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                      <Users className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Verify Meetup Membership</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      To join AWS User Group Madurai, you must be a member of our Meetup group. 
                      Please provide your membership details URL for verification.
                    </p>
                  </div>

                  {meetupVerified ? (
                    <div className="text-center py-4">
                      <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
                        meetupPending ? 'bg-amber-500/10' : 'bg-green-500/10'
                      }`}>
                        {meetupPending ? (
                          <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
                        ) : (
                          <Check className="h-8 w-8 text-green-500" />
                        )}
                      </div>
                      <p className={`font-medium mb-2 ${
                        meetupPending ? 'text-amber-600' : 'text-green-600'
                      }`}>
                        {meetupPending 
                          ? 'Verification submitted for review!' 
                          : 'Meetup membership verified!'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {meetupPending 
                          ? 'Your profile has been submitted. An admin will verify your membership soon. You can continue with signup.'
                          : 'You\'re all set to continue with your registration.'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="meetupEmail">Meetup Membership Details URL</Label>
                          <div className="relative">
                            <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="meetupEmail"
                              type="text"
                              placeholder="https://www.meetup.com/members/.../group/.../"
                              value={formData.meetupEmail}
                              onChange={(e) => updateFormData('meetupEmail', e.target.value)}
                              className="pl-10"
                              disabled={meetupVerifying}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Paste the complete URL from your membership details page. 
                            The URL format should be: <code className="text-xs bg-muted px-1 rounded">https://www.meetup.com/members/.../group/.../</code>
                          </p>
                        </div>

                        {meetupError && (
                          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                            <div className="flex items-start gap-3">
                              <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-destructive mb-1">Invalid URL</p>
                                <p className="text-sm text-muted-foreground">{meetupError}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <p className="text-sm font-medium text-blue-600 mb-2">
                            ⚠️ Important: Use a web browser (not the Meetup mobile app)
                          </p>
                          <p className="text-sm font-medium text-blue-600 mb-3">
                            How to get your membership details URL:
                          </p>
                          <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                            <li>Open a <strong className="text-foreground">web browser</strong> (Chrome, Firefox, Safari, etc.) - <span className="text-amber-600 font-medium">do not use the Meetup mobile app</span></li>
                            <li>Go to <a href="https://www.meetup.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">meetup.com</a> and log in to your account</li>
                            <li>Click on your profile picture or name in the top right corner</li>
                            <li>Navigate to your profile page</li>
                            <li>Look for the section showing all the groups you are a member of</li>
                            <li>Find <strong className="text-foreground">"AWS User Group Madurai"</strong> in the list</li>
                            <li><strong className="text-foreground">Important:</strong> Look for <strong className="text-foreground">"Membership Details"</strong> link/text <span className="text-amber-600">below the group name</span> (do NOT click on the group name itself)</li>
                            <li>Click on <strong className="text-foreground">"Membership Details"</strong> - this will open the membership details page</li>
                            <li>Copy the complete URL from your browser's address bar</li>
                            <li>Paste it in the field above</li>
                          </ol>
                          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-blue-500/20">
                            <strong className="text-blue-600">Expected URL format:</strong><br />
                            <code className="text-xs bg-muted px-1 rounded">https://www.meetup.com/members/[your-id]/group/[group-id]</code><br />
                            <span className="text-xs text-muted-foreground italic">(with or without trailing slash)</span>
                          </p>
                        </div>

                        <Button
                          onClick={handleSubmitMeetupVerification}
                          className="w-full"
                          disabled={meetupVerifying || !formData.meetupEmail.trim()}
                        >
                          {meetupVerifying ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Verifying...
                            </>
                          ) : (
                            <>
                              <Users className="mr-2 h-4 w-4" />
                              Verify Membership
                            </>
                          )}
                        </Button>

                        <div className="p-4 rounded-lg bg-muted/50 border">
                          <p className="text-sm text-muted-foreground mb-2">
                            <strong>Not a member yet?</strong>
                          </p>
                          <Button
                            variant="link"
                            className="p-0 h-auto text-primary"
                            asChild
                          >
                            <a
                              href={getMeetupGroupUrl()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1"
                            >
                              Join AWS User Group Madurai on Meetup
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                          <p className="text-xs text-muted-foreground mt-2">
                            After joining, return here and follow the steps above to get your membership details URL.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 4: Profile Photo & User Type Selection */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  {/* Profile Photo Upload */}
                  <div className="space-y-3">
                    <Label className="text-base">Profile Photo</Label>
                    <div className="flex flex-col items-center gap-4">
                      <div 
                        className={`relative w-28 h-28 rounded-full border-2 border-dashed transition-all cursor-pointer overflow-hidden ${
                          formData.profilePhoto 
                            ? 'border-primary' 
                            : 'border-muted-foreground/30 hover:border-primary/50'
                        }`}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {formData.profilePhoto ? (
                          <>
                            <img 
                              src={formData.profilePhoto} 
                              alt="Profile preview" 
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Camera className="h-6 w-6 text-white" />
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                            <Upload className="h-8 w-8 mb-1" />
                            <span className="text-xs">Upload</span>
                          </div>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <p className="text-xs text-muted-foreground text-center">
                        Click to upload a profile photo (max 5MB)
                      </p>
                    </div>
                  </div>

                  {/* User Type Selection */}
                  <div className="space-y-3">
                    <Label className="text-base">I am a...</Label>
                    <RadioGroup
                      value={formData.userType}
                      onValueChange={(value) => updateFormData('userType', value)}
                      className="grid gap-4"
                    >
                      <Label
                        htmlFor="student"
                        className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          formData.userType === 'student'
                            ? 'border-primary bg-primary/5'
                            : 'border-muted hover:border-primary/50'
                        }`}
                      >
                        <RadioGroupItem value="student" id="student" />
                        <div className="flex items-center gap-3 flex-1">
                          <div className="p-2 rounded-lg bg-blue-500/10">
                            <GraduationCap className="h-6 w-6 text-blue-500" />
                          </div>
                          <div>
                            <p className="font-medium">Student</p>
                            <p className="text-sm text-muted-foreground">
                              Currently pursuing education
                            </p>
                          </div>
                        </div>
                      </Label>

                      <Label
                        htmlFor="professional"
                        className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          formData.userType === 'professional'
                            ? 'border-primary bg-primary/5'
                            : 'border-muted hover:border-primary/50'
                        }`}
                      >
                        <RadioGroupItem value="professional" id="professional" />
                        <div className="flex items-center gap-3 flex-1">
                          <div className="p-2 rounded-lg bg-purple-500/10">
                            <Briefcase className="h-6 w-6 text-purple-500" />
                          </div>
                          <div>
                            <p className="font-medium">Professional</p>
                            <p className="text-sm text-muted-foreground">
                              Working in the industry
                            </p>
                          </div>
                        </div>
                      </Label>
                    </RadioGroup>
                  </div>
                </div>
              )}

              {/* Step 5: Details based on user type */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  {formData.userType === 'student' ? (
                    <>
                      {/* College Champs Toggle */}
                      <div className="space-y-3">
                        <Label className="text-base">Are you part of a College Champs college?</Label>
                        <RadioGroup
                          value={formData.isCollegeChamp ? 'yes' : 'no'}
                          onValueChange={(value) => {
                            updateFormData('isCollegeChamp', value === 'yes');
                            if (value === 'no') {
                              updateFormData('champCollegeId', '');
                            }
                          }}
                          className="flex gap-4"
                        >
                          <Label
                            htmlFor="champ-yes"
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all ${
                              formData.isCollegeChamp
                                ? 'border-primary bg-primary/5'
                                : 'border-muted hover:border-primary/50'
                            }`}
                          >
                            <RadioGroupItem value="yes" id="champ-yes" />
                            <span>Yes</span>
                          </Label>
                          <Label
                            htmlFor="champ-no"
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all ${
                              !formData.isCollegeChamp
                                ? 'border-primary bg-primary/5'
                                : 'border-muted hover:border-primary/50'
                            }`}
                          >
                            <RadioGroupItem value="no" id="champ-no" />
                            <span>No</span>
                          </Label>
                        </RadioGroup>
                      </div>

                      {formData.isCollegeChamp ? (
                        <div className="space-y-2">
                          <Label htmlFor="champCollege">Select Your College</Label>
                          <Select
                            value={formData.champCollegeId}
                            onValueChange={(value) => updateFormData('champCollegeId', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select your college" />
                            </SelectTrigger>
                            <SelectContent>
                              {mockColleges.map((college) => (
                                <SelectItem key={college.id} value={college.id}>
                                  {college.name} ({college.shortName})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            You'll be automatically added as a member of this college's Champs team.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="collegeName">College Name</Label>
                            <div className="relative">
                              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                id="collegeName"
                                type="text"
                                placeholder="Enter your college name"
                                value={formData.collegeName}
                                onChange={(e) => updateFormData('collegeName', e.target.value)}
                                className="pl-10"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="collegeCity">City</Label>
                            <div className="relative">
                              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                id="collegeCity"
                                type="text"
                                placeholder="Enter your city"
                                value={formData.collegeCity}
                                onChange={(e) => updateFormData('collegeCity', e.target.value)}
                                className="pl-10"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="designation">Role/Designation</Label>
                        <div className="relative">
                          <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="designation"
                            type="text"
                            placeholder="e.g., Software Engineer, Solutions Architect"
                            value={formData.designation}
                            onChange={(e) => updateFormData('designation', e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="companyName">Company Name</Label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="companyName"
                            type="text"
                            placeholder="Enter your company name"
                            value={formData.companyName}
                            onChange={(e) => updateFormData('companyName', e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="companyCity">City</Label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="companyCity"
                            type="text"
                            placeholder="Enter your city"
                            value={formData.companyCity}
                            onChange={(e) => updateFormData('companyCity', e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="country"
                            type="text"
                            placeholder="Enter your country"
                            value={formData.country}
                            onChange={(e) => updateFormData('country', e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Social Media Links (Optional for all users) */}
                  <div className="pt-4 border-t space-y-4">
                    <Label className="text-base">Social Media Links (Optional)</Label>
                    <p className="text-xs text-muted-foreground mb-4">
                      Add your social media profiles to help others connect with you
                    </p>
                    
                    <div className="space-y-2">
                      <Label htmlFor="linkedIn">LinkedIn</Label>
                      <div className="relative">
                        <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="linkedIn"
                          type="url"
                          placeholder="https://linkedin.com/in/yourprofile"
                          value={formData.linkedIn}
                          onChange={(e) => updateFormData('linkedIn', e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="github">GitHub</Label>
                      <div className="relative">
                        <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="github"
                          type="url"
                          placeholder="https://github.com/yourusername"
                          value={formData.github}
                          onChange={(e) => updateFormData('github', e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="twitter">X</Label>
                      <div className="relative">
                        <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="twitter"
                          type="url"
                          placeholder="https://x.com/yourusername"
                          value={formData.twitter}
                          onChange={(e) => updateFormData('twitter', e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-6 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={prevStep}
              disabled={currentStep === 1 || isLoading}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            {currentStep !== 2 && currentStep !== 3 && (
              <Button
                onClick={nextStep}
                disabled={!canProceed() || isLoading}
                className="gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : currentStep === 5 ? (
                  <>
                    Complete Setup
                    <Check className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
