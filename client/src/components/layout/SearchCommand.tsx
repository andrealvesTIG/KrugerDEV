import { useState, useEffect, useCallback, useMemo } from "react";
import { normalizeSearch } from "@/lib/utils";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  FolderKanban, 
  Briefcase, 
  CheckSquare, 
  AlertTriangle, 
  Bug, 
  Flag,
  Loader2,
  BookOpen,
  LayoutDashboard,
  Inbox,
  Star,
  Gift,
  Scale,
  Lightbulb,
  CircleDot,
  Clock,
  UserCog,
  Calendar,
  Plug,
  Link2,
  Sliders,
  LayoutTemplate,
  CreditCard,
  Building2,
  Users,
  Settings,
  Moon,
  type LucideIcon
} from "lucide-react";
import type { Portfolio, Project, Task, Issue, Risk, Milestone } from "@shared/schema";

// User Guide sections for local search
const userGuideSections: { id: string; name: string; icon: LucideIcon; keywords: string[] }[] = [
  { id: "overview", name: "Overview", icon: BookOpen, keywords: ["overview", "introduction", "getting started", "guide", "help", "documentation"] },
  { id: "dashboard", name: "Dashboard", icon: LayoutDashboard, keywords: ["dashboard", "home", "summary", "overview", "metrics", "kpi"] },
  { id: "portfolios", name: "Portfolios", icon: Briefcase, keywords: ["portfolio", "portfolios", "program", "strategic", "grouping"] },
  { id: "projects", name: "Projects", icon: FolderKanban, keywords: ["project", "projects", "initiative", "plan", "planning"] },
  { id: "intakes", name: "Project Intakes", icon: Inbox, keywords: ["intake", "intakes", "request", "new project", "submission"] },
  { id: "scoring", name: "Project Scoring", icon: Star, keywords: ["scoring", "score", "prioritization", "ranking", "evaluation"] },
  { id: "benefits", name: "Benefits Tracking", icon: Gift, keywords: ["benefits", "benefit", "value", "roi", "return", "outcome"] },
  { id: "decisions", name: "Decision Log", icon: Scale, keywords: ["decision", "decisions", "log", "approval", "governance"] },
  { id: "lessons", name: "Lessons Learned", icon: Lightbulb, keywords: ["lessons", "lesson", "learned", "retrospective", "improvement"] },
  { id: "tasks", name: "Tasks", icon: CheckSquare, keywords: ["task", "tasks", "work", "assignment", "todo", "activity"] },
  { id: "issues", name: "Issues", icon: CircleDot, keywords: ["issue", "issues", "problem", "blocker", "impediment"] },
  { id: "timesheets", name: "Timesheets", icon: Clock, keywords: ["timesheet", "timesheets", "time", "hours", "tracking", "effort"] },
  { id: "resources", name: "Resources", icon: UserCog, keywords: ["resource", "resources", "team", "member", "capacity", "allocation"] },
  { id: "calendar", name: "Calendar", icon: Calendar, keywords: ["calendar", "schedule", "dates", "timeline", "events"] },
  { id: "integrations", name: "Integrations", icon: Plug, keywords: ["integration", "integrations", "connect", "sync", "planner", "microsoft", "api"] },
  { id: "custom-links", name: "Custom Links", icon: Link2, keywords: ["custom links", "links", "external", "url", "navigation"] },
  { id: "custom-fields", name: "Custom Fields", icon: Sliders, keywords: ["custom fields", "fields", "attributes", "metadata", "properties"] },
  { id: "custom-tabs", name: "Custom Tabs", icon: LayoutTemplate, keywords: ["custom tabs", "tabs", "pages", "views", "navigation"] },
  { id: "billing", name: "Billing & Credits", icon: CreditCard, keywords: ["billing", "credits", "payment", "subscription", "plan", "pricing"] },
  { id: "organizations", name: "Organizations", icon: Building2, keywords: ["organization", "organizations", "company", "tenant", "workspace"] },
  { id: "users", name: "User Management", icon: Users, keywords: ["user", "users", "management", "roles", "permissions", "access"] },
  { id: "settings", name: "Settings", icon: Settings, keywords: ["settings", "configuration", "preferences", "options"] },
  { id: "themes", name: "Themes", icon: Moon, keywords: ["theme", "themes", "dark mode", "light mode", "appearance", "colors"] },
];

