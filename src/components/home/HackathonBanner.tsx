import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, KeyRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getHackathons } from '@/lib/hackathons';

// Matched by title instead of a hard-coded id, so the link works in every
// environment. Current title: "Agent Experience Hackathon: Strands Decider".
const EVENT_TITLE = /strands\s+decider/i;

/**
 * Homepage pointer to the Strands Decider hackathon page, where each team gets
 * its Decider API key (Teams tab, in the team's own section). Self-contained,
 * so it can be removed from Index.tsx once the event is over.
 */
export function HackathonBanner() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Public endpoint. Until it answers, or if nothing matches, the links fall
  // back to the hackathon list, so the banner never waits on the network.
  const { data: hackathon } = useQuery({
    queryKey: ['home-hackathon-banner'],
    queryFn: async () => (await getHackathons()).find(h => EVENT_TITLE.test(h.title)) ?? null,
  });

  const eventPath = hackathon ? `/hackathons/${hackathon.id}` : '/hackathons';
  const apiKeyPath = hackathon ? `${eventPath}?tab=teams` : eventPath;
  // Only signed-in team members can get a key, so signed-out visitors go
  // through login, which sends them straight back to the Teams tab.
  const apiKeyHref = !authLoading && !isAuthenticated
    ? `/login?redirect=${encodeURIComponent(apiKeyPath)}`
    : apiKeyPath;

  return (
    <section
      aria-labelledby="hackathon-banner-title"
      className="border-b border-primary/20 bg-gradient-to-r from-primary/10 via-orange-500/5 to-amber-500/10"
    >
      <div className="container mx-auto flex flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
          >
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="hackathon-banner-title" className="text-base font-semibold md:text-lg">
                Strands Decider Hackathon
              </h2>
              {hackathon?.status === 'active' && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                >
                  Live now
                </Badge>
              )}
            </div>
            {/* foreground/80 rather than muted-foreground: muted text drops
                below 4.5:1 contrast on the tinted background. */}
            <p className="text-sm text-foreground/80">
              Find the hackathon page and get your team's API key here. Register, create a team, then grab the key from your team's section on the Teams tab.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button asChild className="gap-2">
            <Link to={apiKeyHref}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Get your API key
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to={eventPath}>
              View hackathon page
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
