import { useState } from 'react';
import {
  Share2, Twitter, Linkedin, Facebook, Link2, Check,
  Copy, X, MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export interface ShareData {
  title: string;
  text: string;
  url: string;
  hashtags?: string[];
}

interface ShareButtonProps {
  data: ShareData;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  /** Show a full share dialog instead of a dropdown */
  useDialog?: boolean;
}

export function ShareButton({
  data,
  variant = 'outline',
  size = 'sm',
  className,
  useDialog = false,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const shareUrl = encodeURIComponent(data.url);
  const shareText = encodeURIComponent(data.text);
  const hashtags = data.hashtags?.join(',') || '';
  const hashtagStr = data.hashtags?.map(t => `#${t}`).join(' ') || '';

  // Full LinkedIn post content: text + URL + hashtags
  const linkedInContent = `${data.text}\n\n${data.url}\n\n${hashtagStr}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Share link copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleLinkedInShare = async () => {
    try {
      await navigator.clipboard.writeText(linkedInContent);
      toast({
        title: 'Content copied!',
        description: 'Paste it into the LinkedIn post (Cmd+V / Ctrl+V)',
      });
    } catch {
      // clipboard failed, still open LinkedIn
    }
    window.open('https://www.linkedin.com/feed/?shareActive=true', '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: data.title, text: data.text, url: data.url });
      } catch {
        // User cancelled
      }
    }
  };

  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}${hashtags ? `&hashtags=${hashtags}` : ''}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${data.text}\n\n${data.url}`)}`,
  };

  const triggerButton = (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={useDialog ? () => setDialogOpen(true) : undefined}
    >
      <Share2 className="h-4 w-4 mr-2" />
      Share
    </Button>
  );

  // ── Dialog mode ────────────────────────────────────────────────────────────
  if (useDialog) {
    return (
      <>
        {triggerButton}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-primary" />
                Share Achievement
              </DialogTitle>
            </DialogHeader>

            {/* Preview card */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
              <p className="font-semibold text-sm leading-snug">{data.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{data.text}</p>
              {data.hashtags && (
                <p className="text-xs text-primary">{hashtagStr}</p>
              )}
            </div>

            {/* URL copy row */}
            <div className="flex gap-2">
              <Input
                readOnly
                value={data.url}
                className="text-xs h-9"
                aria-label="Share URL"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-9"
                onClick={handleCopyLink}
                aria-label="Copy link"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Platform buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="justify-start gap-2 text-blue-600 border-blue-500/30 hover:bg-blue-500/10"
                onClick={handleLinkedInShare}
              >
                <Linkedin className="h-4 w-4" />
                LinkedIn
              </Button>

              <Button
                variant="outline"
                className="justify-start gap-2"
                onClick={() => window.open(shareLinks.twitter, '_blank', 'noopener,noreferrer')}
              >
                <Twitter className="h-4 w-4" />
                Twitter / X
              </Button>

              <Button
                variant="outline"
                className="justify-start gap-2 text-blue-700 border-blue-600/30 hover:bg-blue-600/10"
                onClick={() => window.open(shareLinks.facebook, '_blank', 'noopener,noreferrer')}
              >
                <Facebook className="h-4 w-4" />
                Facebook
              </Button>

              <Button
                variant="outline"
                className="justify-start gap-2 text-green-600 border-green-500/30 hover:bg-green-500/10"
                onClick={() => window.open(shareLinks.whatsapp, '_blank', 'noopener,noreferrer')}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
            </div>

            {/* Native share (mobile) */}
            {navigator.share && (
              <Button variant="secondary" className="w-full gap-2" onClick={handleNativeShare}>
                <Share2 className="h-4 w-4" />
                More options…
              </Button>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ── Dropdown mode (default, backward-compatible) ───────────────────────────
  // Keep the original dropdown for places that don't need the full dialog.
  // We import DropdownMenu lazily to avoid bloating the bundle for dialog-only usage.
  return <ShareDropdown data={data} variant={variant} size={size} className={className} />;
}

// ─── Internal dropdown (original behaviour) ───────────────────────────────────

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function ShareDropdown({
  data,
  variant = 'outline',
  size = 'sm',
  className,
}: Omit<ShareButtonProps, 'useDialog'>) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const shareUrl = encodeURIComponent(data.url);
  const shareText = encodeURIComponent(data.text);
  const hashtags = data.hashtags?.join(',') || '';
  const linkedInContent = `${data.text}\n\n${data.url}\n\n${data.hashtags?.map(t => `#${t}`).join(' ') || ''}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Share link copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleLinkedInShare = async () => {
    try {
      await navigator.clipboard.writeText(linkedInContent);
      toast({
        title: 'Content copied!',
        description: 'Paste it into the LinkedIn post (Cmd+V / Ctrl+V)',
      });
    } catch {
      // clipboard failed
    }
    window.open('https://www.linkedin.com/feed/?shareActive=true', '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: data.title, text: data.text, url: data.url });
      } catch {
        // User cancelled
      }
    }
  };

  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}${hashtags ? `&hashtags=${hashtags}` : ''}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${data.text}\n\n${data.url}`)}`,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handleLinkedInShare} className="font-medium">
          <Linkedin className="h-4 w-4 mr-2 text-blue-600" />
          Share on LinkedIn
        </DropdownMenuItem>
        {navigator.share && (
          <DropdownMenuItem onClick={handleNativeShare}>
            <Share2 className="h-4 w-4 mr-2" />
            Share…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => window.open(shareLinks.twitter, '_blank', 'noopener,noreferrer')}>
          <Twitter className="h-4 w-4 mr-2" />
          Twitter / X
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(shareLinks.facebook, '_blank', 'noopener,noreferrer')}>
          <Facebook className="h-4 w-4 mr-2" />
          Facebook
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(shareLinks.whatsapp, '_blank', 'noopener,noreferrer')}>
          <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
          WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyLink}>
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2 text-green-500" />
              Copied!
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4 mr-2" />
              Copy Link
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
