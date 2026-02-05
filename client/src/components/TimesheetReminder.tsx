import { useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Bell, X, Clock, AlertTriangle } from "lucide-react";
import { format, startOfWeek, endOfWeek, isWeekend, getDay, differenceInDays } from "date-fns";

interface TimesheetReminderProps {
  weeklyTotal: number;
  targetHours: number;
  weekStart: Date;
  weekEnd: Date;
  onDismiss: () => void;
  visible: boolean;
}

export function TimesheetReminder({ 
  weeklyTotal, 
  targetHours, 
  weekStart, 
  weekEnd, 
  onDismiss, 
  visible 
}: TimesheetReminderProps) {
  const today = new Date();
  const dayOfWeek = getDay(today);
  const isFridayOrLater = dayOfWeek >= 5 || dayOfWeek === 0;
  const missingHours = targetHours - weeklyTotal;
  const daysUntilWeekEnd = differenceInDays(weekEnd, today);
  
  const reminderType = useMemo(() => {
    if (weeklyTotal >= targetHours) return null;
    
    if (dayOfWeek === 5 && weeklyTotal < targetHours * 0.8) {
      return "friday-warning";
    }
    
    if (weeklyTotal < targetHours * 0.5 && dayOfWeek >= 3) {
      return "behind-schedule";
    }
    
    if (weeklyTotal === 0 && dayOfWeek >= 2) {
      return "no-entries";
    }
    
    return null;
  }, [weeklyTotal, targetHours, dayOfWeek]);

  if (!visible || !reminderType) return null;

  const reminderContent = {
    "friday-warning": {
      icon: Bell,
      title: "Submit Your Timesheet",
      description: `It's Friday! You have ${missingHours.toFixed(1)}h remaining to log this week.`,
      variant: "warning" as const
    },
    "behind-schedule": {
      icon: AlertTriangle,
      title: "Timesheet Behind Schedule",
      description: `You're behind on timesheet entries. ${missingHours.toFixed(1)}h still needed for the week.`,
      variant: "warning" as const
    },
    "no-entries": {
      icon: Clock,
      title: "No Time Logged This Week",
      description: `Don't forget to log your hours! ${daysUntilWeekEnd} days left until week end.`,
      variant: "info" as const
    }
  };

  const content = reminderContent[reminderType];
  const Icon = content.icon;

  return (
    <Alert 
      className={`relative ${
        content.variant === "warning" 
          ? "border-amber-500/50 bg-amber-500/10" 
          : "border-primary/50 bg-primary/10"
      }`}
    >
      <Icon className={`h-4 w-4 ${content.variant === "warning" ? "text-amber-500" : "text-primary"}`} />
      <AlertTitle className="pr-8">{content.title}</AlertTitle>
      <AlertDescription>{content.description}</AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6"
        onClick={onDismiss}
        data-testid="button-dismiss-reminder"
      >
        <X className="h-3 w-3" />
      </Button>
    </Alert>
  );
}
