import { useState } from 'react';
import { Share2, Twitter, Linkedin, Facebook, Link2, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const [linkedInDialogOpen, setLinkedInDialogOpen] = useState(false);
  const [contentCopied, setContentCopied] = useState(false);
  const { toast } = useToast();

  const shareUrl = encodeURIComponent(data.url);
  const shareText = encodeURIComponent(data.text);
  const hashtags = data.hashtags?.join(',') || '';

  // Format content for LinkedIn with hashtags and URL
  const linkedInContent = `${data.text}\n\n${data.url}\n\n${data.hashtags?.map(tag => `#${tag}`).join(' ') || ''}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      toast({
        title: 'Link copied!',
        description: 'Share link copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy link to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleCopyLinkedInContent = async () => {
    try {
      await navigator.clipboard.writeText(linkedInContent);
      setContentCopied(true);
      toast({
        title: 'Content copied!',
        description: 'Paste this into your LinkedIn post',
      });
      setTimeout(() => setContentCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy content to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleLinkedInShare = () => {
    setLinkedInDialogOpen(true);
  };

  const handleCopyAndOpenLinkedIn = async () => {
    try {
      await navigator.clipboard.writeText(linkedInContent);
      toast({
        title: 'Content copied!',
        description: 'Paste it into the LinkedIn post that just opened',
      });
    } catch {
      // clipboard failed, still open LinkedIn
    }
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`,
      '_blank',
      'width=700,height=700'
    );
    setLinkedInDialogOpen(false);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: data.title,
          text: data.text,
          url: data.url,
        });
      } catch (error) {
        // User cancelled or error occurred
        console.log('Share cancelled or failed:', error);
      }
    }
  };

  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}${hashtags ? `&hashtags=${hashtags}` : ''}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`,
  };

  return (
    <>
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

      {/* LinkedIn Share Dialog */}
      <Dialog open={linkedInDialogOpen} onOpenChange={setLinkedInDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Linkedin className="h-5 w-5 text-blue-600" />
              Share on LinkedIn
            </DialogTitle>
            <DialogDescription>
              Your post content is shown below. Click "Copy & Open LinkedIn" to copy it and open LinkedIn's post composer — then just paste (Cmd+V) and post.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm whitespace-pre-line">{linkedInContent}</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCopyLinkedInContent}
                variant="outline"
                className="flex-1"
              >
                {contentCopied ? (
                  <>
                    <Check className="h-4 w-4 mr-2 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Text Only
                  </>
                )}
              </Button>
              <Button
                onClick={handleCopyAndOpenLinkedIn}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <Linkedin className="h-4 w-4 mr-2" />
                Copy & Open LinkedIn
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
