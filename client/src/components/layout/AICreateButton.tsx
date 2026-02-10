import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Zap, Mic, MicOff } from "lucide-react";

interface AICostsData {
  aiProjectGeneration: { creditCost: number; description: string; canAfford: boolean };
  credits: { used: number; remaining: number | null; limit: number | null };
  canAfford: boolean;
}

export function AICreateButton() {
  const { currentOrganization } = useOrganization();
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const toggleVoiceInput = () => {
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

  useEffect(() => {
    if (!aiDialogOpen && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }, [aiDialogOpen]);

  const { data: aiCosts } = useQuery<AICostsData>({
    queryKey: ['/api/billing/ai-costs'],
    enabled: aiDialogOpen,
  });

  const smartCreateMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await apiRequest('POST', '/api/ai/smart-create', {
        prompt,
        organizationId: currentOrganization?.id,
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
      setAiPrompt("");
      if (data.redirectTo) {
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

  if (!currentOrganization) return null;

  return (
    <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" data-testid="button-ai-create">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">AI Create</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Create
          </DialogTitle>
          <DialogDescription>
            Describe what you want to create. AI will understand and generate the appropriate items (projects, tasks, risks, issues, milestones, or resources).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {aiCosts && (
            <div className={`flex items-center gap-2 p-3 rounded-lg border ${aiCosts.aiProjectGeneration.canAfford ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'}`}>
              <Zap className={`h-4 w-4 ${aiCosts.aiProjectGeneration.canAfford ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`} />
              <div className="flex-1 text-sm">
                <span className={aiCosts.aiProjectGeneration.canAfford ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-300'}>
                  This will use <strong>{aiCosts.aiProjectGeneration.creditCost}</strong> credit{aiCosts.aiProjectGeneration.creditCost !== 1 ? 's' : ''}.
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
                placeholder="Examples:
• Create a mobile app project with tasks for design, development, and testing
• Add 5 team members for a software development team
• Generate risks for a cloud migration initiative
• Create milestones for a product launch..."
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
          <Button variant="outline" onClick={() => setAiDialogOpen(false)} disabled={smartCreateMutation.isPending} data-testid="button-cancel-ai">
            Cancel
          </Button>
          <Button
            data-testid="button-generate-project"
            onClick={() => smartCreateMutation.mutate(aiPrompt)}
            disabled={!aiPrompt.trim() || smartCreateMutation.isPending || (aiCosts && !aiCosts.aiProjectGeneration.canAfford)}
          >
            {smartCreateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
