import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CircleCheck, Loader2, MailX } from 'lucide-react';
import { unsubscribeFromReminders } from '@/lib/campaign';

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; test: boolean }
  | { kind: 'error'; message: string };

/**
 * Where the "Stop these reminders" link in a Kiro University reminder email
 * lands. The member confirms with a button instead of the visit counting,
 * because mail scanners open every link in an email: if loading the page
 * unsubscribed, people would be unsubscribed without ever clicking.
 */
export default function KiroUnsubscribe() {
  const [params] = useSearchParams();
  const campaignId = params.get('c') ?? '';
  const userId = params.get('u') ?? '';
  const signature = params.get('s') ?? '';
  const test = params.get('test') === '1';
  const linkComplete = Boolean(campaignId && userId && signature);

  const [state, setState] = useState<State>({ kind: 'idle' });

  const confirm = async () => {
    setState({ kind: 'sending' });
    try {
      const r = await unsubscribeFromReminders({ campaignId, userId, signature, test });
      setState({ kind: 'done', test: Boolean(r.test) });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Something went wrong. Try again.',
      });
    }
  };

  const backToCampaign = (
    <Button asChild variant={state.kind === 'done' ? 'default' : 'outline'}>
      <Link to="/kiro">Go to the campaign page</Link>
    </Button>
  );

  let icon = <MailX className="h-6 w-6 text-primary" aria-hidden="true" />;
  let heading = 'Stop Kiro University reminders?';
  let description =
    "You'll stop getting emails reminding you to set up your Kiro University project. " +
    "You stay in the build-along, and nothing else changes.";

  if (!linkComplete) {
    icon = <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />;
    heading = 'This link is incomplete';
    description =
      'Part of the link is missing. Open it straight from the email, or copy all of it into your browser.';
  } else if (state.kind === 'done') {
    icon = <CircleCheck className="h-6 w-6 text-green-600" aria-hidden="true" />;
    heading = state.test ? 'The test link works' : 'Reminders stopped';
    description = state.test
      ? 'This link came from a test email, so nothing was changed.'
      : "You won't get any more Kiro University reminder emails.";
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-16 flex justify-center">
        <Card className="glass-card w-full max-w-lg h-fit">
          <CardHeader className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              {icon}
            </div>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight">{heading}</h1>
            <CardDescription className="text-sm leading-relaxed" role="status" aria-live="polite">
              {description}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {state.kind === 'error' && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>That didn&apos;t work</AlertTitle>
                <AlertDescription className="text-sm">{state.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-3">
              {linkComplete && state.kind !== 'done' && (
                <Button onClick={confirm} disabled={state.kind === 'sending'}>
                  {state.kind === 'sending' && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  )}
                  Stop reminders
                </Button>
              )}
              {backToCampaign}
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
