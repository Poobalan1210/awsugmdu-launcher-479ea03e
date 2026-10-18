import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader2, Eye, EyeOff, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { isUnverifiedEmailResetError, messageOf } from '@/lib/authErrors';
import logo from '@/assets/logo.png';

// 'verifyEmail' covers accounts whose signup stopped before the email code:
// Cognito won't reset their password until the email is confirmed.
type Stage = 'request' | 'verifyEmail' | 'confirm';

export default function ForgotPassword() {
  const [stage, setStage] = useState<Stage>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const { resetPassword, confirmResetPassword, confirmSignUp, resendConfirmationCode } = useAuth();
  const { toast } = useToast();

  // Send a signup confirmation code so the email can be verified before the reset.
  const startEmailVerification = async () => {
    try {
      await resendConfirmationCode(email);
      setCode('');
      setStage('verifyEmail');
      toast({
        title: 'Confirm your email first',
        description: `We've sent a 6-digit code to ${email}.`,
      });
    } catch (err) {
      setError(messageOf(err, "We couldn't send a code. Please try again."));
    }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await resetPassword(email);
      setStage('confirm');
      toast({
        title: 'Reset code sent',
        description: `We've sent a 6-digit code to ${email}`,
      });
    } catch (err: any) {
      if (isUnverifiedEmailResetError(err)) {
        await startEmailVerification();
        return;
      }
      const message = err.message || 'Failed to send reset code. Please try again.';
      setError(message);
      toast({
        title: 'Something went wrong',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (code.length !== 6) {
      setError('Please enter the 6-digit code from your email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsLoading(true);
    try {
      await confirmResetPassword(email, code, newPassword);
      toast({
        title: 'Password reset',
        description: 'Your password has been updated. Please sign in.',
      });
      navigate('/login');
    } catch (err: any) {
      const message = err.message || 'Failed to reset password. Please try again.';
      setError(message);
      toast({
        title: 'Reset failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
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

      // The email is verified now, so the normal reset can go ahead.
      setCode('');
      try {
        await resetPassword(email);
      } catch (err) {
        setStage('request');
        setError(messageOf(err, 'Your email is confirmed. Please request the reset code again.'));
        return;
      }
      setStage('confirm');
      toast({
        title: 'Email confirmed',
        description: `Now enter the password reset code we sent to ${email}.`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    try {
      if (stage === 'verifyEmail') {
        await resendConfirmationCode(email);
      } else {
        await resetPassword(email);
      }
      toast({
        title: 'Code resent',
        description: stage === 'verifyEmail'
          ? 'A new confirmation code has been sent to your email.'
          : 'A new reset code has been sent to your email.',
      });
    } catch (err: any) {
      toast({
        title: 'Failed to resend',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <Card className="w-full max-w-md glass-card">
        <CardHeader className="text-center">
          <Link to="/" className="inline-flex justify-center mb-4">
            <img src={logo} alt="AWS User Group" className="h-16 w-auto" />
          </Link>
          <CardTitle className="text-2xl">
            {stage === 'request'
              ? 'Forgot password?'
              : stage === 'verifyEmail'
              ? 'Confirm your email'
              : 'Reset your password'}
          </CardTitle>
          <CardDescription>
            {stage === 'request'
              ? "Enter your email and we'll send you a code to reset your password."
              : stage === 'verifyEmail'
              ? `Your signup was never finished, so your email isn't confirmed yet. Enter the code we sent to ${email}, then you can choose a new password.`
              : `Enter the code sent to ${email} and choose a new password.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          {stage === 'verifyEmail' ? (
            <form onSubmit={handleVerifyEmail} className="space-y-5">
              <div className="flex flex-col items-center gap-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
                </div>
                <Label htmlFor="email-confirmation-code">Enter the 6-digit code</Label>
                <InputOTP
                  id="email-confirmation-code"
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
                  'Confirm email'
                )}
              </Button>

              <button
                type="button"
                onClick={handleResend}
                className="w-full text-sm text-muted-foreground hover:text-primary"
                disabled={isLoading}
              >
                Didn't receive the code? Resend
              </button>
            </form>
          ) : stage === 'request' ? (
            <form onSubmit={handleRequest} className="space-y-4">
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

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  'Send reset code'
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleConfirm} className="space-y-5">
              <div className="flex flex-col items-center gap-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <ShieldCheck className="h-8 w-8 text-primary" />
                </div>
                <Label>Enter the 6-digit code</Label>
                <InputOTP maxLength={6} value={code} onChange={setCode}>
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

              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
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
                <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || code.length !== 6 || newPassword.length < 8}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Reset password'
                )}
              </Button>

              <button
                type="button"
                onClick={handleResend}
                className="w-full text-sm text-muted-foreground hover:text-primary"
                disabled={isLoading}
              >
                Didn't receive the code? Resend
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