interface SearchResults {
  portfolios: Portfolio[];
  projects: Project[];
  tasks: Task[];
  issues: Issue[];
  risks: Risk[];
  milestones: Milestone[];
}

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();
  const { currentOrganization } = useOrganization();

  const { data: results, isLoading } = useQuery<SearchResults>({
    queryKey: ['/api/search', query, currentOrganization?.id],
    queryFn: async () => {
      const orgParam = currentOrganization?.id ? `&organizationId=${currentOrganization.id}` : '';
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}${orgParam}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: query.length >= 2 && !!currentOrganization?.id,
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Local search for User Guide sections
  const userGuideResults = useMemo(() => {
    if (query.length < 2) return [];
    const lowerQuery = normalizeSearch(query);
    return userGuideSections.filter(section => 
      normalizeSearch(section.name).includes(lowerQuery) ||
      section.keywords.some(keyword => normalizeSearch(keyword).includes(lowerQuery))
    );
  }, [query]);

  const handleSelect = useCallback((type: string, item: any) => {
    setOpen(false);
    setQuery("");
    
    switch (type) {
      case "portfolio":
        setLocation(`/portfolios/${item.id}`);
        break;
      case "project":
        setLocation(`/projects/${item.id}`);
        break;
      case "task":
        setLocation(`/projects/${item.projectId}?tab=tasks&taskId=${item.id}`);
        break;
      case "issue":
        setLocation(`/projects/${item.projectId}?tab=issues&issueId=${item.id}`);
        break;
      case "risk":
        setLocation(`/projects/${item.projectId}?tab=risks&riskId=${item.id}`);
        break;
      case "milestone":
        // Navigate to project summary - milestones are displayed in the summary/timeline view
        setLocation(`/projects/${item.projectId}`);
        break;
      case "userGuide":
        setLocation(`/user-guide#${item.id}`);
        break;
    }
  }, [setLocation]);

  const hasResults = (results && (
    results.portfolios.length > 0 ||
    results.projects.length > 0 ||
    results.tasks.length > 0 ||
    results.issues.length > 0 ||
    results.risks.length > 0 ||
    results.milestones.length > 0
  )) || userGuideResults.length > 0;

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-9 p-0 sm:w-full sm:justify-start sm:px-3 text-sm text-muted-foreground sm:pr-12 md:w-64"
        onClick={() => setOpen(true)}
        aria-label="Search"
        data-testid="button-global-search"
      >
        <Search className="h-4 w-4 sm:mr-2 flex-shrink-0" />
        <span className="hidden lg:inline-flex">Search everything...</span>
        <span className="hidden sm:inline-flex lg:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search portfolios, projects, tasks, help..." 
            value={query}
            onValueChange={setQuery}
            data-testid="input-global-search"
          />
          <CommandList>
            {query.length < 2 && (
              <CommandEmpty>Type at least 2 characters to search...</CommandEmpty>
            )}
            {query.length >= 2 && isLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {query.length >= 2 && !isLoading && !hasResults && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}
            
            {results?.portfolios && results.portfolios.length > 0 && (
              <CommandGroup heading="Portfolios">
                {results.portfolios.map((portfolio) => (
                  <CommandItem
                    key={`portfolio-${portfolio.id}`}
                    value={`portfolio-${portfolio.id}`}
                    onSelect={() => handleSelect("portfolio", portfolio)}
                    className="flex items-center gap-2 cursor-pointer"
                    data-testid={`search-result-portfolio-${portfolio.id}`}
                  >
                    <FolderKanban className="h-4 w-4 text-indigo-500" />
                    <span className="flex-1">{portfolio.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results?.projects && results.projects.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Projects">
                  {results.projects.map((project) => (
                    <CommandItem
                      key={`project-${project.id}`}
                      value={`project-${project.id}`}
                      onSelect={() => handleSelect("project", project)}
                      className="flex items-center gap-2 cursor-pointer"
                      data-testid={`search-result-project-${project.id}`}
                    >
                      <Briefcase className="h-4 w-4 text-blue-500" />
                      <span className="flex-1">{project.name}</span>
                      <Badge variant="outline" className="text-xs">{project.status}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {results?.tasks && results.tasks.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Tasks">
                  {results.tasks.map((task) => (
                    <CommandItem
                      key={`task-${task.id}`}
                      value={`task-${task.id}`}
                      onSelect={() => handleSelect("task", task)}
                      className="flex items-center gap-2 cursor-pointer"
                      data-testid={`search-result-task-${task.id}`}
                    >
                      <CheckSquare className="h-4 w-4 text-green-500" />
                      <span className="flex-1">{task.name}</span>
                      <Badge variant="outline" className="text-xs">{task.status}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {results?.issues && results.issues.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Issues">
                  {results.issues.map((issue) => (
                    <CommandItem
                      key={`issue-${issue.id}`}
                      value={`issue-${issue.id}`}
                      onSelect={() => handleSelect("issue", issue)}
                      className="flex items-center gap-2 cursor-pointer"
                      data-testid={`search-result-issue-${issue.id}`}
                    >
                      <Bug className="h-4 w-4 text-red-500" />
                      <span className="flex-1">{issue.title}</span>
                      <Badge variant="outline" className="text-xs">{issue.status}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {results?.risks && results.risks.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Risks">
                  {results.risks.map((risk) => (
                    <CommandItem
                      key={`risk-${risk.id}`}
                      value={`risk-${risk.id}`}
                      onSelect={() => handleSelect("risk", risk)}
                      className="flex items-center gap-2 cursor-pointer"
                      data-testid={`search-result-risk-${risk.id}`}
                    >
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="flex-1">{risk.title}</span>
                      <Badge variant="outline" className="text-xs">{risk.status}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {results?.milestones && results.milestones.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Milestones">
                  {results.milestones.map((milestone) => (
                    <CommandItem
                      key={`milestone-${milestone.id}`}
                      value={`milestone-${milestone.id}`}
                      onSelect={() => handleSelect("milestone", milestone)}
                      className="flex items-center gap-2 cursor-pointer"
                      data-testid={`search-result-milestone-${milestone.id}`}
                    >
                      <Flag className="h-4 w-4 text-purple-500" />
                      <span className="flex-1">{milestone.title}</span>
                      <Badge variant="outline" className="text-xs">
                        {milestone.completed ? "Complete" : "Pending"}
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {userGuideResults.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="User Guide">
                  {userGuideResults.map((section) => {
                    const IconComponent = section.icon;
                    return (
                      <CommandItem
                        key={`userguide-${section.id}`}
                        value={`userguide-${section.id}`}
                        onSelect={() => handleSelect("userGuide", section)}
                        className="flex items-center gap-2 cursor-pointer"
                        data-testid={`search-result-userguide-${section.id}`}
                      >
                        <IconComponent className="h-4 w-4 text-teal-500" />
                        <span className="flex-1">{section.name}</span>
                        <Badge variant="outline" className="text-xs">Help</Badge>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
