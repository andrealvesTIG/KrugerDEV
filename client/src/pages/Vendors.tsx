import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/use-organization";
import {
  useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor,
  useVendorPrequalifications, useCreatePrequalification, useUpdatePrequalification,
} from "@/hooks/use-bidding";
import type { Vendor, VendorPrequalification } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Building2, Trash2, Pencil, Star, Shield, Loader2, Phone, Mail, Globe, MapPin, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const VENDOR_STATUSES = ["Active", "Inactive", "Suspended", "Blacklisted"] as const;
const PREQUAL_STATUSES = ["Pending", "Qualified", "Conditionally Qualified", "Disqualified"] as const;

function vendorStatusColor(status: string) {
  const map: Record<string, string> = {
    Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    Inactive: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    Suspended: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    Blacklisted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return map[status] || "bg-gray-100 text-gray-700";
}

function prequalStatusColor(status: string) {
  const map: Record<string, string> = {
    Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    Qualified: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    "Conditionally Qualified": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    Disqualified: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return map[status] || "bg-gray-100 text-gray-700";
}

function StarRating({ value, onChange, readonly }: { value: number | null; onChange?: (v: number) => void; readonly?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          disabled={readonly}
          className={cn("focus:outline-none", readonly ? "cursor-default" : "cursor-pointer")}
          onClick={() => onChange?.(i)}
        >
          <Star className={cn("h-4 w-4", i <= (value || 0) ? "text-amber-400 fill-amber-400" : "text-gray-300")} />
        </button>
      ))}
    </div>
  );
}

