import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check, Copy, ExternalLink, Loader2, LogIn, Lock, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  INVITED_USER_ID_HASHES, NOMINATIONS, NOMINATION_DOC_URL, NOMINATION_FORM_URL, type Nomination,
} from '@/data/nominations';

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

type Access = 'checking' | 'signed-out' | 'not-invited' | 'invited' | 'organiser';

/**
 * Who may see the kit. The text is not secret (it ships in the bundle and the
 * content doc is shared by link); the check keeps the page to the members the
 * invite was sent to. Organisers can open it to preview what invitees see.
 */
function useAccess(): Access {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [invited, setInvited] = useState<boolean | null>(null);
  const userId = user?.id;

  useEffect(() => {
    let cancelled = false;
    setInvited(null);
    if (!userId) return;
    sha256Hex(userId)
      .then((hash) => { if (!cancelled) setInvited(INVITED_USER_ID_HASHES.has(hash)); })
      .catch(() => { if (!cancelled) setInvited(false); });
    return () => { cancelled = true; };
  }, [userId]);

  if (isLoading) return 'checking';
  if (!isAuthenticated || !user) return 'signed-out';
  if (invited === null) return 'checking';
  if (invited) return 'invited';
  if (user.role === 'organiser' || user.role === 'admin') return 'organiser';
  return 'not-invited';
}

function NominationCard({ nomination, step }: { nomination: Nomination; step: number }) {
  const [copied, setCopied] = useState(false);
  const words = nomination.text.split(/\s+/).filter(Boolean).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(nomination.text);
      setCopied(true);
      toast.success(`${nomination.nominee} text copied`, {
        description: 'Paste it under the matching award in the form.',
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy. Select the text in the box and copy it manually.');
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl">
              <span className="text-muted-foreground mr-2">{step}.</span>
              {nomination.nominee}
            </CardTitle>
            <CardDescription className="text-sm">
              Paste under: <span className="font-medium text-foreground">{nomination.awards}</span>
            </CardDescription>
          </div>
          <Button onClick={copy} size="lg" className="shrink-0">
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? 'Copied' : 'Copy text'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{nomination.text.length.toLocaleString()} characters</Badge>
          <Badge variant="secondary">{words.toLocaleString()} words</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="max-h-72 overflow-y-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap"
          tabIndex={0}
          aria-label={`Nomination text for ${nomination.nominee}`}
        >
          {nomination.text}
        </div>
      </CardContent>
    </Card>
  );
}

function Gate({ access }: { access: Exclude<Access, 'invited' | 'organiser'> }) {
  if (access === 'checking') {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-3" />
        Loading…
      </div>
    );
  }

  const signedOut = access === 'signed-out';
  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader className="text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          {signedOut ? <LogIn className="h-6 w-6 text-primary" /> : <Lock className="h-6 w-6 text-primary" />}
        </div>
        <CardTitle>{signedOut ? 'Sign in to open your nomination kit' : 'This kit is for invited members'}</CardTitle>
        <CardDescription>
          {signedOut
            ? 'Use the awsugmdu.in account your invitation was sent to.'
            : 'It was shared with AWS Heroes, Community Builders, User Group Leaders and Student Builder Group Leaders in our community. If you received an invitation, sign in with the account it was sent to.'}
        </CardDescription>
      </CardHeader>
      {signedOut && (
        <CardContent className="flex justify-center">
          <Button asChild size="lg">
            <Link to={`/login?redirect=${encodeURIComponent('/nominate')}`}>Sign in</Link>
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

export default function Nominate() {
  const access = useAccess();
  const canView = access === 'invited' || access === 'organiser';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-10 max-w-4xl space-y-8">
          <div className="space-y-3 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 py-1.5 text-sm">
              <Trophy className="h-4 w-4 text-primary" />
              AWS Community Awards 2026
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Nomination kit</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Thank you for backing AWS User Group Madurai. It takes about five minutes.
            </p>
          </div>

          {!canView ? (
            <Gate access={access as Exclude<Access, 'invited' | 'organiser'>} />
          ) : (
            <>
              {access === 'organiser' && (
                <Alert>
                  <AlertDescription>
                    Organiser preview. Invited members see this same page.
                  </AlertDescription>
                </Alert>
              )}

              <Card>
                <CardContent className="pt-6 space-y-4">
                  <ol className="list-decimal pl-5 space-y-2 text-sm sm:text-base">
                    <li>Open the nomination form in a new tab.</li>
                    <li>
                      For each nominee below, start with one line in your own words about how you know
                      them. Then press <span className="font-medium">Copy text</span> and paste it under
                      the award shown.
                    </li>
                    <li>Submit the form.</li>
                  </ol>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild size="lg">
                      <a href={NOMINATION_FORM_URL} target="_blank" rel="noopener noreferrer">
                        Open the nomination form
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </a>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <a href={NOMINATION_DOC_URL} target="_blank" rel="noopener noreferrer">
                        Open the content doc
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                {NOMINATIONS.map((n, i) => (
                  <NominationCard key={n.id} nomination={n} step={i + 1} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
