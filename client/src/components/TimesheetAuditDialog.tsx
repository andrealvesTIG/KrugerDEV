import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useTimesheetEntryAuditLog } from "@/hooks/use-timesheets";
import { Loader2, History, User, Clock } from "lucide-react";
import { format } from "date-fns";

interface TimesheetAuditDialogProps {
  entryId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const actionLabels: Record<string, { label: string; color: string }> = {
  create: { label: "Created", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  update: { label: "Updated", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  delete: { label: "Deleted", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  submit: { label: "Submitted", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  submit_week: { label: "Submitted", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  approve: { label: "Approved", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  reject: { label: "Rejected", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  proxy_create: { label: "Proxy Created", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
};

export function TimesheetAuditDialog({ entryId, open, onOpenChange }: TimesheetAuditDialogProps) {
  const { data: logs, isLoading } = useTimesheetEntryAuditLog(open ? entryId : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[70vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Audit History
          </DialogTitle>
          <DialogDescription>
            Complete change history for this timesheet entry.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[50vh] space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No audit history available
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
              {logs.map((log) => {
                const actionInfo = actionLabels[log.action] || { label: log.action, color: "bg-gray-100 text-gray-800" };
                return (
                  <div key={log.id} className="relative pl-10 pb-4">
                    <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-background border-2 border-primary" />
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className={actionInfo.color}>
                          {actionInfo.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {log.createdAt ? format(new Date(log.createdAt), "MMM d, yyyy h:mm a") : ""}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {log.actorId}
                        {log.targetUserId && log.targetUserId !== log.actorId && (
                          <span> → {log.targetUserId}</span>
                        )}
                      </div>
                      {log.before && Object.keys(log.before).length > 0 && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Before: </span>
                          {Object.entries(log.before).map(([k, v]) => (
                            <span key={k} className="mr-2">
                              <span className="font-medium">{k}</span>={String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                      {log.after && Object.keys(log.after).length > 0 && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">After: </span>
                          {Object.entries(log.after).map(([k, v]) => (
                            <span key={k} className="mr-2">
                              <span className="font-medium">{k}</span>={String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
