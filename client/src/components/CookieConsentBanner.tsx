import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getAnalyticsConsent, setAnalyticsConsent } from '@/lib/track';

const DISMISSED_KEY = 'fr_cookie_banner_dismissed';

function isAuthenticated(): boolean {
  if (typeof document === 'undefined') return false;
  return /(?:^|;\s*)fr_authed=1(?:;|$)/.test(document.cookie);
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isAuthenticated()) return;
    if (getAnalyticsConsent() !== null) return;
    try {
      if (localStorage.getItem(DISMISSED_KEY) === '1') return;
    } catch { /* ignore */ }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const handle = (granted: boolean) => {
    setAnalyticsConsent(granted);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-3xl rounded-lg border bg-background/95 backdrop-blur p-4 shadow-lg flex flex-col sm:flex-row sm:items-center gap-3"
      role="dialog"
      aria-label="Cookie consent"
      data-testid="cookie-consent-banner"
    >
      <div className="text-sm text-muted-foreground flex-1">
        We use a small number of cookies to understand how visitors use FridayReport.AI
        so we can improve the product. No personal data is sold. You can change this any time.
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handle(false)}
          data-testid="button-cookie-reject"
        >
          Reject
        </Button>
        <Button
          size="sm"
          onClick={() => handle(true)}
          data-testid="button-cookie-accept"
        >
          Accept
        </Button>
      </div>
    </div>
  );
}
