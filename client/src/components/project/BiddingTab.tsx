import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/use-organization";
import {
  useBidPackages, useCreateBidPackage, useUpdateBidPackage, useDeleteBidPackage,
  useBidInvitations, useCreateBidInvitations, useUpdateBidInvitation, useDeleteBidInvitation,
  useBids, useCreateBid, useUpdateBid, useDeleteBid,
  useBidLeveling, useVendors,
} from "@/hooks/use-bidding";
import type { BidPackage, Vendor, Bid, BidLineItem } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Search, Package, Trash2, Pencil, Users, DollarSign, BarChart3, ChevronRight, Star, Award, Loader2, AlertCircle, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const BID_PACKAGE_STATUSES = ["Draft", "Open", "Closed", "Under Review", "Awarded", "Cancelled"] as const;
const BID_STATUSES = ["Submitted", "Under Review", "Accepted", "Rejected", "Withdrawn"] as const;

function statusColor(status: string) {
  const map: Record<string, string> = {
    Draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    Open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    Closed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    "Under Review": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    Awarded: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    Submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    Accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    Rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    Withdrawn: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return map[status] || "bg-gray-100 text-gray-700";
}

function formatCurrency(val: string | null | undefined) {
  if (!val) return "—";
  const num = Number(val);
  if (isNaN(num)) return val;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(num);
}

export default function BiddingTab({ projectId }: { projectId: number }) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { data: bidPackagesList = [], isLoading } = useBidPackages(projectId);
  const { data: orgVendors = [] } = useVendors(orgId);
  const createPkg = useCreateBidPackage();
  const updatePkg = useUpdateBidPackage();
  const deletePkg = useDeleteBidPackage();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedPkgId, setSelectedPkgId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPkg, setEditPkg] = useState<BidPackage | null>(null);

  const filtered = useMemo(() => {
    let items = bidPackagesList;
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(p => p.title.toLowerCase().includes(s) || p.number.toLowerCase().includes(s) || (p.tradeCategory || "").toLowerCase().includes(s));
    }
    if (statusFilter !== "all") items = items.filter(p => p.status === statusFilter);
    return items;
  }, [bidPackagesList, search, statusFilter]);

  const selectedPkg = bidPackagesList.find(p => p.id === selectedPkgId);

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search bid packages..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {BID_PACKAGE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> New Bid Package</Button>
      </div>

      {selectedPkg ? (
        <BidPackageDetail
          pkg={selectedPkg}
          projectId={projectId}
          orgId={orgId!}
          vendors={orgVendors}
          onBack={() => setSelectedPkgId(null)}
          onEdit={() => setEditPkg(selectedPkg)}
          onDelete={() => {
            deletePkg.mutate({ projectId, bidPackageId: selectedPkg.id });
            setSelectedPkgId(null);
          }}
        />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-lg font-medium text-muted-foreground">No bid packages</h3>
            <p className="text-sm text-muted-foreground mt-1">Create a bid package to start the bidding process.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map(pkg => (
            <Card key={pkg.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelectedPkgId(pkg.id)}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{pkg.number}</span>
                      <span className="font-medium truncate">{pkg.title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {pkg.tradeCategory && <span>{pkg.tradeCategory}</span>}
                      {pkg.dueDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Due: {pkg.dueDate}</span>}
                      {pkg.estimatedBudget && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(pkg.estimatedBudget)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-xs", statusColor(pkg.status))}>{pkg.status}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BidPackageFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={(data) => {
          createPkg.mutate({ projectId, data });
          setCreateOpen(false);
        }}
      />

      {editPkg && (
        <BidPackageFormDialog
          open={!!editPkg}
          onOpenChange={() => setEditPkg(null)}
          initial={editPkg}
          onSave={(data) => {
            updatePkg.mutate({ projectId, bidPackageId: editPkg.id, data });
            setEditPkg(null);
          }}
        />
      )}
    </div>
  );
}

function BidPackageFormDialog({ open, onOpenChange, initial, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: BidPackage;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [tradeCategory, setTradeCategory] = useState(initial?.tradeCategory || "");
  const [scope, setScope] = useState(initial?.scope || "");
  const [estimatedBudget, setEstimatedBudget] = useState(initial?.estimatedBudget || "");
  const [dueDate, setDueDate] = useState(initial?.dueDate || "");
  const [prebidDate, setPrebidDate] = useState(initial?.prebidDate || "");
  const [status, setStatus] = useState(initial?.status || "Draft");
  const [documents, setDocuments] = useState(initial?.documents || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Bid Package" : "New Bid Package"}</DialogTitle>
          <DialogDescription>{initial ? "Update bid package details" : "Create a new bid package for this project"}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Mechanical HVAC" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Trade Category</Label>
              <Input value={tradeCategory} onChange={e => setTradeCategory(e.target.value)} placeholder="e.g. HVAC" />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BID_PACKAGE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid gap-1.5">
            <Label>Scope of Work</Label>
            <Textarea value={scope} onChange={e => setScope(e.target.value)} rows={3} />
          </div>
          <div className="grid gap-1.5">
            <Label>Documents</Label>
            <Textarea value={documents} onChange={e => setDocuments(e.target.value)} rows={2} placeholder="List document references, URLs, or file paths (one per line)" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Estimated Budget</Label>
              <Input value={estimatedBudget} onChange={e => setEstimatedBudget(e.target.value)} placeholder="100000" />
            </div>
            <div className="grid gap-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Pre-Bid Date</Label>
              <Input type="date" value={prebidDate} onChange={e => setPrebidDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!title.trim()} onClick={() => onSave({
            title, description: description || null, tradeCategory: tradeCategory || null,
            scope: scope || null, estimatedBudget: estimatedBudget || null,
            dueDate: dueDate || null, prebidDate: prebidDate || null, status,
            documents: documents || null,
          })}>{initial ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BidPackageDetail({ pkg, projectId, orgId, vendors, onBack, onEdit, onDelete }: {
  pkg: BidPackage;
  projectId: number;
  orgId: number;
  vendors: Vendor[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>&larr; Back</Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{pkg.number}</span>
            <h2 className="text-lg font-bold truncate">{pkg.title}</h2>
            <Badge className={cn("text-xs", statusColor(pkg.status))}>{pkg.status}</Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="h-3 w-3 mr-1" /> Edit</Button>
        <Button variant="outline" size="sm" className="text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="bids">Bids</TabsTrigger>
          <TabsTrigger value="leveling">Bid Leveling</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
              <div><Label className="text-xs text-muted-foreground">Trade Category</Label><p className="font-medium">{pkg.tradeCategory || "—"}</p></div>
              <div><Label className="text-xs text-muted-foreground">Estimated Budget</Label><p className="font-medium">{formatCurrency(pkg.estimatedBudget)}</p></div>
              <div><Label className="text-xs text-muted-foreground">Due Date</Label><p className="font-medium">{pkg.dueDate || "—"}</p></div>
              <div><Label className="text-xs text-muted-foreground">Pre-Bid Date</Label><p className="font-medium">{pkg.prebidDate || "—"}</p></div>
              {pkg.awardedAmount && <div><Label className="text-xs text-muted-foreground">Awarded Amount</Label><p className="font-medium text-emerald-600">{formatCurrency(pkg.awardedAmount)}</p></div>}
              {pkg.awardedDate && <div><Label className="text-xs text-muted-foreground">Awarded Date</Label><p className="font-medium">{pkg.awardedDate}</p></div>}
            </CardContent>
            {(pkg.description || pkg.scope || pkg.documents) && (
              <CardContent className="pt-0 space-y-3">
                {pkg.description && <div><Label className="text-xs text-muted-foreground">Description</Label><p className="text-sm whitespace-pre-wrap">{pkg.description}</p></div>}
                {pkg.scope && <div><Label className="text-xs text-muted-foreground">Scope of Work</Label><p className="text-sm whitespace-pre-wrap">{pkg.scope}</p></div>}
                {pkg.documents && <div><Label className="text-xs text-muted-foreground">Documents</Label><p className="text-sm whitespace-pre-wrap">{pkg.documents}</p></div>}
              </CardContent>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="invitations">
          <InvitationsPanel projectId={projectId} bidPackageId={pkg.id} orgId={orgId} vendors={vendors} />
        </TabsContent>

        <TabsContent value="bids">
          <BidsPanel projectId={projectId} bidPackageId={pkg.id} orgId={orgId} vendors={vendors} />
        </TabsContent>

        <TabsContent value="leveling">
          <BidLevelingPanel projectId={projectId} bidPackageId={pkg.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InvitationsPanel({ projectId, bidPackageId, orgId, vendors }: {
  projectId: number; bidPackageId: number; orgId: number; vendors: Vendor[];
}) {
  const { data: invitations = [], isLoading } = useBidInvitations(projectId, bidPackageId);
  const { data: existingBids = [] } = useBids(projectId, bidPackageId);
  const createInvitations = useCreateBidInvitations();
  const deleteInvitation = useDeleteBidInvitation();
  const createBid = useCreateBid();
  const updateInvitation = useUpdateBidInvitation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>([]);
  const [submitBidForVendor, setSubmitBidForVendor] = useState<Vendor | null>(null);

  const invitedIds = new Set(invitations.map(i => i.vendorId));
  const biddedVendorIds = new Set(existingBids.map(b => b.vendorId));
  const availableVendors = vendors.filter(v => !invitedIds.has(v.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Users className="h-4 w-4" /> Invited Vendors ({invitations.length})</h3>
        <Button size="sm" onClick={() => { setSelectedVendorIds([]); setInviteOpen(true); }} disabled={availableVendors.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Invite Vendors
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : invitations.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No vendors invited yet</CardContent></Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Trade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Invited</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map(inv => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.vendor?.companyName || "Unknown"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{inv.vendor?.tradeSpecialty || "—"}</TableCell>
                <TableCell><Badge className={cn("text-xs", statusColor(inv.status))}>{inv.status}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{inv.invitedAt ? new Date(inv.invitedAt).toLocaleDateString() : "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {!biddedVendorIds.has(inv.vendorId) && inv.status !== "Declined" && inv.vendor && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
                        updateInvitation.mutate({ projectId, bidPackageId, invitationId: inv.id, data: { status: "Accepted" } });
                        setSubmitBidForVendor(inv.vendor!);
                      }}>
                        <DollarSign className="h-3 w-3 mr-0.5" /> Submit Bid
                      </Button>
                    )}
                    {biddedVendorIds.has(inv.vendorId) && (
                      <Badge variant="outline" className="text-xs text-emerald-600">Bid Submitted</Badge>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteInvitation.mutate({ projectId, bidPackageId, invitationId: inv.id })}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {submitBidForVendor && (
        <BidFormDialog
          open={!!submitBidForVendor}
          onOpenChange={() => setSubmitBidForVendor(null)}
          vendors={[submitBidForVendor]}
          onSave={(data) => {
            createBid.mutate({ projectId, bidPackageId, data: { ...data, vendorId: submitBidForVendor.id } });
            setSubmitBidForVendor(null);
          }}
        />
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Vendors</DialogTitle>
            <DialogDescription>Select vendors to invite to this bid package</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-64">
            <div className="space-y-2">
              {availableVendors.map(v => (
                <label key={v.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer">
                  <Checkbox
                    checked={selectedVendorIds.includes(v.id)}
                    onCheckedChange={(checked) => {
                      setSelectedVendorIds(prev => checked ? [...prev, v.id] : prev.filter(id => id !== v.id));
                    }}
                  />
                  <div>
                    <p className="font-medium text-sm">{v.companyName}</p>
                    <p className="text-xs text-muted-foreground">{v.tradeSpecialty || "No specialty"} {v.contactName ? `· ${v.contactName}` : ""}</p>
                  </div>
                </label>
              ))}
              {availableVendors.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">All vendors have been invited</p>}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button disabled={selectedVendorIds.length === 0} onClick={() => {
              createInvitations.mutate({ projectId, bidPackageId, vendorIds: selectedVendorIds });
              setInviteOpen(false);
            }}>Invite ({selectedVendorIds.length})</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BidsPanel({ projectId, bidPackageId, orgId, vendors }: {
  projectId: number; bidPackageId: number; orgId: number; vendors: Vendor[];
}) {
  const { data: bidsList = [], isLoading } = useBids(projectId, bidPackageId);
  const createBid = useCreateBid();
  const updateBid = useUpdateBid();
  const deleteBid = useDeleteBid();
  const [createOpen, setCreateOpen] = useState(false);
  const [editBid, setEditBid] = useState<(Bid & { vendor: Vendor | null; lineItems: BidLineItem[] }) | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><DollarSign className="h-4 w-4" /> Bids ({bidsList.length})</h3>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Record Bid</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : bidsList.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No bids received yet</CardContent></Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Bond</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bidsList.map(bid => (
              <TableRow key={bid.id} className={cn(bid.isRecommended && "bg-emerald-50/50 dark:bg-emerald-950/20")}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5">
                    {bid.isRecommended && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                    {bid.vendor?.companyName || "Unknown"}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(bid.totalAmount)}</TableCell>
                <TableCell><Badge className={cn("text-xs", statusColor(bid.status))}>{bid.status}</Badge></TableCell>
                <TableCell>{bid.bondIncluded ? "Yes" : "No"}</TableCell>
                <TableCell className="text-right">{bid.evaluationScore !== null ? `${bid.evaluationScore}/100` : "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditBid(bid)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteBid.mutate({ projectId, bidPackageId, bidId: bid.id })}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <BidFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        vendors={vendors}
        onSave={(data) => { createBid.mutate({ projectId, bidPackageId, data }); setCreateOpen(false); }}
      />
      {editBid && (
        <BidFormDialog
          open={!!editBid}
          onOpenChange={() => setEditBid(null)}
          vendors={vendors}
          initial={editBid}
          onSave={(data) => { updateBid.mutate({ projectId, bidPackageId, bidId: editBid.id, data }); setEditBid(null); }}
        />
      )}
    </div>
  );
}

type LineItemDraft = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  totalPrice: string;
  category: string;
};

const emptyLineItem = (): LineItemDraft => ({
  description: "", quantity: "", unit: "", unitPrice: "", totalPrice: "", category: "",
});

function BidFormDialog({ open, onOpenChange, vendors, initial, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendors: Vendor[];
  initial?: Bid & { lineItems?: BidLineItem[] };
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [vendorId, setVendorId] = useState<string>(initial?.vendorId?.toString() || "");
  const [totalAmount, setTotalAmount] = useState(initial?.totalAmount || "");
  const [alternateAmount, setAlternateAmount] = useState(initial?.alternateAmount || "");
  const [bondIncluded, setBondIncluded] = useState(initial?.bondIncluded || false);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [exclusions, setExclusions] = useState(initial?.exclusions || "");
  const [clarifications, setClarifications] = useState(initial?.clarifications || "");
  const [attachments, setAttachments] = useState(initial?.attachments || "");
  const [validUntil, setValidUntil] = useState(initial?.validUntil || "");
  const [status, setStatus] = useState(initial?.status || "Submitted");
  const [evaluationScore, setEvaluationScore] = useState(initial?.evaluationScore?.toString() || "");
  const [evaluationNotes, setEvaluationNotes] = useState(initial?.evaluationNotes || "");
  const [isRecommended, setIsRecommended] = useState(initial?.isRecommended || false);
  const [lineItems, setLineItems] = useState<LineItemDraft[]>(
    initial?.lineItems?.map(li => ({
      description: li.description,
      quantity: li.quantity || "",
      unit: li.unit || "",
      unitPrice: li.unitPrice || "",
      totalPrice: li.totalPrice || "",
      category: li.category || "",
    })) || []
  );

  const isEdit = !!initial;

  const updateLineItem = (idx: number, field: keyof LineItemDraft, value: string) => {
    setLineItems(prev => prev.map((li, i) => i === idx ? { ...li, [field]: value } : li));
  };

  const removeLineItem = (idx: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Bid" : "Submit Bid"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update bid details, breakdown, and evaluation" : "Submit a bid with amount, breakdown, attachments, and notes"}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {!isEdit && (
            <div className="grid gap-1.5">
              <Label>Vendor *</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>{vendors.map(v => <SelectItem key={v.id} value={v.id.toString()}>{v.companyName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Total Amount *</Label>
              <Input value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="e.g. 150000" />
            </div>
            <div className="grid gap-1.5">
              <Label>Alternate Amount</Label>
              <Input value={alternateAmount} onChange={e => setAlternateAmount(e.target.value)} placeholder="e.g. 145000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Valid Until</Label>
              <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <Checkbox checked={bondIncluded} onCheckedChange={(v) => setBondIncluded(!!v)} id="bond" />
              <Label htmlFor="bond">Bond Included</Label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Line Items (Cost Breakdown)</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setLineItems(prev => [...prev, emptyLineItem()])}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            {lineItems.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Description</TableHead>
                      <TableHead className="w-[70px]">Qty</TableHead>
                      <TableHead className="w-[70px]">Unit</TableHead>
                      <TableHead className="w-[90px]">Unit Price</TableHead>
                      <TableHead className="w-[90px]">Total</TableHead>
                      <TableHead className="w-[30px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((li, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="p-1"><Input className="h-8 text-sm" value={li.description} onChange={e => updateLineItem(idx, "description", e.target.value)} placeholder="Item description" /></TableCell>
                        <TableCell className="p-1"><Input className="h-8 text-sm" value={li.quantity} onChange={e => updateLineItem(idx, "quantity", e.target.value)} /></TableCell>
                        <TableCell className="p-1"><Input className="h-8 text-sm" value={li.unit} onChange={e => updateLineItem(idx, "unit", e.target.value)} placeholder="ea" /></TableCell>
                        <TableCell className="p-1"><Input className="h-8 text-sm" value={li.unitPrice} onChange={e => updateLineItem(idx, "unitPrice", e.target.value)} /></TableCell>
                        <TableCell className="p-1"><Input className="h-8 text-sm" value={li.totalPrice} onChange={e => updateLineItem(idx, "totalPrice", e.target.value)} /></TableCell>
                        <TableCell className="p-1"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeLineItem(idx)}><Trash2 className="h-3 w-3 text-destructive" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Exclusions</Label>
              <Textarea value={exclusions} onChange={e => setExclusions(e.target.value)} rows={2} />
            </div>
            <div className="grid gap-1.5">
              <Label>Clarifications</Label>
              <Textarea value={clarifications} onChange={e => setClarifications(e.target.value)} rows={2} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Attachments</Label>
            <Textarea value={attachments} onChange={e => setAttachments(e.target.value)} rows={2} placeholder="List document references, file paths, or URLs (one per line)" />
          </div>
          {isEdit && (
            <>
              <hr />
              <h4 className="font-medium text-sm">Evaluation</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{BID_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Score (0-100)</Label>
                  <Input type="number" min={0} max={100} value={evaluationScore} onChange={e => setEvaluationScore(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Evaluation Notes</Label>
                <Textarea value={evaluationNotes} onChange={e => setEvaluationNotes(e.target.value)} rows={2} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={isRecommended} onCheckedChange={(v) => setIsRecommended(!!v)} id="recommended" />
                <Label htmlFor="recommended" className="flex items-center gap-1"><Award className="h-3.5 w-3.5 text-amber-500" /> Recommended Bid</Label>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={(!isEdit && !vendorId) || !totalAmount.trim()} onClick={() => {
            const validLineItems = lineItems.filter(li => li.description.trim());
            const data: Record<string, unknown> = {
              totalAmount,
              alternateAmount: alternateAmount || null,
              bondIncluded,
              notes: notes || null,
              exclusions: exclusions || null,
              clarifications: clarifications || null,
              attachments: attachments || null,
              validUntil: validUntil || null,
              lineItems: validLineItems.length > 0 ? validLineItems.map((li, idx) => ({
                description: li.description,
                quantity: li.quantity || null,
                unit: li.unit || null,
                unitPrice: li.unitPrice || null,
                totalPrice: li.totalPrice || null,
                category: li.category || null,
                sortOrder: idx,
              })) : undefined,
            };
            if (!isEdit) data.vendorId = Number(vendorId);
            if (isEdit) {
              data.status = status;
              data.evaluationScore = evaluationScore ? Number(evaluationScore) : null;
              data.evaluationNotes = evaluationNotes || null;
              data.isRecommended = isRecommended;
            }
            onSave(data);
          }}>{isEdit ? "Save" : "Submit Bid"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BidLevelingPanel({ projectId, bidPackageId }: { projectId: number; bidPackageId: number }) {
  const { data: leveling, isLoading } = useBidLeveling(projectId, bidPackageId);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!leveling || leveling.bids.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <BarChart3 className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <h3 className="text-lg font-medium text-muted-foreground">No bids to compare</h3>
          <p className="text-sm text-muted-foreground mt-1">Record at least two bids to use the bid leveling view.</p>
        </CardContent>
      </Card>
    );
  }

  const { bids: levelBids, summary } = leveling;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Total Bids</p>
            <p className="text-2xl font-bold">{summary.totalBids}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Lowest Bid</p>
            <p className="text-2xl font-bold text-emerald-600">{summary.lowestBid !== null ? formatCurrency(summary.lowestBid.toString()) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Highest Bid</p>
            <p className="text-2xl font-bold text-red-600">{summary.highestBid !== null ? formatCurrency(summary.highestBid.toString()) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">Average Bid</p>
            <p className="text-2xl font-bold">{summary.averageBid !== null ? formatCurrency(Math.round(summary.averageBid).toString()) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Side-by-Side Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Criteria</TableHead>
                  {levelBids.map(bid => (
                    <TableHead key={bid.id} className="min-w-[160px] text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-medium">{bid.vendor?.companyName || "Unknown"}</span>
                        {bid.isRecommended && <Badge className="bg-amber-100 text-amber-700 text-[10px]"><Star className="h-2.5 w-2.5 mr-0.5 fill-amber-500" />Recommended</Badge>}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Total Amount</TableCell>
                  {levelBids.map(bid => {
                    const isLowest = Number(bid.totalAmount) === summary.lowestBid;
                    return (
                      <TableCell key={bid.id} className={cn("text-center font-mono", isLowest && "text-emerald-600 font-bold")}>
                        {formatCurrency(bid.totalAmount)}
                        {isLowest && <Badge className="ml-1 bg-emerald-100 text-emerald-700 text-[10px]">Lowest</Badge>}
                      </TableCell>
                    );
                  })}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Alternate Amount</TableCell>
                  {levelBids.map(bid => <TableCell key={bid.id} className="text-center font-mono">{formatCurrency(bid.alternateAmount)}</TableCell>)}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Bond Included</TableCell>
                  {levelBids.map(bid => <TableCell key={bid.id} className="text-center">{bid.bondIncluded ? "✓" : "✗"}</TableCell>)}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Valid Until</TableCell>
                  {levelBids.map(bid => <TableCell key={bid.id} className="text-center text-sm">{bid.validUntil || "—"}</TableCell>)}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Eval Score</TableCell>
                  {levelBids.map(bid => <TableCell key={bid.id} className="text-center">{bid.evaluationScore !== null ? `${bid.evaluationScore}/100` : "—"}</TableCell>)}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Status</TableCell>
                  {levelBids.map(bid => <TableCell key={bid.id} className="text-center"><Badge className={cn("text-xs", statusColor(bid.status))}>{bid.status}</Badge></TableCell>)}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Exclusions</TableCell>
                  {levelBids.map(bid => <TableCell key={bid.id} className="text-sm max-w-[200px]">{bid.exclusions || "—"}</TableCell>)}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Clarifications</TableCell>
                  {levelBids.map(bid => <TableCell key={bid.id} className="text-sm max-w-[200px]">{bid.clarifications || "—"}</TableCell>)}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Attachments</TableCell>
                  {levelBids.map(bid => <TableCell key={bid.id} className="text-sm max-w-[200px]">{bid.attachments || "—"}</TableCell>)}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {leveling.bids.some(b => b.lineItems.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Line Item Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Line Item</TableHead>
                    {levelBids.map(bid => (
                      <TableHead key={bid.id} className="text-center min-w-[120px]">{bid.vendor?.companyName || "Unknown"}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const allDescriptions = [...new Set(levelBids.flatMap(b => b.lineItems.map(li => li.description)))];
                    return allDescriptions.map(desc => (
                      <TableRow key={desc}>
                        <TableCell className="font-medium text-sm">{desc}</TableCell>
                        {levelBids.map(bid => {
                          const item = bid.lineItems.find(li => li.description === desc);
                          return (
                            <TableCell key={bid.id} className="text-center font-mono text-sm">
                              {item ? formatCurrency(item.totalPrice) : "—"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
