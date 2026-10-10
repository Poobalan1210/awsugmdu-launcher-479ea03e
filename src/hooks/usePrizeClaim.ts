import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  claimPrize, getMyCampaign, prizeItemInSentence,
  type CampaignPrize, type ClaimPrizeResult, type MyCampaign,
} from '@/lib/campaign';
import { SHIPPING_WINDOW, type RedeemRequest } from '@/lib/store';

/**
 * The signed-in member's Kiro University prize, and claiming it. Used by the
 * profile, the store and the Kiro University page, so a claim from any of them
 * updates the others.
 */
export function usePrizeClaim() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  // Same key as the Kiro University page, so they share one cache entry.
  const { data: campaign } = useQuery({
    queryKey: ['campaign-me', user?.id],
    queryFn: getMyCampaign,
    enabled: Boolean(user),
  });
  const prize: CampaignPrize | null = campaign?.prize ?? null;
  const [dialogOpen, setDialogOpen] = useState(false);

  /** Claim the prize. Throws after showing the error, so the dialog stays open. */
  const claim = async (request: RedeemRequest): Promise<ClaimPrizeResult> => {
    try {
      const result = await claimPrize(request);
      const item = prizeItemInSentence(result.prize.item);
      toast.success(
        result.order.fulfillmentMethod === 'pickup'
          ? `Your ${item} is claimed. Collect it at our next in-person event.`
          : `Your ${item} is claimed. It ships in ${SHIPPING_WINDOW}.`,
      );
      queryClient.setQueryData<MyCampaign | null>(['campaign-me', user?.id], (prev) =>
        prev ? { ...prev, prize: result.prize } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      // The header and the store read the points from the signed-in user.
      await refreshUser();
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not claim your prize. Try again.');
      // Claimed in another tab, perhaps: show where it stands now.
      queryClient.invalidateQueries({ queryKey: ['campaign-me'] });
      throw error;
    }
  };

  return {
    prize,
    /** Has a coupon not yet used. */
    canClaim: prize?.status === 'issued',
    claim,
    dialogOpen,
    openDialog: () => setDialogOpen(true),
    setDialogOpen,
  };
}
