import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Upload, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { submitTaskForReview, type CollegeTask } from '@/lib/colleges';
import { uploadFileToS3 } from '@/lib/s3Upload';
import { useAuth } from '@/contexts/AuthContext';

interface SubmitTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: CollegeTask;
  collegeId: string;
  onSuccess: () => void;
}

export function SubmitTaskDialog({ open, onOpenChange, task, collegeId, onSuccess }: SubmitTaskDialogProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
  };

  const handleSubmit = async () => {
    if (!comments.trim()) {
      toast.error('Please add comments about your submission');
      return;
    }

    if (!user) {
      toast.error('You must be logged in to submit tasks');
      return;
    }

    setIsUploading(true);
    try {
      let fileUrl: string | undefined;
      let fileName: string | undefined;

      // Upload file if provided
      if (file) {
        toast.info('Uploading file...');
        fileUrl = await uploadFileToS3(file, 'college-logos');
        fileName = file.name;
      }

      // Submit task
      await submitTaskForReview(
        collegeId, 
        task.id, 
        comments, 
        user.id, 
        user.name,
        fileUrl, 
        fileName
      );

      toast.success('Task submitted for review!', {
        description: 'Admin will review your submission soon.',
      });

      // Reset form
      setComments('');
      setFile(null);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error submitting task:', error);
      toast.error('Failed to submit task', {
        description: error.message || 'Please try again later',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Submit Task: {task.title}</DialogTitle>
          <DialogDescription>
            Provide details about your task completion. Admin will review and approve your submission.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Task Details */}
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
            <p className="text-sm font-medium">Points: {task.points}</p>
          </div>

          {/* Comments */}
          <div className="space-y-2">
            <Label htmlFor="comments">
              Comments <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="comments"
              placeholder="Describe what you did to complete this task, include links, details, etc."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={5}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Provide detailed information about your task completion
            </p>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file">Supporting Document (Optional)</Label>
            {!file ? (
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip,.txt,.xls,.xlsx"
                />
                <label htmlFor="file" className="cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload a file
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, DOC, DOCX, Images, Excel, Text, or ZIP (max 10MB)
                  </p>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleRemoveFile}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isUploading || !comments.trim()}>
            {isUploading ? 'Submitting...' : 'Submit for Review'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
