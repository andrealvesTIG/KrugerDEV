import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Trash2, RotateCcw, Folder, FileText, Target, Flag, AlertCircle, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { RecycleBinItem, RecycleBinItemType } from "@shared/schema";
import { usePermissions } from "@/hooks/use-permissions";
import { PERMISSIONS } from "@shared/permissionCatalog";

export function RecycleBinSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [itemToDelete, setItemToDelete] = useState<RecycleBinItem | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const { has } = usePermissions();
  const canPurge = has(PERMISSIONS.ORG_RECYCLE_BIN_PURGE);

  const { data: deletedItems, isLoading } = useQuery<RecycleBinItem[]>({
    queryKey: ['/api/organizations', organizationId, 'recycle-bin'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/recycle-bin`);
      if (!res.ok) return [];
      return res.json();
    }
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ type, itemId }: { type: RecycleBinItemType; itemId: number }) => {
      return apiRequest('POST', `/api/organizations/${organizationId}/recycle-bin/restore`, { type, itemId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'recycle-bin'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({ title: "Restored", description: "Item has been restored successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to restore item", variant: "destructive" });
    }
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async ({ type, itemId }: { type: RecycleBinItemType; itemId: number }) => {
      return apiRequest('DELETE', `/api/organizations/${organizationId}/recycle-bin/${type}/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'recycle-bin'] });
      toast({ title: "Deleted", description: "Item has been permanently deleted" });
      setItemToDelete(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete item", variant: "destructive" });
    }
  });

  const emptyBinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/organizations/${organizationId}/recycle-bin`);
      return res.json() as Promise<{ deleted: number; failed: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'recycle-bin'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      const failedNote = result.failed > 0 ? ` (${result.failed} could not be deleted)` : '';
      toast({ title: "Recycle bin emptied", description: `${result.deleted} item${result.deleted === 1 ? '' : 's'} permanently deleted${failedNote}` });
      setConfirmEmpty(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to empty recycle bin", variant: "destructive" });
    }
  });

  const getTypeIcon = (type: RecycleBinItemType) => {
    switch (type) {
      case 'portfolio': return <Folder className="h-4 w-4" />;
      case 'project': return <FileText className="h-4 w-4" />;
      case 'task': return <CheckSquare className="h-4 w-4" />;
      case 'risk': return <AlertCircle className="h-4 w-4" />;
      case 'milestone': return <Target className="h-4 w-4" />;
      case 'issue': return <Flag className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeBadgeVariant = (type: RecycleBinItemType) => {
    switch (type) {
      case 'portfolio': return 'default';
      case 'project': return 'secondary';
      case 'task': return 'outline';
      case 'risk': return 'destructive';
      case 'milestone': return 'default';
      case 'issue': return 'secondary';
      default: return 'outline';
    }
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Recycle Bin
            </CardTitle>
            <CardDescription>
              Recently deleted items can be restored or permanently removed
            </CardDescription>
          </div>
          {canPurge && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmEmpty(true)}
              disabled={!deletedItems || deletedItems.length === 0 || emptyBinMutation.isPending}
              data-testid="button-empty-recycle-bin"
            >
              {emptyBinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Empty Recycle Bin
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {deletedItems && deletedItems.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Deleted By</TableHead>
                <TableHead>Deleted At</TableHead>
                <TableHead className="w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deletedItems.map((item) => (
                <TableRow key={`${item.type}-${item.id}`} data-testid={`recycle-bin-row-${item.type}-${item.id}`}>
                  <TableCell>
                    <Badge variant={getTypeBadgeVariant(item.type) as any} className="flex items-center gap-1 w-fit">
                      {getTypeIcon(item.type)}
                      {item.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.projectName || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">{item.deletedByName || 'Unknown'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(item.deletedAt), 'MMM d, yyyy h:mm a')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => restoreMutation.mutate({ type: item.type, itemId: item.id })}
                        disabled={restoreMutation.isPending}
                        title="Restore"
                        data-testid={`button-restore-${item.type}-${item.id}`}
                      >
                        <RotateCcw className="h-4 w-4 text-green-600" />
                      </Button>
                      {canPurge && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setItemToDelete(item)}
                          disabled={permanentDeleteMutation.isPending}
                          title="Delete permanently"
                          data-testid={`button-delete-permanent-${item.type}-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No deleted items in the recycle bin.
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmEmpty} onOpenChange={(open) => !open && setConfirmEmpty(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty Recycle Bin?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {deletedItems?.length ?? 0} item{(deletedItems?.length ?? 0) === 1 ? '' : 's'} in the recycle bin. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => emptyBinMutation.mutate()}
              data-testid="button-confirm-empty-recycle-bin"
            >
              Empty Recycle Bin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={itemToDelete !== null} onOpenChange={() => setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{itemToDelete?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => itemToDelete && permanentDeleteMutation.mutate({ type: itemToDelete.type, itemId: itemToDelete.id })}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
