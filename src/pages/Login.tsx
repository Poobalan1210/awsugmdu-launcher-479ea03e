import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { UnconfirmedAccountError, messageOf } from '@/lib/authErrors';
import logo from '@/assets/logo.png';

type Stage = 'signIn' | 'confirmEmail';

export default function Login() {
  const [stage, setStage] = useState<Stage>('signIn');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect');
  // Only allow same-origin relative redirects to avoid open-redirect issues.
  const safeRedirect = redirectTo && redirectTo.startsWith('/') ? redirectTo : null;
  const { signIn, confirmSignUp, resendConfirmationCode } = useAuth();
  const { toast } = useToast();

  // The account exists but its email was never confirmed (signup stopped at the
  // code step). Send a fresh code, since the original one has likely expired.
  const startEmailConfirmation = async () => {
    setStage('confirmEmail');
    setCode('');
    setError(null);
    try {
      await resendConfirmationCode(email);
      toast({
        title: 'Confirm your email',
        description: `We've sent a 6-digit code to ${email}.`,
      });
    } catch (err) {
      setError(messageOf(err, "We couldn't send a code. Please use \"Resend code\" in a minute."));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await signIn(email, password);
      toast({
        title: "Welcome back!",
        description: "You've been successfully signed in.",
      });
      navigate(safeRedirect || '/');
    } catch (err) {
      if (err instanceof UnconfirmedAccountError) {
        await startEmailConfirmation();
        return;
      }
      const errorMessage = messageOf(err, 'Failed to sign in. Please check your credentials.');
      setError(errorMessage);
      toast({
        title: "Sign in failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.length !== 6) {
      setError('Please enter the 6-digit code from your email.');
      return;
    }

    setIsLoading(true);
    try {
      try {
        await confirmSignUp(email, code);
      } catch (err) {
        setError(messageOf(err, 'That code did not work. Please try again.'));
        return;
      }

      try {
        // First full sign-in: AuthContext creates the missing profile row.
        await signIn(email, password);
      } catch (err) {
        setStage('signIn');
        setError(messageOf(err, 'Your email is confirmed. Please sign in.'));
        return;
      }

      toast({
        title: 'Email confirmed',
        description: 'Welcome! Add your photo and details from Edit Profile.',
      });
      navigate(safeRedirect || '/profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError(null);
    try {
      await resendConfirmationCode(email);
      toast({
        title: 'Code resent',
        description: `A new code is on its way to ${email}.`,
      });
    } catch (err) {
      setError(messageOf(err, 'Failed to resend the code. Please try again.'));
    }
  };

  const backToSignIn = () => {
    setStage('signIn');
    setCode('');
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <Card className="w-full max-w-md glass-card">
        <CardHeader className="text-center">
          <Link to="/" className="inline-flex justify-center mb-4">
            <img src={logo} alt="AWS User Group" className="h-16 w-auto" />
          </Link>
          <CardTitle className="text-2xl">
            {stage === 'signIn' ? 'Welcome back' : 'Confirm your email'}
          </CardTitle>
          <CardDescription>
            {stage === 'signIn'
              ? 'Sign in to your account to continue'
              : `Your signup was never finished. Enter the 6-digit code we sent to ${email} to activate your account.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stage === 'confirmEmail' ? (
            <form onSubmit={handleConfirmEmail} className="space-y-5">
              {error && (
                <div role="alert" className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="flex flex-col items-center gap-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
                </div>
                <Label htmlFor="confirmation-code">Enter the 6-digit code</Label>
                <InputOTP
                  id="confirmation-code"
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  disabled={isLoading}
                  autoFocus
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

              <Button type="submit" className="w-full" disabled={isLoading || code.length !== 6}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  'Confirm and sign in'
                )}
              </Button>

              <div className="flex flex-col items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={handleResendCode}
                  className="text-muted-foreground hover:text-primary"
                  disabled={isLoading}
                >
                  Didn't receive the code? Resend
                </button>
                <button
                  type="button"
                  onClick={backToSignIn}
                  className="text-muted-foreground hover:text-primary"
                  disabled={isLoading}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div role="alert" className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      disabled={isLoading}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">Don't have an account? </span>
                <Link
                  to={redirectTo ? `/signup?redirect=${encodeURIComponent(redirectTo)}` : '/signup'}
                  className="text-primary hover:underline font-medium"
                >
                  Sign up
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
