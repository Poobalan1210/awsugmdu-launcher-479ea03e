import { useState, useEffect, useMemo, forwardRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search, Filter, ExternalLink, Plus, Loader2, Image as ImageIcon,
  Code2, FileText, Video, Sparkles, X, Tag, Upload, CheckCircle, Clock, XCircle,
  Share2, Calendar, User as UserIcon, Copy, Check, ChevronRight,
  MoreVertical, Pencil, Trash2, Lock, EyeOff
} from 'lucide-react';
import { SpotlightSubmission, SpotlightType } from '@/data/mockData';
import {
  getSpotlightSubmissions,
  getVisibleSpotlightSubmissions,
  submitSpotlight,
  updateSpotlight,
  deleteSpotlight,
  getSpotlightExpiresAt,
  isSpotlightExpired,
  SPOTLIGHT_VISIBILITY_DAYS,
} from '@/lib/spotlight';
import { uploadFileToS3 } from '@/lib/s3Upload';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const typeConfig: Record<SpotlightType, { label: string; icon: typeof Code2; color: string; gradient: string }> = {
  project: { label: 'Project', icon: Code2, color: 'text-violet-400', gradient: 'from-violet-500/20 to-purple-500/20' },
  blog: { label: 'Blog', icon: FileText, color: 'text-sky-400', gradient: 'from-sky-500/20 to-blue-500/20' },
  video: { label: 'Video', icon: Video, color: 'text-rose-400', gradient: 'from-rose-500/20 to-pink-500/20' },
  other: { label: 'Other', icon: Sparkles, color: 'text-amber-400', gradient: 'from-amber-500/20 to-orange-500/20' },
};

