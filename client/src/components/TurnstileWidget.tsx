import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";

// Only use Turnstile if a real site key is configured (not test keys)
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
const isTurnstileEnabled = TURNSTILE_SITE_KEY && !TURNSTILE_SITE_KEY.startsWith("1x0000");

export interface TurnstileWidgetRef {
  reset: () => void;
  getToken: () => string | null;
}

interface TurnstileWidgetProps {
  onSuccess?: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  className?: string;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetRef, TurnstileWidgetProps>(
  ({ onSuccess, onError, onExpire, className }, ref) => {
    const turnstileRef = useRef<TurnstileInstance>(null);
    const [token, setToken] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      reset: () => {
        turnstileRef.current?.reset();
        setToken(null);
      },
      getToken: () => token,
    }));

    // If Turnstile is disabled, call onSuccess immediately with empty token
    // This allows forms to work without Turnstile
    useEffect(() => {
      if (!isTurnstileEnabled && onSuccess) {
        onSuccess("disabled");
      }
    }, [onSuccess]);

    // Don't render if Turnstile is not configured
    if (!isTurnstileEnabled) {
      return null;
    }

    const handleSuccess = (newToken: string) => {
      setToken(newToken);
      onSuccess?.(newToken);
    };

    const handleError = () => {
      setToken(null);
      onError?.();
    };

    const handleExpire = () => {
      setToken(null);
      onExpire?.();
    };

    return (
      <div className={className} data-testid="turnstile-widget">
        <Turnstile
          ref={turnstileRef}
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={handleSuccess}
          onError={handleError}
          onExpire={handleExpire}
          options={{
            theme: "auto",
            size: "flexible",
          }}
        />
      </div>
    );
  }
);

TurnstileWidget.displayName = "TurnstileWidget";

export async function verifyTurnstileToken(token: string): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await fetch("/api/auth/verify-turnstile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return response.json();
  } catch (error) {
    return { success: false, message: "Failed to verify" };
  }
}
