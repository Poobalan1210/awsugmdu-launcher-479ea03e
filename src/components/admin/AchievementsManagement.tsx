import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Loader2, Upload, ExternalLink, Trophy, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAchievements,
  createAchievement,
  updateAchievement,
  deleteAchievement,
  type Achievement,
} from '@/lib/communityAchievements';
import { uploadFileToS3 } from '@/lib/s3Upload';

const emptyForm = { title: '', imageUrl: '', linkedInUrl: '' };

export default function AchievementsManagement() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Achievement | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setItems(await getAchievements());
    } catch (error) {
      console.error('Failed to load achievements:', error);
      toast.error('Failed to load achievements');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowDialog(true);
  };

  const handleEdit = (item: Achievement) => {
    setEditing(item);
    setForm({
      title: item.title,
      imageUrl: item.imageUrl,
      linkedInUrl: item.linkedInUrl,
    });
    setShowDialog(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5MB');
      return;
    }
    try {
      setUploading(true);
      const url = await uploadFileToS3(file, 'achievement-images');
      setForm((prev) => ({ ...prev, imageUrl: url }));
      toast.success('Image uploaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload image');
    } finally {
      setUploading(false);
      // reset so re-selecting the same file re-triggers change
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        title: form.title.trim(),
        imageUrl: form.imageUrl.trim(),
        linkedInUrl: form.linkedInUrl.trim(),
      };
      if (editing) {
        await updateAchievement(editing.id, payload);
        toast.success('Achievement updated');
      } else {
        await createAchievement(payload);
        toast.success('Achievement created');
      }
      setShowDialog(false);
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save achievement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this achievement?')) return;
    try {
      await deleteAchievement(id);
      toast.success('Achievement deleted');
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete achievement');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            Achievements
          </h2>
          <p className="text-muted-foreground">
            Cards shown on the public Achievements page — each has an image, a title, and a LinkedIn link.
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Add Achievement
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center p-12 border border-dashed rounded-lg text-muted-foreground">
          No achievements yet. Click <span className="font-medium">Add Achievement</span> to create the first one.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden flex flex-col">
              <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <ImageOff className="h-8 w-8 text-muted-foreground/50" />
                )}
              </div>
              <CardContent className="p-4 flex flex-col flex-1 gap-3">
                <div className="flex-1">
                  <h3 className="font-semibold leading-tight line-clamp-2">{item.title}</h3>
                  {item.linkedInUrl && (
                    <a
                      href={item.linkedInUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-[#0A66C2] hover:underline line-clamp-1"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{item.linkedInUrl}</span>
                    </a>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {item.createdAt ? `Added ${new Date(item.createdAt).toLocaleDateString()}` : ''}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Achievement' : 'Add Achievement'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update this achievement card.' : 'Add a new achievement card to the public page.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ach-title">Title</Label>
              <Input
                id="ach-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Best AWS User Group of the Year"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ach-image">Image</Label>
              <div className="flex gap-2">
                <Input
                  id="ach-image"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="Paste image URL or upload →"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={uploading}
                  onClick={() => document.getElementById('ach-image-upload')?.click()}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
                <input
                  id="ach-image-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>
              {form.imageUrl?.startsWith('http') && (
                <img
                  src={form.imageUrl}
                  alt="Preview"
                  className="mt-1 w-full max-h-40 object-cover rounded border"
                />
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ach-linkedin">LinkedIn URL</Label>
              <Input
                id="ach-linkedin"
                value={form.linkedInUrl}
                onChange={(e) => setForm({ ...form, linkedInUrl: e.target.value })}
                placeholder="https://www.linkedin.com/posts/..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
