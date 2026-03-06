import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjects } from "@/hooks/use-projects";
import { Sparkles, Loader2, Zap, Mic, MicOff, FolderOpen, CheckSquare, AlertTriangle, AlertCircle, Target, Users, UserPlus, ArrowLeft, Check } from "lucide-react";

interface AICostsData {
  aiProjectGeneration: { creditCost: number; description: string; canAfford: boolean };
  credits: { used: number; remaining: number | null; limit: number | null };
  canAfford: boolean;
}

interface PreviewAction {
  id: string;
  type: string;
  description: string;
  details: any;
  enabled: boolean;
}

type DialogStep = "input" | "confirm" | "done";

function getActionIcon(type: string) {
  switch (type) {
    case "create_project": return <FolderOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    case "create_task": return <CheckSquare className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "create_risk": return <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
    case "create_issue": return <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "create_milestone": return <Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
    case "create_resource": return <Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />;
    case "assign_to_me": return <UserPlus className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />;
    default: return <Sparkles className="h-4 w-4 text-muted-foreground" />;
  }
}

function getActionLabel(type: string) {
  switch (type) {
    case "create_project": return "Project";
    case "create_task": return "Task";
    case "create_risk": return "Risk";
    case "create_issue": return "Issue";
    case "create_milestone": return "Milestone";
    case "create_resource": return "Resource";
    case "assign_to_me": return "Assignment";
    default: return type;
  }
}

export interface AICreateButtonProps {
  projectId?: number;
  projectName?: string;
}

export interface AICreateButtonHandle {
  openWithVoice: () => void;
}

