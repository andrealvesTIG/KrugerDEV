import { useState, useEffect } from "react";
import { Clock, PartyPopper } from "lucide-react";

export function FridayCountdown() {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0, isFriday: false });

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
      <div 
        className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-medium"
        data-testid="friday-countdown"
      >
        <PartyPopper className="h-3.5 w-3.5" />
        <span>It's Friday!</span>
      </div>
    );
  }

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <div 
      className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-mono"
      title="Time until Friday"
      data-testid="friday-countdown"
    >
      <Clock className="h-3.5 w-3.5" />
      <span>{pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}</span>
      <img src="/running-man.gif" alt="Running" className="h-6 w-6 object-contain" />
      <span className="text-muted-foreground">to Friday</span>
    </div>
  );
}
