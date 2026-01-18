import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface PersonCardProps {
  userId?: string;
  name: string;
  photo?: string;
  avatar?: string;
  designation?: string;
  company?: string;
  role?: string | null;
  className?: string;
}

export function PersonCard({
  userId,
  name,
  photo,
  avatar,
  designation,
  company,
  role,
  className = ''
}: PersonCardProps) {
  const imageUrl = photo || avatar;
  const isClickable = !!userId;

  const content = (
    <>
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarImage src={imageUrl} alt={name} />
        <AvatarFallback>{name.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h4 className="font-medium text-sm truncate">{name}</h4>
          {role === 'Speaker' && (
            <Badge variant="default" className="text-xs px-1.5 py-0 h-5">Speaker</Badge>
          )}
          {role === 'Organizer' && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">Organizer</Badge>
          )}
          {role === 'Volunteer' && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">Volunteer</Badge>
          )}
        </div>
        {designation && (
          <p className="text-xs text-muted-foreground truncate">
            {designation}
            {company && ` at ${company}`}
          </p>
        )}
      </div>
    </>
  );

  if (isClickable) {
    return (
      <Link
        to={`/profile/${userId}`}
        className={`flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer ${className}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg bg-muted/50 ${className}`}>
      {content}
    </div>
  );
}
