import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";

interface ExternalBadgeProps {
  organizationName?: string;
  accessRole?: string;
  className?: string;
}

export function ExternalBadge({ organizationName, accessRole, className = "" }: ExternalBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={`text-xs bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 gap-1 ${className}`}
      data-testid="badge-external"
    >
      <Building2 className="h-3 w-3" />
      {organizationName ? (
        <span className="truncate max-w-24" title={organizationName}>{organizationName}</span>
      ) : (
        "External"
      )}
      {accessRole && (
        <span className="text-blue-500 dark:text-blue-400">({accessRole})</span>
      )}
    </Badge>
  );
}
