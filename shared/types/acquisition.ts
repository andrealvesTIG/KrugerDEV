// Strict shape for first-touch acquisition payloads sent from the client to the
// server. Keep in sync with FirstTouch in server/services/acquisition.ts.
export interface FirstTouchData {
  referrer?: string | null;
  landingPath?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  anonymousId?: string | null;
  firstSeenAt?: string | null;
}
