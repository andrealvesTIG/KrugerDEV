import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { trackPageView } from '../lib/analytics';
import { trackPageViewServer } from '../lib/track';

export const useAnalytics = () => {
  const [location] = useLocation();
  const prevLocationRef = useRef<string>(location);

  useEffect(() => {
    if (location !== prevLocationRef.current) {
      trackPageView(location);
      trackPageViewServer(location);
      prevLocationRef.current = location;
    }
  }, [location]);

  // Send the initial page view once on mount
  useEffect(() => {
    trackPageView(location);
    trackPageViewServer(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
