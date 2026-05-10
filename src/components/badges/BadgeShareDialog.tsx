/**
 * Credly-style badge share dialog.
 * Shows a live preview of how the badge will look when shared,
 * plus platform-specific share buttons.
 */
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Twitter, Linkedin, Facebook, Copy, Check,
  MessageCircle, Share2, ExternalLink,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge, User } from '@/data/mockData';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';

interface BadgeShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  badge: Badge;
  recipient: Pick<User, 'id' | 'name' | 'email' | 'avatar' | 'designation' | 'company'>;
  /** OG proxy URL — what gets shared on social (crawlers see OG tags here) */
  badgePageUrl: string;
  /** Human-readable React page URL — shown in the preview URL bar */
  badgeViewUrl?: string;
}

export function BadgeShareDialog({
  open,
  onOpenChange,
  badge,
  recipient,
  badgePageUrl,
  badgeViewUrl,
}: BadgeShareDialogProps) {
  const [copied, setCopied] = useState(false);
  // The URL shown in the preview bar is the human-readable page
  const displayUrl = badgeViewUrl || badgePageUrl;

  const shareText = `I earned the "${badge.name}" badge from AWS User Group Madurai! ${badge.icon} ${badge.description}`;
  const hashtags = ['AWSUG', 'OpenBadges', 'AWS', 'CloudComputing'];
  const hashtagStr = hashtags.map(t => `#${t}`).join(' ');

  const encodedUrl = encodeURIComponent(badgePageUrl);
  const encodedText = encodeURIComponent(`${shareText}\n\n${hashtagStr}`);

  const platforms = [
    {
      name: 'LinkedIn',
      icon: <Linkedin className="h-4 w-4" />,
      color: 'text-blue-600 border-blue-500/30 hover:bg-blue-500/10',
      action: async () => {
        // Copy full post content then open LinkedIn
        const content = `${shareText}\n\n${badgePageUrl}\n\n${hashtagStr}`;
        try { await navigator.clipboard.writeText(content); } catch { /* ignore */ }
        toast.success('Post content copied!', {
          description: 'Paste it into your LinkedIn post (Cmd+V / Ctrl+V)',
        });
        window.open('https://www.linkedin.com/feed/?shareActive=true', '_blank', 'noopener,noreferrer');
      },
    },
    {
      name: 'Twitter / X',
      icon: <Twitter className="h-4 w-4" />,
      color: 'hover:bg-muted',
      action: () => {
        const url = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      },
    },
    {
      name: 'Facebook',
      icon: <Facebook className="h-4 w-4" />,
      color: 'text-blue-700 border-blue-600/30 hover:bg-blue-600/10',
      action: () => {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank', 'noopener,noreferrer');
      },
    },
    {
      name: 'WhatsApp',
      icon: <MessageCircle className="h-4 w-4" />,
      color: 'text-green-600 border-green-500/30 hover:bg-green-500/10',
      action: () => {
        window.open(`https://wa.me/?text=${encodedText}%0A%0A${encodedUrl}`, '_blank', 'noopener,noreferrer');
      },
    },
  ];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(badgePageUrl);
    setCopied(true);
    toast.success('Badge link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: `${recipient.name} earned ${badge.name}`,
        text: shareText,
        url: badgePageUrl,
      });
    } catch { /* user cancelled */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Share2 className="h-5 w-5 text-primary" />
            Share Your Badge
          </DialogTitle>
        </DialogHeader>

        {/* ── Live preview card ─────────────────────────────────────── */}
        <div className="px-6 pb-4">
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-medium">
            Preview
          </p>

          {/* Mimics how the link will look when shared on social media */}
          <div className="rounded-xl border overflow-hidden shadow-sm">
            {/* Top color band */}
            <div className="h-2 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />

            <div className="p-4 flex gap-4 items-start bg-card">
              {/* Badge icon */}
              <div className="flex-shrink-0 w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 p-0.5 shadow-md shadow-amber-500/20">
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center overflow-hidden">
                  {badge.imageUrl ? (
                    <img src={badge.imageUrl} alt={badge.name} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <span className="text-3xl" role="img" aria-label={badge.name}>{badge.icon}</span>
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-0.5">
                  AWS User Group Madurai
                </p>
                <h3 className="font-bold text-base leading-tight">{badge.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{badge.description}</p>

                <div className="flex items-center gap-2 mt-2">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={(recipient as any).avatar} alt={recipient.name} />
                    <AvatarFallback className="text-xs">{recipient.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground">
                    Earned by <span className="font-medium text-foreground">{recipient.name}</span>
                    {' · '}
                    {format(parseISO(badge.earnedDate), 'MMM yyyy')}
                  </span>
                </div>
              </div>
            </div>

            {/* URL bar — shows the human-readable badge page */}
            <div className="px-4 py-2 bg-muted/50 border-t flex items-center gap-1.5">
              <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{displayUrl}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Copy link row ─────────────────────────────────────────── */}
        <div className="px-6 py-4">
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide font-medium">
            Badge Link
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={badgePageUrl}
              className="text-xs h-9 bg-muted/50"
              aria-label="Badge URL"
              onClick={e => (e.target as HTMLInputElement).select()}
            />
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 h-9 gap-1.5"
              onClick={handleCopy}
            >
              {copied ? (
                <><Check className="h-3.5 w-3.5 text-green-500" />Copied</>
              ) : (
                <><Copy className="h-3.5 w-3.5" />Copy</>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Paste this link on LinkedIn to show the badge preview.
          </p>
        </div>

        <Separator />

        {/* ── Platform buttons ──────────────────────────────────────── */}
        <div className="px-6 py-4">
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide font-medium">
            Share On
          </p>
          <div className="grid grid-cols-2 gap-2">
            {platforms.map(p => (
              <Button
                key={p.name}
                variant="outline"
                className={`justify-start gap-2 ${p.color}`}
                onClick={p.action}
              >
                {p.icon}
                {p.name}
              </Button>
            ))}
          </div>

          {/* Native share (mobile) */}
          {navigator.share && (
            <Button
              variant="secondary"
              className="w-full mt-2 gap-2"
              onClick={handleNativeShare}
            >
              <Share2 className="h-4 w-4" />
              More options…
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
