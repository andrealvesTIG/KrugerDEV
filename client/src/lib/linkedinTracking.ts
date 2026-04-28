declare global {
  interface Window {
    lintrk?: ((action: string, payload: { conversion_id: number }) => void) & {
      q?: unknown[];
    };
  }
}

const SIGNUP_CONVERSION_ID = 27149050;

export function trackLinkedInSignupConversion(): void {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.lintrk === "function") {
      window.lintrk("track", { conversion_id: SIGNUP_CONVERSION_ID });
    }
  } catch {
    // Tracking failures must never break the sign-in flow.
  }
}
