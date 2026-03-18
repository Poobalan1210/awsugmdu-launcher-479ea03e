import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Camera, FileText } from 'lucide-react';
import { Meetup } from '@/data/mockData';

interface EventPhotoGalleryProps {
  meetup: Meetup;
}

export function EventPhotoGallery({ meetup }: EventPhotoGalleryProps) {
  const eventPhotos = meetup.eventPhotos || [];
  const eventReport = meetup.eventReport;
  const isCollegeChamp = meetup.type === 'college-champ';

  if (eventPhotos.length === 0 && (!isCollegeChamp || !eventReport)) return null;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Event Photos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {eventPhotos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {eventPhotos.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg overflow-hidden aspect-square bg-muted/20 block hover:opacity-90 transition-opacity"
              >
                <img src={url} alt={`Event photo ${i + 1}`} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        )}
        {isCollegeChamp && eventReport && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <FileText className="h-5 w-5 text-primary" />
            <a
              href={eventReport.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex-1 truncate"
            >
              {eventReport.fileName}
            </a>
            <span className="text-xs text-muted-foreground">Session Report</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
