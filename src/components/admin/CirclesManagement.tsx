import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Edit, Trash2, Users, Crown, Award, Clock, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { 
  listCircles, 
  createCircle, 
  updateCircle, 
  deleteCircle,
  Circle,
  AgentConfig 
} from '@/lib/circles';
import { User as UserType } from '@/data/mockData';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronDown } from 'lucide-react';

interface CirclesManagementProps {
  allUsers: UserType[];
}

function CreateGroupDialog({ onSuccess, allUsers }: { onSuccess: () => void; allUsers: UserType[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    level: 'Associate' as 'Foundational' | 'Associate' | 'Professional' | 'Specialty',
    description: '',
    color: 'bg-blue-500',
    ownerIds: [] as string[]
  });
  const [ownerSearchOpen, setOwnerSearchOpen] = useState(false);

  const selectedOwners = allUsers.filter(u => formData.ownerIds.includes(u.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.ownerIds.length === 0) {
      toast.error('Please select at least one owner');
      return;
    }
    
    setLoading(true);
    try {
      await createCircle({
        name: formData.name,
        level: formData.level,
        description: formData.description,
        ownerIds: formData.ownerIds,
        color: formData.color
      });
      
      toast.success('Circle created successfully!');
      setOpen(false);
      onSuccess();
      setFormData({ name: '', level: 'Associate', description: '', color: 'bg-blue-500', ownerIds: [] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create circle');
    } finally {
      setLoading(false);
    }
  };

  const toggleOwner = (userId: string) => {
    setFormData(prev => ({
      ...prev,
      ownerIds: prev.ownerIds.includes(userId)
        ? prev.ownerIds.filter(id => id !== userId)
        : [...prev.ownerIds, userId]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />Create Circle</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Circle</DialogTitle>
          <DialogDescription>Create a new circle for the community to join and collaborate in</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Circle Name *</Label>
            <Input 
              placeholder="e.g., AWS News Digest"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Level *</Label>
              <Select value={formData.level} onValueChange={(value: any) => setFormData({ ...formData, level: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Foundational">Foundational</SelectItem>
                  <SelectItem value="Associate">Associate</SelectItem>
                  <SelectItem value="Professional">Professional</SelectItem>
                  <SelectItem value="Specialty">Specialty</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Select value={formData.color} onValueChange={(value) => setFormData({ ...formData, color: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bg-blue-500">Blue</SelectItem>
                  <SelectItem value="bg-green-500">Green</SelectItem>
                  <SelectItem value="bg-purple-500">Purple</SelectItem>
                  <SelectItem value="bg-orange-500">Orange</SelectItem>
                  <SelectItem value="bg-red-500">Red</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea 
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this circle is about and what members will get..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Circle Owners * (Select one or more)</Label>
            <Popover open={ownerSearchOpen} onOpenChange={setOwnerSearchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="text-muted-foreground">
                    {selectedOwners.length > 0 ? `${selectedOwners.length} selected` : 'Select owners'}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search users..." />
                  <CommandList>
                    <CommandEmpty>No users found.</CommandEmpty>
                    <CommandGroup>
                      {allUsers.map((user) => (
                        <CommandItem key={user.id} value={user.name} onSelect={() => toggleOwner(user.id)}>
                          <div className="flex items-center gap-2 w-full">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="font-medium">{user.name}</div>
                              <div className="text-xs text-muted-foreground">{user.designation}</div>
                            </div>
                            {formData.ownerIds.includes(user.id) && <Check className="h-4 w-4 text-primary" />}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedOwners.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedOwners.map(owner => (
                  <Badge key={owner.id} variant="secondary" className="gap-1">
                    <Crown className="h-3 w-3" />
                    {owner.name}
                    <button type="button" onClick={() => toggleOwner(owner.id)} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? <><Clock className="h-4 w-4 mr-2 animate-spin" />Creating...</> : <><Plus className="h-4 w-4 mr-2" />Create Circle</>}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AgentConfigDialog({ group, onSuccess }: { group: Circle; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const existing = group.agentConfig;
  const [form, setForm] = useState({
    enabled: existing?.enabled ?? false,
    type: existing?.type ?? 'aws-news-digest',
    frequency: existing?.frequency ?? 'daily',
    botName: existing?.botName ?? 'AWS News Digest',
    mode: existing?.mode ?? 'replace',
  });

  const save = async () => {
    setLoading(true);
    try {
      await updateCircle(group.id, {
        agentConfig: {
          enabled: form.enabled,
          type: form.type as AgentConfig['type'],
          frequency: form.frequency as AgentConfig['frequency'],
          botName: form.botName,
          mode: form.mode as AgentConfig['mode'],
        },
      });
      toast.success('Agent settings saved');
      setOpen(false);
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save agent settings');
    } finally {
      setLoading(false);
    }
  };

  const detach = async () => {
    if (!confirm('Remove the agent from this circle? It will stop posting.')) return;
    setLoading(true);
    try {
      await updateCircle(group.id, { agentConfig: null });
      toast.success('Agent removed from circle');
      setOpen(false);
      onSuccess();
    } catch (e) {
      toast.error('Failed to remove agent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Bot className="h-4 w-4" />
          Agent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agent Circle Settings
          </DialogTitle>
          <DialogDescription>
            Turn "{group.name}" into an agent circle. An AI agent will post digests here on a schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="font-medium">Enable agent posting</Label>
              <p className="text-xs text-muted-foreground">When on, the agent posts automatically.</p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
            />
          </div>

          <div className="space-y-2">
            <Label>Agent</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aws-news-digest">AWS News Digest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Posting mode</Label>
              <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Update one pinned post</SelectItem>
                  <SelectItem value="append">New post each run</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Bot display name</Label>
            <Input
              value={form.botName}
              onChange={(e) => setForm({ ...form, botName: e.target.value })}
              placeholder="AWS News Digest"
            />
          </div>

          {existing?.lastRunAt && (
            <p className="text-xs text-muted-foreground">
              Last run: {existing.lastRunAt}{existing.lastRunStatus ? ` (${existing.lastRunStatus})` : ''}
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={save} disabled={loading} className="flex-1">
            {loading ? <><Clock className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save'}
          </Button>
          {existing && (
            <Button variant="destructive" onClick={detach} disabled={loading}>
              Remove agent
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CirclesManagement({ allUsers }: CirclesManagementProps) {
  const [groups, setGroups] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const data = await listCircles();
      setGroups(data);
    } catch (error) {
      toast.error('Failed to load circles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    
    try {
      await deleteCircle(id);
      toast.success('Circle deleted successfully');
      fetchGroups();
    } catch (error) {
      toast.error('Failed to delete circle');
    }
  };

  const getOwnerNames = (ownerIds: string[]) => {
    return ownerIds.map(id => allUsers.find(u => u.id === id)?.name || 'Unknown').join(', ');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Manage Circles</h2>
        <CreateGroupDialog onSuccess={fetchGroups} allUsers={allUsers} />
      </div>

      {loading ? (
        <div className="text-center py-8">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading circles...</p>
        </div>
      ) : groups.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No circles found. Create your first circle!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <Card key={group.id} className="glass-card">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg">{group.name}</h3>
                      <Badge className={group.color}>{group.level}</Badge>
                      {group.agentConfig && (
                        <Badge
                          variant={group.agentConfig.enabled ? 'default' : 'secondary'}
                          className="gap-1"
                        >
                          <Bot className="h-3 w-3" />
                          {group.agentConfig.enabled ? 'Agent on' : 'Agent off'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{group.description}</p>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {group.members.length} members
                      </span>
                      <span className="flex items-center gap-1">
                        <Crown className="h-4 w-4 text-amber-500" />
                        Owners: {getOwnerNames(group.owners)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <AgentConfigDialog group={group} onSuccess={fetchGroups} />
                    <Button variant="outline" size="sm" className="gap-1">
                      <Edit className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" className="gap-1" onClick={() => handleDelete(group.id, group.name)}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
