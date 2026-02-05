import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Play, Pause, Square, Timer, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task, Project } from "@shared/schema";

interface TimerWidgetProps {
  tasks: { task: Task; project: Project }[];
  onTimerStop: (taskId: number, hours: number, notes: string) => void;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function secondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

export function TimerWidget({ tasks, onTimerStop }: TimerWidgetProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, isPaused]);

  const handleStart = () => {
    setIsRunning(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleResume = () => {
    setIsPaused(false);
  };

  const handleStop = () => {
    if (elapsedSeconds > 0) {
      setIsRunning(false);
      setIsPaused(false);
      setShowAssignDialog(true);
    } else {
      resetTimer();
    }
  };

  const resetTimer = () => {
    setIsRunning(false);
    setIsPaused(false);
    setElapsedSeconds(0);
    setSelectedTaskId(null);
    setNotes("");
  };

  const handleAssign = () => {
    if (selectedTaskId && elapsedSeconds > 0) {
      const hours = secondsToHours(elapsedSeconds);
      onTimerStop(selectedTaskId, hours, notes);
      setShowAssignDialog(false);
      resetTimer();
    }
  };

  const handleDiscard = () => {
    setShowAssignDialog(false);
    resetTimer();
  };

  const hours = secondsToHours(elapsedSeconds);

  return (
    <>
      <div className="flex items-center gap-2">
        {isRunning ? (
          <>
            <Badge 
              variant="outline" 
              className={`font-mono text-sm px-3 py-1 ${isPaused ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30 animate-pulse'}`}
            >
              <Timer className={`h-3 w-3 mr-1.5 ${isPaused ? 'text-amber-500' : 'text-emerald-500'}`} />
              {formatTime(elapsedSeconds)}
            </Badge>
            
            {isPaused ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleResume}
                    className="h-8 w-8"
                    data-testid="button-timer-resume"
                  >
                    <Play className="h-3.5 w-3.5 text-emerald-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Resume timer</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePause}
                    className="h-8 w-8"
                    data-testid="button-timer-pause"
                  >
                    <Pause className="h-3.5 w-3.5 text-amber-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Pause timer</TooltipContent>
              </Tooltip>
            )}
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleStop}
                  className="h-8 w-8"
                  data-testid="button-timer-stop"
                >
                  <Square className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop and log time</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStart}
                className="gap-2"
                data-testid="button-timer-start"
              >
                <Clock className="h-4 w-4" />
                Start Timer
              </Button>
            </TooltipTrigger>
            <TooltipContent>Start tracking time</TooltipContent>
          </Tooltip>
        )}
      </div>

      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-primary" />
              Log Tracked Time
            </DialogTitle>
            <DialogDescription>
              You tracked {formatTime(elapsedSeconds)} ({hours}h). Assign this time to a task.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Assign to Task</Label>
              <Select
                value={selectedTaskId?.toString() || ""}
                onValueChange={(val) => setSelectedTaskId(Number(val))}
              >
                <SelectTrigger data-testid="select-timer-task">
                  <SelectValue placeholder="Select a task..." />
                </SelectTrigger>
                <SelectContent>
                  {tasks.map(({ task, project }) => (
                    <SelectItem key={task.id} value={task.id.toString()}>
                      <div className="flex flex-col">
                        <span>{task.name}</span>
                        <span className="text-xs text-muted-foreground">{project.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="What did you work on?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
                rows={3}
                data-testid="input-timer-notes"
              />
            </div>
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={handleDiscard}
              data-testid="button-timer-discard"
            >
              Discard
            </Button>
            <Button
              onClick={handleAssign}
              disabled={!selectedTaskId}
              data-testid="button-timer-assign"
            >
              Log {hours}h
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
