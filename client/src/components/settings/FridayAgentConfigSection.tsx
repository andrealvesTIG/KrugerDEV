import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Bot, TestTube } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FridayAgentConfig } from "@shared/schema";
import { DEFAULT_FRIDAY_AGENT_CONFIG } from "@shared/schema";

const ANTHROPIC_MODELS = [
  { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet (latest)" },
  { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (latest)" },
  { value: "claude-3-opus-latest", label: "Claude 3 Opus (latest)" },
];

export function FridayAgentConfigSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<FridayAgentConfig>(DEFAULT_FRIDAY_AGENT_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: savedConfig, isLoading } = useQuery<FridayAgentConfig>({
    queryKey: ['/api/organizations', organizationId, 'friday-agent-config'],
  });

  useEffect(() => {
    if (savedConfig) {
      setConfig({ ...DEFAULT_FRIDAY_AGENT_CONFIG, ...savedConfig });
    }
  }, [savedConfig]);

  const handleSave = async () => {
    if (config.provider === "openai" && config.useOrgAzure) {
      if (!config.azureEndpoint.trim()) {
        toast({ title: "Validation Error", description: "Azure endpoint is required when using org-specific model.", variant: "destructive" });
        return;
      }
      if (!config.azureApiKey.trim()) {
        toast({ title: "Validation Error", description: "Azure API key is required when using org-specific model.", variant: "destructive" });
        return;
      }
    }

    if (config.provider === "anthropic") {
      if (!config.anthropicApiKey.trim()) {
        toast({ title: "Validation Error", description: "Anthropic API key is required when using the Anthropic provider.", variant: "destructive" });
        return;
      }
    }

    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/organizations/${organizationId}/friday-agent-config`, config);
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'friday-agent-config'] });
      toast({ title: "Saved", description: "Friday Agent configuration updated successfully." });
      setTestResult(null);
    } catch (err) {
      toast({ title: "Error", description: "Failed to save configuration.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", `/api/jarvis/chat`, {
        organizationId,
        messages: [{ role: "user", content: "Say hello in one sentence." }],
        concise: true,
      });

      const reader = res.body?.getReader();
      if (!reader) {
        setTestResult({ success: false, message: "No response stream received." });
        return;
      }

      const decoder = new TextDecoder();
      let gotContent = false;
      let errorMsg = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) gotContent = true;
            if (data.error) errorMsg = data.error;
            if (data.done) break;
          } catch {}
        }
      }

      if (errorMsg) {
        setTestResult({ success: false, message: errorMsg });
      } else if (gotContent) {
        setTestResult({ success: true, message: "Connection successful! Friday Agent responded." });
      } else {
        setTestResult({ success: false, message: "No response content received." });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || "Connection test failed." });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle>Friday Agent Configuration</CardTitle>
        </div>
        <CardDescription>
          Configure your organization's AI provider for the Friday Report assistant.
          Choose between OpenAI (default) or Anthropic (Claude). When using OpenAI you can optionally
          point Friday at your own Azure OpenAI endpoint.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base font-medium">LLM Provider</Label>
            <p className="text-sm text-muted-foreground">
              Choose which AI model powers Friday Agent for this organization.
            </p>
          </div>
          <RadioGroup
            value={config.provider}
            onValueChange={(value) => setConfig(prev => ({ ...prev, provider: value as "openai" | "anthropic" }))}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            <label
              htmlFor="provider-openai"
              className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer ${config.provider === "openai" ? "border-primary bg-primary/5" : ""}`}
              data-testid="radio-provider-openai-label"
            >
              <RadioGroupItem value="openai" id="provider-openai" data-testid="radio-provider-openai" />
              <div>
                <div className="font-medium">OpenAI</div>
                <div className="text-xs text-muted-foreground">Default. Uses system or org Azure OpenAI.</div>
              </div>
            </label>
            <label
              htmlFor="provider-anthropic"
              className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer ${config.provider === "anthropic" ? "border-primary bg-primary/5" : ""}`}
              data-testid="radio-provider-anthropic-label"
            >
              <RadioGroupItem value="anthropic" id="provider-anthropic" data-testid="radio-provider-anthropic" />
              <div>
                <div className="font-medium">Anthropic (Claude)</div>
                <div className="text-xs text-muted-foreground">Use your Anthropic API key.</div>
              </div>
            </label>
          </RadioGroup>
        </div>

        {config.provider === "openai" && (
          <>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Use Organization-Specific Azure OpenAI</Label>
                <p className="text-sm text-muted-foreground">
                  {config.useOrgAzure
                    ? "Using your organization's Azure OpenAI endpoint"
                    : "Using the system default AI model"}
                </p>
              </div>
              <Switch
                checked={config.useOrgAzure}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, useOrgAzure: checked }))}
              />
            </div>

            {config.useOrgAzure && (
              <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="azure-endpoint">Azure OpenAI Endpoint</Label>
                  <Input
                    id="azure-endpoint"
                    placeholder="https://your-resource.openai.azure.com"
                    value={config.azureEndpoint}
                    onChange={(e) => setConfig(prev => ({ ...prev, azureEndpoint: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    The base endpoint URL from your Azure OpenAI resource (e.g., https://your-resource.openai.azure.com). Do <strong>not</strong> include /openai/v1 — that path is added automatically.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="azure-api-key">Azure OpenAI API Key</Label>
                  <Input
                    id="azure-api-key"
                    type="password"
                    placeholder="Enter your Azure OpenAI API key"
                    value={config.azureApiKey}
                    onChange={(e) => setConfig(prev => ({ ...prev, azureApiKey: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your Azure OpenAI API key. This is stored encrypted and never displayed in full.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="azure-deployment">Deployment Name</Label>
                  <Input
                    id="azure-deployment"
                    placeholder="gpt-4.1"
                    value={config.azureDeployment}
                    onChange={(e) => setConfig(prev => ({ ...prev, azureDeployment: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    The name of your Azure OpenAI model deployment (e.g., gpt-4.1, gpt-4o). Leave blank to use the system default.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="azure-api-version">API Version</Label>
                  <Input
                    id="azure-api-version"
                    placeholder="2024-12-01-preview"
                    value={config.azureApiVersion}
                    onChange={(e) => setConfig(prev => ({ ...prev, azureApiVersion: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    The Azure OpenAI API version. Default: 2024-12-01-preview
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {config.provider === "anthropic" && (
          <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="anthropic-api-key">Anthropic API Key</Label>
              <Input
                id="anthropic-api-key"
                type="password"
                placeholder="sk-ant-..."
                value={config.anthropicApiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, anthropicApiKey: e.target.value }))}
                data-testid="input-anthropic-api-key"
              />
              <p className="text-xs text-muted-foreground">
                Your Anthropic API key. This is stored encrypted and never displayed in full.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="anthropic-model">Model</Label>
              <Select
                value={config.anthropicModel || "claude-3-5-sonnet-latest"}
                onValueChange={(value) => setConfig(prev => ({ ...prev, anthropicModel: value }))}
              >
                <SelectTrigger id="anthropic-model" data-testid="select-anthropic-model">
                  <SelectValue placeholder="Select a Claude model" />
                </SelectTrigger>
                <SelectContent>
                  {ANTHROPIC_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value} data-testid={`option-anthropic-model-${m.value}`}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The Anthropic Claude model used for Friday Agent responses.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-friday-config">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Configuration
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={isTesting} data-testid="button-test-friday-config">
            {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
            Test Connection
          </Button>
        </div>

        {testResult && (
          <div className={`rounded-lg border p-3 ${testResult.success ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950' : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'}`}>
            <div className="flex items-center gap-2">
              <Badge variant={testResult.success ? "default" : "destructive"}>
                {testResult.success ? "Success" : "Failed"}
              </Badge>
              <span className="text-sm">{testResult.message}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
