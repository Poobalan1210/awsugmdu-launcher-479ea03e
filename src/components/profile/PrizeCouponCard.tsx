import { Gift } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { prizeItemInSentence, prizeTierById, type CampaignPrize } from '@/lib/campaign';
import { SHIPPING_WINDOW } from '@/lib/store';

interface PrizeCouponCardProps {
  prize: CampaignPrize;
  onClaim: () => void;
}

/**
 * A Kiro University winner's unused coupon, on their own profile. It claims
 * one item, their prize. Once claimed the card goes; the order shows in their
 * activity history like any other store order.
 */
export function PrizeCouponCard({ prize, onClaim }: PrizeCouponCardProps) {
  const tier = prizeTierById(prize.tier);
  const item = prizeItemInSentence(prize.item);
  const rank = prize.boardRank ?? prize.place;

  return (
    <Card className={`glass-card bg-gradient-to-br ${tier?.accent ?? 'border-primary/40'}`}>
      <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="text-4xl leading-none" aria-hidden="true">{tier?.emoji ?? '🎁'}</span>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Kiro University prize</p>
              <Badge>Ready to claim</Badge>
            </div>
            <h3 className="text-lg font-semibold">You finished #{rank} and won a {item}</h3>
            <p className="max-w-xl text-sm text-muted-foreground">
              Your coupon covers one {item}, free. Claim it to have it shipped ({SHIPPING_WINDOW}) or
              collect it at our next in-person event. It also adds {prize.points.toLocaleString()} points
              to your overall points.
            </p>
            <p className="text-xs text-muted-foreground">
              Coupon code <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{prize.code}</code>
            </p>
          </div>
        </div>
        <div className="md:shrink-0">
          <Button onClick={onClaim}>
            <Gift className="mr-2 h-4 w-4" aria-hidden="true" />
            Claim my {item}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