export const AICreateButton = forwardRef<AICreateButtonHandle, AICreateButtonProps>(function AICreateButton({ projectId: scopedProjectId, projectName: scopedProjectName }, ref) {
  const { currentOrganization } = useOrganization();
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const startVoiceOnOpenRef = useRef(false);

  const [step, setStep] = useState<DialogStep>("input");
  const [previewActions, setPreviewActions] = useState<PreviewAction[]>([]);
  const [requiresProjectWarning, setRequiresProjectWarning] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const resetDialog = () => {
    setStep("input");
    setAiPrompt("");
    setPreviewActions([]);
    setRequiresProjectWarning(false);
    setSelectedProjectId("");
  };

  const toggleVoiceInput = async () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: "Voice Input Unavailable",
        description: "Your browser doesn't support voice input. Try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }
    
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const res = await apiRequest('POST', '/api/ai/voice-usage', {
          organizationId: currentOrganization?.id,
        });
        const data = await res.json();
        if (!data.success) {
          toast({
            title: "Voice Input Unavailable",
            description: data.message || "Could not start voice input.",
            variant: "destructive",
          });
          return;
        }
      } catch (error: any) {
        let errorMsg = "Could not start voice input. You may have reached your AI usage limit.";
        try {
          if (error?.message) {
            const parsed = JSON.parse(error.message);
            if (parsed?.message) errorMsg = parsed.message;
          }
        } catch {}
        toast({
          title: "Voice Input Unavailable",
          description: errorMsg,
          variant: "destructive",
        });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['/api/billing/ai-costs'] });

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }
        if (finalTranscript) {
          setAiPrompt(prev => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };
      
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        if (event.error === 'not-allowed') {
          toast({
            title: "Microphone Access Denied",
            description: "Please allow microphone access to use voice input.",
            variant: "destructive",
          });
        }
      };
      
      recognition.onend = () => {
        setIsRecording(false);
      };
      
      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    }
  };

  useImperativeHandle(ref, () => ({
    openWithVoice: () => {
      startVoiceOnOpenRef.current = true;
      setAiDialogOpen(true);
    },
  }));

  useEffect(() => {
    if (!aiDialogOpen) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        setIsRecording(false);
      }
      resetDialog();
    } else if (startVoiceOnOpenRef.current) {
      startVoiceOnOpenRef.current = false;
      setTimeout(() => toggleVoiceInput(), 100);
    }
  }, [aiDialogOpen]);

  const { data: aiCosts } = useQuery<AICostsData>({
    queryKey: ['/api/billing/ai-costs'],
    enabled: aiDialogOpen,
  });

  const { data: orgProjects } = useProjects(
    requiresProjectWarning ? currentOrganization?.id : undefined
  );

  const previewMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await apiRequest('POST', '/api/ai/smart-create/preview', {
        prompt,
        organizationId: currentOrganization?.id,
        projectId: scopedProjectId,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.actions?.length > 0) {
        setPreviewActions(data.actions);
        setRequiresProjectWarning(!!data.requiresProject);
        setStep("confirm");
      } else {
        toast({
          title: "Nothing to Create",
          description: "AI could not determine what to create from your request. Try being more specific.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Preview Failed",
        description: error.message || "Failed to analyze your request",
        variant: "destructive",
      });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async ({ actions, projectId }: { actions: PreviewAction[]; projectId?: number }) => {
      const response = await apiRequest('POST', '/api/ai/smart-create/execute', {
        organizationId: currentOrganization?.id,
        projectId: projectId || scopedProjectId,
        actions: actions.map(a => ({ type: a.type, details: a.details })),
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Created Successfully",
        description: data.message || "Items created",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/risks'] });
      if (scopedProjectId) {
        queryClient.invalidateQueries({ queryKey: ['/api/projects', scopedProjectId] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', scopedProjectId, 'tasks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', scopedProjectId, 'risks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', scopedProjectId, 'issues'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', scopedProjectId, 'milestones'] });
      }
      if (data.created?.project) {
        const pid = data.created.project.id;
        queryClient.invalidateQueries({ queryKey: ['/api/projects', pid] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', pid, 'tasks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', pid, 'risks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', pid, 'issues'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', pid, 'milestones'] });
      }
      if (data.created?.projects?.length > 0) {
        for (const proj of data.created.projects) {
          queryClient.invalidateQueries({ queryKey: ['/api/projects', proj.id] });
          queryClient.invalidateQueries({ queryKey: ['/api/projects', proj.id, 'tasks'] });
        }
      }
      setAiDialogOpen(false);
      if (!scopedProjectId && data.redirectTo) {
        setLocation(data.redirectTo);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create with AI",
        variant: "destructive",
      });
    },
  });

  const toggleAction = (actionId: string) => {
    setPreviewActions(prev =>
      prev.map(a => a.id === actionId ? { ...a, enabled: !a.enabled } : a)
    );
  };

  const enabledCount = previewActions.filter(a => a.enabled).length;

  const needsProjectSelection = requiresProjectWarning && !selectedProjectId;

  const handleConfirmExecute = () => {
    const enabledActions = previewActions.filter(a => a.enabled);
    if (enabledActions.length === 0) {
      toast({
        title: "No Actions Selected",
        description: "Please enable at least one action to create.",
        variant: "destructive",
      });
      return;
    }
    if (needsProjectSelection) {
      toast({
        title: "Project Required",
        description: "Please select a project for the items to be created in.",
        variant: "destructive",
      });
      return;
    }
    executeMutation.mutate({
      actions: enabledActions,
      projectId: selectedProjectId ? Number(selectedProjectId) : undefined,
    });
  };

  if (!currentOrganization) return null;

  const isPending = previewMutation.isPending || executeMutation.isPending;

  return (
    <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" data-testid="button-ai-create">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">AI Create</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px]">
        {step === "input" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Create
              </DialogTitle>
              <DialogDescription>
                {scopedProjectId && scopedProjectName
                  ? `Describe what you want to create inside "${scopedProjectName}". AI will analyze your request and show you a preview before creating anything.`
                  : "Describe what you want to create. AI will analyze your request and show you a preview before creating anything."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {aiCosts && (
                <div className={`flex items-center gap-2 p-3 rounded-md border ${aiCosts.aiProjectGeneration.canAfford ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'}`}>
                  <Zap className={`h-4 w-4 ${aiCosts.aiProjectGeneration.canAfford ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`} />
                  <div className="flex-1 text-sm">
                    <span className={aiCosts.aiProjectGeneration.canAfford ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-300'}>
                      This will use <strong>{aiCosts.aiProjectGeneration.creditCost}</strong> credit{aiCosts.aiProjectGeneration.creditCost !== 1 ? 's' : ''} per AI run.
                    </span>
                    <span className="text-muted-foreground ml-1">
                      ({aiCosts.credits.remaining !== null ? `${aiCosts.credits.remaining} remaining` : 'unlimited'})
                    </span>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ai-prompt">What would you like to create?</Label>
                  <Button
                    type="button"
                    variant={isRecording ? "destructive" : "outline"}
                    size="sm"
                    onClick={toggleVoiceInput}
                    data-testid="button-voice-input"
                    className="gap-1.5"
                  >
                    {isRecording ? (
                      <>
                        <MicOff className="h-3.5 w-3.5" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Mic className="h-3.5 w-3.5" />
                        Voice
                      </>
                    )}
                  </Button>
                </div>
                <div className="relative">
                  <Textarea
                    id="ai-prompt"
                    data-testid="textarea-ai-prompt"
                    placeholder={scopedProjectId
                      ? "Examples:\n\u2022 Create tasks for design, development, and testing\n\u2022 Generate risks for this project\n\u2022 Add milestones for the key deliverables\n\u2022 Create issues for known blockers..."
                      : "Examples:\n\u2022 Create a mobile app project with tasks for design, development, and testing\n\u2022 Add 5 team members for a software development team\n\u2022 Generate risks for a cloud migration initiative\n\u2022 Create milestones for a product launch..."}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="min-h-[140px]"
                  />
                  {isRecording && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-1.5 text-xs text-red-500">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      Listening...
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAiDialogOpen(false)} disabled={isPending} data-testid="button-cancel-ai">
                Cancel
              </Button>
              <Button
                data-testid="button-preview-ai"
                onClick={() => previewMutation.mutate(aiPrompt)}
                disabled={!aiPrompt.trim() || isPending || (aiCosts && !aiCosts.aiProjectGeneration.canAfford)}
              >
                {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Preview
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-primary" />
                Confirm Actions
              </DialogTitle>
              <DialogDescription>
                Review the items AI will create. Toggle off any you don't want.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              {requiresProjectWarning && (
                <div className="p-3 mb-3 rounded-md border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                      These items need a project. Select one below:
                    </p>
                  </div>
                  <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                    <SelectTrigger data-testid="select-project-for-ai" className="bg-background">
                      <SelectValue placeholder="Select a project..." />
                    </SelectTrigger>
                    <SelectContent>
                      {orgProjects && orgProjects.length > 0 ? (
                        orgProjects.map((project: any) => (
                          <SelectItem key={project.id} value={String(project.id)}>
                            {project.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__none" disabled>No projects found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {!selectedProjectId && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Please select a project or the items won't be created.
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">
                  {enabledCount} of {previewActions.length} action{previewActions.length !== 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const allEnabled = previewActions.every(a => a.enabled);
                    setPreviewActions(prev => prev.map(a => ({ ...a, enabled: !allEnabled })));
                  }}
                  data-testid="button-toggle-all-actions"
                >
                  {previewActions.every(a => a.enabled) ? "Deselect All" : "Select All"}
                </Button>
              </div>
              <ScrollArea className={previewActions.length > 6 ? "h-[320px]" : ""}>
                <div className="space-y-2">
                  {previewActions.map((action) => (
                    <div
                      key={action.id}
                      className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
                        action.enabled
                          ? 'border-border bg-card'
                          : 'border-border/50 bg-muted/30 opacity-60'
                      }`}
                      data-testid={`action-item-${action.id}`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {getActionIcon(action.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">
                            {getActionLabel(action.type)}
                          </Badge>
                        </div>
                        <p className="text-sm mt-1">{action.description}</p>
                      </div>
                      <Switch
                        checked={action.enabled}
                        onCheckedChange={() => toggleAction(action.id)}
                        data-testid={`switch-action-${action.id}`}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            {aiCosts && (
              <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/30" data-testid="text-total-credit-cost">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  This uses <strong>{aiCosts.aiProjectGeneration.creditCost}</strong> credit{aiCosts.aiProjectGeneration.creditCost !== 1 ? 's' : ''} (1 AI run)
                  {aiCosts.credits.remaining !== null && (
                    <> — {aiCosts.credits.remaining} remaining</>
                  )}
                </span>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("input")}
                disabled={isPending}
                data-testid="button-back-to-input"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setAiDialogOpen(false)} disabled={isPending} data-testid="button-cancel-confirm">
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-create"
                onClick={handleConfirmExecute}
                disabled={enabledCount === 0 || isPending || needsProjectSelection}
              >
                {executeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Create {enabledCount} Item{enabledCount !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
});
