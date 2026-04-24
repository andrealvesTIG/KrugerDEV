import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Provider = "resend" | "smtp" | "graph";

interface EmailSettings {
  provider: Provider;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  hasSmtpPassword: boolean;
  graphTenantId: string | null;
  graphClientId: string | null;
  hasGraphClientSecret: boolean;
  graphSenderAddress: string | null;
  fromAddress: string | null;
  fromName: string | null;
  isEnabled: boolean;
  lastTestedAt: string | null;
  lastTestStatus: "success" | "failed" | null;
  lastTestError: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

const PASSWORD_PLACEHOLDER = "__UNCHANGED__";

const O365_DEFAULTS = {
  smtpHost: "smtp.office365.com",
  smtpPort: 587,
  smtpSecure: false,
};

export function EmailSettingsTab() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<EmailSettings>({
    queryKey: ["/api/admin/email-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/email-settings");
      if (!res.ok) throw new Error("Failed to load email settings");
      return res.json();
    },
  });

  const [provider, setProvider] = useState<Provider>("resend");
  const [isEnabled, setIsEnabled] = useState(false);

  // SMTP fields
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState<string>("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpPasswordTouched, setSmtpPasswordTouched] = useState(false);

  // Graph fields
  const [graphTenantId, setGraphTenantId] = useState("");
  const [graphClientId, setGraphClientId] = useState("");
  const [graphClientSecret, setGraphClientSecret] = useState("");
  const [graphSecretTouched, setGraphSecretTouched] = useState(false);
  const [graphSenderAddress, setGraphSenderAddress] = useState("");

  // Shared identity
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    if (!data) return;
    setProvider(data.provider || "resend");
    setIsEnabled(!!data.isEnabled);
    setSmtpHost(data.smtpHost || O365_DEFAULTS.smtpHost);
    setSmtpPort(data.smtpPort != null ? String(data.smtpPort) : String(O365_DEFAULTS.smtpPort));
    setSmtpSecure(!!data.smtpSecure);
    setSmtpUser(data.smtpUser || "");
    setSmtpPassword("");
    setSmtpPasswordTouched(false);
    setGraphTenantId(data.graphTenantId || "");
    setGraphClientId(data.graphClientId || "");
    setGraphSenderAddress(data.graphSenderAddress || "");
    setGraphClientSecret("");
    setGraphSecretTouched(false);
    setFromAddress(data.fromAddress || "");
    setFromName(data.fromName || "");
  }, [data]);

  function buildPayload(includeEnabled: boolean): Record<string, unknown> {
    const payload: Record<string, unknown> = { provider };
    if (includeEnabled) payload.isEnabled = isEnabled;
    if (provider === "smtp") {
      payload.smtpHost = smtpHost.trim();
      payload.smtpPort = Number(smtpPort);
      payload.smtpSecure = smtpSecure;
      payload.smtpUser = smtpUser.trim();
      payload.fromAddress = fromAddress.trim();
      payload.fromName = fromName.trim();
      payload.smtpPassword = smtpPasswordTouched && smtpPassword ? smtpPassword : PASSWORD_PLACEHOLDER;
    } else if (provider === "graph") {
      payload.graphTenantId = graphTenantId.trim();
      payload.graphClientId = graphClientId.trim();
      payload.graphSenderAddress = graphSenderAddress.trim();
      payload.fromAddress = fromAddress.trim() || graphSenderAddress.trim();
      payload.fromName = fromName.trim();
      payload.graphClientSecret = graphSecretTouched && graphClientSecret ? graphClientSecret : PASSWORD_PLACEHOLDER;
    }
    return payload;
  }

  const saveMutation = useMutation({
    mutationFn: async () => apiRequest("PUT", "/api/admin/email-settings", buildPayload(true)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-settings"] });
      toast({ title: "Saved", description: "Email settings updated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to save", variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(false);
      payload.to = testTo.trim();
      return apiRequest("POST", "/api/admin/email-settings/test", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-settings"] });
      toast({ title: "Test sent", description: `Check the inbox of ${testTo}.` });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-settings"] });
      toast({ title: "Test failed", description: err?.message || "Failed to send test email", variant: "destructive" });
    },
  });

  const applyO365Defaults = () => {
    setSmtpHost(O365_DEFAULTS.smtpHost);
    setSmtpPort(String(O365_DEFAULTS.smtpPort));
    setSmtpSecure(O365_DEFAULTS.smtpSecure);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const showSmtpFields = provider === "smtp";
  const showGraphFields = provider === "graph";
  const showCustomProviderFields = showSmtpFields || showGraphFields;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Email Delivery</CardTitle>
              <CardDescription>
                Choose how outbound notifications (intake updates, password resets, alerts) are sent. Defaults to Resend; switch to Microsoft Graph (Entra ID) or SMTP to send through your own Office 365 tenant.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <SelectTrigger className="max-w-md" data-testid="select-email-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="resend">Resend (default)</SelectItem>
                <SelectItem value="graph">Microsoft Graph (Entra ID app)</SelectItem>
                <SelectItem value="smtp">Office 365 / SMTP (basic auth)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showGraphFields && (
            <div className="space-y-4 rounded-md border p-4">
              <div>
                <Label className="text-base">Microsoft Graph credentials</Label>
                <p className="text-xs text-muted-foreground">
                  Register an application in Entra ID and grant it the <span className="font-mono">Mail.Send</span> application permission (admin-consented). Then create a client secret and paste the values below.
                  Sender mailbox must be a licensed Exchange Online mailbox in the same tenant.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="graph-tenant">Tenant ID</Label>
                  <Input id="graph-tenant" value={graphTenantId} onChange={(e) => setGraphTenantId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" data-testid="input-graph-tenant" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="graph-client-id">Client ID (Application ID)</Label>
                  <Input id="graph-client-id" value={graphClientId} onChange={(e) => setGraphClientId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" data-testid="input-graph-client-id" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="graph-client-secret">
                    Client Secret
                    {data?.hasGraphClientSecret && !graphSecretTouched && (
                      <Badge variant="outline" className="ml-2 text-[10px]">Saved — leave blank to keep</Badge>
                    )}
                  </Label>
                  <Input
                    id="graph-client-secret"
                    type="password"
                    value={graphClientSecret}
                    onChange={(e) => { setGraphClientSecret(e.target.value); setGraphSecretTouched(true); }}
                    placeholder={data?.hasGraphClientSecret ? "••••••••" : "Paste client secret value"}
                    data-testid="input-graph-client-secret"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="graph-sender">Sender mailbox</Label>
                  <Input id="graph-sender" value={graphSenderAddress} onChange={(e) => setGraphSenderAddress(e.target.value)} placeholder="notifications@yourcompany.com" data-testid="input-graph-sender" />
                  <p className="text-xs text-muted-foreground">The mailbox the app sends as. Must exist in your tenant. Used as the From address unless you override below.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from-address-graph">From address (optional override)</Label>
                  <Input id="from-address-graph" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="defaults to sender mailbox" data-testid="input-from-address" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from-name-graph">From name (optional)</Label>
                  <Input id="from-name-graph" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="FridayReport.AI" data-testid="input-from-name" />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="provider-enabled-graph">Enable Microsoft Graph delivery</Label>
                  <p className="text-xs text-muted-foreground">When enabled, all outbound emails are sent via Microsoft Graph. Resend is used as a fallback if a send fails.</p>
                </div>
                <Switch id="provider-enabled-graph" checked={isEnabled} onCheckedChange={setIsEnabled} data-testid="switch-provider-enabled" />
              </div>
            </div>
          )}

          {showSmtpFields && (
            <div className="space-y-4 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Office 365 / SMTP credentials</Label>
                  <p className="text-xs text-muted-foreground">
                    For Office 365 use your mailbox address as the username and an{' '}
                    <a className="underline" href="https://account.microsoft.com/security" target="_blank" rel="noreferrer">app password</a>.
                    Basic SMTP authentication must be enabled on the mailbox — Microsoft is deprecating this; prefer Microsoft Graph above when possible.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={applyO365Defaults} data-testid="button-o365-defaults">
                  Use Office 365 defaults
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">SMTP host</Label>
                  <Input id="smtp-host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.office365.com" data-testid="input-smtp-host" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input id="smtp-port" type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} data-testid="input-smtp-port" />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                  <div>
                    <Label htmlFor="smtp-secure">Use implicit TLS (port 465)</Label>
                    <p className="text-xs text-muted-foreground">Off = STARTTLS on port 587 (recommended for Office 365).</p>
                  </div>
                  <Switch id="smtp-secure" checked={smtpSecure} onCheckedChange={setSmtpSecure} data-testid="switch-smtp-secure" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">Username (mailbox address)</Label>
                  <Input id="smtp-user" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="notifications@yourcompany.com" data-testid="input-smtp-user" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-password">
                    Password / app password
                    {data?.hasSmtpPassword && !smtpPasswordTouched && (
                      <Badge variant="outline" className="ml-2 text-[10px]">Saved — leave blank to keep</Badge>
                    )}
                  </Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => { setSmtpPassword(e.target.value); setSmtpPasswordTouched(true); }}
                    placeholder={data?.hasSmtpPassword ? "••••••••" : "Enter password"}
                    data-testid="input-smtp-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from-address">From address</Label>
                  <Input id="from-address" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="notifications@yourcompany.com" data-testid="input-from-address" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from-name">From name (optional)</Label>
                  <Input id="from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="FridayReport.AI" data-testid="input-from-name" />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="smtp-enabled">Enable SMTP delivery</Label>
                  <p className="text-xs text-muted-foreground">When enabled, all outbound emails are sent via these SMTP credentials. Resend is used as a fallback if a send fails.</p>
                </div>
                <Switch id="smtp-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} data-testid="switch-provider-enabled" />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-email-settings">
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save settings
            </Button>
            {data?.lastTestedAt && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {data.lastTestStatus === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                Last test: {new Date(data.lastTestedAt).toLocaleString()} — {data.lastTestStatus || "unknown"}
                {data.lastTestStatus === "failed" && data.lastTestError && (
                  <span className="text-destructive">({data.lastTestError})</span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {showCustomProviderFields && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Send a test message
            </CardTitle>
            <CardDescription>
              Verifies the credentials above by connecting to {showGraphFields ? "Microsoft Graph" : "the SMTP server"} and delivering a one-off message. Does not require saving first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="recipient@example.com"
                data-testid="input-test-recipient"
              />
              <Button
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !testTo.trim()}
                data-testid="button-send-test"
              >
                {testMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send test
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
