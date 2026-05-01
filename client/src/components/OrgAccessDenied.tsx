import { Building2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/hooks/use-organization";
import { stripOrg, withOrg } from "@/lib/orgUrl";

// Full-screen "you don't have access to this organization" gate. Rendered
// when the URL's `?org=<slug>` resolves to a real org but the current user
// is not a member of it. We deliberately do NOT silently swap to a different
// org — that hides the problem and makes shared links confusing.
export function OrgAccessDenied() {
  const { accessDeniedOrg, organizations, setCurrentOrganization } = useOrganization();

  if (!accessDeniedOrg) return null;

  const handleSwitchTo = (orgIndex: number) => {
    const org = organizations[orgIndex];
    if (!org) return;
    setCurrentOrganization(org);
    // Replace the URL with the new org's slug so we don't immediately
    // re-trigger the access-denied check on the next render. Keep the user
    // on a safe landing page (the home route) so they don't get a blank
    // entity-detail page for an id that doesn't belong to the new org.
    const target = withOrg("/", org.slug);
    window.history.replaceState(window.history.state, "", target);
    // Trigger a soft reload so the OrganizationProvider effect re-runs and
    // hydrates from the new ?org= value.
    window.dispatchEvent(new Event("popstate"));
  };

  const handleSignOut = () => {
    // Strip the offending ?org= so a fresh sign-in starts cleanly.
    const cleaned = stripOrg(window.location.pathname + window.location.search + window.location.hash);
    window.history.replaceState(window.history.state, "", cleaned);
    window.location.href = "/auth";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-xl font-semibold text-foreground" data-testid="text-access-denied-title">
          You don't have access to this organization
        </h1>
        <p className="mt-2 text-sm text-muted-foreground" data-testid="text-access-denied-org">
          The link you opened belongs to <strong>{accessDeniedOrg.name}</strong>,
          and you are not a member.
        </p>

        {organizations.length > 0 ? (
          <div className="mt-6 space-y-2 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Switch to one of your organizations
            </p>
            <div className="space-y-1.5">
              {organizations.map((org, idx) => (
                <Button
                  key={org.id}
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => handleSwitchTo(idx)}
                  data-testid={`button-switch-to-org-${org.id}`}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{org.name}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            You are not a member of any other organizations. Ask the owner of
            <strong> {accessDeniedOrg.name}</strong> to invite you.
          </p>
        )}

        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="text-xs text-muted-foreground"
            data-testid="button-access-denied-signout"
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
