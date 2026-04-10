import { useState, useEffect, useMemo, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Search, Filter, ExternalLink, Plus, Loader2, Image as ImageIcon,
  Code2, FileText, Video, Sparkles, X, Tag, Upload, CheckCircle, Clock, XCircle
} from 'lucide-react';
import { SpotlightSubmission, SpotlightType } from '@/data/mockData';
import { getSpotlightSubmissions, submitSpotlight } from '@/lib/spotlight';
import { uploadFileToS3 } from '@/lib/s3Upload';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const typeConfig: Record<SpotlightType, { label: string; icon: typeof Code2; color: string; gradient: string }> = {
  project: { label: 'Project', icon: Code2, color: 'text-violet-400', gradient: 'from-violet-500/20 to-purple-500/20' },
  blog: { label: 'Blog', icon: FileText, color: 'text-sky-400', gradient: 'from-sky-500/20 to-blue-500/20' },
  video: { label: 'Video', icon: Video, color: 'text-rose-400', gradient: 'from-rose-500/20 to-pink-500/20' },
  other: { label: 'Other', icon: Sparkles, color: 'text-amber-400', gradient: 'from-amber-500/20 to-orange-500/20' },
};

const SpotlightCard = forwardRef<HTMLDivElement, { item: SpotlightSubmission }>(({ item }, ref) => {
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
      <Card className="group glass-card overflow-hidden border-border/40 hover:border-primary/40 transition-all duration-500 hover:shadow-xl hover:shadow-primary/5">
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
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7 border border-border/50">
                <AvatarImage src={item.userAvatar} />
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                  {item.userName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-muted-foreground">{item.userName}</span>
            </div>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors group/link"
            >
              View
              <ExternalLink className="h-3 w-3 transition-transform group-hover/link:translate-x-0.5" />
            </a>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

function SubmitSpotlightDialog({ onSuccess }: { onSuccess: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'project' as SpotlightType,
    url: '',
    imageUrl: '',
    tagsRaw: '',
  });

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

      await submitSpotlight({
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        title: formData.title.trim(),
        description: formData.description.trim(),
        type: formData.type,
        url: formData.url.trim(),
        imageUrl: formData.imageUrl || undefined,
        tags,
      });

      toast.success('Spotlight submission sent! It will appear once approved by an admin.');
      setFormData({ title: '', description: '', type: 'project', url: '', imageUrl: '', tagsRaw: '' });
      setOpen(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gradient-to-r from-primary to-orange-500 hover:from-primary/90 hover:to-orange-500/90 shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" />
          Submit Your Work
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Submit to Community Spotlight
          </DialogTitle>
          <DialogDescription>
            Share your open-source projects, blogs, videos, or any creative work with the community.
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

          <Button type="submit" disabled={loading} className="w-full gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Submitting...' : 'Submit for Review'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MySubmissions({ submissions }: { submissions: SpotlightSubmission[] }) {
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
        {submissions.map((sub) => (
          <Card key={sub.id} className="glass-card border-border/40">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
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
                </div>
              </div>
              <Badge className={`capitalize font-semibold text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0 ${statusColor[sub.status]}`}>
                {statusIcon[sub.status]}
                {sub.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const approved = await getSpotlightSubmissions('approved');
      setSubmissions(approved);

      if (user) {
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
                Share your open-source projects, technical blogs, videos, and creative work with the AWS User Group community.
              </p>
            </motion.div>

            {isAuthenticated && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <SubmitSpotlightDialog onSuccess={fetchData} />
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
                    <SpotlightCard key={item.id} item={item} />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </section>

        {/* My Submissions Section */}
        {isAuthenticated && mySubmissions.length > 0 && (
          <section className="container mx-auto px-4 pb-16">
            <MySubmissions submissions={mySubmissions} />
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