export default function Vendors() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { data: vendorsList = [], isLoading } = useVendors(orgId);
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deleteVendor = useDeleteVendor();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null);

  const trades = useMemo(() => [...new Set(vendorsList.map(v => v.tradeSpecialty).filter(Boolean))].sort(), [vendorsList]);

  const filtered = useMemo(() => {
    let items = vendorsList;
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(v =>
        v.companyName.toLowerCase().includes(s) ||
        (v.contactName || "").toLowerCase().includes(s) ||
        (v.email || "").toLowerCase().includes(s) ||
        (v.tradeSpecialty || "").toLowerCase().includes(s)
      );
    }
    if (statusFilter !== "all") items = items.filter(v => v.status === statusFilter);
    if (tradeFilter !== "all") items = items.filter(v => v.tradeSpecialty === tradeFilter);
    return items;
  }, [vendorsList, search, statusFilter, tradeFilter]);

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" /> Vendor Directory</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage vendors, prequalifications, and trade contacts</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Vendor</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {VENDOR_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {trades.length > 0 && (
          <Select value={tradeFilter} onValueChange={setTradeFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trades</SelectItem>
              {trades.map(t => <SelectItem key={t!} value={t!}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {detailVendor ? (
        <VendorDetail
          vendor={detailVendor}
          orgId={orgId!}
          onBack={() => setDetailVendor(null)}
          onEdit={() => { setEditVendor(detailVendor); }}
          onDelete={() => { deleteVendor.mutate({ orgId: orgId!, vendorId: detailVendor.id }); setDetailVendor(null); }}
        />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-lg font-medium text-muted-foreground">No vendors found</h3>
            <p className="text-sm text-muted-foreground mt-1">Add vendors to your directory to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(vendor => (
            <Card key={vendor.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setDetailVendor(vendor)}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{vendor.companyName}</h3>
                    {vendor.contactName && <p className="text-sm text-muted-foreground">{vendor.contactName}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge className={cn("text-xs", vendorStatusColor(vendor.status))}>{vendor.status}</Badge>
                    {(vendor as any).latestPrequalification && (
                      <Badge className={cn("text-xs", prequalStatusColor((vendor as any).latestPrequalification.qualificationStatus))}>
                        <Shield className="h-3 w-3 mr-0.5" />
                        {(vendor as any).latestPrequalification.qualificationStatus}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {vendor.tradeSpecialty && <p className="font-medium text-foreground">{vendor.tradeSpecialty}</p>}
                  {vendor.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{vendor.email}</p>}
                  {vendor.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{vendor.phone}</p>}
                  {(vendor.city || vendor.state) && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[vendor.city, vendor.state].filter(Boolean).join(", ")}</p>}
                </div>
                {vendor.rating && <div className="mt-2"><StarRating value={vendor.rating} readonly /></div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <VendorFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={(data) => { createVendor.mutate({ orgId: orgId!, data }); setCreateOpen(false); }}
      />
      {editVendor && (
        <VendorFormDialog
          open={!!editVendor}
          onOpenChange={() => setEditVendor(null)}
          initial={editVendor}
          onSave={(data) => { updateVendor.mutate({ orgId: orgId!, vendorId: editVendor.id, data }); setEditVendor(null); setDetailVendor(null); }}
        />
      )}
    </div>
  );
}

function VendorFormDialog({ open, onOpenChange, initial, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Vendor;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [companyName, setCompanyName] = useState(initial?.companyName || "");
  const [contactName, setContactName] = useState(initial?.contactName || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [city, setCity] = useState(initial?.city || "");
  const [state, setState] = useState(initial?.state || "");
  const [zipCode, setZipCode] = useState(initial?.zipCode || "");
  const [website, setWebsite] = useState(initial?.website || "");
  const [tradeSpecialty, setTradeSpecialty] = useState(initial?.tradeSpecialty || "");
  const [licenseNumber, setLicenseNumber] = useState(initial?.licenseNumber || "");
  const [insuranceExpiry, setInsuranceExpiry] = useState(initial?.insuranceExpiry || "");
  const [bondingCapacity, setBondingCapacity] = useState(initial?.bondingCapacity || "");
  const [status, setStatus] = useState(initial?.status || "Active");
  const [rating, setRating] = useState<number | null>(initial?.rating || null);
  const [notes, setNotes] = useState(initial?.notes || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          <DialogDescription>{initial ? "Update vendor information" : "Add a new vendor to your directory"}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Company Name *</Label>
            <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="ABC Construction Co." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Contact Name</Label><Input value={contactName} onChange={e => setContactName(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Trade Specialty</Label><Input value={tradeSpecialty} onChange={e => setTradeSpecialty(e.target.value)} placeholder="e.g. Electrical" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label>Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5"><Label>City</Label><Input value={city} onChange={e => setCity(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>State</Label><Input value={state} onChange={e => setState(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Zip Code</Label><Input value={zipCode} onChange={e => setZipCode(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Website</Label><Input value={website} onChange={e => setWebsite(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>License Number</Label><Input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5"><Label>Insurance Expiry</Label><Input type="date" value={insuranceExpiry} onChange={e => setInsuranceExpiry(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Bonding Capacity</Label><Input value={bondingCapacity} onChange={e => setBondingCapacity(e.target.value)} /></div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VENDOR_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Rating</Label>
            <StarRating value={rating} onChange={setRating} />
          </div>
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!companyName.trim()} onClick={() => onSave({
            companyName, contactName: contactName || null, email: email || null, phone: phone || null,
            address: address || null, city: city || null, state: state || null, zipCode: zipCode || null,
            website: website || null, tradeSpecialty: tradeSpecialty || null, licenseNumber: licenseNumber || null,
            insuranceExpiry: insuranceExpiry || null, bondingCapacity: bondingCapacity || null, status,
            rating, notes: notes || null,
          })}>{initial ? "Save" : "Add Vendor"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendorDetail({ vendor, orgId, onBack, onEdit, onDelete }: {
  vendor: Vendor; orgId: number; onBack: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const { data: prequalifications = [] } = useVendorPrequalifications(orgId, vendor.id);
  const createPrequal = useCreatePrequalification();
  const updatePrequal = useUpdatePrequalification();
  const [prequalOpen, setPrequalOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>&larr; Back</Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{vendor.companyName}</h2>
            <Badge className={cn("text-xs", vendorStatusColor(vendor.status))}>{vendor.status}</Badge>
          </div>
          {vendor.tradeSpecialty && <p className="text-sm text-muted-foreground">{vendor.tradeSpecialty}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="h-3 w-3 mr-1" /> Edit</Button>
        <Button variant="outline" size="sm" className="text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Information</TabsTrigger>
          <TabsTrigger value="prequalification">Prequalification</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4">
              <div><Label className="text-xs text-muted-foreground">Contact</Label><p className="font-medium">{vendor.contactName || "—"}</p></div>
              <div><Label className="text-xs text-muted-foreground">Email</Label><p className="font-medium">{vendor.email || "—"}</p></div>
              <div><Label className="text-xs text-muted-foreground">Phone</Label><p className="font-medium">{vendor.phone || "—"}</p></div>
              <div><Label className="text-xs text-muted-foreground">Address</Label><p className="font-medium">{vendor.address || "—"}</p></div>
              <div><Label className="text-xs text-muted-foreground">City/State</Label><p className="font-medium">{[vendor.city, vendor.state, vendor.zipCode].filter(Boolean).join(", ") || "—"}</p></div>
              <div><Label className="text-xs text-muted-foreground">Website</Label>
                {vendor.website ? <a href={vendor.website.startsWith("http") ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline flex items-center gap-1"><Globe className="h-3 w-3" />{vendor.website}</a> : <p className="font-medium">—</p>}
              </div>
              <div><Label className="text-xs text-muted-foreground">License Number</Label><p className="font-medium">{vendor.licenseNumber || "—"}</p></div>
              <div><Label className="text-xs text-muted-foreground">Insurance Expiry</Label><p className="font-medium">{vendor.insuranceExpiry || "—"}</p></div>
              <div><Label className="text-xs text-muted-foreground">Bonding Capacity</Label><p className="font-medium">{vendor.bondingCapacity || "—"}</p></div>
              {vendor.rating && <div><Label className="text-xs text-muted-foreground">Rating</Label><StarRating value={vendor.rating} readonly /></div>}
            </CardContent>
            {vendor.notes && (
              <CardContent className="pt-0">
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <p className="text-sm whitespace-pre-wrap">{vendor.notes}</p>
              </CardContent>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="prequalification">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2"><Shield className="h-4 w-4" /> Prequalification Records</h3>
              <Button size="sm" onClick={() => setPrequalOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Record</Button>
            </div>

            {prequalifications.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No prequalification records</CardContent></Card>
            ) : (
              prequalifications.map(pq => (
                <Card key={pq.id}>
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge className={cn("text-xs", prequalStatusColor(pq.qualificationStatus))}>{pq.qualificationStatus}</Badge>
                      {pq.overallScore !== null && <span className="text-sm font-mono">Score: {pq.overallScore}/100</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div><Label className="text-xs text-muted-foreground">Safety</Label><StarRating value={pq.safetyRating} readonly /></div>
                      <div><Label className="text-xs text-muted-foreground">Financial</Label><StarRating value={pq.financialRating} readonly /></div>
                      <div><Label className="text-xs text-muted-foreground">Quality</Label><StarRating value={pq.qualityRating} readonly /></div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {pq.experienceYears !== null && <Badge variant="outline">{pq.experienceYears} yrs experience</Badge>}
                      {pq.emrRate && <Badge variant="outline">EMR: {pq.emrRate}</Badge>}
                      {pq.osha300Log && <Badge variant="outline">OSHA 300</Badge>}
                      {pq.insuranceCertificate && <Badge variant="outline">Insurance Cert</Badge>}
                      {pq.bondingLetter && <Badge variant="outline">Bonding Letter</Badge>}
                    </div>
                    {pq.notes && <p className="text-sm text-muted-foreground">{pq.notes}</p>}
                    <div className="flex gap-2">
                      {pq.qualificationStatus === "Pending" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => updatePrequal.mutate({ orgId, vendorId: vendor.id, prequalId: pq.id, data: { qualificationStatus: "Qualified" } })}>Approve</Button>
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => updatePrequal.mutate({ orgId, vendorId: vendor.id, prequalId: pq.id, data: { qualificationStatus: "Disqualified" } })}>Reject</Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            <PrequalificationFormDialog
              open={prequalOpen}
              onOpenChange={setPrequalOpen}
              onSave={(data) => { createPrequal.mutate({ orgId, vendorId: vendor.id, data }); setPrequalOpen(false); }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PrequalificationFormDialog({ open, onOpenChange, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSave: (data: Record<string, unknown>) => void;
}) {
  const [safetyRating, setSafetyRating] = useState<number | null>(null);
  const [financialRating, setFinancialRating] = useState<number | null>(null);
  const [qualityRating, setQualityRating] = useState<number | null>(null);
  const [experienceYears, setExperienceYears] = useState("");
  const [emrRate, setEmrRate] = useState("");
  const [osha300Log, setOsha300Log] = useState(false);
  const [insuranceCertificate, setInsuranceCertificate] = useState(false);
  const [bondingLetter, setBondingLetter] = useState(false);
  const [overallScore, setOverallScore] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Prequalification</DialogTitle>
          <DialogDescription>Record prequalification evaluation for this vendor</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5"><Label className="text-xs">Safety</Label><StarRating value={safetyRating} onChange={setSafetyRating} /></div>
            <div className="grid gap-1.5"><Label className="text-xs">Financial</Label><StarRating value={financialRating} onChange={setFinancialRating} /></div>
            <div className="grid gap-1.5"><Label className="text-xs">Quality</Label><StarRating value={qualityRating} onChange={setQualityRating} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5"><Label className="text-xs">Experience (years)</Label><Input type="number" value={experienceYears} onChange={e => setExperienceYears(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label className="text-xs">EMR Rate</Label><Input value={emrRate} onChange={e => setEmrRate(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label className="text-xs">Overall Score (0-100)</Label><Input type="number" min={0} max={100} value={overallScore} onChange={e => setOverallScore(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={osha300Log} onCheckedChange={(v) => setOsha300Log(!!v)} />OSHA 300 Log</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={insuranceCertificate} onCheckedChange={(v) => setInsuranceCertificate(!!v)} />Insurance Certificate</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={bondingLetter} onCheckedChange={(v) => setBondingLetter(!!v)} />Bonding Letter</label>
          </div>
          <div className="grid gap-1.5"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave({
            safetyRating, financialRating, qualityRating,
            experienceYears: experienceYears ? Number(experienceYears) : null,
            emrRate: emrRate || null, osha300Log, insuranceCertificate, bondingLetter,
            overallScore: overallScore ? Number(overallScore) : null, notes: notes || null,
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
