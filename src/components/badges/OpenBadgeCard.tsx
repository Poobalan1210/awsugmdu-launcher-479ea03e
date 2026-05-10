import { useState } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import {
  Download, ExternalLink, Award, CheckCircle2,
  Linkedin, ChevronDown, ChevronUp, Share2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge as BadgeUI } from '@/components/ui/badge';
import { Badge, User } from '@/data/mockData';
import {
  downloadBadgeAssertion,
  downloadBakedBadge,
  getLinkedInBadgeUrl,
  getBadgeVerificationUrl,
  getPublicBadgeUrl,
} from '@/lib/openBadges';
import { BadgeShareDialog } from '@/components/badges/BadgeShareDialog';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface OpenBadgeCardProps {
  badge: Badge;
  user: Pick<User, 'id' | 'name' | 'email' | 'avatar' | 'designation' | 'company'>;
  isOwnProfile?: boolean;
  index?: number;
}

export function OpenBadgeCard({
  badge,
  user,
  isOwnProfile = false,
  index = 0,
}: OpenBadgeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const publicBadgeUrl = getPublicBadgeUrl(badge, user.name, user.id);

  const handleDownloadJson = async () => {
    await downloadBadgeAssertion(badge, user);
    toast.success('OB v2 assertion downloaded!', {
      description: 'Upload the JSON file to Badgr, Credly, or any Open Badges v2 platform.',
    });
  };

  const handleDownloadSvg = async () => {
    await downloadBakedBadge(badge, user);
    toast.success('Baked badge SVG downloaded!', {
      description: 'This self-contained badge can be verified by any Open Badges v2 verifier.',
    });
  };

  const handleLinkedIn = () => {
    const url = getLinkedInBadgeUrl(badge, badge.earnedDate);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyVerifyUrl = () => {
    const url = getBadgeVerificationUrl(badge.id, user.id);
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Verification URL copied!');
    });
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.08 }}
      >
        <Card className="border-2 hover:border-primary/50 transition-all duration-200 group">
          <CardContent className="p-4">
            {/* Badge header */}
            <div className="flex items-start gap-4">
              {/* Icon with verified ring — clicking goes to public badge page */}
              <Link to={publicBadgeUrl} className="relative flex-shrink-0 group/icon">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20 border-2 border-amber-400/40 flex items-center justify-center overflow-hidden group-hover/icon:border-amber-400/80 transition-colors">
                  {badge.imageUrl ? (
                    <img src={badge.imageUrl} alt={badge.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">{badge.icon}</span>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
              </Link>

              <div className="flex-1 min-w-0">
                <Link to={publicBadgeUrl} className="hover:text-primary transition-colors">
                  <h3 className="font-semibold leading-tight">{badge.name}</h3>
                </Link>
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                  {badge.description}
                </p>

                <div className="flex items-center gap-2 mt-2">
                  <BadgeUI variant="outline" className="text-xs gap-1 text-green-600 border-green-500/30 bg-green-500/5">
                    <Award className="h-3 w-3" />
                    Open Badge
                  </BadgeUI>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(badge.earnedDate), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
            </div>

            {/* Criteria (expandable) */}
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="mt-3 w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={expanded}
            >
              <span className="text-left">Criteria: {badge.criteria.description}</span>
              {expanded ? (
                <ChevronUp className="h-3 w-3 flex-shrink-0 ml-1" />
              ) : (
                <ChevronDown className="h-3 w-3 flex-shrink-0 ml-1" />
              )}
            </button>

            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground space-y-1"
              >
                <p>
                  <span className="font-medium text-foreground">Issuer:</span> AWS User Group Madurai
                </p>
                <p>
                  <span className="font-medium text-foreground">Standard:</span> IMS Open Badges v2.0
                </p>
                <p>
                  <span className="font-medium text-foreground">Issued:</span>{' '}
                  {format(parseISO(badge.earnedDate), 'MMMM d, yyyy')}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <Link
                    to={publicBadgeUrl}
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View public badge page
                  </Link>
                  <button
                    type="button"
                    onClick={handleCopyVerifyUrl}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Copy verify URL
                  </button>
                </div>
              </motion.div>
            )}

            {/* Actions — only for own profile */}
            {isOwnProfile && (
              <div className="mt-3 pt-3 border-t flex items-center gap-2">
                {/* Share — opens Credly-style dialog */}
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => setShareOpen(true)}
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>

                {/* LinkedIn add-to-profile */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLinkedIn}
                      className="text-blue-600 border-blue-500/30 hover:bg-blue-500/10"
                      aria-label="Add to LinkedIn profile"
                    >
                      <Linkedin className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add to LinkedIn Profile</TooltipContent>
                </Tooltip>

                {/* Download dropdown */}
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" aria-label="Download badge">
                          <Download className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Download Open Badge</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={handleDownloadSvg}>
                      <Download className="h-4 w-4 mr-2" />
                      <div>
                        <div className="font-medium">Baked Badge (SVG)</div>
                        <div className="text-xs text-muted-foreground">
                          Self-contained &amp; verifiable
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleDownloadJson}>
                      <Download className="h-4 w-4 mr-2" />
                      <div>
                        <div className="font-medium">Badge Assertion (JSON)</div>
                        <div className="text-xs text-muted-foreground">
                          For Badgr, Credly, etc.
                        </div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* For other people's profiles — just show a "View" link */}
            {!isOwnProfile && (
              <div className="mt-3 pt-3 border-t">
                <Link
                  to={publicBadgeUrl}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  View badge details
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Credly-style share dialog */}
      <BadgeShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        badge={badge}
        recipient={user}
        badgePageUrl={publicBadgeUrl}
      />
    </>
  );
}
