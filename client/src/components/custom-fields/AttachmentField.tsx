import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Paperclip, ExternalLink, X } from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";

export interface AttachmentValue {
  path: string;
  name: string;
  size?: number;
  type?: string;
}

function isSafeAttachmentPath(path: unknown): path is string {
  return typeof path === "string" && /^\/objects\/[A-Za-z0-9._/-]+$/.test(path);
}

export function parseAttachmentValue(raw: string | null | undefined): AttachmentValue | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && isSafeAttachmentPath(parsed.path)) {
      return {
        path: parsed.path,
        name: typeof parsed.name === "string" && parsed.name.length > 0 ? parsed.name : parsed.path.split("/").pop() || "file",
        size: typeof parsed.size === "number" ? parsed.size : undefined,
        type: typeof parsed.type === "string" ? parsed.type : undefined,
      };
    }
  } catch {
    if (isSafeAttachmentPath(raw)) {
      return { path: raw, name: raw.split("/").pop() || "file" };
    }
  }
  return null;
}

export function serializeAttachmentValue(att: AttachmentValue): string {
  return JSON.stringify(att);
}

interface AttachmentFieldInputProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  testId?: string;
}

export function AttachmentFieldInput({ value, onChange, disabled, testId }: AttachmentFieldInputProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const att = parseAttachmentValue(value);
  const { uploadFile, isUploading } = useUpload({
    onError: (err) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadFile(file);
    if (result) {
      onChange(serializeAttachmentValue({
        path: result.objectPath,
        name: file.name,
        size: file.size,
        type: file.type || undefined,
      }));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0" data-testid={testId}>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />
      {att ? (
        <>
          <a
            href={att.path}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline flex items-center gap-1 truncate min-w-0"
            data-testid={`${testId}-link`}
          >
            <Paperclip className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{att.name}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>
          {!disabled && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onChange("")}
              data-testid={`${testId}-clear`}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          data-testid={`${testId}-upload`}
        >
          {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Paperclip className="h-3 w-3 mr-1" />}
          {isUploading ? "Uploading…" : "Upload file"}
        </Button>
      )}
    </div>
  );
}

interface AttachmentFieldDisplayProps {
  value: string;
  testId?: string;
}

export function AttachmentFieldDisplay({ value, testId }: AttachmentFieldDisplayProps) {
  const att = parseAttachmentValue(value);
  if (!att) return <span className="text-muted-foreground text-sm" data-testid={testId}>Not set</span>;
  return (
    <a
      href={att.path}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm underline flex items-center gap-1 truncate min-w-0"
      data-testid={testId}
      onClick={(e) => e.stopPropagation()}
    >
      <Paperclip className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">{att.name}</span>
      <ExternalLink className="h-3 w-3 flex-shrink-0" />
    </a>
  );
}
