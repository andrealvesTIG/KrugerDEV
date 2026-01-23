import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { MessageCircle, Users, Video, Phone, Mail, Send, Clock, Calendar, ChevronRight } from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import { cn } from "@/lib/utils";

interface MicrosoftContactCardProps {
  displayName: string;
  email?: string | null;
  title?: string | null;
  department?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function MicrosoftContactCard({
  displayName,
  email,
  title,
  department,
  phone,
  photoUrl,
  children,
  side = "top",
  align = "center",
}: MicrosoftContactCardProps) {
  const [quickMessage, setQuickMessage] = useState("");

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleTeamsChat = () => {
    if (email) {
      const message = quickMessage ? `&message=${encodeURIComponent(quickMessage)}` : '';
      window.open(`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}${message}`, '_blank');
      setQuickMessage("");
    }
  };

  const handleTeamsCall = () => {
    if (email) {
      window.open(`https://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(email)}`, '_blank');
    }
  };

  const handleTeamsVideoCall = () => {
    if (email) {
      window.open(`https://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(email)}&withVideo=true`, '_blank');
    }
  };

  const handleTeamsMeeting = () => {
    if (email) {
      window.open(`https://teams.microsoft.com/l/meeting/new?attendees=${encodeURIComponent(email)}`, '_blank');
    }
  };

  const handleEmail = () => {
    if (email) {
      window.open(`mailto:${email}`, '_blank');
    }
  };

  const handleLinkedIn = () => {
    window.open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(displayName)}`, '_blank');
  };

  const handlePhoneCall = () => {
    if (phone) {
      window.open(`tel:${phone}`, '_blank');
    }
  };

  const currentTime = new Date().toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent 
        side={side} 
        align={align}
        className="w-[320px] p-0 bg-white dark:bg-[#1f1f1f] shadow-xl border-0 rounded-lg overflow-hidden"
        data-testid="microsoft-contact-card"
      >
        <div className="p-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="relative">
              <Avatar className="h-16 w-16 border-2 border-amber-400">
                {photoUrl ? (
                  <AvatarImage src={photoUrl} alt={displayName} />
                ) : null}
                <AvatarFallback className="bg-amber-100 text-amber-800 text-xl font-semibold">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-amber-500 rounded-full flex items-center justify-center">
                <Phone className="h-3 w-3 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base text-foreground truncate">{displayName}</h3>
              {title && <p className="text-sm text-muted-foreground truncate">{title}</p>}
              {department && <p className="text-xs text-muted-foreground truncate">{department}</p>}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mb-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-muted"
              onClick={handleTeamsChat}
              disabled={!email}
              title="Chat in Teams"
              data-testid="btn-teams-chat"
            >
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-muted"
              onClick={handleTeamsMeeting}
              disabled={!email}
              title="Schedule meeting"
              data-testid="btn-teams-meeting"
            >
              <Users className="h-5 w-5 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-muted"
              onClick={handleTeamsVideoCall}
              disabled={!email}
              title="Video call"
              data-testid="btn-teams-video"
            >
              <Video className="h-5 w-5 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-muted"
              onClick={phone ? handlePhoneCall : handleTeamsCall}
              disabled={!email && !phone}
              title="Call"
              data-testid="btn-call"
            >
              <Phone className="h-5 w-5 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full hover:bg-muted"
              onClick={handleLinkedIn}
              title="Find on LinkedIn"
              data-testid="btn-linkedin"
            >
              <SiLinkedin className="h-5 w-5 text-[#0A66C2]" />
            </Button>
          </div>

          <div className="relative mb-4">
            <Input
              placeholder="Send a quick message"
              value={quickMessage}
              onChange={(e) => setQuickMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && quickMessage.trim()) {
                  handleTeamsChat();
                }
              }}
              className="pr-10 h-9 bg-muted/50 border-0 rounded-full text-sm"
              disabled={!email}
              data-testid="input-quick-message"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={handleTeamsChat}
              disabled={!email || !quickMessage.trim()}
            >
              <Send className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>

          <div className="space-y-2 text-sm border-t pt-3">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Clock className="h-4 w-4 text-amber-500" />
              <span>Available now</span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{currentTime} - Same time zone as you</span>
            </div>
          </div>
        </div>

        <div className="border-t">
          <button 
            className="w-full px-4 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-muted/50 flex items-center justify-between"
            onClick={() => {}}
          >
            <span>Contact</span>
            <ChevronRight className="h-4 w-4" />
          </button>
          
          {email && (
            <button 
              className="w-full px-4 py-2 text-left hover:bg-muted/50 flex items-center gap-3"
              onClick={handleEmail}
              data-testid="btn-email"
            >
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-primary hover:underline truncate">{email}</span>
            </button>
          )}

          <button 
            className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-muted/50"
            onClick={() => {}}
          >
            Show more
          </button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
