/**
 * Open Badges v2.0 Verification Page
 * Route: /ob2/verify  (also reachable from the public badge page)
 *
 * Accepts ?url={assertionUrl} and runs the full OB v2 verification chain:
 *   Assertion → BadgeClass → Issuer
 *
 * UI is intentionally minimal — no redesign of existing pages.
 */
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CheckCircle2, XCircle, AlertCircle, Loader2,
  ShieldCheck, ExternalLink, ArrowLeft, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge as BadgeUI } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import {
  verifyOB2Assertion,
  VerificationResult,
  VerificationStep,
} from '@/lib/openBadges';
import { format, parseISO } from 'date-fns';

export default function BadgeVerify() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputUrl, setInputUrl] = useState(searchParams.get('url') || '');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-run if ?url= is in the query string
  useEffect(() => {
    const url = searchParams.get('url');
    if (url) {
      setInputUrl(url);
      runVerification(url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runVerification(url: string) {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await verifyOB2Assertion(url.trim());
      setResult(res);
      setSearchParams({ url: url.trim() }, { replace: true });
    } catch (e: any) {
      setError(e.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runVerification(inputUrl);
  };

  const stepIcon = (step: VerificationStep) => {
    if (step.status === 'pass') return <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />;
    if (step.status === 'fail') return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
    return <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-10 max-w-2xl">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 rounded-lg bg-green-500/10">
            <ShieldCheck className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Badge Verification</h1>
            <p className="text-sm text-muted-foreground">
              Verify any Open Badges v2.0 assertion by its hosted URL
            </p>
          </div>
        </div>

        {/* ── Input form ──────────────────────────────────────────────── */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={inputUrl}
                onChange={e => setInputUrl(e.target.value)}
                placeholder="https://www.awsugmdu.in/ob2/assertions/b1-userId.json"
                className="flex-1 font-mono text-xs"
                aria-label="Assertion URL"
              />
              <Button type="submit" disabled={loading || !inputUrl.trim()} className="gap-2 shrink-0">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Verify
              </Button>
            </form>
            <p className="text-xs text-muted-foreground mt-2">
              Enter the assertion URL from a downloaded badge JSON or the badge page.
            </p>
          </CardContent>
        </Card>

        {/* ── Loading ──────────────────────────────────────────────────── */}
        {loading && (
          <Card>
            <CardContent className="p-8 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Running verification chain…</p>
              <p className="text-xs text-muted-foreground">Fetching Assertion → BadgeClass → Issuer</p>
            </CardContent>
          </Card>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && !loading && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="p-6 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-600">Verification Error</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Result ───────────────────────────────────────────────────── */}
        {result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Overall verdict */}
            <Card className={result.valid
              ? 'border-green-500/40 bg-green-500/5'
              : 'border-red-500/40 bg-red-500/5'
            }>
              <CardContent className="p-6 flex items-center gap-4">
                {result.valid ? (
                  <CheckCircle2 className="h-10 w-10 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="h-10 w-10 text-red-500 flex-shrink-0" />
                )}
                <div>
                  <p className={`text-xl font-bold ${result.valid ? 'text-green-600' : 'text-red-600'}`}>
                    {result.valid ? 'Valid Open Badge' : 'Verification Failed'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {result.valid
                      ? 'This assertion is a valid Open Badges v2.0 credential.'
                      : 'One or more verification checks failed. See details below.'}
                  </p>
                </div>
                <BadgeUI
                  variant="outline"
                  className={`ml-auto shrink-0 ${result.valid
                    ? 'text-green-600 border-green-500/30 bg-green-500/5'
                    : 'text-red-600 border-red-500/30 bg-red-500/5'
                  }`}
                >
                  OB v2.0
                </BadgeUI>
              </CardContent>
            </Card>

            {/* Badge & earner summary */}
            {result.assertion && result.badgeClass && (
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                    Badge Details
                  </h2>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Badge</p>
                      <p className="font-medium">{result.badgeClass.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Issued On</p>
                      <p className="font-medium">
                        {format(parseISO(result.assertion.issuedOn), 'MMMM d, yyyy')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Issuer</p>
                      <p className="font-medium">{result.issuer?.name ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Recipient</p>
                      <p className="font-medium font-mono text-xs break-all">
                        {result.assertion.recipient.identity.slice(0, 20)}…
                      </p>
                    </div>
                    {result.assertion.expires && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Expires</p>
                        <p className="font-medium">
                          {format(parseISO(result.assertion.expires), 'MMMM d, yyyy')}
                        </p>
                      </div>
                    )}
                  </div>

                  <Separator className="my-4" />

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={result.assertion.badge} target="_blank" rel="noopener noreferrer">
                        BadgeClass JSON
                        <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={result.badgeClass.issuer} target="_blank" rel="noopener noreferrer">
                        Issuer JSON
                        <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                      </a>
                    </Button>
                    {result.assertion.evidence?.[0]?.id && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={result.assertion.evidence[0].id} target="_blank" rel="noopener noreferrer">
                          View Profile
                          <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step-by-step checks */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Verification Steps
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {result.steps.filter(s => s.status === 'pass').length}/{result.steps.length} passed
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {result.steps.map((step, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-2.5 rounded-md text-sm ${
                        step.status === 'pass' ? 'bg-green-500/5' :
                        step.status === 'fail' ? 'bg-red-500/5' : 'bg-amber-500/5'
                      }`}
                    >
                      {stepIcon(step)}
                      <div className="flex-1 min-w-0">
                        <span className={
                          step.status === 'pass' ? 'text-green-700 dark:text-green-400' :
                          step.status === 'fail' ? 'text-red-700 dark:text-red-400' :
                          'text-amber-700 dark:text-amber-400'
                        }>
                          {step.label}
                        </span>
                        {step.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                            {step.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* OB v2 spec note */}
            <p className="text-xs text-muted-foreground text-center">
              Verification follows the{' '}
              <a
                href="https://www.imsglobal.org/spec/ob/v2p0/#verification"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                1EdTech Open Badges v2.0 HostedBadge verification algorithm
              </a>
            </p>
          </motion.div>
        )}
      </main>

      <Footer />
    </div>
  );
}
