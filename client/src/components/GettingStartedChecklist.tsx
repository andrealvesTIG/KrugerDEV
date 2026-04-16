import { useUserJourney } from "@/hooks/use-user-journey";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, X, Rocket, FolderPlus, ListTodo, Users, Sparkles, LayoutDashboard, Bot } from "lucide-react";
import { useLocation } from "wouter";

const CHECKLIST_ITEMS = [
  { key: "create_project", label: "Create your first project", icon: FolderPlus, href: "/projects" },
  { key: "add_task", label: "Add a task to a project", icon: ListTodo, href: "/projects" },
  { key: "assign_member", label: "Assign a team member", icon: Users, href: "/resources" },
  { key: "use_ai", label: "Try AI features", icon: Sparkles, href: null },
  { key: "explore_dashboard", label: "Explore the dashboard", icon: LayoutDashboard, href: "/dashboards" },
  { key: "meet_copilot", label: "Meet Friday Report", icon: Bot, href: null },
];

export function GettingStartedChecklist() {
  const { status, completedCount, totalCount, isChecklistComplete, dismiss } = useUserJourney();
  const [, setLocation] = useLocation();

  if (status.dismissed || isChecklistComplete) return null;

  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <Card className="border-violet-200 dark:border-violet-800/50 bg-gradient-to-br from-violet-50/50 to-white dark:from-violet-950/20 dark:to-background">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <CardTitle className="text-base">Getting Started</CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={dismiss}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={progressPct} className="h-2 flex-1" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{completedCount}/{totalCount}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {CHECKLIST_ITEMS.map(item => {
            const completed = status.checklistProgress[item.key];
            const ItemIcon = item.icon;
            return (
              <button
                key={item.key}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${
                  completed
                    ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400"
                    : "hover:bg-muted/60 cursor-pointer"
                }`}
                onClick={() => {
                  if (!completed && item.href) setLocation(item.href);
                }}
                disabled={completed}
              >
                {completed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <ItemIcon className="h-4 w-4 flex-shrink-0" />
                <span className={`text-sm ${completed ? "line-through" : ""}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
