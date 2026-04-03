import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Search, Users, Camera, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Mail, Send, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

interface SelfieLead {
  id: number;
  name: string;
  email: string;
  interviewer: string | null;
  photoPath: string | null;
  shareToken: string;
  followupSentAt: string | null;
  createdAt: string | null;
}

interface SelfieLeadsResponse {
  leads: SelfieLead[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  summary: { totalLeads: number; uniqueEmails: number; uniqueInterviewers: number };
}

type SortField = "name" | "email" | "interviewer" | "createdAt";

export function MarketingTab() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pageSize = 50;
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const { data, isLoading } = useQuery<SelfieLeadsResponse>({
    queryKey: ["/api/admin/selfie-leads", page, debouncedSearch, sortField, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), sort: sortField, sortDir });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/admin/selfie-leads?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch selfie leads");
      return res.json();
    },
    staleTime: 0,
  });

  const sendFollowupMutation = useMutation({
    mutationFn: async (leadIds: number[]) => {
      const res = await fetch("/api/admin/selfie-leads/send-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to send emails" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Emails sent",
        description: data.message,
      });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/selfie-leads"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to send emails",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const leads = data?.leads ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: pageSize, total: 0, totalPages: 1 };
  const summary = data?.summary ?? { totalLeads: 0, uniqueEmails: 0, uniqueInterviewers: 0 };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "createdAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  const sorted = leads;

  const pageIds = sorted.map((l) => l.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allPageSelected, pageIds]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSendToSelected = () => {
    if (selectedIds.size === 0) return;
    sendFollowupMutation.mutate(Array.from(selectedIds));
  };

  const handleSendToOne = (leadId: number) => {
    sendFollowupMutation.mutate([leadId]);
  };

  const getPhotoUrl = (lead: SelfieLead) => {
    if (!lead.photoPath) return null;
    if (lead.photoPath.startsWith("data:")) return lead.photoPath;
    if (lead.photoPath.startsWith("http")) return lead.photoPath;
    return `/api/uncon2026/selfie/${lead.shareToken}/og.png`;
  };

  const exportToExcel = async () => {
    try {
      const allRes = await fetch(`/api/admin/selfie-leads?page=1&export=true`, { credentials: "include" });
      if (!allRes.ok) throw new Error("Failed to fetch all leads");
      const allData: SelfieLeadsResponse = await allRes.json();
      const headers = ["Name", "Email", "Interviewer", "Date & Time", "Followup Sent"];
      const rows = allData.leads.map((l) => [
        l.name,
        l.email,
        l.interviewer || "",
        l.createdAt
          ? format(new Date(l.createdAt), "MMM d, yyyy h:mm a")
          : "",
        l.followupSentAt
          ? format(new Date(l.followupSentAt), "MMM d, yyyy h:mm a")
          : "Not sent",
      ]);
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      worksheet["!cols"] = [
        { wch: 25 },
        { wch: 30 },
        { wch: 20 },
        { wch: 22 },
        { wch: 22 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Selfie Leads");
      XLSX.writeFile(
        workbook,
        `selfie-leads-${format(new Date(), "yyyy-MM-dd")}.xlsx`
      );
    } catch {
      toast({ title: "Export failed", description: "Could not export selfie leads. Please try again.", variant: "destructive" });
    }
  };

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field ? (
      sortDir === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )
    ) : null;

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="hover-elevate">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Camera className="h-4 w-4" />
              Total Selfie Leads
            </div>
            <div className="text-2xl font-bold mt-1">{summary.totalLeads}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Unique Emails
            </div>
            <div className="text-2xl font-bold mt-1">{summary.uniqueEmails}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Interviewers
            </div>
            <div className="text-2xl font-bold mt-1">{summary.uniqueInterviewers}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Camera className="h-5 w-5" />
            Selfie Leads ({pagination.total})
          </CardTitle>
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, interviewer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-full sm:w-[280px] h-9"
              />
            </div>
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                onClick={handleSendToSelected}
                disabled={sendFollowupMutation.isPending}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {sendFollowupMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Send to {selectedIds.size} selected
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={exportToExcel}
              disabled={summary.totalLeads === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              Export Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No selfie leads found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={allPageSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all on this page"
                        />
                      </TableHead>
                      <TableHead className="w-[60px]">Photo</TableHead>
                      {(
                        [
                          ["name", "Name"],
                          ["email", "Email"],
                          ["interviewer", "Interviewer"],
                          ["createdAt", "Date & Time"],
                        ] as const
                      ).map(([key, label]) => (
                        <TableHead
                          key={key}
                          className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort(key)}
                        >
                          <div className="flex items-center gap-1">
                            {label}
                            <SortIcon field={key} />
                          </div>
                        </TableHead>
                      ))}
                      <TableHead className="w-[100px]">Email Status</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((lead) => {
                      const photoUrl = getPhotoUrl(lead);
                      return (
                        <TableRow key={lead.id} className={selectedIds.has(lead.id) ? "bg-muted/30" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(lead.id)}
                              onCheckedChange={() => toggleSelect(lead.id)}
                              aria-label={`Select ${lead.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            {photoUrl ? (
                              <img
                                src={photoUrl}
                                alt={lead.name}
                                className="h-10 w-10 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                onClick={() => setPreviewImage(photoUrl)}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                <Camera className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {lead.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {lead.email}
                          </TableCell>
                          <TableCell>
                            {lead.interviewer || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {lead.createdAt
                              ? format(
                                  new Date(lead.createdAt),
                                  "MMM d, yyyy h:mm a"
                                )
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {lead.followupSentAt ? (
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Sent
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground gap-1">
                                <Mail className="h-3 w-3" />
                                Not sent
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSendToOne(lead.id)}
                              disabled={sendFollowupMutation.isPending}
                              title={lead.followupSentAt ? "Resend followup email" : "Send followup email"}
                              className="h-8 px-2"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(pagination.page - 1) * pagination.limit + 1}-
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                    {pagination.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPage((p) => Math.min(pagination.totalPages, p + 1))
                      }
                      disabled={page >= pagination.totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!previewImage}
        onOpenChange={() => setPreviewImage(null)}
      >
        <DialogContent className="max-w-lg p-2">
          {previewImage && (
            <img
              src={previewImage}
              alt="Selfie preview"
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
