import * as React from 'react';
import { useState } from 'react';
import { 
  Check, ChevronDown, X 
} from 'lucide-react';
import { 
  Popover, PopoverContent, PopoverTrigger 
} from '@/components/ui/popover';
import { 
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList 
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { User as UserType } from '@/data/mockData';

// Types for session/meetup participants
export interface SessionPerson {
  userId?: string;
  name: string;
  photo?: string;
  email?: string;
  designation?: string;
  company?: string;
  linkedIn?: string;
}

// Helper function to convert User to SessionPerson
export const userToSessionPerson = (user: UserType): SessionPerson => ({
  userId: user.userId || user.id,
  name: user.name,
  photo: user.avatar,
  email: user.email,
  designation: user.designation,
  company: user.company,
  linkedIn: user.linkedIn
});

// Helper to convert User to MeetupPerson (same structure as SessionPerson)
export const userToMeetupPerson = (user: UserType): SessionPerson => ({
  userId: user.id,
  name: user.name,
  photo: user.avatar,
  email: user.email,
  designation: user.designation,
  company: user.company,
  linkedIn: user.linkedIn
});

interface UserSelectProps {
  selectedUser?: SessionPerson;
  onSelect: (user: SessionPerson | undefined) => void;
  placeholder: string;
  excludeUserIds?: string[];
  allUsers?: UserType[];
}

export function UserSelect({
  selectedUser,
  onSelect,
  placeholder,
  excludeUserIds = [],
  allUsers = []
}: UserSelectProps) {
  const [open, setOpen] = useState(false);
  const availableUsers = allUsers.filter(user =>
    !excludeUserIds.includes(user.id) && user.id !== selectedUser?.userId
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedUser ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={selectedUser.photo} />
                <AvatarFallback>{selectedUser.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span>{selectedUser.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search users..." />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup>
              {availableUsers.map((user, index) => {
                const isSelected = selectedUser?.userId === user.id;
                return (
                  <CommandItem
                    key={user.id || `user-${index}`}
                    value={user.name}
                    onSelect={() => {
                      onSelect(isSelected ? undefined : userToSessionPerson(user));
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="font-medium">{user.name}</div>
                        {user.designation && (
                          <div className="text-xs text-muted-foreground">{user.designation}</div>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface UserMultiSelectProps {
  selectedUsers: SessionPerson[];
  onSelect: (users: SessionPerson[]) => void;
  placeholder: string;
  excludeUserIds?: string[];
  allUsers?: UserType[];
}

export function UserMultiSelect({
  selectedUsers,
  onSelect,
  placeholder,
  excludeUserIds = [],
  allUsers = []
}: UserMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedUserIds = selectedUsers.map(u => u.userId).filter(Boolean) as string[];
  const availableUsers = allUsers.filter(user =>
    !excludeUserIds.includes(user.id) && !selectedUserIds.includes(user.id)
  );

  const toggleUser = (user: UserType) => {
    const userPerson = userToSessionPerson(user);
    const isSelected = selectedUsers.some(u => u.userId === user.id);

    if (isSelected) {
      onSelect(selectedUsers.filter(u => u.userId !== user.id));
    } else {
      onSelect([...selectedUsers, userPerson]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className="text-muted-foreground">
            {selectedUsers.length > 0
              ? `${selectedUsers.length} selected`
              : placeholder}
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
              {availableUsers.map((user, index) => {
                const isSelected = selectedUsers.some(u => u.userId === user.id);
                return (
                  <CommandItem
                    key={user.id || `user-${index}`}
                    value={user.name}
                    onSelect={() => toggleUser(user)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="font-medium">{user.name}</div>
                        {user.designation && (
                          <div className="text-xs text-muted-foreground">{user.designation}</div>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface SessionPeopleManagerProps {
  sessionData: {
    hosts?: SessionPerson[];
    speakers?: SessionPerson[];
    volunteers?: SessionPerson[];
  };
  onUpdate: (data: {
    hosts?: SessionPerson[];
    speakers?: SessionPerson[];
    volunteers?: SessionPerson[];
  }) => void;
  allUsers?: UserType[];
}

export function SessionPeopleManager({
  sessionData,
  onUpdate,
  allUsers = []
}: SessionPeopleManagerProps) {
  const removeHost = (userId: string) => {
    const updated = (sessionData.hosts || []).filter(h => h.userId !== userId);
    onUpdate({ ...sessionData, hosts: updated });
  };

  const removeSpeaker = (userId: string) => {
    const updated = (sessionData.speakers || []).filter(s => s.userId !== userId);
    onUpdate({ ...sessionData, speakers: updated });
  };

  const removeVolunteer = (userId: string) => {
    const updated = (sessionData.volunteers || []).filter(v => v.userId !== userId);
    onUpdate({ ...sessionData, volunteers: updated });
  };

  return (
    <div className="space-y-6">
      {/* Hosts */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">
          Hosts ({sessionData.hosts?.length || 0})
        </Label>
        <div className="space-y-2">
          {sessionData.hosts?.map((host, index) => (
            <div key={host.userId || `host-${index}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={host.photo} />
                <AvatarFallback>{host.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{host.name}</span>
                  <Badge variant="outline" className="text-xs">Host</Badge>
                </div>
                {host.designation && (
                  <p className="text-xs text-muted-foreground">{host.designation}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeHost(host.userId!)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <UserMultiSelect
            allUsers={allUsers}
            selectedUsers={sessionData.hosts || []}
            onSelect={(users) => onUpdate({ ...sessionData, hosts: users })}
            placeholder="Select hosts..."
          />
        </div>
      </div>

      {/* Speakers */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">
          Speakers ({sessionData.speakers?.length || 0}) *
        </Label>
        <div className="space-y-2">
          {sessionData.speakers?.map((speaker, index) => (
            <div key={speaker.userId || `speaker-${index}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={speaker.photo} />
                <AvatarFallback>{speaker.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{speaker.name}</span>
                  <Badge variant="default" className="text-xs">Speaker</Badge>
                </div>
                {speaker.designation && (
                  <p className="text-xs text-muted-foreground">{speaker.designation}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeSpeaker(speaker.userId!)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <UserMultiSelect
            allUsers={allUsers}
            selectedUsers={sessionData.speakers || []}
            onSelect={(users) => onUpdate({ ...sessionData, speakers: users })}
            placeholder="Select speakers..."
          />
        </div>
      </div>

      {/* Volunteers */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">
          Volunteers ({sessionData.volunteers?.length || 0})
        </Label>
        <div className="space-y-2">
          {sessionData.volunteers?.map((volunteer, index) => (
            <div key={volunteer.userId || `volunteer-${index}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={volunteer.photo} />
                <AvatarFallback>{volunteer.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{volunteer.name}</span>
                  <Badge variant="secondary" className="text-xs">Volunteer</Badge>
                </div>
                {volunteer.designation && (
                  <p className="text-xs text-muted-foreground">{volunteer.designation}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeVolunteer(volunteer.userId!)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <UserMultiSelect
            allUsers={allUsers}
            selectedUsers={sessionData.volunteers || []}
            onSelect={(users) => onUpdate({ ...sessionData, volunteers: users })}
            placeholder="Select volunteers..."
          />
        </div>
      </div>
    </div>
  );
}

interface MeetupPeopleManagerProps {
  meetupData: {
    speakers?: any[];
    hosts?: any[];
    volunteers?: any[];
  };
  onUpdate: (data: {
    speakers?: any[];
    hosts?: any[];
    volunteers?: any[];
  }) => void;
  allUsers?: UserType[];
}

export function MeetupPeopleManager({
  meetupData,
  onUpdate,
  allUsers = []
}: MeetupPeopleManagerProps) {
  const removeSpeaker = (userId: string) => {
    const updated = (meetupData.speakers || []).filter((s: any) => s.userId !== userId);
    onUpdate({ ...meetupData, speakers: updated });
  };

  const removeHost = (userId: string) => {
    const updated = (meetupData.hosts || []).filter((h: any) => h.userId !== userId);
    onUpdate({ ...meetupData, hosts: updated });
  };

  const removeVolunteer = (userId: string) => {
    const updated = (meetupData.volunteers || []).filter((v: any) => v.userId !== userId);
    onUpdate({ ...meetupData, volunteers: updated });
  };

  return (
    <div className="space-y-6">
      {/* Speakers */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">
          Speakers ({meetupData.speakers?.length || 0})
        </Label>
        <div className="space-y-2">
          {meetupData.speakers?.map((speaker: any, index: number) => (
            <div key={speaker.userId || `speaker-${index}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={speaker.photo} />
                <AvatarFallback>{speaker.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{speaker.name}</span>
                  <Badge variant="default" className="text-xs">Speaker</Badge>
                </div>
                {speaker.designation && (
                  <p className="text-xs text-muted-foreground">{speaker.designation}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeSpeaker(speaker.userId!)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <UserMultiSelect
            allUsers={allUsers}
            selectedUsers={meetupData.speakers || []}
            onSelect={(users) => onUpdate({ ...meetupData, speakers: users })}
            placeholder="Select speakers..."
          />
        </div>
      </div>

      {/* Organisers */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">
          Organisers ({meetupData.hosts?.length || 0})
        </Label>
        <div className="space-y-2">
          {meetupData.hosts?.map((host: any, index: number) => (
            <div key={host.userId || `host-${index}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={host.photo} />
                <AvatarFallback>{host.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{host.name}</span>
                  <Badge variant="outline" className="text-xs">Organiser</Badge>
                </div>
                {host.designation && (
                  <p className="text-xs text-muted-foreground">{host.designation}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeHost(host.userId!)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <UserMultiSelect
            allUsers={allUsers}
            selectedUsers={meetupData.hosts || []}
            onSelect={(users) => onUpdate({ ...meetupData, hosts: users })}
            placeholder="Select organisers..."
          />
        </div>
      </div>

      {/* Volunteers */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">
          Volunteers ({meetupData.volunteers?.length || 0})
        </Label>
        <div className="space-y-2">
          {meetupData.volunteers?.map((volunteer: any, index: number) => (
            <div key={volunteer.userId || `volunteer-${index}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={volunteer.photo} />
                <AvatarFallback>{volunteer.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{volunteer.name}</span>
                  <Badge variant="secondary" className="text-xs">Volunteer</Badge>
                </div>
                {volunteer.designation && (
                  <p className="text-xs text-muted-foreground">{volunteer.designation}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeVolunteer(volunteer.userId!)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <UserMultiSelect
            allUsers={allUsers}
            selectedUsers={meetupData.volunteers || []}
            onSelect={(users) => onUpdate({ ...meetupData, volunteers: users })}
            placeholder="Select volunteers..."
          />
        </div>
      </div>
    </div>
  );
}
