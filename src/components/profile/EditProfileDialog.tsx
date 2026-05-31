import { useState, useRef, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Loader2, Camera, Upload, Briefcase, Building2, MapPin, Globe,
  Linkedin, Github, Twitter, GraduationCap, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { User as UserType } from '@/data/mockData';
import { updateUserProfile, CreateUserProfileData } from '@/lib/userProfile';
import { uploadFileToS3 } from '@/lib/s3Upload';
import { useAuth } from '@/contexts/AuthContext';

type UserTypeValue = 'student' | 'professional';

interface EditProfileDialogProps {
  user: UserType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the freshly updated user so the parent can update its state. */
  onUpdated: (updated: UserType) => void;
}

interface EditFormState {
  name: string;
  bio: string;
  avatar: string;
  userType: UserTypeValue;
  // Professional fields
  designation: string;
  companyName: string;
  companyCity: string;
  country: string;
  // Student (free-text) fields
  collegeName: string;
  collegeCity: string;
  // Social
  linkedIn: string;
  github: string;
  twitter: string;
}

function buildInitialState(user: UserType): EditFormState {
  const raw = user as unknown as Record<string, unknown>;
  const rawUserType = raw.userType as string | undefined;
  // Infer the user type: explicit field wins, otherwise infer from existing data.
  const inferredType: UserTypeValue =
    rawUserType === 'professional' || rawUserType === 'student'
      ? rawUserType
      : (user.company || raw.companyName) ? 'professional' : 'student';

  return {
    name: user.name || '',
    bio: user.bio || '',
    avatar: user.avatar || '',
    userType: inferredType,
    designation: user.designation || '',
    companyName: (raw.companyName as string) || user.company || '',
    companyCity: (raw.companyCity as string) || '',
    country: (raw.country as string) || '',
    collegeName: (raw.collegeName as string) || '',
    collegeCity: (raw.collegeCity as string) || '',
    linkedIn: user.linkedIn || '',
    github: user.github || '',
    twitter: user.twitter || '',
  };
}

export function EditProfileDialog({ user, open, onOpenChange, onUpdated }: EditProfileDialogProps) {
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<EditFormState>(() => buildInitialState(user));
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Reset form whenever the dialog is (re)opened for the current user.
  useEffect(() => {
    if (open) {
      setForm(buildInitialState(user));
    }
  }, [open, user]);

  const update = <K extends keyof EditFormState>(field: K, value: EditFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Please upload an image smaller than 5MB.');
      return;
    }

    setIsUploading(true);
    try {
      const url = await uploadFileToS3(file, 'profile-photos');
      update('avatar', url);
      toast.success('Photo uploaded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload photo.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required.');
      return;
    }

    setIsSaving(true);
    try {
      // Only send fields this form owns. Role/affiliation data (champ, cloud club,
      // community roles) is intentionally excluded and remains admin-managed.
      const payload: Partial<CreateUserProfileData> = {
        name: form.name.trim(),
        bio: form.bio.trim(),
        avatar: form.avatar,
        userType: form.userType,
        designation: form.userType === 'professional' ? form.designation.trim() : '',
        companyName: form.userType === 'professional' ? form.companyName.trim() : '',
        companyCity: form.userType === 'professional' ? form.companyCity.trim() : '',
        country: form.userType === 'professional' ? form.country.trim() : '',
        collegeName: form.userType === 'student' ? form.collegeName.trim() : '',
        collegeCity: form.userType === 'student' ? form.collegeCity.trim() : '',
        linkedIn: form.linkedIn.trim(),
        github: form.github.trim(),
        twitter: form.twitter.trim(),
      };

      const result = await updateUserProfile(user.id, payload);

      // Merge the result back into the local user object. Fall back to the
      // submitted values if the API echoes a partial object.
      const updatedUser: UserType = {
        ...user,
        ...(result?.user || {}),
        name: payload.name!,
        bio: payload.bio,
        avatar: payload.avatar || user.avatar,
        designation: payload.designation,
        company: payload.companyName,
        linkedIn: payload.linkedIn,
        github: payload.github,
        twitter: payload.twitter,
        id: user.id,
      };

      onUpdated(updatedUser);

      // Refresh the auth context so the header avatar/name stay in sync.
      try {
        await refreshUser();
      } catch {
        // Non-fatal: the profile page already reflects the change.
      }

      toast.success('Profile updated.');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const busy = isSaving || isUploading;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your personal details. Community roles and affiliations are managed by organisers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative w-24 h-24 rounded-full border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 cursor-pointer overflow-hidden transition-colors"
              onClick={() => !busy && fileInputRef.current?.click()}
            >
              {form.avatar ? (
                <>
                  <Avatar className="w-full h-full">
                    <AvatarImage src={form.avatar} alt={form.name} className="object-cover" />
                    <AvatarFallback className="text-2xl">{form.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    {isUploading ? (
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    ) : (
                      <Camera className="h-6 w-6 text-white" />
                    )}
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                  {isUploading ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-7 w-7 mb-1" />
                      <span className="text-xs">Upload</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <p className="text-xs text-muted-foreground">Click the photo to change it (max 5MB)</p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-name">Full Name</Label>
            <Input
              id="edit-name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Your name"
              disabled={busy}
            />
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="edit-bio">Bio</Label>
            <Textarea
              id="edit-bio"
              value={form.bio}
              onChange={(e) => update('bio', e.target.value)}
              placeholder="Tell the community a bit about yourself"
              rows={3}
              disabled={busy}
            />
          </div>

          {/* User type */}
          <div className="space-y-2">
            <Label className="text-base">I am a...</Label>
            <RadioGroup
              value={form.userType}
              onValueChange={(value) => update('userType', value as UserTypeValue)}
              className="grid grid-cols-2 gap-3"
            >
              <Label
                htmlFor="edit-student"
                className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  form.userType === 'student' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
                }`}
              >
                <RadioGroupItem value="student" id="edit-student" />
                <GraduationCap className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-sm">Student</span>
              </Label>
              <Label
                htmlFor="edit-professional"
                className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  form.userType === 'professional' ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
                }`}
              >
                <RadioGroupItem value="professional" id="edit-professional" />
                <Briefcase className="h-4 w-4 text-purple-500" />
                <span className="font-medium text-sm">Professional</span>
              </Label>
            </RadioGroup>
          </div>

          {/* Type-specific fields */}
          {form.userType === 'professional' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-designation">Role / Designation</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="edit-designation"
                    value={form.designation}
                    onChange={(e) => update('designation', e.target.value)}
                    placeholder="e.g., Solutions Architect"
                    className="pl-10"
                    disabled={busy}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-company">Company Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="edit-company"
                    value={form.companyName}
                    onChange={(e) => update('companyName', e.target.value)}
                    placeholder="Enter your company name"
                    className="pl-10"
                    disabled={busy}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-company-city">City</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="edit-company-city"
                    value={form.companyCity}
                    onChange={(e) => update('companyCity', e.target.value)}
                    placeholder="Enter your city"
                    className="pl-10"
                    disabled={busy}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-country">Country</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="edit-country"
                    value={form.country}
                    onChange={(e) => update('country', e.target.value)}
                    placeholder="Enter your country"
                    className="pl-10"
                    disabled={busy}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 flex gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <span>
                  College Champs and Cloud Club affiliations are assigned by organisers. Contact an
                  organiser to update those.
                </span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-college">College Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="edit-college"
                    value={form.collegeName}
                    onChange={(e) => update('collegeName', e.target.value)}
                    placeholder="Enter your college name"
                    className="pl-10"
                    disabled={busy}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-college-city">City</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="edit-college-city"
                    value={form.collegeCity}
                    onChange={(e) => update('collegeCity', e.target.value)}
                    placeholder="Enter your city"
                    className="pl-10"
                    disabled={busy}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Social links */}
          <div className="pt-2 border-t space-y-4">
            <Label className="text-base">Social Links</Label>
            <div className="space-y-2">
              <Label htmlFor="edit-linkedin">LinkedIn</Label>
              <div className="relative">
                <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-linkedin"
                  type="url"
                  value={form.linkedIn}
                  onChange={(e) => update('linkedIn', e.target.value)}
                  placeholder="https://linkedin.com/in/yourprofile"
                  className="pl-10"
                  disabled={busy}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-github">GitHub</Label>
              <div className="relative">
                <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-github"
                  type="url"
                  value={form.github}
                  onChange={(e) => update('github', e.target.value)}
                  placeholder="https://github.com/yourusername"
                  className="pl-10"
                  disabled={busy}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-twitter">X</Label>
              <div className="relative">
                <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="edit-twitter"
                  type="url"
                  value={form.twitter}
                  onChange={(e) => update('twitter', e.target.value)}
                  placeholder="https://x.com/yourusername"
                  className="pl-10"
                  disabled={busy}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
