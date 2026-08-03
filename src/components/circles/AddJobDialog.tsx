import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { RichText } from '@/components/ui/rich-text';
import { Briefcase, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeUrl } from '@/lib/utils';
import { postGroupMessage } from '@/lib/circles';
import { buildJobMarkdown, EMPTY_JOB_DRAFT, type JobDraft } from '@/lib/jobPost';

interface AddJobDialogProps {
  groupId: string;
  /** Author the post is attributed to (the moderator adding it). */
  user: { id: string; name?: string; avatar?: string };
  /** Called after a successful post so the caller can refetch the circle. */
  onPosted: () => void | Promise<void>;
}

/**
 * Lets a circle owner or organiser add a job listing by hand into an agent-run
 * jobs circle — for roles the scraper missed, or community referrals.
 */
export function AddJobDialog({ groupId, user, onPosted }: AddJobDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<JobDraft>(EMPTY_JOB_DRAFT);

  const setField = (field: keyof JobDraft) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setJob((prev) => ({ ...prev, [field]: e.target.value }));

  const preview = job.title.trim() ? buildJobMarkdown(job) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job.title.trim()) {
      toast.error('Job title is required');
      return;
    }
    if (!normalizeUrl(job.link)) {
      toast.error('An apply link is required so members can act on the posting');
      return;
    }

    setSubmitting(true);
    try {
      await postGroupMessage(groupId, {
        userId: user.id,
        userName: user.name || 'Unknown User',
        userAvatar: user.avatar || '',
        content: buildJobMarkdown(job),
        isJobPost: true,
      });
      toast.success('Job added to the circle');
      setJob(EMPTY_JOB_DRAFT);
      setOpen(false);
      await onPosted();
    } catch (error) {
      console.error('Error adding job:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add job');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setJob(EMPTY_JOB_DRAFT);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Job
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Add a Job Manually
          </DialogTitle>
          <DialogDescription>
            Post an opening the agent hasn't picked up. It appears in the feed formatted
            the same way as the automated listings.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job-title">Job Title *</Label>
            <Input
              id="job-title"
              value={job.title}
              onChange={setField('title')}
              placeholder="e.g., Solutions Architect I"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="job-category">Category</Label>
              <Input
                id="job-category"
                value={job.category}
                onChange={setField('category')}
                placeholder="e.g., Solutions Architect"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-team">Team / Company</Label>
              <Input
                id="job-team"
                value={job.team}
                onChange={setField('team')}
                placeholder="e.g., AWS Sales"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="job-location">Location</Label>
              <Input
                id="job-location"
                value={job.location}
                onChange={setField('location')}
                placeholder="e.g., Bengaluru, India (Hybrid)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-posted">Posted Date</Label>
              <Input
                id="job-posted"
                type="date"
                value={job.posted}
                onChange={setField('posted')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-summary">Summary</Label>
            <Textarea
              id="job-summary"
              rows={4}
              value={job.summary}
              onChange={setField('summary')}
              placeholder="What the role involves, key requirements, experience level..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-link">Apply Link *</Label>
            <Input
              id="job-link"
              type="url"
              inputMode="url"
              value={job.link}
              onChange={setField('link')}
              placeholder="https://amazon.jobs/en/jobs/..."
              required
            />
          </div>

          {preview && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="rounded-lg border bg-muted/40 p-4">
                <RichText content={preview} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Job'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