const SpotlightCard = forwardRef<HTMLDivElement, { item: SpotlightSubmission; onClick: () => void }>(({ item, onClick }, ref) => {
  const config = typeConfig[item.type];
  const Icon = config.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
    >
      <Card
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className="group glass-card overflow-hidden border-border/40 hover:border-primary/40 transition-all duration-500 hover:shadow-xl hover:shadow-primary/5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {/* Image */}
        <div className={`relative h-48 overflow-hidden bg-gradient-to-br ${config.gradient}`}>
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Icon className={`h-16 w-16 ${config.color} opacity-40`} />
            </div>
          )}
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
          {/* Type badge */}
          <div className="absolute top-3 left-3">
            <Badge className={`bg-background/80 backdrop-blur-sm border-border/50 ${config.color} gap-1.5 py-1 px-2.5 text-[11px] font-bold uppercase tracking-wider`}>
              <Icon className="h-3 w-3" />
              {config.label}
            </Badge>
          </div>
          {/* Points badge */}
          {item.points > 0 && (
            <div className="absolute top-3 right-3">
              <Badge className="bg-amber-500/90 text-white border-0 py-1 px-2.5 text-[11px] font-bold">
                ⭐ {item.points} pts
              </Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="font-bold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {item.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 line-clamp-3 leading-relaxed">
              {item.description}
            </p>
          </div>

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full border border-border/40"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
              {item.tags.length > 4 && (
                <span className="text-[10px] text-muted-foreground font-medium">+{item.tags.length - 4} more</span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-7 w-7 border border-border/50 flex-shrink-0">
                <AvatarImage src={item.userAvatar} />
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                  {item.userName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-muted-foreground truncate">{item.userName}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary group-hover:text-primary/80 transition-colors flex-shrink-0">
              View details
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

const emptyForm = {
  title: '',
  description: '',
  type: 'project' as SpotlightType,
  url: '',
  imageUrl: '',
  tagsRaw: '',
};

/**
 * Create/edit form for a spotlight submission.
 * Pass `submission` to switch the dialog into edit mode.
 */
function SpotlightFormDialog({
  open,
  onOpenChange,
  onSuccess,
  submission,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  submission?: SpotlightSubmission | null;
}) {
  const { user } = useAuth();
  const isEdit = !!submission;
  const [loading, setLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  // Seed the form whenever the dialog opens (or targets a different submission)
  useEffect(() => {
    if (!open) return;
    setFormData(
      submission
        ? {
            title: submission.title,
            description: submission.description,
            type: submission.type,
            url: submission.url,
            imageUrl: submission.imageUrl || '',
            tagsRaw: (submission.tags || []).join(', '),
          }
        : emptyForm
    );
    // Keyed on the submission id on purpose: re-seeding on every identity change
    // would discard in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submission?.id]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    setImageUploading(true);
    try {
      const publicUrl = await uploadFileToS3(file, 'spotlight-images');
      setFormData({ ...formData, imageUrl: publicUrl });
      toast.success('Image uploaded!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.title.trim() || !formData.description.trim() || !formData.url.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const tags = formData.tagsRaw
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        type: formData.type,
        url: formData.url.trim(),
        imageUrl: formData.imageUrl || undefined,
        tags,
      };

      if (isEdit && submission) {
        await updateSpotlight(submission.id, { userId: user.id, ...payload });
        toast.success(
          submission.status === 'rejected'
            ? 'Submission updated and sent back for review.'
            : 'Submission updated!'
        );
      } else {
        await submitSpotlight({
          userId: user.id,
          userName: user.name,
          userAvatar: user.avatar,
          ...payload,
        });
        toast.success('Spotlight submission sent! It will appear once approved by an admin.');
      }

      setFormData(emptyForm);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || (isEdit ? 'Failed to update' : 'Failed to submit'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Pencil className="h-5 w-5 text-primary" /> : <Sparkles className="h-5 w-5 text-primary" />}
            {isEdit ? 'Edit Submission' : 'Submit to Community Spotlight'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the details of your submission. Changes are reviewed by an admin before going live.'
              : 'Share your open-source projects, blogs, videos, or any creative work with the community.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Title *</Label>
            <Input
              placeholder="e.g., My Serverless Chat App"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Type *</Label>
            <Select value={formData.type} onValueChange={(v: SpotlightType) => setFormData({ ...formData, type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">🛠️ Project</SelectItem>
                <SelectItem value="blog">📝 Blog</SelectItem>
                <SelectItem value="video">🎬 Video</SelectItem>
                <SelectItem value="other">✨ Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">URL *</Label>
            <Input
              placeholder="https://github.com/your-project or https://dev.to/your-blog"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Description *</Label>
            <Textarea
              placeholder="Tell the community about your work, what you built, and what you learned..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Cover Image</Label>
            <div className="flex items-center gap-3">
              {formData.imageUrl ? (
                <div className="relative group w-full">
                  <img
                    src={formData.imageUrl}
                    alt="Cover"
                    className="w-full h-32 object-cover rounded-lg border border-border/50"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setFormData({ ...formData, imageUrl: '' })}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border/50 rounded-lg cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-all">
                  {imageUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                      <span className="text-xs text-muted-foreground">Click to upload (max 5MB)</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={imageUploading}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Tags</Label>
            <Input
              placeholder="aws, serverless, lambda (comma-separated)"
              value={formData.tagsRaw}
              onChange={(e) => setFormData({ ...formData, tagsRaw: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground">
              Separate tags with commas. These help others discover your work.
            </p>
          </div>

          <Button type="submit" disabled={loading || imageUploading} className="w-full gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isEdit ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading ? (isEdit ? 'Saving...' : 'Submitting...') : isEdit ? 'Save Changes' : 'Submit for Review'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MySubmissions({
  submissions,
  onSelect,
  onEdit,
  onDelete,
}: {
  submissions: SpotlightSubmission[];
  onSelect: (item: SpotlightSubmission) => void;
  onEdit: (item: SpotlightSubmission) => void;
  onDelete: (item: SpotlightSubmission) => void;
}) {
  if (submissions.length === 0) return null;

  const statusIcon = {
    pending: <Clock className="h-3.5 w-3.5 text-amber-500" />,
    approved: <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />,
    rejected: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  };

  const statusColor = {
    pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    approved: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        My Submissions
      </h3>
      <div className="grid gap-3">
        {submissions.map((sub) => {
          const expired = isSpotlightExpired(sub);
          const expiresAt = getSpotlightExpiresAt(sub);

          return (
          <Card
            key={sub.id}
            className="glass-card border-border/40 hover:border-primary/40 transition-colors focus-within:ring-2 focus-within:ring-primary/40"
          >
            <CardContent className="p-4 flex items-center justify-between gap-4">
              {/* Details trigger — a real button so the row stays keyboard accessible
                  without nesting the actions menu inside another button. */}
              <button
                type="button"
                onClick={() => onSelect(sub)}
                className="flex items-center gap-3 min-w-0 text-left flex-1 focus:outline-none"
              >
                {sub.imageUrl ? (
                  <img src={sub.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover flex-shrink-0" />
                ) : (
                  <div className={`h-10 w-10 rounded-md bg-gradient-to-br ${typeConfig[sub.type].gradient} flex items-center justify-center flex-shrink-0`}>
                    {(() => { const I = typeConfig[sub.type].icon; return <I className="h-5 w-5 text-muted-foreground" />; })()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{sub.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{sub.url}</p>
                  {expiresAt && (
                    <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5">
                      {expired
                        ? `Rotated out of the spotlight ${formatDistanceToNow(expiresAt, { addSuffix: true })}`
                        : `Listed until ${format(expiresAt, 'MMM d, yyyy')}`}
                    </p>
                  )}
                </div>
              </button>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Badge
                  className={`capitalize font-semibold text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    expired ? 'bg-muted text-muted-foreground border-border/50' : statusColor[sub.status]
                  }`}
                >
                  {expired ? <EyeOff className="h-3.5 w-3.5" /> : statusIcon[sub.status]}
                  {expired ? 'expired' : sub.status}
                </Badge>
                <SubmissionActionsMenu
                  submission={sub}
                  onEdit={() => onEdit(sub)}
                  onDelete={() => onDelete(sub)}
                />
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Approved submissions stay in the public spotlight for {SPOTLIGHT_VISIBILITY_DAYS} days, then rotate out.
        You can still find them here.
      </p>
    </div>
  );
}

/** Kebab menu with owner-only Edit / Delete actions for a submission. */
function SubmissionActionsMenu({
  submission,
  onEdit,
  onDelete,
  className,
}: {
  submission: SpotlightSubmission;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
}) {
  const editLocked = submission.status === 'approved';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${className || ''}`}
          aria-label={`Actions for ${submission.title}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {editLocked ? (
          <DropdownMenuItem disabled className="text-xs">
            <Lock className="h-3.5 w-3.5 mr-2" />
            Approved — editing locked
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SpotlightDetailDialog({
  item,
  open,
  onClose,
  isOwner,
  onEdit,
  onDelete,
}: {
  item: SpotlightSubmission | null;
  open: boolean;
  onClose: () => void;
  isOwner: boolean;
  onEdit: (item: SpotlightSubmission) => void;
  onDelete: (item: SpotlightSubmission) => void;
}) {
  const [copied, setCopied] = useState(false);

  // Reset copied state when dialog reopens
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!item) return null;

  const config = typeConfig[item.type];
  const Icon = config.icon;

  const shareUrl = `${window.location.origin}/community-spotlight?id=${item.id}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: item.title,
      text: `${item.title} — shared from AWS UG Madurai Community Spotlight`,
      url: shareUrl,
    };
    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  let submittedLabel: string | null = null;
  if (item.submittedAt) {
    try {
      submittedLabel = formatDistanceToNow(new Date(item.submittedAt), { addSuffix: true });
    } catch {
      submittedLabel = null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-1rem)] sm:w-full max-w-2xl h-[90vh] sm:h-auto sm:max-h-[90vh] p-0 gap-0 rounded-xl flex flex-col overflow-hidden">
        {/* Hero image / gradient — fixed */}
        <div className={`relative h-28 sm:h-48 md:h-56 flex-shrink-0 overflow-hidden bg-gradient-to-br ${config.gradient}`}>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Icon className={`h-12 w-12 sm:h-20 sm:w-20 ${config.color} opacity-40`} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-[calc(100%-3.5rem)]">
            <Badge className={`bg-background/80 backdrop-blur-sm border-border/50 ${config.color} gap-1.5 py-1 px-2.5 text-[11px] font-bold uppercase tracking-wider`}>
              <Icon className="h-3 w-3" />
              {config.label}
            </Badge>
            {item.points > 0 && (
              <Badge className="bg-amber-500/90 text-white border-0 py-1 px-2.5 text-[11px] font-bold">
                ⭐ {item.points} pts
              </Badge>
            )}
            {isSpotlightExpired(item) && (
              <Badge className="bg-background/80 backdrop-blur-sm border-border/50 text-muted-foreground gap-1.5 py-1 px-2.5 text-[11px] font-bold uppercase tracking-wider">
                <EyeOff className="h-3 w-3" />
                No longer listed
              </Badge>
            )}
          </div>
        </div>

        {/* Header — fixed */}
        <div className="px-4 sm:px-6 pt-3 sm:pt-5 pb-3 flex-shrink-0 border-b border-border/40">
          <DialogHeader className="text-left space-y-2 sm:space-y-3">
            <DialogTitle className="text-lg sm:text-2xl font-extrabold tracking-tight leading-tight pr-8 line-clamp-2">
              {item.title}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-5 w-5 sm:h-6 sm:w-6 border border-border/50 flex-shrink-0">
                    <AvatarImage src={item.userAvatar} />
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                      {item.userName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-foreground/80 truncate">{item.userName}</span>
                </div>
                {submittedLabel && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {submittedLabel}
                  </span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4 sm:space-y-5">
          {/* Description */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 sm:mb-2">
              About
            </h4>
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
              {item.description}
            </p>
          </div>

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 sm:mb-2">
                Tags
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider bg-muted/50 text-muted-foreground px-2 py-1 rounded-full border border-border/40"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer — fixed */}
        <DialogFooter className="px-4 sm:px-6 py-3 sm:py-4 border-t border-border/40 bg-background flex-shrink-0 flex-row gap-2 sm:justify-end">
          {isOwner && (
            <SubmissionActionsMenu
              submission={item}
              onEdit={() => onEdit(item)}
              onDelete={() => onDelete(item)}
              className="border border-border/50 rounded-md flex-shrink-0"
            />
          )}
          <Button variant="outline" onClick={handleShare} className="gap-2 flex-1 sm:flex-initial">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button asChild className="gap-2 flex-1 sm:flex-initial bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90">
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              Open
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CommunitySpotlight() {
  const { user, isAuthenticated } = useAuth();
  const [submissions, setSubmissions] = useState<SpotlightSubmission[]>([]);
  const [mySubmissions, setMySubmissions] = useState<SpotlightSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<SpotlightType | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [selected, setSelected] = useState<SpotlightSubmission | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SpotlightSubmission | null>(null);
  const [deleting, setDeleting] = useState<SpotlightSubmission | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // The API already drops submissions past their visibility window; the local
      // filter keeps the grid correct against responses that predate that field.
      const approved = await getVisibleSpotlightSubmissions();
      setSubmissions(approved.filter((s) => !isSpotlightExpired(s)));

      if (user) {
        // Owners keep seeing all of their submissions, expired ones included.
        const mine = await getSpotlightSubmissions(undefined, user.id);
        setMySubmissions(mine);
      }
    } catch (error) {
      console.error('Failed to fetch spotlight data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user?.id]);

  // Open modal automatically when ?id= is in URL and submissions are loaded
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) {
      if (selected) setSelected(null);
      return;
    }
    if (loading) return;

    // Look in approved submissions first, then user's own
    const found =
      submissions.find((s) => s.id === id) ||
      mySubmissions.find((s) => s.id === id) ||
      null;

    if (found) {
      setSelected(found);
    } else if (selected?.id !== id) {
      // ID in URL but not in our list — silently ignore
      setSelected(null);
    }
  }, [searchParams, submissions, mySubmissions, loading]);

  const openDetail = (item: SpotlightSubmission) => {
    setSelected(item);
    const next = new URLSearchParams(searchParams);
    next.set('id', item.id);
    setSearchParams(next, { replace: false });
  };

  const closeDetail = () => {
    setSelected(null);
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  // Opening a second modal in the same frame the detail dialog closes leaves Radix's
  // pointer-events lock on <body>, so hand off after the close animation settles.
  const afterDetailCloses = (fn: () => void) => {
    if (!selected) {
      fn();
      return;
    }
    closeDetail();
    window.setTimeout(fn, 200);
  };

  const openEdit = (item: SpotlightSubmission) => {
    afterDetailCloses(() => {
      setEditing(item);
      setFormOpen(true);
    });
  };

  const requestDelete = (item: SpotlightSubmission) => {
    afterDetailCloses(() => setDeleting(item));
  };

  const handleDelete = async () => {
    if (!deleting || !user) return;

    setDeleteLoading(true);
    try {
      await deleteSpotlight(deleting.id, user.id);
      setSubmissions((prev) => prev.filter((s) => s.id !== deleting.id));
      setMySubmissions((prev) => prev.filter((s) => s.id !== deleting.id));
      toast.success('Submission deleted');
      setDeleting(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete submission');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Gather all unique tags from approved submissions
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    submissions.forEach((s) => s.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [submissions]);

  // Filtered results
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((item) => {
      // Type filter
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;

      // Tag filter
      if (tagFilter && !item.tags?.includes(tagFilter)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesUser = item.userName.toLowerCase().includes(q);
        const matchesTags = item.tags?.some((t) => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesDesc && !matchesUser && !matchesTags) return false;
      }

      return true;
    });
  }, [submissions, typeFilter, tagFilter, searchQuery]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/50">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-amber-500/5" />
          <div className="absolute inset-0">
            <div className="absolute top-10 left-1/4 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          </div>
          <div className="relative container mx-auto px-4 py-16 text-center space-y-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 py-1 px-4 text-xs font-bold uppercase tracking-widest">
                <Sparkles className="h-3 w-3 mr-1.5 animate-pulse" />
                Community Spotlight
              </Badge>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground via-primary to-foreground">
                Showcase Your Work
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-4 leading-relaxed">
                Share your open-source projects, technical blogs, videos, and creative work with the AWS User Group Madurai community.
              </p>
            </motion.div>

            {isAuthenticated && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Button
                  onClick={openCreate}
                  className="gap-2 bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 shadow-lg shadow-primary/20"
                >
                  <Plus className="h-4 w-4" />
                  Submit Your Work
                </Button>
              </motion.div>
            )}
          </div>
        </section>

        {/* Search & Filters */}
        <section className="sticky top-16 z-40 bg-background/95 backdrop-blur-lg border-b border-border/50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col md:flex-row gap-3 items-center">
              {/* Search */}
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="spotlight-search"
                  placeholder="Search projects, blogs, videos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-muted/30 border-border/50"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              {/* Type Filter */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Filter className="h-4 w-4 text-muted-foreground hidden md:block" />
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as SpotlightType | 'all')}>
                  <SelectTrigger className="w-[140px] bg-muted/30 border-border/50">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="project">🛠️ Projects</SelectItem>
                    <SelectItem value="blog">📝 Blogs</SelectItem>
                    <SelectItem value="video">🎬 Videos</SelectItem>
                    <SelectItem value="other">✨ Other</SelectItem>
                  </SelectContent>
                </Select>

                {/* Tag Filter */}
                {allTags.length > 0 && (
                  <Select value={tagFilter} onValueChange={(v) => setTagFilter(v === '_all' ? '' : v)}>
                    <SelectTrigger className="w-[150px] bg-muted/30 border-border/50">
                      <SelectValue placeholder="All Tags" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All Tags</SelectItem>
                      {allTags.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          #{tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Active filters */}
            {(typeFilter !== 'all' || tagFilter || searchQuery) && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-xs text-muted-foreground">Active filters:</span>
                {typeFilter !== 'all' && (
                  <Badge variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => setTypeFilter('all')}>
                    {typeConfig[typeFilter].label} <X className="h-3 w-3" />
                  </Badge>
                )}
                {tagFilter && (
                  <Badge variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => setTagFilter('')}>
                    #{tagFilter} <X className="h-3 w-3" />
                  </Badge>
                )}
                {searchQuery && (
                  <Badge variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => setSearchQuery('')}>
                    "{searchQuery}" <X className="h-3 w-3" />
                  </Badge>
                )}
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setTypeFilter('all'); setTagFilter(''); setSearchQuery(''); }}>
                  Clear all
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Spotlight Grid */}
        <section className="container mx-auto px-4 py-12">
          {loading ? (
            <div className="text-center py-20">
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-4" />
              <p className="text-muted-foreground">Loading spotlight...</p>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="text-center py-20">
              <Sparkles className="h-16 w-16 text-muted-foreground/30 mx-auto mb-6" />
              <h3 className="text-xl font-bold mb-2">
                {searchQuery || typeFilter !== 'all' || tagFilter
                  ? 'No results found'
                  : 'No spotlights yet'}
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {searchQuery || typeFilter !== 'all' || tagFilter
                  ? 'Try adjusting your filters or search query.'
                  : 'Be the first to share your work with the community!'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-bold text-foreground">{filteredSubmissions.length}</span> spotlight{filteredSubmissions.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {filteredSubmissions.map((item) => (
                    <SpotlightCard key={item.id} item={item} onClick={() => openDetail(item)} />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </section>

        {/* My Submissions Section */}
        {isAuthenticated && mySubmissions.length > 0 && (
          <section className="container mx-auto px-4 pb-16">
            <MySubmissions
              submissions={mySubmissions}
              onSelect={openDetail}
              onEdit={openEdit}
              onDelete={requestDelete}
            />
          </section>
        )}
      </main>

      <SpotlightDetailDialog
        item={selected}
        open={!!selected}
        onClose={closeDetail}
        isOwner={!!user && selected?.userId === user.id}
        onEdit={openEdit}
        onDelete={requestDelete}
      />

      <SpotlightFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        onSuccess={fetchData}
        submission={editing}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && !deleteLoading && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete submission</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `"${deleting.title}" will be permanently removed. ` : ''}
              This action cannot be undone.
              {deleting?.status === 'approved'
                ? ' It will also be removed from the public spotlight. Points already awarded stay on your profile.'
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
            >
              {deleteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
    </div>
  );
}
