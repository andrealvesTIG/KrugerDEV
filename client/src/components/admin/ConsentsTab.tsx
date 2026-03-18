import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileCheck } from "lucide-react";
import { format } from "date-fns";

interface ConsentRecord {
  id: number;
  userId: string;
  consentType: string;
  version: string;
  acceptedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  method: string;
  revoked: boolean;
  revokedAt: string | null;
  userName: string;
  userEmail: string;
}

interface ConsentStats {
  stats: { consentType: string; version: string; count: number }[];
  currentVersions: {
    terms_of_service: string;
    privacy_policy: string;
  };
}

export function ConsentsTab() {
  const { data: consents, isLoading: consentsLoading } = useQuery<ConsentRecord[]>({
    queryKey: ["/api/admin/consents"],
    staleTime: 0,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ConsentStats>({
    queryKey: ["/api/admin/consents/stats"],
    staleTime: 0,
  });

  if (consentsLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const formatConsentType = (type: string) => {
    switch (type) {
      case 'terms_of_service':
        return 'Terms of Service';
      case 'privacy_policy':
        return 'Privacy Policy';
      case 'marketing':
        return 'Marketing';
      default:
        return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Consent Statistics
          </CardTitle>
          <CardDescription>
            Overview of user consent acceptance by type and version
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats?.stats.map((stat, index) => (
              <div key={index} className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground">{formatConsentType(stat.consentType)}</div>
                <div className="text-2xl font-bold">{stat.count}</div>
                <div className="text-xs text-muted-foreground">
                  Version: {stat.version}
                  {stats.currentVersions[stat.consentType as keyof typeof stats.currentVersions] === stat.version && (
                    <Badge variant="secondary" className="ml-2">Current</Badge>
                  )}
                </div>
              </div>
            ))}
            {(!stats?.stats || stats.stats.length === 0) && (
              <div className="col-span-full text-center text-muted-foreground py-8">
                No consent records yet
              </div>
            )}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-muted text-sm">
            <strong>Current Versions:</strong> Terms v{stats?.currentVersions.terms_of_service}, Privacy v{stats?.currentVersions.privacy_policy}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Consent Records</CardTitle>
          <CardDescription>
            Complete audit log of user consent acceptances
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Consent Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Accepted At</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consents?.map((consent) => (
                <TableRow key={consent.id} data-testid={`row-consent-${consent.id}`}>
                  <TableCell className="font-medium">{consent.userName || 'Unknown'}</TableCell>
                  <TableCell className="text-muted-foreground">{consent.userEmail || 'Unknown'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatConsentType(consent.consentType)}</Badge>
                  </TableCell>
                  <TableCell>{consent.version}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{consent.method}</TableCell>
                  <TableCell>{format(new Date(consent.acceptedAt), 'MMM d, yyyy h:mm a')}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {consent.ipAddress || '-'}
                  </TableCell>
                  <TableCell>
                    {consent.revoked ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!consents || consents.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No consent records found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
