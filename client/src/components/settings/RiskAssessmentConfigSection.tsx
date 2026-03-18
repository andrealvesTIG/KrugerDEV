import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RotateCcw, Save, X, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import type { RiskAssessmentConfig } from "@shared/schema";
import { DEFAULT_RISK_ASSESSMENT_CONFIG } from "@shared/schema";

export function RiskAssessmentConfigSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<RiskAssessmentConfig>(DEFAULT_RISK_ASSESSMENT_CONFIG);
  const [newCategory, setNewCategory] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const { data: savedConfig, isLoading } = useQuery<RiskAssessmentConfig>({
    queryKey: ['/api/organizations', organizationId, 'risk-assessment-config'],
  });

  useEffect(() => {
    if (savedConfig) {
      setConfig({ ...DEFAULT_RISK_ASSESSMENT_CONFIG, ...savedConfig });
    }
  }, [savedConfig]);

  const handleSave = async () => {
    if (config.thresholds.lowMax >= config.thresholds.mediumMax || config.thresholds.mediumMax >= config.thresholds.highMax) {
      toast({ title: "Invalid Thresholds", description: "Thresholds must be in ascending order: Low < Medium < High.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/organizations/${organizationId}/risk-assessment-config`, config);
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'risk-assessment-config'] });
      toast({ title: "Saved", description: "Risk assessment configuration updated successfully." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to save configuration.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_RISK_ASSESSMENT_CONFIG);
  };

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (config.categories.includes(trimmed)) {
      toast({ title: "Duplicate", description: "This category already exists.", variant: "destructive" });
      return;
    }
    setConfig(prev => ({ ...prev, categories: [...prev.categories, trimmed] }));
    setNewCategory("");
  };

  const handleRemoveCategory = (cat: string) => {
    setConfig(prev => ({ ...prev, categories: prev.categories.filter(c => c !== cat) }));
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle data-testid="text-risk-config-title">Risk Assessment Configuration</CardTitle>
            <CardDescription>Configure how AI risk assessments are generated for portfolios and projects in your organization.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-reset-risk-config">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Defaults
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid="button-save-risk-config">
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="ai-model" data-testid="label-ai-model">AI Model</Label>
              <Select value={config.model} onValueChange={(val) => setConfig(prev => ({ ...prev, model: val as RiskAssessmentConfig["model"] }))}>
                <SelectTrigger id="ai-model" data-testid="select-ai-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">GPT-4o (Higher quality, more credits)</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster, fewer credits)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Choose the AI model used for risk analysis. GPT-4o provides more detailed analysis.</p>
            </div>

            <div className="space-y-2">
              <Label data-testid="label-temperature">Temperature: {config.temperature.toFixed(2)}</Label>
              <Slider
                value={[config.temperature]}
                onValueChange={([val]) => setConfig(prev => ({ ...prev, temperature: Math.round(val * 100) / 100 }))}
                min={0}
                max={1}
                step={0.05}
                className="mt-2"
                data-testid="slider-temperature"
              />
              <p className="text-xs text-muted-foreground">Lower values produce more consistent results. Higher values produce more creative analysis.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-tokens" data-testid="label-max-tokens">Max Response Length (tokens)</Label>
              <Input
                id="max-tokens"
                type="number"
                min={500}
                max={8000}
                value={config.maxTokens}
                onChange={(e) => setConfig(prev => ({ ...prev, maxTokens: Number(e.target.value) || 3000 }))}
                data-testid="input-max-tokens"
              />
              <p className="text-xs text-muted-foreground">Maximum length of the AI response. Higher values allow more detailed reports (500-8000).</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cache-days" data-testid="label-cache-days">Cache Duration (days)</Label>
              <Input
                id="cache-days"
                type="number"
                min={1}
                max={30}
                value={config.cacheDays}
                onChange={(e) => setConfig(prev => ({ ...prev, cacheDays: Number(e.target.value) || 5 }))}
                data-testid="input-cache-days"
              />
              <p className="text-xs text-muted-foreground">Reports generated within this period will be returned from cache without using AI credits (1-30 days).</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium" data-testid="label-thresholds">Risk Score Thresholds</Label>
              <p className="text-sm text-muted-foreground mt-1">Define the score ranges for each risk level (scores are 1-100).</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="threshold-low" className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  Low (1 to)
                </Label>
                <Input
                  id="threshold-low"
                  type="number"
                  min={1}
                  max={98}
                  value={config.thresholds.lowMax}
                  onChange={(e) => setConfig(prev => ({ ...prev, thresholds: { ...prev.thresholds, lowMax: Number(e.target.value) || 25 } }))}
                  data-testid="input-threshold-low"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="threshold-medium" className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  Medium ({config.thresholds.lowMax + 1} to)
                </Label>
                <Input
                  id="threshold-medium"
                  type="number"
                  min={2}
                  max={99}
                  value={config.thresholds.mediumMax}
                  onChange={(e) => setConfig(prev => ({ ...prev, thresholds: { ...prev.thresholds, mediumMax: Number(e.target.value) || 50 } }))}
                  data-testid="input-threshold-medium"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="threshold-high" className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-orange-500" />
                  High ({config.thresholds.mediumMax + 1} to)
                </Label>
                <Input
                  id="threshold-high"
                  type="number"
                  min={3}
                  max={99}
                  value={config.thresholds.highMax}
                  onChange={(e) => setConfig(prev => ({ ...prev, thresholds: { ...prev.thresholds, highMax: Number(e.target.value) || 75 } }))}
                  data-testid="input-threshold-high"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              Critical: {config.thresholds.highMax + 1} - 100
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium" data-testid="label-categories">Risk Categories</Label>
              <p className="text-sm text-muted-foreground mt-1">Define which risk categories the AI should evaluate.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.categories.map((cat) => (
                <Badge key={cat} variant="secondary" className="gap-1 pr-1" data-testid={`badge-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}>
                  {cat}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 ml-1 hover:bg-destructive/20 rounded-full"
                    onClick={() => handleRemoveCategory(cat)}
                    data-testid={`button-remove-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add a category..."
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                className="max-w-xs"
                data-testid="input-new-category"
              />
              <Button variant="outline" size="sm" onClick={handleAddCategory} disabled={!newCategory.trim()} data-testid="button-add-category">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="custom-instructions" className="text-base font-medium" data-testid="label-custom-instructions">Custom Instructions</Label>
            <p className="text-sm text-muted-foreground">Provide additional instructions or context for the AI risk analyst. These will be appended to every assessment.</p>
            <Textarea
              id="custom-instructions"
              placeholder="e.g., Pay special attention to regulatory compliance risks. Our organization has a low risk tolerance for budget overruns exceeding 10%."
              value={config.customInstructions}
              onChange={(e) => setConfig(prev => ({ ...prev, customInstructions: e.target.value }))}
              className="min-h-[100px]"
              maxLength={2000}
              data-testid="textarea-custom-instructions"
            />
            <p className="text-xs text-muted-foreground text-right">{config.customInstructions.length}/2000</p>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium" data-testid="label-custom-llm">Custom LLM Endpoint</Label>
                <p className="text-sm text-muted-foreground mt-1">Use your own OpenAI-compatible API endpoint and key instead of the built-in AI service.</p>
              </div>
              <Switch
                checked={config.useCustomLLM}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, useCustomLLM: checked }))}
                data-testid="switch-use-custom-llm"
              />
            </div>
            {config.useCustomLLM && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <Label htmlFor="custom-endpoint" data-testid="label-custom-endpoint">API Endpoint URL</Label>
                  <Input
                    id="custom-endpoint"
                    type="url"
                    placeholder="https://api.openai.com/v1"
                    value={config.customEndpoint}
                    onChange={(e) => setConfig(prev => ({ ...prev, customEndpoint: e.target.value }))}
                    data-testid="input-custom-endpoint"
                  />
                  <p className="text-xs text-muted-foreground">The base URL for the OpenAI-compatible API (e.g., Azure OpenAI, Ollama, or any compatible provider).</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-api-key" data-testid="label-custom-api-key">API Key</Label>
                  <Input
                    id="custom-api-key"
                    type="password"
                    placeholder="sk-..."
                    value={config.customApiKey}
                    onChange={(e) => setConfig(prev => ({ ...prev, customApiKey: e.target.value }))}
                    data-testid="input-custom-api-key"
                  />
                  <p className="text-xs text-muted-foreground">Your API key for the custom endpoint. It will be stored securely and masked after saving.</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="custom-model" data-testid="label-custom-model">Model Name</Label>
                  <Input
                    id="custom-model"
                    placeholder="gpt-4o, claude-3-opus, llama-3, etc."
                    value={config.customModel}
                    onChange={(e) => setConfig(prev => ({ ...prev, customModel: e.target.value }))}
                    data-testid="input-custom-model"
                  />
                  <p className="text-xs text-muted-foreground">The model identifier to use with your custom endpoint. If left empty, the selected model above will be used.</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
