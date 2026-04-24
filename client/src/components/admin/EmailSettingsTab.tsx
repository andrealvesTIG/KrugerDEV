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

interface EmailSettings {
  provider: "resend" | "smtp";
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  hasSmtpPassword: boolean;
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

  const [provider, setProvider] = useState<"resend" | "smtp">("resend");
  const [isEnabled, setIsEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState<string>("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
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
    setFromAddress(data.fromAddress || "");
    setFromName(data.fromName || "");
    setSmtpPassword("");
    setPasswordTouched(false);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        provider,
        isEnabled,
      };
      if (provider === "smtp") {
        payload.smtpHost = smtpHost.trim();
        payload.smtpPort = Number(smtpPort);
        payload.smtpSecure = smtpSecure;
        payload.smtpUser = smtpUser.trim();
        payload.fromAddress = fromAddress.trim();
        payload.fromName = fromName.trim();
        if (passwordTouched && smtpPassword) {
          payload.smtpPassword = smtpPassword;
        } else {
          payload.smtpPassword = PASSWORD_PLACEHOLDER;
        }
      }
      return apiRequest("PUT", "/api/admin/email-settings", payload);
    },
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
      const payload: Record<string, unknown> = {
        to: testTo.trim(),
        smtpHost: smtpHost.trim(),
        smtpPort: Number(smtpPort),
        smtpSecure,
        smtpUser: smtpUser.trim(),
        fromAddress: fromAddress.trim(),
        fromName: fromName.trim(),
      };
      if (passwordTouched && smtpPassword) {
        payload.smtpPassword = smtpPassword;
      } else {
        payload.smtpPassword = PASSWORD_PLACEHOLDER;
      }
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Email Delivery</CardTitle>
              <CardDescription>
                Choose how outbound notifications (intake updates, password resets, alerts) are sent. Defaults to Resend; switch to SMTP to send through Office 365 or any other SMTP server.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as "resend" | "smtp")}>
              <SelectTrigger className="max-w-sm" data-testid="select-email-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="resend">Resend (default)</SelectItem>
                <SelectItem value="smtp">Office 365 / SMTP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showSmtpFields && (
            <div className="space-y-4 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Office 365 / SMTP credentials</Label>
                  <p className="text-xs text-muted-foreground">
                    For Office 365 use your mailbox address as the username and an{' '}
                    <a className="underline" href="https://account.microsoft.com/security" target="_blank" rel="noreferrer">app password</a>.
                    Basic SMTP authentication must be enabled on the mailbox.
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
                    {data?.hasSmtpPassword && !passwordTouched && (
                      <Badge variant="outline" className="ml-2 text-[10px]">Saved — leave blank to keep</Badge>
                    )}
                  </Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => { setSmtpPassword(e.target.value); setPasswordTouched(true); }}
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
                <Switch id="smtp-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} data-testid="switch-smtp-enabled" />
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

      {showSmtpFields && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Send a test message
            </CardTitle>
            <CardDescription>
              Verifies the credentials above by connecting to the SMTP server and delivering a one-off message. Does not require saving first.
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
