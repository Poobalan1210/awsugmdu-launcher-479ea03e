import { useState, useEffect } from 'react';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Plus, Calendar, Users, CheckCircle, XCircle, Clock,
  Rocket, ExternalLink, MessageSquare, Award, Link2,
  Copy, Mail, Edit, Trash2, Eye, FileText, User as UserIcon, Video,
  Upload, X, Check, ChevronDown, ChevronUp, GraduationCap,
  ListTodo, Medal, Github, Star, Quote, List, Hash, Type, CheckSquare
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { 
  Sprint, Submission, SubmissionField, User as UserType, 
  mockSprints, mockUsers 
} from '@/data/mockData';
import { 
  getSprints, createSprint, updateSprint, deleteSprint, 
  addSession, deleteSession, reviewSubmission,
  CreateSprintData, UpdateSprintData, CreateSessionData 
} from '@/lib/sprints';
import { uploadFileToS3 } from '@/lib/s3Upload';
import { SessionPerson, SessionPeopleManager } from '@/components/admin/shared/AdminShared';

interface SprintsTabProps {
  isAdmin: boolean;
  isSpeaker: boolean;
  authUser: UserType | null;
  onRefreshStats?: () => void;
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------

function SubmissionReview({ submission, submissionFormConfig, onAction }: {
  submission: Submission & { sprintTitle: string };
  submissionFormConfig?: SubmissionField[];
  onAction: (action: 'approve' | 'reject', points?: number, feedback?: string) => void
}) {
  const [points, setPoints] = useState(submission.points || 100);
  const [feedback, setFeedback] = useState(submission.feedback || '');
  const [showFeedback, setShowFeedback] = useState(false);

  const isPending = submission.status === 'pending';

  return (
    <Card className="glass-card overflow-hidden border-border/40 hover:border-primary/30 transition-all duration-300">
      <CardContent className="p-0">
        <Collapsible defaultOpen={false} className="w-full group/main-collapsible">
          <CollapsibleTrigger asChild>
            <div className="p-4 border-b border-border/50 bg-muted/20 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 ring-2 ring-background border border-border/50">
                  <AvatarImage src={submission.userAvatar} />
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                    {submission.userName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-semibold text-sm leading-tight text-foreground">{submission.userName}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 bg-background/50 border-primary/20 text-primary uppercase tracking-wider font-semibold">
                      {submission.sprintTitle}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {format(parseISO(submission.submittedAt), 'MMM d, h:mm a')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Badge
                  variant={
                    submission.status === 'approved' ? 'default' :
                      submission.status === 'rejected' ? 'destructive' : 'secondary'
                  }
                  className={`capitalize font-semibold text-[10px] px-2 py-0.5 rounded-full ${submission.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                      submission.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                        'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    }`}
                >
                  {submission.status}
                </Badge>
                <div className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-background/50 transition-colors">
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-data-[state=open]/main-collapsible:rotate-180" />
                </div>
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="w-full">
            <div className="p-5 flex flex-col lg:flex-row gap-6 border-t border-border/10">
              <div className="flex-1 space-y-6">
                {/* Submission Details */}
                {(() => {
                  const customFields = submission.customFields || {};
                  const fields = { ...customFields };
                  const hasKiroInCustom = Object.keys(fields).some(k =>
                    k.toLowerCase().includes('kiro') ||
                    submissionFormConfig?.find(f => f.id === k)?.label.toLowerCase().includes('kiro')
                  );

                  if (submission.isFirstTimeKiro !== undefined && fields.isFirstTimeKiro === undefined && !hasKiroInCustom) {
                    fields.isFirstTimeKiro = submission.isFirstTimeKiro;
                  }

                  const fieldEntries = Object.entries(fields);
                  if (fieldEntries.length === 0) return null;

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <div className="h-4 w-1 bg-primary/40 rounded-full" />
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Technical details</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 p-5 bg-muted/20 rounded-2xl border border-border/40 shadow-inner-sm">
                        {fieldEntries.map(([key, value]) => {
                          const configField = submissionFormConfig?.find(f => f.id === key);
                          const isKiro = key === 'isFirstTimeKiro' || configField?.label.toLowerCase().includes('kiro');
                          const displayKey = configField?.label || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

                          let Icon = List;
                          let isLong = false;
                          let displayValue = String(value);

                          if (typeof value === 'boolean') Icon = CheckSquare;
                          else if (typeof value === 'number') Icon = Hash;
                          else if (typeof value === 'string') {
                            isLong = value.length >= 40;
                            Icon = value.length > 100 ? FileText : (value.length > 30 ? Type : List);
                          }

                          return (
                            <div key={key} className={`space-y-1.5 ${isLong ? 'md:col-span-2' : ''}`}>
                              <Label className="text-[11px] font-bold text-muted-foreground/80 flex items-center gap-2">
                                <Icon className="h-3 w-3 text-primary/60" />
                                {displayKey}
                              </Label>
                              <div className={`p-2.5 rounded-lg border bg-background/50 transition-all duration-200 hover:border-primary/20 hover:bg-background/80 ${isKiro && (value === 'Yes' || value === true || value === 'First Time') ? 'border-primary/30 bg-primary/5' : 'border-border/60'}`}>
                                {typeof value === 'boolean' ? (
                                  <div className="flex items-center gap-2">
                                    <div className={`h-2.5 w-2.5 rounded-full ${value ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-muted'}`} />
                                    <span className="text-sm font-semibold">{value ? 'Yes' : 'No'}</span>
                                  </div>
                                ) : (
                                  <p className="text-sm font-semibold text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                    {isKiro && (value === 'Yes' || value === true || value === 'First Time') && <Star className="inline-block h-3.5 w-3.5 mr-2 text-primary fill-primary/20 animate-pulse" />}
                                    {displayValue}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {submission.comments && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <div className="h-4 w-1 bg-amber-500/40 rounded-full" />
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Builder Comments</p>
                    </div>
                    <div className="bg-muted/5 border border-border/30 rounded-xl p-4 relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                      <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                        {submission.comments}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {(submission.blogUrl || submission.githubUrl) && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Project Links</p>
                      <div className="flex flex-col gap-2">
                        {submission.blogUrl && (
                          <a href={submission.blogUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center justify-between group/link bg-background border border-border/60 hover:border-primary/40 hover:bg-primary/5 p-2 rounded-lg transition-all duration-200">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-md bg-orange-500/10 text-orange-500">
                                <FileText className="h-3.5 w-3.5" />
                              </div>
                              <span className="text-xs font-medium">Blog Post</span>
                            </div>
                            <ExternalLink className="h-3 w-3 text-muted-foreground group-hover/link:text-primary transition-colors" />
                          </a>
                        )}
                        {submission.githubUrl && (
                          <a href={submission.githubUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center justify-between group/link bg-background border border-border/60 hover:border-primary/40 hover:bg-primary/5 p-2 rounded-lg transition-all duration-200">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-md bg-foreground/10 text-foreground">
                                <Github className="h-3.5 w-3.5" />
                              </div>
                              <span className="text-xs font-medium">GitHub Repository</span>
                            </div>
                            <ExternalLink className="h-3 w-3 text-muted-foreground group-hover/link:text-primary transition-colors" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {submission.supportingDocuments && submission.supportingDocuments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Supporting Docs</p>
                      <div className="flex flex-wrap gap-2">
                        {submission.supportingDocuments.map((docUrl, index) => (
                          <a key={index} href={docUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-muted/40 hover:bg-muted/80 border border-transparent hover:border-border/60 px-3 py-1.5 rounded-full transition-all duration-200 group/doc">
                            <FileText className="h-3 w-3 text-primary group-hover/doc:scale-110 transition-transform" />
                            <span className="text-[11px] font-medium">Doc {index + 1}</span>
                            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:w-80 flex-shrink-0">
                <div className={`h-full flex flex-col p-5 rounded-2xl border transition-all duration-500 ${isPending ? 'bg-primary/[0.03] border-primary/20 shadow-sm' : 'bg-emerald-500/[0.03] border-emerald-500/20 shadow-sm flex items-center justify-center'}`}>
                  {isPending ? (
                    <div className="space-y-5 w-full">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-primary">Reward Submission</h5>
                        <Award className="h-4 w-4 text-primary animate-pulse" />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <Label className="text-[11px] font-bold">Award Points</Label>
                          <span className="text-[11px] font-mono font-bold bg-primary/10 text-primary px-2 rounded-full">{points}</span>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={points}
                            onChange={(e) => setPoints(Number(e.target.value))}
                            onKeyDown={(e) => { 
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                            }}
                            className="h-10 text-sm font-bold"
                            min={0}
                            max={1000}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <Label className="text-[11px] font-bold">Admin Feedback</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.preventDefault(); setShowFeedback(!showFeedback); }}
                            className={`h-6 text-[10px] font-bold ${showFeedback ? 'text-primary' : 'text-muted-foreground'}`}
                          >
                            {showFeedback ? 'Cancel' : 'Add Note +'}
                          </Button>
                        </div>
                        <AnimatePresence>
                          {showFeedback && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                              <Textarea
                                placeholder="Write a message to the builder..."
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                className="text-xs min-h-[90px]"
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-10 text-xs font-bold"
                          onClick={(e) => { 
                            e.preventDefault(); 
                            e.stopPropagation(); 
                            onAction('reject', 0, feedback); 
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                          Reject
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-10 text-xs font-bold bg-[#f97316] hover:bg-[#ea580c] text-white"
                          onClick={(e) => { 
                            e.preventDefault(); 
                            e.stopPropagation(); 
                            onAction('approve', points, feedback); 
                          }}
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                          Approve
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center space-y-4 py-4">
                      <div className="relative h-20 w-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
                        <Award className="h-10 w-10 text-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-emerald-600">Awarded {submission.points} pts</p>
                      </div>
                      {submission.feedback && (
                        <div className="px-3 py-2 bg-background border rounded-lg">
                          <p className="text-[11px] italic">{submission.feedback}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function ViewParticipantsDialog({ sprint }: { sprint: Sprint }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1">
          <Users className="h-4 w-4" /> Participants
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Participants - {sprint.title}</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sprint.submissions?.map(sub => (
              <TableRow key={sub.id}>
                <TableCell className="flex items-center gap-2">
                  <Avatar className="h-8 w-8"><AvatarImage src={sub.userAvatar} /></Avatar>
                  {sub.userName}
                </TableCell>
                <TableCell>{sub.points || 0}</TableCell>
                <TableCell className="capitalize">{sub.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

function SprintFormContent({ formData, setFormData, submissionFields, setSubmissionFields }: any) {
  const addField = () => {
    const id = `field-${Date.now()}`;
    setSubmissionFields([...submissionFields, { id, label: '', type: 'text', placeholder: '', required: false }]);
  };

  const removeField = (id: string) => {
    setSubmissionFields(submissionFields.filter((f: any) => f.id !== id));
  };

  const updateField = (id: string, updates: any) => {
    setSubmissionFields(submissionFields.map((f: any) => f.id === id ? { ...f, ...updates } : f));
  };

  const years = [new Date().getFullYear(), new Date().getFullYear() + 1];
  const months = [
    { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
    { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
    { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
    { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Sprint Title *</Label>
          <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="e.g., April Builders Skill Sprint" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label>Month *</Label>
            <Select value={formData.month} onValueChange={v => setFormData({ ...formData, month: v })}>
              <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Year *</Label>
            <Select value={formData.year} onValueChange={v => setFormData({ ...formData, year: v })}>
              <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the sprint goals..." />
      </div>
      <div className="space-y-4">
        <div className="flex justify-between items-center"><Label>Submission Form Configuration</Label><Button type="button" variant="outline" size="sm" onClick={addField}><Plus className="h-4 w-4 mr-2" />Add Field</Button></div>
        {submissionFields.map((field: any) => (
          <div key={field.id} className="p-4 border rounded-lg space-y-3 bg-muted/20">
            <div className="flex justify-between gap-2">
              <Input className="flex-1" value={field.label} onChange={e => updateField(field.id, { label: e.target.value })} placeholder="Field Label (e.g., Blog URL)" />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeField(field.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateSprintDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', month: '', year: '', githubRepo: '' });
  const [submissionFields, setSubmissionFields] = useState<SubmissionField[]>([
    { id: 'blogUrl', label: 'Blog URL', type: 'text', placeholder: '', required: false },
    { id: 'githubUrl', label: 'GitHub URL', type: 'text', placeholder: '', required: false }
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const startDate = `${formData.year}-${formData.month.padStart(2, '0')}-01`;
      await createSprint({ ...formData, startDate, endDate: startDate, submissionFormConfig: submissionFields });
      toast.success('Sprint created!');
      setOpen(false);
      onSuccess?.();
    } catch (e) { toast.error('Failed to create sprint'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" className="gap-2"><Plus className="h-4 w-4" />Create Sprint</Button></DialogTrigger>
      <DialogContent className="max-w-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader><DialogTitle>Create New Sprint</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <SprintFormContent formData={formData} setFormData={setFormData} submissionFields={submissionFields} setSubmissionFields={setSubmissionFields} />
          <div className="flex gap-2 pt-4 border-t"><Button type="submit" disabled={loading} className="flex-1">Create</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditSprintDialog({ sprint, onSuccess }: { sprint: Sprint; onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ title: sprint.title, description: sprint.description, month: '1', year: '2024', githubRepo: sprint.githubRepo || '' });
  const [submissionFields, setSubmissionFields] = useState<SubmissionField[]>(sprint.submissionFormConfig || []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateSprint(sprint.id, { ...formData, submissionFormConfig: submissionFields });
      toast.success('Sprint updated!');
      setOpen(false);
      onSuccess?.();
    } catch (e) { toast.error('Failed to update sprint'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" size="sm"><Edit className="h-4 w-4 mr-2" />Edit</Button></DialogTrigger>
      <DialogContent className="max-w-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader><DialogTitle>Edit Sprint</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <SprintFormContent formData={formData} setFormData={setFormData} submissionFields={submissionFields} setSubmissionFields={setSubmissionFields} />
          <div className="flex gap-2 pt-4 border-t"><Button type="submit" disabled={loading} className="flex-1">Save</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddSessionDialog({ sprint, onSuccess, allUsers = mockUsers }: { sprint: Sprint; onSuccess?: () => void; allUsers?: UserType[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    title: '', date: '', time: '', duration: '90',
    description: '', meetingLink: '', meetupUrl: '', posterImage: ''
  });
  const [peopleData, setPeopleData] = useState<{
    hosts?: SessionPerson[];
    speakers?: SessionPerson[];
    volunteers?: SessionPerson[];
  }>({ hosts: [], speakers: [], volunteers: [] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peopleData.speakers || peopleData.speakers.length === 0) {
      toast.error('Please add at least one speaker for this session');
      return;
    }
    if (!formData.posterImage) {
      toast.error('Please add a poster image for this session');
      return;
    }
    setLoading(true);
    try {
      const primarySpeaker = peopleData.speakers[0];
      const sessionData: CreateSessionData = {
        title: formData.title,
        speaker: primarySpeaker.name,
        speakerId: primarySpeaker.userId,
        speakerPhoto: primarySpeaker.photo,
        speakerDesignation: primarySpeaker.designation,
        speakerCompany: primarySpeaker.company,
        speakerLinkedIn: primarySpeaker.linkedIn,
        hosts: peopleData.hosts,
        speakers: peopleData.speakers,
        volunteers: peopleData.volunteers,
        date: formData.date,
        time: formData.time,
        duration: `${formData.duration} minutes`,
        description: formData.description,
        meetingLink: formData.meetingLink || undefined,
        meetupUrl: formData.meetupUrl || undefined,
        posterImage: formData.posterImage || undefined
      };
      await addSession(sprint.id, sessionData);
      toast.success('Session added successfully!');
      setFormData({ title: '', date: '', time: '', duration: '90', description: '', meetingLink: '', meetupUrl: '', posterImage: '' });
      setPeopleData({ hosts: [], speakers: [], volunteers: [] });
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add session');
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Video className="h-4 w-4" /> Add Session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Session to {sprint.title}</DialogTitle>
          <DialogDescription>Create a new session for this sprint.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Session Details</h3>
            <div className="space-y-2">
              <Label>Session Title *</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g., Introduction to Serverless" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input type="time" value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Input type="number" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })} placeholder="90" min="15" />
              </div>
              <div className="space-y-2">
                <Label>Meeting Link</Label>
                <Input value={formData.meetingLink} onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })} placeholder="https://meet..." />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Session Description *</Label>
              <Textarea rows={4} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Objectives..." required />
            </div>
            <div className="space-y-2">
              <Label>Poster Image *</Label>
              <div className="flex gap-2">
                <Input value={formData.posterImage} onChange={(e) => setFormData({ ...formData, posterImage: e.target.value })} placeholder="URL or upload" required />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingImage(true);
                  try {
                    const imageUrl = await uploadFileToS3(file, 'meetup-posters');
                    setFormData({ ...formData, posterImage: imageUrl });
                  } catch (error) { toast.error('Upload failed'); }
                  finally { setUploadingImage(false); }
                }} />
                <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
                  {uploadingImage ? <Clock className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-semibold text-lg">Session People</h3>
            <SessionPeopleManager sessionData={peopleData} onUpdate={setPeopleData} allUsers={allUsers} />
          </div>
          <div className="flex gap-2 pt-4 border-t">
            <Button type="submit" className="flex-1" disabled={loading || uploadingImage}>Create Session</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Main SprintsTab Component
// --------------------------------------------------------------------------

export default function SprintsTab({ isAdmin, isSpeaker, authUser, onRefreshStats }: SprintsTabProps) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSprints = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getSprints();
      setSprints(data);
      setAllSubmissions(data.flatMap(s => (s.submissions || []).map(sub => ({ ...sub, sprintTitle: s.title, sprintId: s.id }))));
      // Refresh global admin stats if callback provided
      onRefreshStats?.();
    } catch (e) {
      toast.error('Failed to fetch sprints');
      setSprints(mockSprints);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSprints();
  }, []);

  const handleSubmissionAction = async (subId: string, sprintId: string, action: string, points?: number, feedback?: string) => {
    try {
      await reviewSubmission(sprintId, {
        submissionId: subId,
        status: action === 'approve' ? 'approved' : 'rejected',
        points: action === 'approve' ? points : 0,
        feedback,
        reviewedBy: authUser?.id || '',
        reviewerName: authUser?.name
      });
      toast.success(`Submission ${action}d!`);
      fetchSprints(true); // Silent refresh in background
    } catch (e) {
      toast.error('Failed to review submission');
    }
  };

  const handleDeleteSprint = async (id: string, title: string) => {
    if (confirm(`Delete ${title}?`)) {
      try {
        await deleteSprint(id);
        toast.success('Sprint deleted');
        fetchSprints(true); // Silent refresh in background
      } catch (e) { toast.error('Failed to delete'); }
    }
  };

  if (loading) {
    return <div className="text-center py-12"><Clock className="h-8 w-8 animate-spin mx-auto mb-4" /><p>Loading sprints...</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Manage Sprints</h2>
        <CreateSprintDialog onSuccess={() => fetchSprints(true)} />
      </div>

      <div className="space-y-4">
        {sprints.map(sprint => {
          const sprintSubmissions = allSubmissions.filter(sub => sub.sprintId === sprint.id);
          const pending = sprintSubmissions.filter(s => s.status === 'pending');
          const reviewed = sprintSubmissions.filter(s => s.status !== 'pending');

          return (
            <Card key={sprint.id} className="glass-card">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">{sprint.title}</h3>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-4 w-4" />{sprint.participants} participants</span>
                      <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />Submissions: {sprintSubmissions.length}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <AddSessionDialog sprint={sprint} onSuccess={() => fetchSprints(true)} />
                    <ViewParticipantsDialog sprint={sprint} />
                    <EditSprintDialog sprint={sprint} onSuccess={() => fetchSprints(true)} />
                    <Button type="button" variant="destructive" size="sm" onClick={() => handleDeleteSprint(sprint.id, sprint.title)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>

                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" className="w-full flex justify-between items-center py-4 border-t group">
                      <div className="flex items-center gap-2 font-semibold"><ListTodo className="h-4 w-4 text-primary" />Submissions ({sprintSubmissions.length})</div>
                      <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-6 pt-4">
                    {pending.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold mb-4 flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" />Pending Reviews</h4>
                        <div className="space-y-4">
                          {pending.map(sub => (
                            <SubmissionReview 
                              key={sub.id} 
                              submission={sub} 
                              onAction={(a, p, f) => {
                                handleSubmissionAction(sub.id, sub.sprintId, a, p, f);
                              }} 
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {reviewed.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold mb-4 flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500" />Reviewed</h4>
                        <div className="space-y-4">
                          {reviewed.map(sub => (
                            <SubmissionReview key={sub.id} submission={sub} onAction={() => {}} />
                          ))}
                        </div>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
