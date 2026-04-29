import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Trash2, Sparkles, Mic, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AICostsData {
  aiDemoDataGeneration: { creditCost: number; description: string; canAfford: boolean };
  credits: { used: number; remaining: number | null; limit: number | null };
  canAfford: boolean;
}

export function DemoDataSection({ organizationId, orgName }: { organizationId: number; orgName: string }) {
  const { toast } = useToast();
  const [customIndustry, setCustomIndustry] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("");
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Not Supported",
        description: "Voice input is not supported in this browser. Try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast({
        title: "Voice Error",
        description: "Could not capture voice. Please try again.",
        variant: "destructive",
      });
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setCustomIndustry(transcript);
      setSelectedIndustry("");
    };

    recognition.start();
  };

  const { data: industries } = useQuery<Array<{ id: string; label: string; description: string }>>({
    queryKey: ['/api/demo-data/industries'],
  });
  
  const { data: aiCosts } = useQuery<AICostsData>({
    queryKey: ['/api/billing/ai-costs'],
    enabled: !!customIndustry.trim(),
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { organizationId: number; industry?: string; customIndustry?: string }) => {
      return apiRequest('POST', '/api/demo-data/generate', data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/intakes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
      const stats = response.stats || {};
      const parts: string[] = [];
      if (stats.portfolios) parts.push(`${stats.portfolios} portfolios`);
      if (stats.projects) parts.push(`${stats.projects} projects`);
      if (stats.tasks) parts.push(`${stats.tasks} tasks`);
      if (stats.risks) parts.push(`${stats.risks} risks`);
      if (stats.issues) parts.push(`${stats.issues} issues`);
      if (stats.intakes) parts.push(`${stats.intakes} intakes`);
      if (stats.resources) parts.push(`${stats.resources} resources`);
      if (stats.vendors) parts.push(`${stats.vendors} vendors`);
      if (stats.dailyLogs) parts.push(`${stats.dailyLogs} daily logs`);
      if (stats.rfis) parts.push(`${stats.rfis} RFIs`);
      if (stats.submittals) parts.push(`${stats.submittals} submittals`);
      if (stats.drawings) parts.push(`${stats.drawings} drawings`);
      if (stats.punchListItems) parts.push(`${stats.punchListItems} punch items`);
      if (stats.inspections) parts.push(`${stats.inspections} inspections`);
      if (stats.incidents) parts.push(`${stats.incidents} incidents`);
      if (stats.observations) parts.push(`${stats.observations} observations`);
      if (stats.bidPackages) parts.push(`${stats.bidPackages} bid packages`);
      if (stats.changeOrders) parts.push(`${stats.changeOrders} change orders`);
      if (stats.constructionInvoices) parts.push(`${stats.constructionInvoices} pay apps`);
      if (stats.meetings) parts.push(`${stats.meetings} meetings`);
      if (stats.correspondence) parts.push(`${stats.correspondence} correspondence`);
      toast({
        title: "Demo Data Generated",
        description: parts.length > 0 ? `Created ${parts.join(', ')} for ${orgName}` : `Demo data created for ${orgName}`,
      });
      setCustomIndustry("");
      setSelectedIndustry("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate demo data",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/demo-data/${organizationId}`);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/intakes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
      const stats = response.stats || {};
      const parts: string[] = [];
      if (stats.portfolios) parts.push(`${stats.portfolios} portfolios`);
      if (stats.projects) parts.push(`${stats.projects} projects`);
      if (stats.tasks) parts.push(`${stats.tasks} tasks`);
      if (stats.risks) parts.push(`${stats.risks} risks`);
      if (stats.issues) parts.push(`${stats.issues} issues`);
      if (stats.intakes) parts.push(`${stats.intakes} intakes`);
      if (stats.resources) parts.push(`${stats.resources} resources`);
      if (stats.vendors) parts.push(`${stats.vendors} vendors`);
      if (stats.dailyLogs) parts.push(`${stats.dailyLogs} daily logs`);
      if (stats.rfis) parts.push(`${stats.rfis} RFIs`);
      if (stats.submittals) parts.push(`${stats.submittals} submittals`);
      if (stats.drawings) parts.push(`${stats.drawings} drawings`);
      if (stats.punchListItems) parts.push(`${stats.punchListItems} punch items`);
      if (stats.inspections) parts.push(`${stats.inspections} inspections`);
      if (stats.incidents) parts.push(`${stats.incidents} incidents`);
      if (stats.observations) parts.push(`${stats.observations} observations`);
      if (stats.bidPackages) parts.push(`${stats.bidPackages} bid packages`);
      if (stats.changeOrders) parts.push(`${stats.changeOrders} change orders`);
      if (stats.constructionInvoices) parts.push(`${stats.constructionInvoices} pay apps`);
      if (stats.meetings) parts.push(`${stats.meetings} meetings`);
      if (stats.correspondence) parts.push(`${stats.correspondence} correspondence`);
      toast({
        title: "Demo Data Removed",
        description: parts.length > 0 ? `Removed ${parts.join(', ')} from ${orgName}` : `Demo data removed from ${orgName}`,
      });
      setShowRemoveConfirm(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove demo data",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (customIndustry.trim()) {
      generateMutation.mutate({ organizationId, customIndustry: customIndustry.trim() });
    } else if (selectedIndustry) {
      generateMutation.mutate({ organizationId, industry: selectedIndustry });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Generate Demo Data
        </CardTitle>
        <CardDescription>
          Populate the workspace with realistic sample data for both classic PPM and Capital Projects — portfolios, projects (with full street addresses, map coordinates, sample hero images, and on-site location labels), tasks, risks, key dates, issues, financials, intakes, resources, plus full Capital Projects coverage (Daily Logs, RFIs, Submittals, Drawings, Punch List, Inspections, Incidents, Observations, Vendors, Bid Packages, Bids, Change Orders, Pay Applications, Meetings, and Correspondence).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customIndustry">Industry / Business Type</Label>
            <div className="flex gap-2">
              <Input
                id="customIndustry"
                placeholder="e.g., Real Estate, Construction, Legal Services, Education..."
                value={customIndustry}
                onChange={(e) => {
                  setCustomIndustry(e.target.value);
                  if (e.target.value) setSelectedIndustry("");
                }}
                className="flex-1"
                data-testid="input-custom-industry"
              />
              <Button
                type="button"
                variant={isListening ? "default" : "outline"}
                size="icon"
                onClick={handleVoiceInput}
                disabled={isListening}
                title="Voice input"
                data-testid="button-voice-industry"
              >
                <Mic className={`h-4 w-4 ${isListening ? 'animate-pulse text-red-500' : ''}`} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter any industry or business type and AI will generate relevant demo data
            </p>
            {customIndustry.trim() && aiCosts && (
              <div className="flex items-center gap-2 p-3 rounded-lg border mt-2 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <div className="flex-1 text-sm">
                  <span className="text-blue-700 dark:text-blue-300">
                    Custom industry uses AI and will consume <strong>{aiCosts.aiDemoDataGeneration.creditCost}</strong> credit{aiCosts.aiDemoDataGeneration.creditCost !== 1 ? 's' : ''}.
                  </span>
                  <span className="text-muted-foreground ml-1">
                    ({aiCosts.credits.remaining !== null ? `${aiCosts.credits.remaining} remaining` : 'unlimited'})
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 border-t" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="flex-1 border-t" />
          </div>

          <div className="space-y-2">
            <Label>Choose from Templates</Label>
            <Select 
              value={selectedIndustry} 
              onValueChange={(val) => {
                setSelectedIndustry(val);
                if (val) setCustomIndustry("");
              }}
            >
              <SelectTrigger data-testid="select-industry">
                <SelectValue placeholder="Select an industry template" />
              </SelectTrigger>
              <SelectContent>
                {industries?.map((ind) => (
                  <SelectItem key={ind.id} value={ind.id}>
                    {ind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-sm">What will be created:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>2 Portfolios with descriptions</li>
            <li>4-6 Projects with budgets, statuses, full street addresses, map coordinates (latitude / longitude), sample hero images, and health indicators</li>
            <li>Tasks, Risks, Key Dates, Issues (with on-site location labels), Financial line items, status & health history per project</li>
            <li>4 Intake pipeline items with various workflow statuses</li>
            <li>5 Resources with skills, availability windows (PTO + training), and departments</li>
            <li>Org-level Vendors with prequalifications and bid invitations</li>
            <li>Capital Projects per project: Daily Logs (with weather, labor, equipment), RFIs, Submittals, Drawings, Punch List, Inspections, Incidents, Observations</li>
            <li>Bid Packages, Bids with line items, Change Orders, Pay Applications (Construction Invoices), Cost Items</li>
            <li>Meetings (with attendees and agenda items) and Project Correspondence</li>
          </ul>
        </div>

        <Button 
          onClick={handleGenerate}
          disabled={generateMutation.isPending || (!customIndustry.trim() && !selectedIndustry)}
          className="w-full"
          data-testid="button-generate-demo"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Demo Data
            </>
          )}
        </Button>

        <div className="border-t pt-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-sm">Remove Demo Data</h4>
              <p className="text-xs text-muted-foreground">
                Delete all demo portfolios, projects, and related items
              </p>
            </div>
            <Button 
              variant="destructive"
              onClick={() => setShowRemoveConfirm(true)}
              disabled={removeMutation.isPending}
              data-testid="button-remove-demo"
            >
              {removeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove Demo Data
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Demo Data</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove all demo data from {orgName}? This will delete every demo record across both classic PPM (portfolios, projects, tasks, risks, key dates, issues, intakes, resources, financials) and Capital Projects (daily logs, RFIs, submittals, drawings, punch list, inspections, incidents, observations, vendors, bid packages, change orders, pay applications, meetings, and correspondence).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveConfirm(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              data-testid="button-confirm-remove-demo"
            >
              {removeMutation.isPending ? "Removing..." : "Remove All Demo Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
