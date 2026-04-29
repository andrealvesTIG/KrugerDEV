import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Mic, MicOff } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface CreateCustomDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (dashboardId: number) => void;
}

export function CreateCustomDashboardDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateCustomDashboardDialogProps) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check if speech recognition is supported
  const isSpeechRecognitionSupported = typeof window !== 'undefined' && 
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Initialize speech recognition
  useEffect(() => {
    if (!isSpeechRecognitionSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;
    const recognition: SpeechRecognition = new SpeechRecognitionAPI();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        setDescription(prev => prev + (prev ? ' ' : '') + final.trim());
        setInterimTranscript('');
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event: Event) => {
      console.error('Speech recognition error:', event);
      setIsListening(false);
      setInterimTranscript('');
      toast({
        title: "Voice input error",
        description: "Could not recognize speech. Please try again.",
        variant: "destructive",
      });
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [isSpeechRecognitionSupported, toast]);

  // Stop listening when dialog closes
  useEffect(() => {
    if (!open && isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [open, isListening]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
        toast({
          title: "Voice input unavailable",
          description: "Please check your microphone permissions.",
          variant: "destructive",
        });
      }
    }
  };

  const createMutation = useMutation({
    mutationFn: async (description: string) => {
      const response = await apiRequest('POST', '/api/custom-dashboards/generate', {
        description,
        organizationId: currentOrganization?.id,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Dashboard created", description: "Your custom dashboard is ready!" });
      queryClient.invalidateQueries({ queryKey: ['/api/custom-dashboards'] });
      setDescription("");
      onOpenChange(false);
      onCreated(data.id);
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: "Failed to create dashboard. Please try again.", 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = () => {
    if (!description.trim()) {
      toast({ title: "Please describe your dashboard", variant: "destructive" });
      return;
    }
    createMutation.mutate(description);
  };

  const examples = [
    "Show me project health trends and risk distribution",
    "Overview of task completion rates by project",
    "Resource utilization and budget tracking",
    "Issues and risks breakdown by severity",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create Custom Dashboard
          </DialogTitle>
          <DialogDescription>
            Describe the dashboard you want to create. AI will generate the appropriate charts and visualizations based on your data.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">What would you like to see in your dashboard?</Label>
              {isSpeechRecognitionSupported && (
                <Button
                  type="button"
                  variant={isListening ? "default" : "outline"}
                  size="sm"
                  onClick={toggleListening}
                  className={cn(
                    "h-8 gap-1.5",
                    isListening && "bg-red-500 hover:bg-red-600 text-white"
                  )}
                  data-testid="button-voice-input"
                >
                  {isListening ? (
                    <>
                      <MicOff className="h-3.5 w-3.5" />
                      <span className="text-xs">Stop</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5" />
                      <span className="text-xs">Voice</span>
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="relative">
              <Textarea
                id="description"
                placeholder="e.g., Show me project health distribution and task completion trends..."
                value={description + (interimTranscript ? (description ? ' ' : '') + interimTranscript : '')}
                onChange={(e) => setDescription(e.target.value)}
                className={cn(
                  "min-h-[100px]",
                  isListening && "border-red-500 ring-1 ring-red-500"
                )}
                data-testid="input-dashboard-description"
              />
              {isListening && (
                <div className="absolute bottom-2 right-2 flex items-center gap-1.5 text-xs text-red-500">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  Listening...
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Examples:</Label>
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <Button
                  key={example}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setDescription(example)}
                  data-testid={`example-${example.slice(0, 20)}`}
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
            data-testid="button-cancel-dashboard"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !description.trim()}
            data-testid="button-create-dashboard"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Create Dashboard
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
