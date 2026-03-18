import { useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Trash2, ShieldAlert, Eye, EyeOff, Plus, RefreshCw, ExternalLink, BookOpen, FileText, Code2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function DeveloperSection() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const [showApiKey, setShowApiKey] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [newBearerToken, setNewBearerToken] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState('');
  const [showGenerateTokenDialog, setShowGenerateTokenDialog] = useState(false);
  const [showRevokeTokenDialog, setShowRevokeTokenDialog] = useState<number | null>(null);

  const { data: apiKeyData, isLoading: apiKeyLoading, refetch: refetchApiKey } = useQuery<{
    hasApiKey: boolean;
    apiKey: string | null;
  }>({
    queryKey: ['/api/user/api-key'],
  });

  const { data: bearerTokens, isLoading: tokensLoading, refetch: refetchTokens } = useQuery<{
    id: number;
    name: string | null;
    token: string;
    organizationId: number;
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
  }[]>({
    queryKey: [`/api/organizations/${orgId}/api-tokens`],
    enabled: !!orgId,
  });

  const generateTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/organizations/${orgId}/api-tokens`, {
        name: tokenName || undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setNewBearerToken(data.token);
      setShowGenerateTokenDialog(false);
      setTokenName('');
      refetchTokens();
      toast({
        title: "Bearer Token Created",
        description: "Copy your token now. It won't be shown again.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate bearer token",
        variant: "destructive",
      });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: async (tokenId: number) => {
      await apiRequest('DELETE', `/api/organizations/${orgId}/api-tokens/${tokenId}`);
    },
    onSuccess: () => {
      refetchTokens();
      setShowRevokeTokenDialog(null);
      toast({
        title: "Token Revoked",
        description: "The bearer token has been revoked.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to revoke token",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
    });
  };

  const generateApiKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/user/api-key/generate');
      return response.json();
    },
    onSuccess: (data) => {
      setNewlyGeneratedKey(data.apiKey);
      refetchApiKey();
      toast({
        title: "API Key Generated",
        description: "Your new API key has been created. Copy it now - you won't be able to see the full key again.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate API key",
        variant: "destructive",
      });
    },
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', '/api/user/api-key');
    },
    onSuccess: () => {
      refetchApiKey();
      setShowRevokeDialog(false);
      toast({
        title: "API Key Revoked",
        description: "Your API key has been revoked and is no longer valid.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to revoke API key",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            API Key Management
          </CardTitle>
          <CardDescription>
            Generate and manage API keys for external integrations like Power BI, custom scripts, or third-party tools
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border rounded-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <ShieldAlert className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Your API Key</h3>
                  <p className="text-sm text-muted-foreground">
                    Use this key to authenticate with the Analytics API endpoints
                  </p>
                </div>
              </div>
            </div>

            {apiKeyLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-api-key-loading">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : newlyGeneratedKey ? (
              <div className="space-y-3">
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                    New API Key Generated - Copy it now!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-background rounded font-mono text-sm break-all" data-testid="text-new-api-key">
                      {newlyGeneratedKey}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(newlyGeneratedKey)}
                      data-testid="button-copy-api-key"
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    This is the only time you will see the full key. Store it securely.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setNewlyGeneratedKey(null)}
                  data-testid="button-dismiss-new-key"
                >
                  Done
                </Button>
              </div>
            ) : apiKeyData?.hasApiKey ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm" data-testid="text-masked-api-key">
                    {showApiKey ? apiKeyData.apiKey : '••••••••••••••••••••••••••••••••'}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                    data-testid="button-toggle-api-key-visibility"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Only a partial key is shown for security. Generate a new key if you need the full value.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => generateApiKeyMutation.mutate()}
                    disabled={generateApiKeyMutation.isPending}
                    data-testid="button-regenerate-api-key"
                  >
                    {generateApiKeyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Regenerate Key
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowRevokeDialog(true)}
                    data-testid="button-revoke-api-key"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Revoke Key
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  You don't have an API key yet. Generate one to start using the Analytics API.
                </p>
                <Button
                  onClick={() => generateApiKeyMutation.mutate()}
                  disabled={generateApiKeyMutation.isPending}
                  data-testid="button-generate-api-key"
                >
                  {generateApiKeyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Generate API Key
                </Button>
              </div>
            )}
          </div>

          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">How to use your API key</h4>
            <p className="text-sm text-muted-foreground">
              Use Basic Authentication with your email as the username and API key as the password:
            </p>
            <pre className="p-2 bg-background rounded text-xs overflow-x-auto">
              Authorization: Basic base64(email:api_key)
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Bearer Tokens
          </CardTitle>
          <CardDescription>
            Create Bearer tokens scoped to this organization for the Analytics API. Each token automatically restricts data to this organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {newBearerToken && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg space-y-2">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                New Bearer Token Created - Copy it now!
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-background rounded font-mono text-sm break-all">
                  {newBearerToken}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(newBearerToken)}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This is the only time you will see the full token. Store it securely.
              </p>
              <Button variant="outline" size="sm" onClick={() => setNewBearerToken(null)}>
                Done
              </Button>
            </div>
          )}

          {tokensLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tokens...
            </div>
          ) : bearerTokens && bearerTokens.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bearerTokens.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name || 'Unnamed'}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{t.token}</code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.createdAt ? format(new Date(t.createdAt), 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.lastUsedAt ? format(new Date(t.lastUsedAt), 'MMM d, yyyy HH:mm') : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowRevokeTokenDialog(t.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No bearer tokens yet. Create one to authenticate with the Analytics API using <code className="text-xs">Authorization: Bearer &lt;token&gt;</code>.
            </p>
          )}

          <Button onClick={() => setShowGenerateTokenDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Generate Bearer Token
          </Button>

          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">How to use Bearer tokens</h4>
            <p className="text-sm text-muted-foreground">
              Include the token in your request header. The organization is automatically determined from the token — no need for an organizationId parameter.
            </p>
            <pre className="p-2 bg-background rounded text-xs overflow-x-auto">
              Authorization: Bearer your_token_here
            </pre>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showGenerateTokenDialog} onOpenChange={setShowGenerateTokenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Bearer Token</DialogTitle>
            <DialogDescription>
              Create a new token for this organization. Give it a descriptive name so you can identify it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="token-name">Token Name (optional)</Label>
              <Input
                id="token-name"
                placeholder="e.g., Power BI Production"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateTokenDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => generateTokenMutation.mutate()}
              disabled={generateTokenMutation.isPending}
            >
              {generateTokenMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showRevokeTokenDialog !== null} onOpenChange={(open) => !open && setShowRevokeTokenDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Bearer Token?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke this token. Any integrations using it will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => showRevokeTokenDialog !== null && revokeTokenMutation.mutate(showRevokeTokenDialog)}
              className="bg-destructive text-destructive-foreground"
            >
              {revokeTokenMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Revoke Token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            API Documentation
          </CardTitle>
          <CardDescription>
            Access interactive documentation and developer resources
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">Swagger Documentation</h3>
                <p className="text-sm text-muted-foreground">
                  Interactive API documentation. Explore and test endpoints directly.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => window.open('/api-docs', '_blank')}
              className="shrink-0"
              data-testid="button-open-api-docs"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open API Docs
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">OpenAPI Specification</h3>
                <p className="text-sm text-muted-foreground">
                  Raw OpenAPI 3.0 spec in JSON format for client generation.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => window.open('/api-docs.json', '_blank')}
              className="shrink-0"
              data-testid="button-download-openapi-spec"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Spec
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-medium">Available API Endpoints</h3>
            <p className="text-sm text-muted-foreground">
              The API provides access to all major resources. Session-based auth for web, API key for external tools.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-4">
              {[
                'Organizations', 'Portfolios', 'Projects', 'Intakes',
                'Tasks', 'Milestones', 'Risks', 'Issues',
                'Resources', 'Timesheets', 'Invoices', 'Analytics'
              ].map((endpoint) => (
                <Badge key={endpoint} variant="secondary" className="justify-center py-1">
                  {endpoint}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke your API key. Any integrations using this key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeApiKeyMutation.mutate()}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-revoke"
            >
              {revokeApiKeyMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
