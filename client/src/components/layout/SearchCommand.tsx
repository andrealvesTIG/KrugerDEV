import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  Loader2 
} from "lucide-react";
import type { Portfolio, Project, Task, Issue, Risk, Milestone } from "@shared/schema";

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

  const { data: results, isLoading } = useQuery<SearchResults>({
    queryKey: ['/api/search', query],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: query.length >= 2,
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
        setLocation(`/projects/${item.projectId}?tab=tasks`);
        break;
      case "issue":
        setLocation(`/projects/${item.projectId}?tab=issues`);
        break;
      case "risk":
        setLocation(`/projects/${item.projectId}?tab=risks`);
        break;
      case "milestone":
        setLocation(`/projects/${item.projectId}?tab=milestones`);
        break;
    }
  }, [setLocation]);

  const hasResults = results && (
    results.portfolios.length > 0 ||
    results.projects.length > 0 ||
    results.tasks.length > 0 ||
    results.issues.length > 0 ||
    results.risks.length > 0 ||
    results.milestones.length > 0
  );

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start text-sm text-muted-foreground sm:pr-12 md:w-64"
        onClick={() => setOpen(true)}
        data-testid="button-global-search"
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Search everything...</span>
        <span className="inline-flex lg:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search portfolios, projects, tasks, issues..." 
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
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
