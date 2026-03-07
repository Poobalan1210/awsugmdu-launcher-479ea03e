import { useState } from 'react';
import { Share2, Twitter, Linkedin, Facebook, Link2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
}

export function ShareButton({ data, variant = 'outline', size = 'sm', className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const shareUrl = encodeURIComponent(data.url);
  const shareText = encodeURIComponent(data.text);
  const hashtags = data.hashtags?.join(',') || '';

  // Full LinkedIn post content: text + URL + hashtags
  const linkedInContent = `${data.text}\n\n${data.url}\n\n${data.hashtags?.map(tag => `#${tag}`).join(' ') || ''}`;

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
    window.open('https://www.linkedin.com/feed/?shareActive=true', '_blank');
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
            Share...
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => window.open(shareLinks.twitter, '_blank')}>
          <Twitter className="h-4 w-4 mr-2" />
          Twitter
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(shareLinks.facebook, '_blank')}>
          <Facebook className="h-4 w-4 mr-2" />
          Facebook
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
