import { useEffect } from 'react';
import { captureFirstTouch, installGlobalClickTracker } from '@/lib/track';

/**
 * Captures first-touch acquisition data (referrer, UTM params, landing path)
 * on the very first visit and persists it in localStorage so it can be
 * sent up at signup time. Also installs a global click tracker.
 */
export function useFirstTouch() {
  useEffect(() => {
    captureFirstTouch();
    installGlobalClickTracker();
  }, []);
}
