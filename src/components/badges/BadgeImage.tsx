import { useState } from 'react';
import { Badge } from '@/data/mockData';
import { cn } from '@/lib/utils';

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT;

/** The badge's own hexagon image, served by the badges API. */
function badgeImageUrl(badgeId: string): string {
  return `${API_ENDPOINT}/ob2/badge-images/${encodeURIComponent(badgeId)}.svg`;
}

/**
 * A badge's picture: the artwork an organiser uploaded, otherwise the
 * AWS User Group Madurai hexagon. Falls back to the emoji icon if the image
 * cannot load (offline, API down).
 */
export function BadgeImage({
  badge,
  className,
  emojiClassName,
}: {
  badge: Pick<Badge, 'id' | 'name' | 'icon' | 'imageUrl'>;
  className?: string;
  emojiClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = badge.imageUrl || (API_ENDPOINT ? badgeImageUrl(badge.id) : '');

  if (!src || failed) {
    return (
      <span className={cn('text-3xl', emojiClassName)} role="img" aria-label={badge.name}>
        {badge.icon || '🏅'}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={`${badge.name} badge`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('h-full w-full', badge.imageUrl ? 'object-cover' : 'object-contain', className)}
    />
  );
}
