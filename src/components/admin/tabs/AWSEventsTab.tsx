import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Calendar, CheckCircle, XCircle, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAWSEvents, createAWSEvent, deleteAWSEvent, getPendingEventSubmissions, reviewEventSubmission } from '@/lib/awsEvents';
import { AWSEvent, AWSEventSubmission } from '@/data/mockData';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

function CreateEventDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    points: '100',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createAWSEvent({
        title: formData.title,
        description: formData.description,
        date: formData.date,
        points: parseInt(formData.points, 10) || 0,
      });
      toast.success('AWS Event created successfully!');
      setOpen(false);
      setFormData({ title: '', description: '', date: '', points: '100' });
      onCreated();
    } catch (error) {
      toast.error('Failed to create AWS Event');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Create AWS Event</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Official AWS Event</DialogTitle>
          <DialogDescription>Add a new official AWS event that participants can claim attendance for.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Event Title</Label>
            <Input 
              value={formData.title} 
              onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} 
              placeholder="e.g., AWS Summit 2025" 
              required 
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea 
              value={formData.description} 
              onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} 
              placeholder="Brief description of the event..." 
              required 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input 
                type="date" 
                value={formData.date} 
                onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label>Points to Award</Label>
              <Input 
                type="number" 
                value={formData.points} 
                onChange={e => setFormData(p => ({ ...p, points: e.target.value }))} 
                min="0" 
                required 
              />
            </div>
          </div>
          <div className="pt-4 flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Event
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AWSEventsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: events, isLoading: loadingEvents } = useQuery({
    queryKey: ['admin-aws-events'],
    queryFn: getAWSEvents,
  });

  const { data: submissions, isLoading: loadingSubmissions } = useQuery({
    queryKey: ['admin-aws-submissions'],
    queryFn: getPendingEventSubmissions,
  });

  const handleReview = async (submissionId: string, status: 'approved' | 'rejected') => {
    try {
      await reviewEventSubmission(submissionId, status, user?.name || 'Admin', user?.id || 'admin1');
      toast.success(`Submission ${status} successfully!`);
      queryClient.invalidateQueries({ queryKey: ['admin-aws-submissions'] });
    } catch (error) {
      toast.error('Failed to review submission');
      console.error(error);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this event? This will not delete associated submissions.')) return;
    try {
      await deleteAWSEvent(id);
      toast.success('Event deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-aws-events'] });
    } catch (error) {
      toast.error('Failed to delete event');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Official AWS Events</h2>
          <p className="text-muted-foreground">
            Manage official AWS events and review attendance proofs for points.
          </p>
        </div>
        <CreateEventDialog onCreated={() => queryClient.invalidateQueries({ queryKey: ['admin-aws-events'] })} />
      </div>

      <Tabs defaultValue="events" className="w-full">
        <TabsList>
          <TabsTrigger value="events">Manage Events</TabsTrigger>
          <TabsTrigger value="proofs" className="relative">
            Review Proofs
            {submissions && submissions.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                {submissions.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Configured Events</CardTitle>
              <CardDescription>Events available for participants to claim attendance.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingEvents ? (
                <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : events && events.length > 0 ? (
                <div className="space-y-4">
                  {events.map((event) => (
                    <div key={event.id} className="flex justify-between items-center p-4 border rounded-lg bg-card">
                      <div>
                        <h4 className="font-semibold text-lg">{event.title}</h4>
                        <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center"><Calendar className="h-4 w-4 mr-1" /> {format(parseISO(event.date), 'PP')}</span>
                          <span className="text-primary font-medium">+{event.points} Points</span>
                        </div>
                      </div>
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteEvent(event.id)}>
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  No events configured yet. Create one to get started.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proofs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Attendance Proofs</CardTitle>
              <CardDescription>Review and approve participant submissions.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSubmissions ? (
                <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : submissions && submissions.length > 0 ? (
                <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                  {submissions.map((sub) => {
                    // Find the event title to display
                    const eventTitle = events?.find(e => e.id === sub.eventId)?.title || 'Unknown Event';
                    
                    return (
                      <div key={sub.id} className="p-4 border rounded-lg bg-card flex flex-col md:flex-row gap-6">
                        {/* User Info & Event */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <img src={sub.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${sub.userName}`} alt="Avatar" className="w-8 h-8 rounded-full border" />
                            <span className="font-medium">{sub.userName}</span>
                          </div>
                          <p className="text-sm">Submitted for: <strong className="text-primary">{eventTitle}</strong></p>
                          <div className="text-xs text-muted-foreground pt-2">
                            Submitted at: {format(parseISO(sub.submittedAt), 'PPp')}
                          </div>
                          
                          <div className="mt-4 flex gap-2">
                            <Button 
                              variant="outline" 
                              className="w-full text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => handleReview(sub.id, 'approved')}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Approve & Award
                            </Button>
                            <Button 
                              variant="outline" 
                              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleReview(sub.id, 'rejected')}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                        </div>

                        {/* Proof Content */}
                        <div className="flex-1 space-y-4">
                          <a 
                            href={sub.linkedInUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-3 bg-blue-50/50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                          >
                            <ExternalLink className="h-4 w-4" />
                            <span className="text-sm font-medium line-clamp-1">{sub.linkedInUrl}</span>
                          </a>

                          <div className="border rounded-md overflow-hidden bg-muted/20">
                            <div className="p-2 bg-muted flex items-center gap-2 text-xs font-medium text-muted-foreground">
                              <ImageIcon className="h-4 w-4" />
                              Uploaded Photo
                            </div>
                            <div className="p-2">
                              <a href={sub.photoUrl} target="_blank" rel="noopener noreferrer">
                                <img 
                                  src={sub.photoUrl} 
                                  alt="Proof" 
                                  className="max-h-48 w-full object-contain bg-black/5 rounded cursor-pointer hover:opacity-90 transition-opacity" 
                                />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  No pending proofs to review.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
