/**
 * Public badge page — like Credly's /badges/{id}/public_url
 * URL: /badges/{badgeId}/{userSlug}
 *
 * This page is publicly accessible (no login required) and renders a rich
 * badge view with proper OG meta tags so social platforms show a preview card.
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import {
  CheckCircle2, Award, Calendar, User, Building2,
  ExternalLink, Download, Linkedin, Share2, Copy, Check,
  ShieldCheck, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge as BadgeUI } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAllUsers, getUserProfile } from '@/lib/userProfile';
import { mockBadges, Badge, User as UserType } from '@/data/mockData';
import { matchesSlug, getShareableProfileUrl } from '@/lib/profileSlug';
import {
  downloadBadgeAssertion,
  downloadBakedBadge,
  getLinkedInBadgeUrl,
  getBadgeVerificationUrl,
  assertionUrl,
} from '@/lib/openBadges';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { BadgeShareDialog } from '@/components/badges/BadgeShareDialog';

export default function BadgePublic() {
  const { badgeId, userSlug } = useParams<{ badgeId: string; userSlug: string }>();
  const [badge, setBadge] = useState<Badge | null>(null);
  const [recipient, setRecipient] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Resolve badge
        const foundBadge = mockBadges.find(b => b.id === badgeId);
        if (!foundBadge) { setLoading(false); return; }
        setBadge(foundBadge);

        // Resolve user from slug
        if (userSlug) {
          const allUsers = await getAllUsers();
          const matched = allUsers.find(u => matchesSlug(userSlug, u.name, u.id));
          if (matched) {
            const profile = await getUserProfile(matched.id);
            setRecipient({
              ...profile,
              id: (profile as any).userId || profile.id || matched.id,
            });
          }
        }
      } catch (err) {
        console.error('Failed to load badge page:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [badgeId, userSlug]);

  // Inject dynamic OG meta tags into <head> for social previews
  useEffect(() => {
    if (!badge || !recipient) return;

    const pageUrl = window.location.href;
    const title = `${recipient.name} earned ${badge.name} | AWS UG Madurai`;
    const description = `${recipient.name} was awarded the "${badge.name}" badge by AWS User Group Madurai. ${badge.description}`;

    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    const setNameMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    document.title = title;
    setMeta('og:title', title);
    setMeta('og:description', description);
    setMeta('og:url', pageUrl);
    setMeta('og:type', 'profile');
    // Use the SVG badge as the OG image (data URI won't work for crawlers,
    // but the badge page URL itself is what gets shared)
    setNameMeta('twitter:card', 'summary');
    setNameMeta('twitter:title', title);
    setNameMeta('twitter:description', description);

    return () => {
      // Restore defaults on unmount
      document.title = 'AWS User Group Madurai';
    };
  }, [badge, recipient]);

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast.success('Badge link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = async () => {
    if (!badge || !recipient) return;
    await downloadBadgeAssertion(badge, recipient);
    toast.success('OB v2 assertion downloaded!', {
      description: 'Upload to Badgr, Credly, or any Open Badges v2 platform.',
    });
  };

  const handleDownloadSvg = async () => {
    if (!badge || !recipient) return;
    await downloadBakedBadge(badge, recipient);
    toast.success('Baked badge SVG downloaded!');
  };

  const handleLinkedIn = () => {
    if (!badge) return;
    window.open(getLinkedInBadgeUrl(badge, badge.earnedDate), '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-pulse space-y-4 w-full max-w-2xl px-4">
            <div className="h-64 bg-muted rounded-2xl" />
            <div className="h-32 bg-muted rounded-2xl" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!badge) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="p-8 text-center">
              <Award className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Badge Not Found</h2>
              <p className="text-muted-foreground mb-4">This badge doesn't exist or has been removed.</p>
              <Button asChild variant="outline">
                <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />Go Home</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  const badgePageUrl = window.location.href;
  const profileUrl = recipient ? getShareableProfileUrl(recipient.name, recipient.id) : '/';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/20">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-10 max-w-3xl">
        {/* Back link */}
        {recipient && (
          <Link
            to={profileUrl}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {recipient.name}'s profile
          </Link>
        )}

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* ── Main badge card ─────────────────────────────────────────── */}
          <Card className="overflow-hidden border-0 shadow-xl">
            {/* Gradient header band */}
            <div className="h-3 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />

            <CardContent className="p-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8">
                {/* Badge visual */}
                <div className="flex-shrink-0">
                  <div className="relative">
                    {/* Outer glow ring */}
                    <div className="w-36 h-36 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 p-1 shadow-lg shadow-amber-500/30">
                      <div className="w-full h-full rounded-full bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center overflow-hidden">
                        {badge.imageUrl ? (
                          <img src={badge.imageUrl} alt={badge.name} className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <span className="text-6xl" role="img" aria-label={badge.name}>
                            {badge.icon}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Verified checkmark */}
                    <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1.5 shadow-md border-2 border-background">
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    </div>
                  </div>

                  {/* Issuer */}
                  <div className="mt-4 text-center">
                    <p className="text-xs text-muted-foreground">Issued by</p>
                    <p className="text-sm font-semibold text-amber-600">AWS UG Madurai</p>
                  </div>
                </div>

                {/* Badge info */}
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                    <BadgeUI variant="outline" className="text-xs gap-1 text-green-600 border-green-500/30 bg-green-500/5">
                      <ShieldCheck className="h-3 w-3" />
                      Verified Open Badge
                    </BadgeUI>
                    <BadgeUI variant="outline" className="text-xs text-amber-600 border-amber-500/30 bg-amber-500/5">
                      IMS OB v2.0
                    </BadgeUI>
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-bold mb-2">{badge.name}</h1>
                  <p className="text-muted-foreground mb-4">{badge.description}</p>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-primary" />
                      Issued {format(parseISO(badge.earnedDate), 'MMMM d, yyyy')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-primary" />
                      AWS User Group Madurai
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Earner card ──────────────────────────────────────────────── */}
          {recipient && (
            <Card>
              <CardContent className="p-6">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  Awarded To
                </h2>
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14 border-2 border-primary/20">
                    <AvatarImage src={recipient.avatar} alt={recipient.name} />
                    <AvatarFallback className="text-lg">{recipient.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Link
                      to={profileUrl}
                      className="text-lg font-bold hover:text-primary transition-colors"
                    >
                      {recipient.name}
                    </Link>
                    {recipient.designation && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <User className="h-3.5 w-3.5" />
                        {recipient.designation}
                        {recipient.company && ` · ${recipient.company}`}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={profileUrl}>
                      View Profile
                      <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Criteria card ────────────────────────────────────────────── */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Earning Criteria
              </h2>
              <p className="text-sm leading-relaxed">{badge.criteria.description}</p>

              <Separator className="my-4" />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Standard</p>
                  <p className="font-medium">IMS Open Badges v2.0</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Type</p>
                  <p className="font-medium capitalize">{badge.criteria.type.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Issuer</p>
                  <p className="font-medium">AWS UG Madurai</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Action bar ───────────────────────────────────────────────── */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Share &amp; Export
              </h2>

              <div className="flex flex-wrap gap-3">
                {/* Share dialog */}
                <Button
                  onClick={() => setShareOpen(true)}
                  className="gap-2 bg-primary hover:bg-primary/90"
                >
                  <Share2 className="h-4 w-4" />
                  Share Badge
                </Button>

                {/* Copy link */}
                <Button variant="outline" onClick={handleCopyLink} className="gap-2">
                  {copied ? (
                    <><Check className="h-4 w-4 text-green-500" />Copied!</>
                  ) : (
                    <><Copy className="h-4 w-4" />Copy Link</>
                  )}
                </Button>

                {/* LinkedIn add-to-profile */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={handleLinkedIn}
                      className="gap-2 text-blue-600 border-blue-500/30 hover:bg-blue-500/10"
                    >
                      <Linkedin className="h-4 w-4" />
                      Add to LinkedIn
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add this badge to your LinkedIn certifications</TooltipContent>
                </Tooltip>

                {/* Download SVG */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={handleDownloadSvg} className="gap-2">
                      <Download className="h-4 w-4" />
                      Download Badge
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download baked SVG (self-contained &amp; verifiable)</TooltipContent>
                </Tooltip>

                {/* Download JSON assertion */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleDownloadJson} className="gap-2 text-muted-foreground">
                      <Download className="h-3.5 w-3.5" />
                      Export JSON
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download Open Badge assertion JSON for Badgr / Credly</TooltipContent>
                </Tooltip>
              </div>

              {/* Verification note */}
              <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                This badge is issued under the{' '}
                <a
                  href="https://www.imsglobal.org/spec/ob/v2p0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  1EdTech Open Badges v2.0
                </a>{' '}
                standard. Verify it at{' '}
                {badge && recipient && (
                  <Link
                    to={`/ob2/verify?url=${encodeURIComponent(assertionUrl(badge.id, recipient.id))}`}
                    className="text-primary hover:underline"
                  >
                    /ob2/verify
                  </Link>
                )}.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <Footer />

      {/* Share dialog */}
      {badge && recipient && (
        <BadgeShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          badge={badge}
          recipient={recipient}
          badgePageUrl={badgePageUrl}
        />
      )}
    </div>
  );
}
