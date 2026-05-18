import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { usePermissions } from "@/hooks/use-permissions";
import { groupPermissionsByArea } from "@shared/permissionCatalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface RoleWithPerms {
  id: number;
  organizationId: number;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export default function RolesAndPermissionsPage() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { has, isLoading: permsLoading } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RoleWithPerms | null>(null);
  const [viewing, setViewing] = useState<RoleWithPerms | null>(null);
  const [creating, setCreating] = useState(false);
  const [cloning, setCloning] = useState<RoleWithPerms | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneKey, setCloneKey] = useState("");

  const rolesQuery = useQuery<RoleWithPerms[]>({
    queryKey: ["/api/organizations/roles", orgId],
    queryFn: async () => {
      const r = await fetch(`/api/organizations/${orgId}/roles`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load roles");
      return r.json();
    },
    enabled: !!orgId && has("roles.view"),
  });

  const grouped = useMemo(() => groupPermissionsByArea(), []);

  const saveRole = useMutation({
    mutationFn: async (role: Partial<RoleWithPerms> & { id?: number }) => {
      const isUpdate = !!role.id;
      const url = isUpdate
        ? `/api/organizations/${orgId}/roles/${role.id}`
        : `/api/organizations/${orgId}/roles`;
      const r = await fetch(url, {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(role),
      });
      if (!r.ok) throw new Error((await r.json()).message || "Save failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/organizations/roles", orgId] });
      qc.invalidateQueries({ queryKey: ["/api/me/permissions", orgId] });
      setEditing(null);
      setCreating(false);
      toast({ title: "Role saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteRole = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/organizations/${orgId}/roles/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/organizations/roles", orgId] });
      toast({ title: "Role deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const cloneRoleMut = useMutation({
    mutationFn: async ({ source, name, key }: { source: RoleWithPerms; name: string; key: string }) => {
      const r = await fetch(`/api/organizations/${orgId}/roles/${source.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, key }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Clone failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/organizations/roles", orgId] });
      setCloning(null);
      setCloneName("");
      setCloneKey("");
      toast({ title: "Role cloned" });
    },
    onError: (e: any) => toast({ title: "Clone failed", description: e.message, variant: "destructive" }),
  });

  const resetDefaults = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/organizations/${orgId}/roles/reset-defaults`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error("Reset failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/organizations/roles", orgId] });
      toast({ title: "Built-in roles reset to defaults" });
    },
  });

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!has("roles.view")) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Roles &amp; Permissions</h1>
        <p className="mt-2 text-muted-foreground">You don't have permission to view roles.</p>
      </div>
    );
  }

  const canManage = has("roles.manage");

  return (
    <div className="p-6 space-y-6" data-testid="page-roles-permissions">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Roles &amp; Permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define who can do what in your organization. Built-in roles cover most teams;
            create custom roles for anything specific.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => resetDefaults.mutate()} data-testid="button-reset-defaults">
              Reset built-in roles
            </Button>
            <Button onClick={() => setCreating(true)} data-testid="button-new-role">
              New role
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3">
        {(rolesQuery.data || []).map(role => (
          <Card key={role.id} data-testid={`role-card-${role.key}`}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {role.name}
                  {role.isSystem && <Badge variant="secondary">Built-in</Badge>}
                </CardTitle>
                {role.description && (
                  <p className="text-sm text-muted-foreground mt-1">{role.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1 font-mono">{role.key}</p>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  {role.isSystem ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setViewing(role)} data-testid={`button-view-${role.key}`}>
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCloning(role);
                          setCloneName(`${role.name} (custom)`);
                          setCloneKey(`${role.key}_custom`);
                        }}
                        data-testid={`button-clone-${role.key}`}
                      >
                        Clone
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing(role)} data-testid={`button-edit-${role.key}`}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { if (confirm(`Delete role "${role.name}"?`)) deleteRole.mutate(role.id); }}
                        data-testid={`button-delete-${role.key}`}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {role.permissions.length === 0
                  ? <span className="text-sm text-muted-foreground">No permissions</span>
                  : role.permissions.map(p => (
                      <Badge key={p} variant="outline" className="font-mono text-xs">{p}</Badge>
                    ))
                }
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <RoleEditorDialog
        open={!!editing || creating}
        role={editing}
        groupedPerms={grouped}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSave={(data) => saveRole.mutate(data)}
        saving={saveRole.isPending}
      />

      {/* Read-only viewer for built-in roles */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-view-builtin">
          <DialogHeader>
            <DialogTitle>{viewing?.name} <Badge variant="secondary" className="ml-2">Built-in</Badge></DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Built-in roles are read-only. Use "Clone" to create a custom copy you can edit.
          </p>
          <div className="mt-4 flex flex-wrap gap-1">
            {(viewing?.permissions || []).map(p => (
              <Badge key={p} variant="outline" className="font-mono text-xs">{p}</Badge>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setViewing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone built-in dialog */}
      <Dialog open={!!cloning} onOpenChange={(o) => !o && setCloning(null)}>
        <DialogContent data-testid="dialog-clone-role">
          <DialogHeader>
            <DialogTitle>Clone "{cloning?.name}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">New role name</label>
              <Input value={cloneName} onChange={(e) => setCloneName(e.target.value)} data-testid="input-clone-name" />
            </div>
            <div>
              <label className="text-sm font-medium">Key (snake_case)</label>
              <Input
                value={cloneKey}
                onChange={(e) => setCloneKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                data-testid="input-clone-key"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloning(null)}>Cancel</Button>
            <Button
              disabled={!cloneName.trim() || !cloneKey.trim() || cloneRoleMut.isPending}
              onClick={() => cloning && cloneRoleMut.mutate({ source: cloning, name: cloneName.trim(), key: cloneKey.trim() })}
              data-testid="button-confirm-clone"
            >
              {cloneRoleMut.isPending ? "Cloning…" : "Clone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleEditorDialog({
  open, role, groupedPerms, onClose, onSave, saving,
}: {
  open: boolean;
  role: RoleWithPerms | null;
  groupedPerms: Record<string, { key: string; label: string; description: string }[]>;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(role?.name || "");
  const [key, setKey] = useState(role?.key || "");
  const [description, setDescription] = useState(role?.description || "");
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions || []));

  // Reset when role changes
  useMemo(() => {
    setName(role?.name || "");
    setKey(role?.key || "");
    setDescription(role?.description || "");
    setSelected(new Set(role?.permissions || []));
  }, [role?.id, open]);

  const isCreate = !role;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Create role" : `Edit ${role!.name}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-role-name" />
          </div>
          {isCreate && (
            <div>
              <label className="text-sm font-medium">Key (lowercase, snake_case)</label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="e.g. budget_reviewer"
                data-testid="input-role-key"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div>
            <h4 className="font-semibold mb-2">Permissions</h4>
            {Object.entries(groupedPerms).map(([area, perms]) => (
              <div key={area} className="mb-4">
                <h5 className="text-sm font-semibold text-muted-foreground mb-1">{area}</h5>
                <div className="space-y-1.5 pl-1">
                  {perms.map(p => (
                    <label key={p.key} className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        checked={selected.has(p.key)}
                        onCheckedChange={(c) => {
                          const next = new Set(selected);
                          if (c) next.add(p.key); else next.delete(p.key);
                          setSelected(next);
                        }}
                        data-testid={`checkbox-perm-${p.key}`}
                      />
                      <div>
                        <div className="text-sm font-medium">{p.label}</div>
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={saving || !name.trim() || (isCreate && !key.trim())}
            onClick={() => onSave({
              id: role?.id,
              name: name.trim(),
              key: isCreate ? key.trim() : undefined,
              description: description.trim() || null,
              permissions: Array.from(selected),
            })}
            data-testid="button-save-role"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
