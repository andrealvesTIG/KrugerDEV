import { useState, useEffect } from "react";
import { Clock, PartyPopper, Coffee, TreePalm, Sparkles, Share2, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import running_man from "@assets/running_man_transparent.gif";

const partyGifs = [
  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  "https://media.giphy.com/media/5xaOcLGvzHxDKjufnLW/giphy.gif",
  "https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif",
  "https://media.giphy.com/media/l4FGni1RBAR2OWsGk/giphy.gif",
  "https://media.giphy.com/media/l3q2Z6S6n38zjPswo/giphy.gif",
  "https://media.giphy.com/media/3o7TKSxdQJIoiRXHl6/giphy.gif",
  "https://media.giphy.com/media/26tPplGWjN0xLybiU/giphy.gif",
  "https://media.giphy.com/media/l0HlKrB02QY0f1mbm/giphy.gif",
];

export function FridayCountdown() {
  const { toast } = useToast();
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0, isFriday: false });
  const [gifIndex, setGifIndex] = useState(0);
  const partyGif = partyGifs[gifIndex];
  
  const shareUrl = `${window.location.origin}/friday?gif=${gifIndex}`;
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied!", description: "Share the Friday celebration with your team" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };
  
  const handleShareLinkedIn = () => {
    const url = encodeURIComponent(shareUrl);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank');
  };
  
  const handleOpenFridayPage = () => {
    window.open(`/friday?gif=${gifIndex}`, '_blank');
  };

  const selectRandomGif = () => {
    let randomIndex = Math.floor(Math.random() * partyGifs.length);
    if (randomIndex === gifIndex && partyGifs.length > 1) {
      randomIndex = (randomIndex + 1) % partyGifs.length;
    }
    setGifIndex(randomIndex);
  };

  useEffect(() => {
    const calculateTimeUntilFriday = () => {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday, 5 = Friday
      
      // If it's Friday (day 5)
      if (dayOfWeek === 5) {
        return { hours: 0, minutes: 0, seconds: 0, isFriday: true };
      }
      
      // Calculate days until Friday
      let daysUntilFriday = 5 - dayOfWeek;
      if (daysUntilFriday <= 0) {
        daysUntilFriday += 7; // If Saturday (6) or Sunday (0), add days to next Friday
      }
      
      // Create target date (next Friday at midnight)
      const nextFriday = new Date(now);
      nextFriday.setDate(now.getDate() + daysUntilFriday);
      nextFriday.setHours(0, 0, 0, 0);
      
      const diff = nextFriday.getTime() - now.getTime();
      
      const totalSeconds = Math.floor(diff / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      
      return { hours, minutes, seconds, isFriday: false };
    };

    // Initial calculation
    setTimeLeft(calculateTimeUntilFriday());

    // Update every second
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeUntilFriday());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (timeLeft.isFriday) {
    return (
      <Dialog onOpenChange={(open) => { if (open) selectRandomGif(); }}>
        <DialogTrigger asChild>
          <div 
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-medium cursor-pointer hover:from-amber-200 hover:to-orange-200 dark:hover:from-amber-800/50 dark:hover:to-orange-800/50 transition-all"
            data-testid="friday-countdown"
          >
            <PartyPopper className="h-3.5 w-3.5" />
            <span>It's Friday!</span>
          </div>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md bg-gradient-to-br from-amber-50 via-orange-50 to-pink-50 dark:from-amber-900/50 dark:via-orange-900/50 dark:to-pink-900/50 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl font-bold text-amber-900 dark:text-amber-100">
              <PartyPopper className="h-6 w-6 text-orange-500" />
              It's Friday!
              <Sparkles className="h-5 w-5 text-yellow-500" />
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6 space-y-4 text-center">
            <div className="relative">
              <div className="absolute -inset-4 bg-orange-400/20 rounded-full blur-xl animate-pulse" />
              <img 
                src={partyGif} 
                alt="Party celebration" 
                className="relative h-40 w-40 object-cover rounded-xl shadow-lg"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={selectRandomGif}
                className="absolute -bottom-2 -right-2 rounded-full bg-white dark:bg-slate-800 shadow-md border border-amber-200 dark:border-amber-700 text-amber-600 dark:text-amber-400"
                title="Next GIF"
                data-testid="button-next-gif"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-2">
              <p className="text-xl font-bold text-amber-800 dark:text-amber-200">
                Time to celebrate!
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                You made it through the week. Enjoy your Friday!
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium">
                <PartyPopper className="h-3.5 w-3.5" />
                <span>Party time</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Weekend vibes</span>
              </div>
            </div>
            
            <div className="border-t border-amber-200 dark:border-amber-800 pt-4 mt-4 w-full space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">Share the celebration</p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleShareLinkedIn}
                  className="flex-1 border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400"
                  data-testid="button-share-linkedin-countdown"
                >
                  <SiLinkedin className="h-4 w-4 mr-2" />
                  LinkedIn
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCopyLink}
                  className="flex-1"
                  data-testid="button-copy-link-countdown"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleOpenFridayPage}
                className="w-full text-amber-700 dark:text-amber-300"
                data-testid="button-open-friday-page"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Friday Page
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div 
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-transparent text-slate-600 dark:text-slate-300 text-xs font-mono cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors"
          title="Time until Friday"
          data-testid="friday-countdown"
        >
          <img src={running_man} alt="Running" className="h-10 w-10 object-contain" />
          <Clock className="h-3.5 w-3.5" />
          <span>{pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}</span>
          <span className="text-muted-foreground">to Friday</span>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl font-serif text-sky-900 dark:text-sky-100 italic">
            <TreePalm className="h-6 w-6 text-emerald-500" />
            Time to exhale...
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-8 space-y-6 text-center">
          <div className="relative">
            <div className="absolute -inset-4 bg-sky-400/20 rounded-full blur-xl animate-pulse" />
            <img 
              src={running_man} 
              alt="Relaxing" 
              className="relative h-24 w-24 object-contain"
            />
          </div>
          
          <div className="space-y-2">
            <p className="text-lg text-slate-700 dark:text-slate-300">
              You can relax as it is only
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className="flex flex-col items-center">
                <span className="text-4xl font-bold text-sky-600 dark:text-sky-400 font-mono tracking-tighter">{pad(timeLeft.hours)}</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">hours</span>
              </div>
              <span className="text-2xl font-light text-slate-300">:</span>
              <div className="flex flex-col items-center">
                <span className="text-4xl font-bold text-sky-600 dark:text-sky-400 font-mono tracking-tighter">{pad(timeLeft.minutes)}</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">minutes</span>
              </div>
              <span className="text-2xl font-light text-slate-300">:</span>
              <div className="flex flex-col items-center">
                <span className="text-4xl font-bold text-sky-600 dark:text-sky-400 font-mono tracking-tighter">{pad(timeLeft.seconds)}</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">seconds</span>
              </div>
            </div>
            <p className="text-lg text-slate-700 dark:text-slate-300">
              left until it is <span className="text-emerald-600 dark:text-emerald-400 font-bold italic underline decoration-wavy decoration-emerald-200">Friday</span>!
            </p>
          </div>

          <div className="flex gap-4 pt-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/50 dark:bg-white/5 text-slate-500 text-xs">
              <Coffee className="h-3.5 w-3.5" />
              <span>Take a breath</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/50 dark:bg-white/5 text-slate-500 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Almost there</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
