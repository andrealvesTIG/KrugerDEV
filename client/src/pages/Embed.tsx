import { Link } from "wouter";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Embed() {
  const searchParams = new URLSearchParams(window.location.search);
  const url = searchParams.get('url');
  const label = searchParams.get('label') || 'External Content';

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">No URL provided</h2>
          <p className="text-muted-foreground mb-4">Unable to display embedded content without a URL.</p>
          <Link href="/">
            <Button variant="outline" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="font-semibold text-lg">{label}</h1>
        </div>
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-open-external"
        >
          <span className="hidden sm:inline">Open in new tab</span>
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <div className="flex-1 min-h-0">
        <iframe
          src={url}
          className="w-full h-full border-0"
          title={label}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"
          data-testid="iframe-content"
        />
      </div>
    </div>
  );
}
