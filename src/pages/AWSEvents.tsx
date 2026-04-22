import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar, Award, ExternalLink, Image as ImageIcon, Upload, Loader2, CheckCircle, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAWSEvents, submitEventProof, getPendingEventSubmissions } from '@/lib/awsEvents';
import { uploadFileToS3 } from '@/lib/s3Upload';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { AWSEvent, AWSEventSubmission } from '@/data/mockData';

function SubmitProofDialog({ event, user, onSubmitted }: { event: AWSEvent, user: any, onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkedInUrl) {
      toast.error('LinkedIn post URL is required');
      return;
    }
    if (!file) {
      toast.error('Photo is required (with organizer or ID card)');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Upload photo to S3
      const photoUrl = await uploadFileToS3(file, 'aws-events-proofs');

      // 2. Submit proof
      await submitEventProof(event.id, {
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        linkedInUrl,
        photoUrl
      });

      toast.success('Attendance proof submitted successfully!');
      setOpen(false);
      onSubmitted();
    } catch (error) {
      console.error('Error submitting proof:', error);
      toast.error('Failed to submit proof. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full mt-4">Submit Attendance Proof</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Proof for {event.title}</DialogTitle>
          <DialogDescription>
            Provide your LinkedIn post URL and a photo with an organizer or your event ID card to earn {event.points} points.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="linkedin">LinkedIn Post URL <span className="text-destructive">*</span></Label>
            <Input 
              id="linkedin"
              placeholder="https://www.linkedin.com/posts/..." 
              value={linkedInUrl}
              onChange={(e) => setLinkedInUrl(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label>Event Photo <span className="text-destructive">*</span></Label>
            <div 
              className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? (
                <div className="text-center">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">Click to change</p>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">Click to upload photo</p>
                  <p className="text-xs">With organizer or ID card</p>
                </div>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isSubmitting || !file || !linkedInUrl} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Proof'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AWSEvents() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Fetch AWS Events
  const { data: events, isLoading: loadingEvents } = useQuery({
    queryKey: ['aws-events'],
    queryFn: getAWSEvents,
  });

  // Fetch User's Pending Submissions (to show status)
  // For simplicity, we just fetch pending to see if they've already submitted recently
  // A real implementation might fetch all their submissions to show approved/rejected too
  const { data: pendingSubmissions } = useQuery({
    queryKey: ['aws-events-pending'],
    queryFn: getPendingEventSubmissions,
    enabled: isAuthenticated,
  });

  const getUserSubmissionStatus = (eventId: string) => {
    if (!pendingSubmissions || !user) return null;
    const submission = pendingSubmissions.find(s => s.eventId === eventId && s.userId === user.id);
    return submission ? submission.status : null;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Award className="h-4 w-4" />
            Official AWS Events
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Earn Points for Attending</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Did you attend an official AWS event like a Summit, Community Day, or re:Invent? 
            Submit your proof of attendance here to earn community points!
          </p>
        </motion.div>

        {loadingEvents ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : events && events.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => {
              const status = getUserSubmissionStatus(event.id);
              
              return (
                <motion.div key={event.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                  <Card className="h-full flex flex-col glass-card border-primary/20 hover:border-primary/50 transition-colors">
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="bg-primary/5 text-primary">
                          +{event.points} Points
                        </Badge>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3 mr-1" />
                          {format(parseISO(event.date), 'MMM d, yyyy')}
                        </div>
                      </div>
                      <CardTitle className="line-clamp-2">{event.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <p className="text-sm text-muted-foreground mb-6 flex-1 whitespace-pre-wrap">
                        {event.description}
                      </p>
                      
                      {isAuthenticated ? (
                        status === 'pending' ? (
                          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-md p-3 flex items-center justify-center gap-2 mt-auto">
                            <Clock className="h-4 w-4" />
                            <span className="text-sm font-medium">Review Pending</span>
                          </div>
                        ) : (
                          <SubmitProofDialog 
                            event={event} 
                            user={user} 
                            onSubmitted={() => queryClient.invalidateQueries({ queryKey: ['aws-events-pending'] })}
                          />
                        )
                      ) : (
                        <Button variant="outline" className="w-full mt-auto" disabled>
                          Login to Submit Proof
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <Card className="glass-card">
            <CardContent className="p-12 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
              <h3 className="text-lg font-semibold mb-2">No Events Found</h3>
              <p className="text-muted-foreground">There are currently no official AWS events listed for points.</p>
            </CardContent>
          </Card>
        )}
      </main>

      <Footer />
    </div>
  );
}
