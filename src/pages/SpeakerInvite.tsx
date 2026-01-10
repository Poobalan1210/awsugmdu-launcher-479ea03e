import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Mic, User, Building, FileText, Link2, Upload, 
  CheckCircle, Linkedin, Camera
} from 'lucide-react';
import { toast } from 'sonner';

export default function SpeakerInvite() {
  const { inviteId } = useParams();
  const [submitted, setSubmitted] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    photo: '',
    designation: '',
    company: '',
    bio: '',
    linkedIn: '',
    topic: '',
    sessionDetails: '',
    slidesUrl: ''
  });

  // In real app, validate the invite link against backend
  const isValidInvite = inviteId && inviteId.startsWith('speaker-invite');

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Speaker details submitted:', formData);
    toast.success('Your session details have been submitted successfully!');
    setSubmitted(true);
  };

  if (!isValidInvite) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header isLoggedIn={false} />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
          <Card className="glass-card max-w-md">
            <CardContent className="p-8 text-center">
              <Link2 className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <h2 className="text-xl font-bold mb-2">Invalid or Expired Link</h2>
              <p className="text-muted-foreground mb-4">
                This speaker invitation link is not valid or has expired.
              </p>
              <Button asChild>
                <Link to="/">Go to Home</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header isLoggedIn={false} />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Card className="glass-card max-w-md">
              <CardContent className="p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                >
                  <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
                </motion.div>
                <h2 className="text-xl font-bold mb-2">Thank You!</h2>
                <p className="text-muted-foreground mb-4">
                  Your session details have been submitted successfully. The organizers will review your submission and get back to you.
                </p>
                <Button asChild>
                  <Link to="/">Explore the Community</Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header isLoggedIn={false} />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Mic className="h-4 w-4" />
              Speaker Invitation
            </div>
            <h1 className="text-3xl font-bold mb-2">Submit Your Session Details</h1>
            <p className="text-muted-foreground">
              You've been invited to speak at an AWS User Group event. Please fill in your details below.
            </p>
          </div>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Speaker Information
              </CardTitle>
              <CardDescription>
                This information will be displayed on the event page
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Photo Upload */}
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-24 w-24 border-4 border-primary/20">
                      {photoPreview ? (
                        <AvatarImage src={photoPreview} />
                      ) : (
                        <AvatarFallback className="bg-muted">
                          <Camera className="h-8 w-8 text-muted-foreground" />
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <label className="absolute -bottom-1 -right-1 h-8 w-8 bg-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors">
                      <Upload className="h-4 w-4 text-primary-foreground" />
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden"
                        onChange={handlePhotoChange}
                      />
                    </label>
                  </div>
                  <p className="text-sm text-muted-foreground">Upload your photo</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input 
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Your full name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input 
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="designation">Designation *</Label>
                    <Input 
                      id="designation"
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      placeholder="e.g., Solutions Architect"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input 
                      id="company"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      placeholder="e.g., Tech Corp"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Short Bio</Label>
                  <Textarea 
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Tell us about yourself and your expertise..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="linkedin" className="flex items-center gap-2">
                    <Linkedin className="h-4 w-4" />
                    LinkedIn Profile
                  </Label>
                  <Input 
                    id="linkedin"
                    value={formData.linkedIn}
                    onChange={(e) => setFormData({ ...formData, linkedIn: e.target.value })}
                    placeholder="https://linkedin.com/in/yourprofile"
                  />
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Session Details
                  </h3>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="topic">Session Topic *</Label>
                      <Input 
                        id="topic"
                        value={formData.topic}
                        onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                        placeholder="e.g., Introduction to Serverless Architecture"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sessionDetails">Session Description *</Label>
                      <Textarea 
                        id="sessionDetails"
                        value={formData.sessionDetails}
                        onChange={(e) => setFormData({ ...formData, sessionDetails: e.target.value })}
                        placeholder="Describe what you'll be covering in your session, key takeaways, and prerequisites if any..."
                        rows={4}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="slides">Slides URL (Optional)</Label>
                      <Input 
                        id="slides"
                        value={formData.slidesUrl}
                        onChange={(e) => setFormData({ ...formData, slidesUrl: e.target.value })}
                        placeholder="https://slides.example.com/your-presentation"
                      />
                      <p className="text-xs text-muted-foreground">
                        You can add this later if your slides aren't ready yet
                      </p>
                    </div>
                  </div>
                </div>

                <Button type="submit" className="w-full" size="lg">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Submit Session Details
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
