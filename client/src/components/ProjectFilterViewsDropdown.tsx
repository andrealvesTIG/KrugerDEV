import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Check, FolderOpen, FolderCheck, User, Users, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectFilterView = 
  | "all"
  | "my-active"
  | "active"
  | "closed"
  | "my-closed";

interface FilterOption {
  id: ProjectFilterView;
  label: string;
  icon: typeof FolderOpen;
  description: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  {
    id: "all",
    label: "All Projects",
    icon: FolderOpen,
    description: "View all projects",
  },
  {
    id: "active",
    label: "Active Projects",
    icon: Users,
    description: "Projects not in 'Closing' status",
  },
  {
    id: "my-active",
    label: "My Active Projects",
    icon: User,
    description: "Your assigned projects not in 'Closing' status",
  },
  {
    id: "closed",
    label: "Closed Projects",
    icon: Archive,
    description: "Projects with 'Closing' status",
  },
  {
    id: "my-closed",
    label: "My Closed Projects",
    icon: FolderCheck,
    description: "Your assigned projects with 'Closing' status",
  },
];

interface ProjectFilterViewsDropdownProps {
  value: ProjectFilterView;
  onChange: (value: ProjectFilterView) => void;
}

export function ProjectFilterViewsDropdown({
  value,
  onChange,
}: ProjectFilterViewsDropdownProps) {
  const currentOption = FILTER_OPTIONS.find(o => o.id === value) || FILTER_OPTIONS[0];
  const Icon = currentOption.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-project-filter-views">
          <Icon className="h-4 w-4 mr-2" />
          <span>{currentOption.label}</span>
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {FILTER_OPTIONS.map((option, index) => {
          const OptionIcon = option.icon;
          const isSelected = value === option.id;
          
          return (
            <div key={option.id}>
              {index === 2 && <DropdownMenuSeparator />}
              {index === 3 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={() => onChange(option.id)}
                data-testid={`filter-view-option-${option.id}`}
                className="flex items-center justify-between py-2"
              >
                <div className="flex flex-col">
                  <span className={cn("flex items-center gap-2", isSelected && "font-medium")}>
                    <OptionIcon className="h-4 w-4" />
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground ml-6">{option.description}</span>
                </div>
                {isSelected && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
