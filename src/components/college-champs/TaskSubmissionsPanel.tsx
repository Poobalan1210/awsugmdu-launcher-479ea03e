import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, XCircle, AlertCircle, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { getAllTaskSubmissions, reviewTaskSubmission, getAllCollegeTasks, type CollegeTaskSubmission, type CollegeTask } from '@/lib/colleges';

export function TaskSubmissionsPanel({ onSubmissionReviewed }: { onSubmissionReviewed?: () => void }) {
  const [submissions, setSubmissions] = useState<CollegeTaskSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<CollegeTaskSubmission | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewComments, setReviewComments] = useState('');
  const [pointsAwarded, setPointsAwarded] = useState('');
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected' | 'needs_revision'>('approved');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allTasks, setAllTasks] = useState<CollegeTask[]>([]);

  useEffect(() => {
    loadSubmissions();
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const tasks = await getAllCollegeTasks();
      setAllTasks(tasks);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  const loadSubmissions = async () => {
    try {
      const data = await getAllTaskSubmissions();
      setSubmissions(data);
    } catch (error) {
      console.error('Error loading submissions:', error);
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = (submission: CollegeTaskSubmission, action: 'approved' | 'rejected' | 'needs_revision') => {
    setSelectedSubmission(submission);
    setReviewAction(action);
    setReviewComments('');
    
    // Get task points for default
    const task = allTasks.find(t => t.id === submission.taskId);
    setPointsAwarded(task?.points.toString() || '');
    
    setReviewDialogOpen(true);
  };

  const submitReview = async () => {
    if (!selectedSubmission) return;

    setIsSubmitting(true);
    try {
      await reviewTaskSubmission(
        selectedSubmission.id,
        reviewAction,
        reviewComments || undefined,
        reviewAction === 'approved' ? parseInt(pointsAwarded) || undefined : undefined
      );

      toast.success(`Submission ${reviewAction}!`);
      setReviewDialogOpen(false);
      loadSubmissions();
      
      // Refresh parent component if callback provided
      if (reviewAction === 'approved' && onSubmissionReviewed) {
        onSubmissionReviewed();
      }
    } catch (error: any) {
      console.error('Error reviewing submission:', error);
      toast.error('Failed to review submission', {
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50"><AlertCircle className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'needs_revision':
        return <Badge variant="outline" className="bg-orange-50"><AlertCircle className="h-3 w-3 mr-1" />Needs Revision</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingSubmissions = submissions.filter(s => s.status === 'pending');

  if (loading) {
    return <div className="text-center py-8">Loading submissions...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Pending Submissions */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Pending Review ({pendingSubmissions.length})</h3>
        {pendingSubmissions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No pending submissions
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingSubmissions.map((submission) => {
              const task = allTasks.find(t => t.id === submission.taskId);
              return (
                <Card key={submission.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base">{task?.title || submission.taskId}</CardTitle>
                        <CardDescription>
                          Submitted by {submission.submittedByName} • {new Date(submission.submittedAt).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      {getStatusBadge(submission.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-medium mb-1">Comments:</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{submission.comments}</p>
                    </div>
                    
                    {submission.fileUrl && (
                      <div>
                        <p className="text-sm font-medium mb-1">Attachment:</p>
                        <a
                          href={submission.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <FileText className="h-4 w-4" />
                          {submission.fileName || 'View File'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => handleReview(submission, 'approved')}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReview(submission, 'needs_revision')}
                      >
                        <AlertCircle className="h-4 w-4 mr-1" />
                        Request Changes
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReview(submission, 'rejected')}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approved' && 'Approve Submission'}
              {reviewAction === 'rejected' && 'Reject Submission'}
              {reviewAction === 'needs_revision' && 'Request Changes'}
            </DialogTitle>
            <DialogDescription>
              Provide feedback for the submission
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {reviewAction === 'approved' && (
              <div className="space-y-2">
                <Label htmlFor="points">Points to Award</Label>
                <Input
                  id="points"
                  type="number"
                  value={pointsAwarded}
                  onChange={(e) => setPointsAwarded(e.target.value)}
                  placeholder="Enter points"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="comments">Comments {reviewAction !== 'approved' && <span className="text-destructive">*</span>}</Label>
              <Textarea
                id="comments"
                value={reviewComments}
                onChange={(e) => setReviewComments(e.target.value)}
                placeholder="Add your feedback..."
                rows={4}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={submitReview}
              disabled={isSubmitting || (reviewAction !== 'approved' && !reviewComments.trim())}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Review'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
