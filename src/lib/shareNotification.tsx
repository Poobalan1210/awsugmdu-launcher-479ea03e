import { toast } from 'sonner';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AchievementShareData } from './sharing';

export function showShareNotification(shareData: AchievementShareData, message: string = 'Achievement unlocked!') {
  // Check if native share is available
  const canShare = typeof navigator !== 'undefined' && navigator.share;

  if (canShare) {
    toast.success(
      <div className="flex flex-col gap-2">
        <span>{message}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.share({
                title: shareData.title,
                text: shareData.text,
                url: shareData.url,
              });
            } catch (error) {
              // User cancelled or error occurred
              console.log('Share cancelled or failed:', error);
            }
          }}
        >
          <Share2 className="h-3 w-3 mr-1" />
          Share Achievement
        </Button>
      </div>,
      { duration: 5000 }
    );
  } else {
    // Fallback: just show success message with copy link option
    toast.success(message, {
      description: 'Share your achievement on social media!',
      action: {
        label: 'Copy Link',
        onClick: () => {
          navigator.clipboard.writeText(shareData.url);
          toast.success('Link copied to clipboard!');
        },
      },
      duration: 5000,
    });
  }
}
