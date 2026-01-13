import { useState, useMemo } from "react";
import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  isToday,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isSameMonth
} from "date-fns";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Target, Flag, CheckSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Milestone, Task, Project } from "@shared/schema";

type ViewType = "month" | "week" | "day";

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  type: "milestone" | "task" | "deadline";
  projectName?: string;
  projectId?: number;
  status?: string;
}

export default function Calendar() {
  const { currentOrganization } = useOrganization();
  const { data: projects = [] } = useProjects(currentOrganization?.id);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewType, setViewType] = useState<ViewType>("month");

  // Fetch all milestones for organization's projects
  const { data: allMilestones = [] } = useQuery<Milestone[]>({
    queryKey: ['/api/milestones', { organizationId: currentOrganization?.id }],
    enabled: !!currentOrganization?.id,
  });

  // Fetch all tasks for organization's projects
  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/tasks', { organizationId: currentOrganization?.id }],
    enabled: !!currentOrganization?.id,
  });


  // Create project lookup map
  const projectMap = useMemo(() => {
    const map: Record<number, Project> = {};
    projects.forEach(p => { map[p.id] = p; });
    return map;
  }, [projects]);

  // Combine all events into a unified calendar events list
  const calendarEvents = useMemo((): CalendarEvent[] => {
    const events: CalendarEvent[] = [];

    // Add project deadlines
    projects.forEach(p => {
      if (p.endDate) {
        events.push({
          id: `project-${p.id}`,
          title: `Deadline: ${p.name}`,
          date: new Date(p.endDate),
          type: "deadline",
          projectName: p.name,
          projectId: p.id,
          status: p.status
        });
      }
    });

    // Add milestones
    allMilestones.forEach(m => {
      if (m.dueDate) {
        events.push({
          id: `milestone-${m.id}`,
          title: m.title,
          date: new Date(m.dueDate),
          type: "milestone",
          projectName: projectMap[m.projectId]?.name,
          projectId: m.projectId,
          status: m.status ?? undefined
        });
      }
    });

    // Add tasks with end dates
    allTasks.forEach(t => {
      if (t.endDate) {
        events.push({
          id: `task-${t.id}`,
          title: t.name,
          date: new Date(t.endDate),
          type: "task",
          projectName: projectMap[t.projectId]?.name,
          projectId: t.projectId,
          status: t.status ?? undefined
        });
      }
    });

    // Note: Issues don't have due dates in the schema, so they're not included in the calendar

    return events;
  }, [projects, allMilestones, allTasks, projectMap]);

  // Get events for a specific day
  const getEventsForDay = (day: Date) => {
    return calendarEvents.filter(event => isSameDay(event.date, day));
  };

  // Navigation handlers
  const navigatePrevious = () => {
    if (viewType === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (viewType === "week") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subDays(currentDate, 1));
    }
  };

  const navigateNext = () => {
    if (viewType === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (viewType === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, 1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Get days to display based on view type
  const daysToDisplay = useMemo(() => {
    if (viewType === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const calendarStart = startOfWeek(monthStart);
      const calendarEnd = endOfWeek(monthEnd);
      return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    } else if (viewType === "week") {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    } else {
      return [currentDate];
    }
  }, [currentDate, viewType]);

  // Get title based on view type
  const getTitle = () => {
    if (viewType === "month") {
      return format(currentDate, "MMMM yyyy");
    } else if (viewType === "week") {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      if (format(weekStart, "MMM") === format(weekEnd, "MMM")) {
        return `${format(weekStart, "MMM d")} - ${format(weekEnd, "d, yyyy")}`;
      }
      return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
    } else {
      return format(currentDate, "EEEE, MMMM d, yyyy");
    }
  };

  const getEventIcon = (type: CalendarEvent["type"]) => {
    switch (type) {
      case "milestone": return <Target className="h-3 w-3" />;
      case "task": return <CheckSquare className="h-3 w-3" />;
      case "deadline": return <Flag className="h-3 w-3" />;
    }
  };

  const getEventColors = (type: CalendarEvent["type"]) => {
    switch (type) {
      case "milestone": return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800";
      case "task": return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
      case "deadline": return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CalendarIcon className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Calendar</h1>
            <p className="text-muted-foreground">View milestones, tasks, and deadlines</p>
          </div>
        </div>

        {/* View type selector */}
        <Tabs value={viewType} onValueChange={(v) => setViewType(v as ViewType)}>
          <TabsList>
            <TabsTrigger value="month" data-testid="tab-month">Month</TabsTrigger>
            <TabsTrigger value="week" data-testid="tab-week">Week</TabsTrigger>
            <TabsTrigger value="day" data-testid="tab-day">Day</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Navigation controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={navigatePrevious}
                data-testid="button-calendar-prev"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={navigateNext}
                data-testid="button-calendar-next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                onClick={goToToday}
                data-testid="button-calendar-today"
              >
                Today
              </Button>
            </div>

            <AnimatePresence mode="wait">
              <motion.h2
                key={getTitle()}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="text-xl font-semibold text-foreground"
              >
                {getTitle()}
              </motion.h2>
            </AnimatePresence>

            {/* Legend */}
            <div className="hidden md:flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-purple-500" />
                <span className="text-muted-foreground">Milestones</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-blue-500" />
                <span className="text-muted-foreground">Tasks</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-500" />
                <span className="text-muted-foreground">Deadlines</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar grid */}
      <Card>
        <CardContent className="p-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${viewType}-${currentDate.toISOString()}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {viewType === "month" && (
                <div className="rounded-lg overflow-hidden">
                  {/* Weekday headers */}
                  <div className="grid grid-cols-7 bg-muted border-b">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="p-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Days grid */}
                  <div className="grid grid-cols-7">
                    {daysToDisplay.map((day, idx) => {
                      const dayEvents = getEventsForDay(day);
                      const isCurrentMonth = isSameMonth(day, currentDate);
                      
                      return (
                        <div
                          key={day.toString()}
                          className={cn(
                            "min-h-[120px] p-2 border-b border-r relative transition-colors",
                            !isCurrentMonth && "bg-muted/30",
                            isToday(day) && "bg-primary/5",
                            idx % 7 === 6 && "border-r-0"
                          )}
                        >
                          <span className={cn(
                            "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                            isToday(day) ? "bg-primary text-primary-foreground" : "",
                            !isCurrentMonth && "text-muted-foreground"
                          )}>
                            {format(day, 'd')}
                          </span>

                          <div className="mt-1 space-y-1 overflow-y-auto max-h-[80px]">
                            {dayEvents.slice(0, 3).map(event => (
                              <div
                                key={event.id}
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded truncate font-medium border flex items-center gap-1",
                                  getEventColors(event.type)
                                )}
                                title={`${event.title}${event.projectName ? ` - ${event.projectName}` : ''}`}
                              >
                                {getEventIcon(event.type)}
                                <span className="truncate">{event.title}</span>
                              </div>
                            ))}
                            {dayEvents.length > 3 && (
                              <div className="text-[10px] text-muted-foreground pl-1">
                                +{dayEvents.length - 3} more
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {viewType === "week" && (
                <div className="rounded-lg overflow-hidden">
                  {/* Weekday headers with dates */}
                  <div className="grid grid-cols-7 bg-muted border-b">
                    {daysToDisplay.map(day => (
                      <div key={day.toString()} className={cn(
                        "p-3 text-center",
                        isToday(day) && "bg-primary/10"
                      )}>
                        <div className="text-xs font-semibold text-muted-foreground uppercase">
                          {format(day, 'EEE')}
                        </div>
                        <div className={cn(
                          "text-lg font-bold mt-1",
                          isToday(day) ? "text-primary" : "text-foreground"
                        )}>
                          {format(day, 'd')}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Events for each day */}
                  <div className="grid grid-cols-7 min-h-[400px]">
                    {daysToDisplay.map((day, idx) => {
                      const dayEvents = getEventsForDay(day);
                      
                      return (
                        <div
                          key={day.toString()}
                          className={cn(
                            "p-2 border-r",
                            isToday(day) && "bg-primary/5",
                            idx === 6 && "border-r-0"
                          )}
                        >
                          <div className="space-y-2">
                            {dayEvents.map(event => (
                              <div
                                key={event.id}
                                className={cn(
                                  "text-xs p-2 rounded border",
                                  getEventColors(event.type)
                                )}
                              >
                                <div className="flex items-center gap-1 font-medium">
                                  {getEventIcon(event.type)}
                                  <span className="truncate">{event.title}</span>
                                </div>
                                {event.projectName && (
                                  <div className="text-[10px] opacity-75 mt-1 truncate">
                                    {event.projectName}
                                  </div>
                                )}
                              </div>
                            ))}
                            {dayEvents.length === 0 && (
                              <div className="text-xs text-muted-foreground text-center py-4">
                                No events
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {viewType === "day" && (
                <div className="p-6">
                  <div className="max-w-2xl mx-auto">
                    <div className={cn(
                      "text-center mb-6 pb-4 border-b",
                      isToday(currentDate) && "text-primary"
                    )}>
                      <div className="text-4xl font-bold">{format(currentDate, 'd')}</div>
                      <div className="text-lg text-muted-foreground">{format(currentDate, 'EEEE')}</div>
                    </div>

                    <div className="space-y-3">
                      {getEventsForDay(currentDate).length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No events scheduled for this day</p>
                        </div>
                      ) : (
                        getEventsForDay(currentDate).map(event => (
                          <div
                            key={event.id}
                            className={cn(
                              "p-4 rounded-lg border",
                              getEventColors(event.type)
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5">{getEventIcon(event.type)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">{event.title}</div>
                                {event.projectName && (
                                  <div className="text-sm opacity-75 mt-1">
                                    Project: {event.projectName}
                                  </div>
                                )}
                                {event.status && (
                                  <Badge variant="outline" className="mt-2 text-xs">
                                    {event.status}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="text-2xl font-bold">{allMilestones.filter(m => m.dueDate).length}</div>
              <div className="text-xs text-muted-foreground">Milestones</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold">{allTasks.filter(t => t.endDate).length}</div>
              <div className="text-xs text-muted-foreground">Tasks</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Flag className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <div className="text-2xl font-bold">{projects.filter(p => p.endDate).length}</div>
              <div className="text-xs text-muted-foreground">Deadlines</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
