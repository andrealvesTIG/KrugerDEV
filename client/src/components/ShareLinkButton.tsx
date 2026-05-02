import { useState } from "react";
import { Link2, Check, Globe, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/use-organization";
import {
  getOrgFromCurrentUrl,
  isOrgScopedPath,
  stripOrg,
  withOrg,
} from "@/lib/orgUrl";
import { cn } from "@/lib/utils";

interface ShareLinkButtonProps {
  className?: string;
}

function buildHrefSuffix(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search + window.location.hash;
}

function buildAbsoluteUrl(href: string): string {
  if (typeof window === "undefined") return href;
  return window.location.origin + href;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy fallback
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function ShareLinkButton({ className }: ShareLinkButtonProps) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [menuOpen, setMenuOpen] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  // The button only makes sense on org-scoped pages. Public marketing /
  // auth / share pages don't benefit from a "copy with org" action.
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const onOrgScopedPage = isOrgScopedPath(path);
  if (!onOrgScopedPage) return null;

  // Prefer the resolved active organization's slug so the copied link is
  // always canonical (a stale/invalid `?org=` value in the URL would
  // otherwise be propagated). Fall back to the raw URL param only if the
  // org context hasn't resolved yet.
  const orgSlug = currentOrganization?.slug || getOrgFromCurrentUrl() || null;

  const handleCopy = async (variant: "with-org" | "public") => {
    const suffix = buildHrefSuffix();
    const href =
      variant === "with-org" && orgSlug
        ? withOrg(suffix, orgSlug)
        : stripOrg(suffix);
    const url = buildAbsoluteUrl(href);
    const ok = await copyToClipboard(url);
    if (ok) {
      setJustCopied(true);
      window.setTimeout(() => setJustCopied(false), 1500);
      toast({
        title: variant === "with-org" ? "Link copied" : "Public link copied",
        description:
          variant === "with-org"
            ? "Pasted with your organization context — share with teammates."
            : "Pasted without organization context — share with anyone with access.",
      });
    } else {
      toast({
        title: "Couldn't copy link",
        description:
          "Your browser blocked clipboard access. Copy the URL from the address bar instead.",
        variant: "destructive",
      });
    }
  };

  // Split-button: the primary icon copies the org-scoped link in a single
  // click; the chevron opens a menu for the alternate "public link" action.
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-transparent hover:border-border transition-colors",
        className,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground rounded-r-none"
            aria-label="Copy link to this page"
            onClick={() => void handleCopy("with-org")}
            disabled={!orgSlug}
            data-testid="button-share-link"
          >
            {justCopied ? (
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            {orgSlug
              ? `Copy link to this page (includes ?org=${orgSlug})`
              : "Loading organization — try again in a moment"}
          </p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-5 px-0 text-muted-foreground hover:text-foreground rounded-l-none"
            aria-label="More share options"
            data-testid="button-share-link-more"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Share this page
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              void handleCopy("with-org");
            }}
            disabled={!orgSlug}
            className="gap-2"
            data-testid="menu-item-copy-link-with-org"
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span>Copy link</span>
              <span className="text-[11px] text-muted-foreground">
                {orgSlug
                  ? `Includes ?org=${orgSlug} for teammates`
                  : "No organization selected"}
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              void handleCopy("public");
            }}
            className="gap-2"
            data-testid="menu-item-copy-public-link"
          >
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span>Copy public link</span>
              <span className="text-[11px] text-muted-foreground">
                Strips ?org= for non-members
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default ShareLinkButton;
