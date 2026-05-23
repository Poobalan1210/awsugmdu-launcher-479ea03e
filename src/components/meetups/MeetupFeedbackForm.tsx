import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CheckCircle, Loader2, MessageSquareHeart, Star } from 'lucide-react';
import { Meetup, MeetupFeedback } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyMeetupFeedback, submitMeetupFeedback } from '@/lib/meetupFeedback';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

interface MeetupFeedbackFormProps {
  meetup: Meetup;
}

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Overall rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          className="p-1 rounded-md hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <Star
            className={`h-7 w-7 transition-colors ${
              n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export function MeetupFeedbackForm({ meetup }: MeetupFeedbackFormProps) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Only show the form section once an admin has explicitly enabled it
  // and the meetup is complete. Backward compatibility: old meetups without
  // feedbackEnabled simply never render this card.
  const isVisible =
    meetup.feedbackEnabled === true && meetup.status === 'completed';

  const { data: existingFeedback, isLoading } = useQuery<MeetupFeedback | null>({
    queryKey: ['meetup-feedback-me', meetup.id, user?.id],
    queryFn: () => getMyMeetupFeedback(meetup.id),
    enabled: isVisible && !!user?.id,
    staleTime: 30_000,
  });

  const [rating, setRating] = useState<number>(0);
  const [wouldRecommend, setWouldRecommend] = useState<boolean>(true);
  const [learnings, setLearnings] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [favoritePart, setFavoritePart] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isVisible) return null;

  if (!isAuthenticated || !user) {
    return (
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareHeart className="h-5 w-5 text-primary" />
            Share your feedback
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please log in to submit feedback for this event. Your submission also records
            your attendance and awards points.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading feedback form...
        </CardContent>
      </Card>
    );
  }

  if (existingFeedback) {
    return (
      <Card className="glass-card border-green-500/30 bg-green-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle className="h-5 w-5" />
            Thanks for your feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Your rating:</span>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={`h-4 w-4 ${
                    n <= existingFeedback.rating
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-muted-foreground'
                  }`}
                />
              ))}
            </div>
          </div>
          {existingFeedback.pointsAwarded > 0 && (
            <p className="text-green-700 dark:text-green-400">
              Your attendance has been recorded — +{existingFeedback.pointsAwarded} points awarded.
            </p>
          )}
          {existingFeedback.pointsAwarded === 0 && (
            <p className="text-muted-foreground">
              Your attendance was already on record, so no additional points were awarded.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Submitted on {format(parseISO(existingFeedback.submittedAt), 'PPp')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      toast.error('Please select a rating');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitMeetupFeedback(meetup.id, {
        rating,
        wouldRecommend,
        learnings,
        suggestions,
        favoritePart: favoritePart || undefined,
      });
      if (res.pointsAwarded > 0) {
        toast.success(`Feedback submitted. +${res.pointsAwarded} points awarded.`);
      } else {
        toast.success('Feedback submitted. Thanks!');
      }
      // Refresh both the feedback-me query and the meetup query (attendedUsers may have changed)
      queryClient.invalidateQueries({ queryKey: ['meetup-feedback-me', meetup.id, user.id] });
      queryClient.invalidateQueries({ queryKey: ['meetup', meetup.id] });
    } catch (error) {
      console.error('Feedback submit failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareHeart className="h-5 w-5 text-primary" />
          Share your feedback
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Your feedback also records your attendance for this event.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Overall rating *</Label>
            <StarRating value={rating} onChange={setRating} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="recommend-switch" className="cursor-pointer">
                Would you recommend this event to others?
              </Label>
            </div>
            <Switch
              id="recommend-switch"
              checked={wouldRecommend}
              onCheckedChange={setWouldRecommend}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="learnings">What did you learn or take away?</Label>
            <Textarea
              id="learnings"
              rows={3}
              value={learnings}
              onChange={(e) => setLearnings(e.target.value)}
              placeholder="Key learnings, tools you discovered, ideas you want to try..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="suggestions">Suggestions for improvement</Label>
            <Textarea
              id="suggestions"
              rows={3}
              value={suggestions}
              onChange={(e) => setSuggestions(e.target.value)}
              placeholder="What could we do better next time?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="favorite">Favorite session or moment (optional)</Label>
            <Input
              id="favorite"
              value={favoritePart}
              onChange={(e) => setFavoritePart(e.target.value)}
              placeholder="A talk, networking moment, demo..."
            />
          </div>

          <Button type="submit" disabled={submitting} className="w-full gap-2">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" /> Submit feedback
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
