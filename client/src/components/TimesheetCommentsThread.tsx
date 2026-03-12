import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import {
  useTimesheetComments,
  useCreateTimesheetComment,
  useTimesheetEntryAuditLog,
} from "@/hooks/use-timesheets";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Send,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface TimesheetCommentsThreadProps {
  entryId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryInfo?: {
    taskName?: string;
    projectName?: string;
    date?: string;
    hours?: string;
    status?: string;
  };
}

function getStatusIcon(action: string) {
  switch (action) {
    case "submit": return <Clock className="h-3.5 w-3.5 text-blue-500" />;
    case "approve": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "reject": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    case "create": return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
    case "update": return <FileText className="h-3.5 w-3.5 text-amber-500" />;
    default: return <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getActionLabel(action: string) {
  switch (action) {
    case "submit": return "Submitted for approval";
    case "approve": return "Approved";
    case "reject": return "Rejected";
    case "create": return "Created entry";
    case "update": return "Updated entry";
    case "delete": return "Deleted entry";
    default: return action;
  }
}

export function TimesheetCommentsThread({ entryId, open, onOpenChange, entryInfo }: TimesheetCommentsThreadProps) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [newComment, setNewComment] = useState("");

  const { data: comments = [], isLoading: commentsLoading } = useTimesheetComments(entryId);
  const { data: auditLogs = [], isLoading: auditLoading } = useTimesheetEntryAuditLog(entryId);
  const createComment = useCreateTimesheetComment();

  const handleSubmit = async () => {
    if (!entryId || !currentOrganization?.id || !newComment.trim()) return;
    try {
      await createComment.mutateAsync({
        entryId,
        organizationId: currentOrganization.id,
        text: newComment.trim(),
      });
      setNewComment("");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to add comment", variant: "destructive" });
    }
  };

  const timeline = [
    ...auditLogs.map(log => ({
      type: "audit" as const,
      date: log.createdAt ? new Date(log.createdAt) : new Date(),
      action: log.action,
      actorId: log.actorId,
      details: log.after as Record<string, unknown> | null,
      id: `audit-${log.id}`,
    })),
    ...comments.map(comment => ({
      type: "comment" as const,
      date: comment.createdAt ? new Date(comment.createdAt) : new Date(),
      action: "comment",
      actorId: comment.userId,
      details: { text: comment.text },
      id: `comment-${comment.id}`,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Entry History & Comments
          </DialogTitle>
          {entryInfo && (
            <DialogDescription>
              {entryInfo.taskName} • {entryInfo.projectName} • {entryInfo.date} • {entryInfo.hours}h
              {entryInfo.status && (
                <Badge variant="secondary" className="ml-2 text-[10px]">{entryInfo.status}</Badge>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[400px] pr-2">
          {(commentsLoading || auditLoading) ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : timeline.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No activity yet
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {timeline.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="pt-1 shrink-0">
                    {item.type === "comment" ? (
                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      getStatusIcon(item.action)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {item.type === "comment" ? (
                      <div className="bg-muted/50 rounded-lg p-2.5">
                        <div className="text-sm">{(item.details as { text: string })?.text}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(item.date, "MMM d, yyyy h:mm a")}
                        </div>
                      </div>
                    ) : (
                      <div className="py-1">
                        <div className="text-sm">
                          <span className="font-medium">{getActionLabel(item.action)}</span>
                          {item.action === "reject" && item.details && (item.details as Record<string, unknown>).rejectionReason && (
                            <span className="text-muted-foreground"> — {String((item.details as Record<string, unknown>).rejectionReason)}</span>
                          )}
                          {item.action === "update" && item.details && (item.details as Record<string, unknown>).hours && (
                            <span className="text-muted-foreground"> — {String((item.details as Record<string, unknown>).hours)}h</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(item.date, "MMM d, yyyy h:mm a")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t pt-3 flex gap-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[60px] text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!newComment.trim() || createComment.isPending}
            className="shrink-0 h-10 w-10"
          >
            {createComment.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}