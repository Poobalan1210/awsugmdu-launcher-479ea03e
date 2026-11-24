import { Link2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface BuilderCenterLinkCardProps {
  /** Points for linking, or 0 if linking earns none (or they already got them). */
  points: number;
  onLink: () => void;
}

/** On a member's own profile until they link their AWS Builder Center account. */
export function BuilderCenterLinkCard({ points, onLink }: BuilderCenterLinkCardProps) {
  return (
    <Card className="glass-card border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="rounded-full bg-primary/10 p-2 text-primary" aria-hidden="true">
            <Link2 className="h-6 w-6" />
          </span>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">AWS Builder Center</p>
              {points > 0 && <Badge>+{points.toLocaleString()} points</Badge>}
            </div>
            <h3 className="text-lg font-semibold">Add your Builder Center alias</h3>
            <p className="max-w-xl text-sm text-muted-foreground">
              Add your AWS Builder Center alias to your profile
              {points > 0 ? <> and earn {points.toLocaleString()} points</> : null}.
            </p>
          </div>
        </div>
        <div className="md:shrink-0">
          <Button onClick={onLink}>
            <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Add my alias
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
