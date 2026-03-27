import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, Download, Search, Users, Camera, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { normalizeSearch } from "@/lib/utils";
import * as XLSX from "xlsx";

interface SelfieLead {
  id: number;
  name: string;
  email: string;
  interviewer: string | null;
  photoPath: string | null;
  shareToken: string;
  createdAt: string | null;
}

type SortField = "name" | "email" | "interviewer" | "createdAt";

export function MarketingTab() {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const pageSize = 20;

  const { data: leads = [], isLoading } = useQuery<SelfieLead[]>({
    queryKey: ["/api/admin/selfie-leads"],
    staleTime: 0,
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "createdAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  const filtered = useMemo(() => {
    let result = [...leads];
    if (search.trim()) {
      const q = normalizeSearch(search);
      result = result.filter(
        (l) =>
          normalizeSearch(l.name).includes(q) ||
          normalizeSearch(l.email).includes(q) ||
          normalizeSearch(l.interviewer || "").includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    result.sort((a, b) => {
      switch (sortField) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "email":
          return a.email.localeCompare(b.email) * dir;
        case "interviewer":
          return (a.interviewer || "").localeCompare(b.interviewer || "") * dir;
        case "createdAt": {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return (da - db) * dir;
        }
        default:
          return 0;
      }
    });
    return result;
  }, [leads, search, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (effectivePage - 1) * pageSize,
    effectivePage * pageSize
  );

  const getPhotoUrl = (lead: SelfieLead) => {
    if (!lead.photoPath) return null;
    if (lead.photoPath.startsWith("data:")) return lead.photoPath;
    if (lead.photoPath.startsWith("http")) return lead.photoPath;
    return `/api/uncon2026/selfie/${lead.shareToken}/og.png`;
  };

  const exportToExcel = () => {
    const headers = ["Name", "Email", "Interviewer", "Date & Time"];
    const rows = filtered.map((l) => [
      l.name,
      l.email,
      l.interviewer || "",
      l.createdAt
        ? format(new Date(l.createdAt), "MMM d, yyyy h:mm a")
        : "",
    ]);
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    worksheet["!cols"] = [
      { wch: 25 },
      { wch: 30 },
      { wch: 20 },
      { wch: 22 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Selfie Leads");
    XLSX.writeFile(
      workbook,
      `selfie-leads-${format(new Date(), "yyyy-MM-dd")}.xlsx`
    );
  };

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field ? (
      sortDir === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )
    ) : null;

  if (isLoading) {
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
            <div className="text-2xl font-bold mt-1">{leads.length}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Unique Emails
            </div>
            <div className="text-2xl font-bold mt-1">
              {new Set(leads.map((l) => l.email.toLowerCase())).size}
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Interviewers
            </div>
            <div className="text-2xl font-bold mt-1">
              {new Set(leads.filter((l) => l.interviewer).map((l) => l.interviewer!.toLowerCase())).size}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Camera className="h-5 w-5" />
            Selfie Leads ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, interviewer..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9 w-full sm:w-[280px] h-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToExcel}
              disabled={filtered.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              Export Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((lead) => {
                      const photoUrl = getPhotoUrl(lead);
                      return (
                        <TableRow key={lead.id}>
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
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(effectivePage - 1) * pageSize + 1}-
                    {Math.min(effectivePage * pageSize, filtered.length)} of{" "}
                    {filtered.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={effectivePage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {effectivePage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={effectivePage >= totalPages}
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
