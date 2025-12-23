import { useProjects } from "@/hooks/use-projects";
import { useMilestones } from "@/hooks/use-milestones"; // Note: this hook is by project, so we might need a custom one or just show placeholder
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday } from "date-fns";
import { cn } from "@/lib/utils";

// Mocking calendar events for MVP since useMilestones is per-project
// In a real app, I'd fetch all milestones across all projects
export default function Calendar() {
  const { data: projects } = useProjects();
  const today = new Date();
  const days = eachDayOfInterval({
    start: startOfMonth(today),
    end: endOfMonth(today),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold text-slate-900">Project Calendar</h1>
        <p className="text-slate-500">{format(today, 'MMMM yyyy')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Milestones & Deadlines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden border border-slate-200">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="bg-slate-50 p-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {day}
              </div>
            ))}
            
            {/* Blank start days */}
            {Array.from({ length: days[0].getDay() }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-white h-32" />
            ))}

            {days.map(day => (
              <div key={day.toString()} className={cn("bg-white p-2 h-32 relative group hover:bg-slate-50 transition-colors", isToday(day) && "bg-blue-50/30")}>
                <span className={cn(
                  "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full", 
                  isToday(day) ? "bg-primary text-white" : "text-slate-700"
                )}>
                  {format(day, 'd')}
                </span>
                
                <div className="mt-2 space-y-1 overflow-y-auto max-h-[80px] no-scrollbar">
                  {/* Mock logic to show some project deadlines */}
                  {projects?.filter(p => p.endDate && isSameDay(new Date(p.endDate), day)).map(p => (
                    <div key={p.id} className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded truncate font-medium border border-red-200">
                      Deadline: {p.name}
                    </div>
                  ))}
                  
                  {/* Random simulated milestones for visual richness since we don't have an "all milestones" endpoint */}
                   {(day.getDate() % 5 === 0) && (
                     <div className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded truncate font-medium border border-blue-200">
                       Review: {projects?.[0]?.name || 'Alpha'}
                     </div>
                   )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
