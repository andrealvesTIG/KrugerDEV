import { useEffect } from 'react';
import { captureFirstTouch, installGlobalClickTracker, setAnalyticsConsent } from '@/lib/track';

interface ConsentStatus {
  marketingAccepted?: boolean;
  analyticsAccepted?: boolean;
}

/**
 * Captures first-touch acquisition data (referrer, UTM params, landing path)
 * on the very first visit and persists it in localStorage + a cookie so it
 * can be sent up at signup time (including via OAuth redirects). Also installs
 * a global click tracker that is gated on the user's analytics consent.
 */
export function useFirstTouch() {
  useEffect(() => {
    captureFirstTouch();
    installGlobalClickTracker();

    // Resolve analytics consent state. Page views are always captured (essential
    // telemetry); the click listener installed above only fires once consent is
    // granted via setAnalyticsConsent.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/consents/status', { credentials: 'include' });
        if (!res.ok) {
          // Anonymous / not authenticated — leave consent undetermined (denied default).
          return;
        }
        const data: ConsentStatus = await res.json();
        if (cancelled) return;
        // We piggy-back on the existing "marketing" consent the user accepted
        // during onboarding for analytics-style click capture, since we do not
        // surface a separate analytics toggle yet.
        const granted = Boolean(data.marketingAccepted || data.analyticsAccepted);
        setAnalyticsConsent(granted);
      } catch {
        // ignore — leaves clicks gated off
      }
    })();
    return () => { cancelled = true; };
  }, []);
}
