import { BookOpen, Link2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface BuilderCenterClaimCardProps {
  suggestedCount: number;
  /** Most points the member can still get by claiming them all. */
  potentialPoints: number;
  /** Whether they already linked their Builder Center account. */
  linked: boolean;
  onReview: () => void;
  onLink: () => void;
}

/**
 * On a member's own profile while they have unclaimed Builder Center
 * suggestions. Goes once each has been claimed or marked "not mine".
 */
export function BuilderCenterClaimCard({ suggestedCount, potentialPoints, linked, onReview, onLink }: BuilderCenterClaimCardProps) {
  const things = suggestedCount === 1 ? 'blog or project looks' : 'blogs and projects look';

  return (
    <Card className="glass-card border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="rounded-full bg-primary/10 p-2 text-primary" aria-hidden="true">
            <BookOpen className="h-6 w-6" />
          </span>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">AWS Builder Center</p>
              <Badge>Ready to claim</Badge>
            </div>
            <h3 className="text-lg font-semibold">
              {suggestedCount} Builder Center {things} like yours
            </h3>
            <p className="max-w-xl text-sm text-muted-foreground">
              We matched these to your profile from the public Builder Center feed. Claim the ones you wrote
              to add them to your profile
              {potentialPoints > 0 ? <> and earn up to {potentialPoints.toLocaleString()} points</> : null}.
              {!linked && ' Or link your Builder Center account to add them all, and new ones every week.'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row md:shrink-0">
          {!linked && (
            <Button variant="outline" onClick={onLink}>
              <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Link my account
            </Button>
          )}
          <Button onClick={onReview}>
            <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
            Review
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
