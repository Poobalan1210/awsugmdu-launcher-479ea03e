import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  Calendar, Clock, Loader2, CheckCircle2, XCircle, AlertTriangle, Mic, LogIn, UserPlus,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SpeakerCodeOfConductContent } from '@/components/common/SpeakerCodeOfConductContent';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  getSpeakerInvite,
  acceptSpeakerInvite,
  declineSpeakerInvite,
  SpeakerInviteDetails,
} from '@/lib/meetups';
import { SPEAKER_COC_VERSION } from '@/data/speakerCodeOfConduct';

export default function SpeakerInvite() {
  const { meetupId, token } = useParams<{ meetupId: string; token: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading, refreshUser } = useAuth();

  const [invite, setInvite] = useState<SpeakerInviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Where to send the user back after they authenticate, so they land on this
  // invite page again to complete acceptance.
  const returnPath = `/speaker-invite/${meetupId}/${token}`;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!meetupId || !token) {
        setLoadError('This invitation link is invalid.');
        setLoading(false);
        return;
      }
      try {
        const details = await getSpeakerInvite(meetupId, token);
        if (active) setInvite(details);
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : 'Failed to load invitation.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [meetupId, token]);

  const emailMismatch =
    isAuthenticated &&
    user?.email &&
    invite?.invitedEmail &&
    user.email.toLowerCase() !== invite.invitedEmail.toLowerCase();

  const handleAccept = async () => {
    if (!meetupId || !token || !user) return;
    if (!agreed) {
      toast.error('Please agree to the Speaker Code of Conduct to continue.');
      return;
    }
    setSubmitting(true);
    try {
      await acceptSpeakerInvite(meetupId, {
        token,
        userId: user.id,
        agreedToCodeOfConduct: true,
        codeOfConductVersion: SPEAKER_COC_VERSION,
      });
      toast.success('You are confirmed as a speaker. See you at the event!');
      await refreshUser();
      navigate(`/meetups?id=${meetupId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!meetupId || !token) return;
    setSubmitting(true);
    try {
      await declineSpeakerInvite(meetupId, token);
      toast.success('You have declined the speaker invitation.');
      setInvite((prev) => (prev ? { ...prev, inviteStatus: 'declined' } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to decline invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusCard = (
    icon: React.ReactNode,
    title: string,
    description: string,
    action?: React.ReactNode
  ) => (
    <Card className="glass-card max-w-lg mx-auto">
      <CardContent className="p-8 text-center space-y-4">
        <div className="flex justify-center">{icon}</div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        {action}
      </CardContent>
    </Card>
  );

  let body: React.ReactNode;

  if (loading || authLoading) {
    body = (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading your invitation...</p>
      </div>
    );
  } else if (loadError || !invite) {
    body = renderStatusCard(
      <AlertTriangle className="h-12 w-12 text-destructive" />,
      'Invitation not found',
      loadError || 'This invitation link is invalid or has expired.',
      <Button asChild variant="outline">
        <Link to="/">Go to homepage</Link>
      </Button>
    );
  } else if (invite.inviteStatus === 'accepted') {
    body = renderStatusCard(
      <CheckCircle2 className="h-12 w-12 text-green-500" />,
      'Invitation already accepted',
      `You're confirmed as a speaker for "${invite.meetupTitle}".`,
      <Button asChild>
        <Link to={`/meetups?id=${invite.meetupId}`}>View event</Link>
      </Button>
    );
  } else if (invite.inviteStatus === 'declined') {
    body = renderStatusCard(
      <XCircle className="h-12 w-12 text-muted-foreground" />,
      'Invitation declined',
      'You have declined this speaker invitation. If this was a mistake, please contact the organisers.'
    );
  } else {
    // Pending invitation — show details + code of conduct
    body = (
      <div className="max-w-3xl mx-auto space-y-6">
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="gap-1">
                <Mic className="h-3 w-3" /> Speaker Invitation
              </Badge>
            </div>
            <CardTitle className="text-2xl mt-2">{invite.meetupTitle}</CardTitle>
            <CardDescription>
              You have been invited to speak at this AWS User Group Madurai meetup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              {invite.meetupDate && (
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  {format(parseISO(invite.meetupDate), 'EEE, MMM d, yyyy')}
                </span>
              )}
              {invite.meetupTime && (
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  {invite.meetupTime}
                </span>
              )}
            </div>
            {invite.topic && (
              <p className="text-sm">
                <span className="font-medium">Topic: </span>
                {invite.topic}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Invitation sent to <span className="font-medium">{invite.invitedEmail}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Speaker Code of Conduct</CardTitle>
            <CardDescription>
              Please read and agree to the code of conduct before accepting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72 rounded-md border p-4">
              <SpeakerCodeOfConductContent />
            </ScrollArea>
          </CardContent>
        </Card>

        {!isAuthenticated ? (
          <Card className="glass-card border-primary/30">
            <CardContent className="p-6 space-y-4">
              <p className="text-sm">
                To accept this invitation you need an AWS User Group Madurai account. Please log in
                or create one&mdash;you&apos;ll come right back here to confirm.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button asChild className="gap-2">
                  <Link to={`/signup?redirect=${encodeURIComponent(returnPath)}&email=${encodeURIComponent(invite.invitedEmail)}`}>
                    <UserPlus className="h-4 w-4" /> Join the website
                  </Link>
                </Button>
                <Button asChild variant="outline" className="gap-2">
                  <Link to={`/login?redirect=${encodeURIComponent(returnPath)}`}>
                    <LogIn className="h-4 w-4" /> I already have an account
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="glass-card">
            <CardContent className="p-6 space-y-4">
              {emailMismatch && (
                <div className="flex gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    You&apos;re signed in as <strong>{user?.email}</strong>, but this invitation was
                    sent to <strong>{invite.invitedEmail}</strong>. Please sign in with the invited
                    email address to accept.
                  </span>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="agree-coc"
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                  disabled={!!emailMismatch}
                />
                <label htmlFor="agree-coc" className="text-sm leading-relaxed cursor-pointer">
                  I have read and agree to the AWS User Group Madurai{' '}
                  <Link to="/speaker-code-of-conduct" target="_blank" className="text-primary hover:underline">
                    Speaker Code of Conduct
                  </Link>
                  , and I confirm my participation as a speaker for this meetup.
                </label>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleAccept}
                  disabled={!agreed || submitting || !!emailMismatch}
                  className="gap-2"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Agree &amp; accept invitation
                </Button>
                <Button
                  onClick={handleDecline}
                  disabled={submitting}
                  variant="outline"
                  className="gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12">{body}</main>
      <Footer />
    </div>
  );
}
