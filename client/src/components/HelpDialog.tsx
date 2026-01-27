import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, ImagePlus, Clipboard, HelpCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const createTicketMutation = useMutation({
    mutationFn: async (data: { subject: string; description: string; imageUrls: string[]; organizationId?: number }) => {
      const response = await apiRequest("POST", "/api/help-tickets", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Help request submitted",
        description: "We've received your request and will get back to you soon.",
      });
      resetForm();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["/api/help-tickets"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSubject("");
    setDescription("");
    setImages([]);
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const preview = URL.createObjectURL(file);
          setImages(prev => [...prev, { file, preview }]);
        }
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (file.type.startsWith("image/")) {
        const preview = URL.createObjectURL(file);
        setImages(prev => [...prev, { file, preview }]);
      }
    });
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadImages = async (): Promise<string[]> => {
    if (images.length === 0) return [];

    const uploadedUrls: string[] = [];
    
    for (const { file } of images) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "help-tickets");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const data = await response.json();
      uploadedUrls.push(data.url);
    }

    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!subject.trim() || !description.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide both a subject and description.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUploading(true);
      const imageUrls = await uploadImages();
      await createTicketMutation.mutateAsync({
        subject: subject.trim(),
        description: description.trim(),
        imageUrls,
        organizationId: currentOrganization?.id,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload images. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const isSubmitting = isUploading || createTicketMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Help & Feedback
          </DialogTitle>
          <DialogDescription>
            Describe your issue or feedback. You can paste screenshots directly or upload images.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Brief summary of your issue or feedback"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isSubmitting}
              data-testid="input-help-subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              ref={textareaRef}
              id="description"
              placeholder="Describe your issue in detail. You can paste screenshots here (Ctrl+V / Cmd+V)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onPaste={handlePaste}
              disabled={isSubmitting}
              className="min-h-[150px] resize-none"
              data-testid="input-help-description"
            />
          </div>

          {images.length > 0 && (
            <div className="space-y-2">
              <Label>Attached Images</Label>
              <div className="flex flex-wrap gap-2">
                {images.map((img, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={img.preview}
                      alt={`Attachment ${index + 1}`}
                      className="h-20 w-20 object-cover rounded-md border"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 h-5 w-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-remove-image-${index}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-help-file"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              data-testid="button-add-image"
            >
              <ImagePlus className="h-4 w-4 mr-2" />
              Add Image
            </Button>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clipboard className="h-3 w-3" />
              Or paste screenshots directly
            </span>
          </div>

          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
            <p className="font-medium mb-1">Logged in as:</p>
            <p>{user?.email}</p>
            {currentOrganization && (
              <p className="mt-1">Organization: {currentOrganization.name}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              data-testid="button-help-cancel"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              data-testid="button-help-submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
