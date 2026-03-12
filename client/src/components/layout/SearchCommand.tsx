import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { normalizeSearch } from "@/lib/utils";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
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
  X,
  type LucideIcon
} from "lucide-react";
import type { Portfolio, Project, Task, Issue, Risk, Milestone } from "@shared/schema";

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

interface ResultItem {
  type: string;
  id: string;
  item: any;
}

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [mobileDialogOpen, setMobileDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [, setLocation] = useLocation();
  const { currentOrganization } = useOrganization();
  const containerRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileResultsRef = useRef<HTMLDivElement>(null);
  const listboxId = "search-results-listbox";

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

  const isMobileViewport = useCallback(() => {
    return window.innerWidth < 640;
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isMobileViewport()) {
          setMobileDialogOpen(true);
          setTimeout(() => mobileInputRef.current?.focus(), 100);
        } else {
          setOpen(true);
          setTimeout(() => desktopInputRef.current?.focus(), 0);
        }
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isMobileViewport]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDesktopSearch();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const userGuideResults = useMemo(() => {
    if (query.length < 2) return [];
    const lowerQuery = normalizeSearch(query);
    return userGuideSections.filter(section => 
      normalizeSearch(section.name).includes(lowerQuery) ||
      section.keywords.some(keyword => normalizeSearch(keyword).includes(lowerQuery))
    );
  }, [query]);

  const flatResults = useMemo((): ResultItem[] => {
    const items: ResultItem[] = [];
    if (results?.portfolios) {
      results.portfolios.forEach(p => items.push({ type: "portfolio", id: `portfolio-${p.id}`, item: p }));
    }
    if (results?.projects) {
      results.projects.forEach(p => items.push({ type: "project", id: `project-${p.id}`, item: p }));
    }
    if (results?.tasks) {
      results.tasks.forEach(t => items.push({ type: "task", id: `task-${t.id}`, item: t }));
    }
    if (results?.issues) {
      results.issues.forEach(i => items.push({ type: "issue", id: `issue-${i.id}`, item: i }));
    }
    if (results?.risks) {
      results.risks.forEach(r => items.push({ type: "risk", id: `risk-${r.id}`, item: r }));
    }
    if (results?.milestones) {
      results.milestones.forEach(m => items.push({ type: "milestone", id: `milestone-${m.id}`, item: m }));
    }
    userGuideResults.forEach(s => items.push({ type: "userGuide", id: `userguide-${s.id}`, item: s }));
    return items;
  }, [results, userGuideResults]);

  const hasResults = flatResults.length > 0;

  const closeDesktopSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlightIndex(0);
    desktopInputRef.current?.blur();
  }, []);

  const closeMobileSearch = useCallback(() => {
    setMobileDialogOpen(false);
    setQuery("");
    setHighlightIndex(0);
  }, []);

  const closeAll = useCallback(() => {
    closeDesktopSearch();
    closeMobileSearch();
  }, [closeDesktopSearch, closeMobileSearch]);

  const handleSelect = useCallback((type: string, item: any) => {
    closeAll();
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
        setLocation(`/projects/${item.projectId}`);
        break;
      case "userGuide":
        setLocation(`/user-guide#${item.id}`);
        break;
    }
  }, [setLocation, closeAll]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAll();
      return;
    }
    if (query.length < 2 || !hasResults) {
      if (e.key === "Enter") {
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex(i => (i + 1) % flatResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex(i => (i <= 0 ? flatResults.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = highlightIndex >= 0 && highlightIndex < flatResults.length ? highlightIndex : 0;
      if (flatResults[idx]) {
        handleSelect(flatResults[idx].type, flatResults[idx].item);
      }
    }
  }, [hasResults, query, flatResults, highlightIndex, handleSelect, closeAll]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  useEffect(() => {
    if (highlightIndex >= 0) {
      const scrollContainer = dropdownRef.current || mobileResultsRef.current;
      if (scrollContainer) {
        const el = scrollContainer.querySelector(`[data-result-index="${highlightIndex}"]`);
        el?.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIndex]);

  const showDropdown = open && query.length >= 1;
  const activeDescendant = hasResults && highlightIndex >= 0 && highlightIndex < flatResults.length
    ? `search-option-${highlightIndex}`
    : undefined;

  const handleInputFocus = () => {
    setOpen(true);
  };

  const handleMobileSearchClick = () => {
    setMobileDialogOpen(true);
    setTimeout(() => mobileInputRef.current?.focus(), 100);
  };

  const renderResultItem = (r: ResultItem, index: number) => {
    const isHighlighted = index === highlightIndex;
    const baseClass = `flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-sm transition-colors ${
      isHighlighted ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
    }`;

    const commonProps = {
      "data-result-index": index,
      id: `search-option-${index}`,
      role: "option" as const,
      "aria-selected": isHighlighted,
      className: baseClass,
      onMouseEnter: () => setHighlightIndex(index),
    };

    switch (r.type) {
      case "portfolio":
        return (
          <div key={r.id} {...commonProps} onClick={() => handleSelect("portfolio", r.item)}
            data-testid={`search-result-portfolio-${r.item.id}`}>
            <FolderKanban className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <span className="flex-1 truncate">{r.item.name}</span>
          </div>
        );
      case "project":
        return (
          <div key={r.id} {...commonProps} onClick={() => handleSelect("project", r.item)}
            data-testid={`search-result-project-${r.item.id}`}>
            <Briefcase className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="flex-1 truncate">{r.item.name}</span>
            <Badge variant="outline" className="text-xs flex-shrink-0">{r.item.status}</Badge>
          </div>
        );
      case "task":
        return (
          <div key={r.id} {...commonProps} onClick={() => handleSelect("task", r.item)}
            data-testid={`search-result-task-${r.item.id}`}>
            <CheckSquare className="h-4 w-4 text-green-500 flex-shrink-0" />
            <span className="flex-1 truncate">{r.item.name}</span>
            <Badge variant="outline" className="text-xs flex-shrink-0">{r.item.status}</Badge>
          </div>
        );
      case "issue":
        return (
          <div key={r.id} {...commonProps} onClick={() => handleSelect("issue", r.item)}
            data-testid={`search-result-issue-${r.item.id}`}>
            <Bug className="h-4 w-4 text-red-500 flex-shrink-0" />
            <span className="flex-1 truncate">{r.item.title}</span>
            <Badge variant="outline" className="text-xs flex-shrink-0">{r.item.status}</Badge>
          </div>
        );
      case "risk":
        return (
          <div key={r.id} {...commonProps} onClick={() => handleSelect("risk", r.item)}
            data-testid={`search-result-risk-${r.item.id}`}>
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <span className="flex-1 truncate">{r.item.title}</span>
            <Badge variant="outline" className="text-xs flex-shrink-0">{r.item.status}</Badge>
          </div>
        );
      case "milestone":
        return (
          <div key={r.id} {...commonProps} onClick={() => handleSelect("milestone", r.item)}
            data-testid={`search-result-milestone-${r.item.id}`}>
            <Flag className="h-4 w-4 text-purple-500 flex-shrink-0" />
            <span className="flex-1 truncate">{r.item.title}</span>
            <Badge variant="outline" className="text-xs flex-shrink-0">
              {r.item.completed ? "Complete" : "Pending"}
            </Badge>
          </div>
        );
      case "userGuide": {
        const IconComponent = r.item.icon;
        return (
          <div key={r.id} {...commonProps} onClick={() => handleSelect("userGuide", r.item)}
            data-testid={`search-result-userguide-${r.item.id}`}>
            <IconComponent className="h-4 w-4 text-teal-500 flex-shrink-0" />
            <span className="flex-1 truncate">{r.item.name}</span>
            <Badge variant="outline" className="text-xs flex-shrink-0">Help</Badge>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const groupedResults = useMemo(() => {
    const groups: { label: string; items: { r: ResultItem; globalIndex: number }[] }[] = [];
    const addGroup = (label: string, type: string) => {
      const items = flatResults
        .map((r, i) => ({ r, globalIndex: i }))
        .filter(({ r }) => r.type === type);
      if (items.length > 0) groups.push({ label, items });
    };
    addGroup("Portfolios", "portfolio");
    addGroup("Projects", "project");
    addGroup("Tasks", "task");
    addGroup("Issues", "issue");
    addGroup("Risks", "risk");
    addGroup("Milestones", "milestone");
    addGroup("User Guide", "userGuide");
    return groups;
  }, [flatResults]);

  const renderResultsContent = () => (
    <>
      {query.length < 2 && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Type at least 2 characters to search...
        </div>
      )}
      {query.length >= 2 && isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {query.length >= 2 && !isLoading && !hasResults && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          No results found.
        </div>
      )}
      {query.length >= 2 && !isLoading && hasResults && (
        <div className="py-1">
          {groupedResults.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="mx-2 my-1 h-px bg-border" />}
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {group.label}
              </div>
              {group.items.map(({ r, globalIndex }) => renderResultItem(r, globalIndex))}
            </div>
          ))}
        </div>
      )}
    </>
  );

  const desktopInputProps = {
    type: "text" as const,
    value: query,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setQuery(e.target.value); setOpen(true); },
    onFocus: handleInputFocus,
    onKeyDown: handleKeyDown,
    role: "combobox" as const,
    "aria-expanded": showDropdown,
    "aria-controls": listboxId,
    "aria-activedescendant": activeDescendant,
    "aria-label": "Search",
    "aria-autocomplete": "list" as const,
    autoComplete: "off",
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      {/* Desktop: inline input with dropdown */}
      <div className="hidden sm:flex items-center relative">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={desktopInputRef}
          {...desktopInputProps}
          placeholder="Search everything..."
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-16 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          data-testid="input-global-search"
        />
        <kbd className="pointer-events-none absolute right-2 top-1.5 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>

      {/* Desktop dropdown results */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className="hidden sm:block absolute top-full left-0 right-0 mt-1 z-50 rounded-md border bg-popover text-popover-foreground shadow-lg overflow-hidden"
          style={{ minWidth: "min(100vw - 2rem, 400px)" }}
        >
          <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
            {renderResultsContent()}
          </div>
        </div>
      )}

      {/* Mobile: search icon button */}
      <button
        onClick={handleMobileSearchClick}
        className="flex sm:hidden h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:bg-accent transition-colors"
        aria-label="Search"
        data-testid="button-global-search"
      >
        <Search className="h-4 w-4" />
      </button>

      {/* Mobile: search dialog aligned to top */}
      <Dialog open={mobileDialogOpen} onOpenChange={(isOpen) => {
        setMobileDialogOpen(isOpen);
        if (!isOpen) {
          setQuery("");
          setHighlightIndex(0);
        }
      }}>
        <DialogContent className="sm:hidden top-[12%] translate-y-0 left-[50%] translate-x-[-50%] w-[calc(100vw-2rem)] max-w-lg p-0 gap-0 overflow-hidden rounded-lg border shadow-lg">
          <VisuallyHidden.Root>
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>Search across all data</DialogDescription>
          </VisuallyHidden.Root>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={mobileInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded={query.length >= 1}
              aria-controls="mobile-search-results"
              aria-activedescendant={activeDescendant}
              aria-label="Search"
              aria-autocomplete="list"
              autoComplete="off"
              data-testid="input-global-search-mobile"
            />
          </div>
          {query.length >= 1 && (
            <div
              ref={mobileResultsRef}
              id="mobile-search-results"
              role="listbox"
              aria-label="Search results"
              className="max-h-[60vh] overflow-y-auto overflow-x-hidden"
            >
              {renderResultsContent()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
