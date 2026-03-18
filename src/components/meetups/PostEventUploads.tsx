import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Camera, Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { uploadFileToS3 } from '@/lib/s3Upload';
import { addMeetupPhotos } from '@/lib/meetups';
import { Meetup } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

interface PostEventUploadsProps {
  meetup: Meetup;
}

export function PostEventUploads({ meetup }: PostEventUploadsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === 'organiser' || user?.role === 'admin';

  if (!isAdmin) return null;

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} is too large (max 10MB)`);
        return false;
      }
      if (!f.type.startsWith('image/')) {
        toast.error(`${f.name} is not an image`);
        return false;
      }
      return true;
    });
    setSelectedPhotos(prev => [...prev, ...validFiles]);
  };

  const handleUploadPhotos = async () => {
    if (selectedPhotos.length === 0) return;
    setIsUploadingPhotos(true);
    try {
      const urls: string[] = [];
      for (const photo of selectedPhotos) {
        const url = await uploadFileToS3(photo, 'meetup-photos');
        urls.push(url);
      }
      await addMeetupPhotos(meetup.id, urls);
      toast.success(`${urls.length} photo(s) uploaded`);
      setSelectedPhotos([]);
      setPhotoDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['meetup', meetup.id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload photos');
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const handleRemovePhoto = async (photoUrl: string) => {
    try {
      await removeMeetupPhoto(meetup.id, photoUrl);
      toast.success('Photo removed');
      queryClient.invalidateQueries({ queryKey: ['meetup', meetup.id] });
    } catch (error) {
      toast.error('Failed to remove photo');
    }
  };

  const handleReportSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }
    setReportFile(file);
  };

  const handleUploadReport = async () => {
    if (!reportFile) return;
    setIsUploadingReport(true);
    try {
      const url = await uploadFileToS3(reportFile, 'meetup-reports');
      await addMeetupReport(meetup.id, url, reportFile.name);
      toast.success('Report uploaded');
      setReportFile(null);
      queryClient.invalidateQueries({ queryKey: ['meetup', meetup.id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload report');
    } finally {
      setIsUploadingReport(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Post-Event Uploads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Photos Button */}
        <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              Add Event Photos
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Event Photos</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full h-24 border-dashed gap-2"
                onClick={() => photoInputRef.current?.click()}
              >
                <Upload className="h-5 w-5" />
                Select Photos
              </Button>
              {selectedPhotos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{selectedPhotos.length} photo(s) selected</p>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedPhotos.map((file, i) => (
                      <div key={i} className="relative rounded-md overflow-hidden aspect-square bg-muted/20">
                        <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setSelectedPhotos(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 p-0.5 bg-destructive/80 text-destructive-foreground rounded-full"
                          aria-label="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button
                onClick={handleUploadPhotos}
                disabled={selectedPhotos.length === 0 || isUploadingPhotos}
                className="w-full gap-2"
              >
                {isUploadingPhotos ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                ) : (
                  <><Upload className="h-4 w-4" /> Upload {selectedPhotos.length} Photo(s)</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
