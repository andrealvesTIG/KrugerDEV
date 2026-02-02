import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";

// Global flags to prevent multiple SDK loads across component instances
let sdkLoadingPromise: Promise<void> | null = null;
let sdkLoaded = false;
// Global guard to prevent double checkout - track when last subscription was initiated
let lastSubscriptionInitTime = 0;
const SUBSCRIPTION_COOLDOWN_MS = 5000; // 5 seconds cooldown between subscription attempts
// Counter for tracking render coordination during cleanup
let buttonRenderCount = 0;

interface PayPalSubscriptionButtonProps {
  planId: string;
  planCode?: string;
  onSuccess?: (subscriptionId: string, subscriptionData: any) => void;
  onError?: (error: any) => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}

export default function PayPalSubscriptionButton({
  planId,
  planCode,
  onSuccess,
  onError,
  onCancel,
  disabled = false,
  className = "",
}: PayPalSubscriptionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(sdkLoaded);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const paypalButtonRendered = useRef(false);
  const componentMounted = useRef(true);
  const subscriptionInProgress = useRef(false);

  const loadPayPalSDK = useCallback(async () => {
    // If SDK is already loaded, we're done
    if (sdkLoaded && (window as any).paypal?.Buttons) {
      if (componentMounted.current) setSdkReady(true);
      return;
    }

    // If already loading, wait for existing promise
    if (sdkLoadingPromise) {
      await sdkLoadingPromise;
      if (componentMounted.current) setSdkReady(true);
      return;
    }

    // Start loading
    sdkLoadingPromise = new Promise<void>(async (resolve, reject) => {
      try {
        // Remove any existing broken script
        const existingScript = document.querySelector('script[src*="paypal.com/sdk/js"]');
        if (existingScript && !(window as any).paypal?.Buttons) {
          existingScript.remove();
        }

        const response = await fetch("/api/paypal/subscription/client-id");
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "PayPal is not available");
        }
        const { clientId } = await response.json();
        
        if (!clientId) {
          throw new Error("PayPal client ID not configured");
        }

        const script = document.createElement("script");
        script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&vault=true&intent=subscription&disable-funding=paylater,venmo,credit`;
        script.async = true;
        script.onload = () => {
          sdkLoaded = true;
          resolve();
        };
        script.onerror = () => {
          sdkLoadingPromise = null;
          reject(new Error("Failed to load PayPal SDK"));
        };
        document.body.appendChild(script);
      } catch (error) {
        sdkLoadingPromise = null;
        reject(error);
      }
    });

    try {
      await sdkLoadingPromise;
      if (componentMounted.current) setSdkReady(true);
    } catch (error: any) {
      console.error("Failed to get PayPal client ID:", error);
      if (componentMounted.current) {
        setSdkError(error.message || "PayPal is not available");
        if (onError) onError(error);
      }
    }
  }, [onError]);

  useEffect(() => {
    componentMounted.current = true;
    loadPayPalSDK();
    
    return () => {
      componentMounted.current = false;
    };
  }, [loadPayPalSDK]);

  useEffect(() => {
    if (!sdkReady || !buttonContainerRef.current || disabled) {
      return;
    }

    const paypal = (window as any).paypal;
    if (!paypal?.Buttons) {
      return;
    }

    const container = buttonContainerRef.current;
    
    // Prevent double rendering - check if already rendered for this planId
    if (paypalButtonRendered.current) {
      return;
    }
    
    // Track this render for cleanup coordination
    buttonRenderCount++;
    const currentRenderCount = buttonRenderCount;
    
    // Clear any existing buttons first
    container.innerHTML = "";
    paypalButtonRendered.current = true;

    // Render the default PayPal button (single checkout window)
    const paypalButton = paypal.Buttons({
      style: {
        shape: "rect",
        color: "gold",
        layout: "vertical",
        label: "subscribe",
      },
      createSubscription: async (data: any, actions: any) => {
        // Global cooldown check - prevent rapid successive subscription attempts
        const now = Date.now();
        if (now - lastSubscriptionInitTime < SUBSCRIPTION_COOLDOWN_MS) {
          console.log('[PayPal] Subscription attempt within cooldown period, blocking');
          return Promise.reject(new Error('Please wait before trying again'));
        }
        
        // Prevent double subscription creation
        if (subscriptionInProgress.current) {
          console.log('[PayPal] Subscription already in progress, ignoring duplicate call');
          return Promise.reject(new Error('Subscription already in progress'));
        }
        
        // Set both guards
        lastSubscriptionInitTime = now;
        subscriptionInProgress.current = true;
        
        // Build return URL with plan code for redirect flow (mobile devices)
        const baseUrl = window.location.origin;
        const returnUrl = planCode 
          ? `${baseUrl}/billing?plan_code=${encodeURIComponent(planCode)}`
          : `${baseUrl}/billing`;
        
        try {
          return await actions.subscription.create({
            plan_id: planId,
            application_context: {
              brand_name: "FridayReport.AI",
              shipping_preference: "NO_SHIPPING",
              user_action: "SUBSCRIBE_NOW",
              return_url: returnUrl,
              cancel_url: `${baseUrl}/billing`,
            },
          });
        } catch (error) {
          subscriptionInProgress.current = false;
          throw error;
        }
      },
      onApprove: async (data: any, actions: any) => {
        setIsLoading(true);
        try {
          const response = await fetch(`/api/paypal/subscription/${data.subscriptionID}`);
          const subscriptionData = await response.json();
          
          if (onSuccess) {
            onSuccess(data.subscriptionID, subscriptionData);
          }
        } catch (error) {
          console.error("Failed to verify subscription:", error);
          if (onError) onError(error);
        } finally {
          setIsLoading(false);
          subscriptionInProgress.current = false;
        }
      },
      onCancel: () => {
        subscriptionInProgress.current = false;
        if (onCancel) onCancel();
      },
      onError: (err: any) => {
        subscriptionInProgress.current = false;
        console.error("PayPal subscription error:", err);
        if (onError) onError(err);
      },
    });
    
    // Render the PayPal button
    paypalButton.render(container);

    return () => {
      paypalButtonRendered.current = false;
      subscriptionInProgress.current = false;
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [sdkReady, planId, planCode, disabled]);

  if (disabled) {
    return (
      <Button disabled className={className}>
        Subscribe with Card
      </Button>
    );
  }

  if (sdkError) {
    return (
      <div className={`flex items-center gap-2 text-sm text-destructive p-3 rounded-md bg-destructive/10 ${className}`}>
        <AlertCircle className="h-4 w-4" />
        <span>{sdkError}</span>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <Button disabled className={className}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading Payment...
      </Button>
    );
  }

  return (
    <div className={className}>
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Processing subscription...</span>
        </div>
      )}
      <div ref={buttonContainerRef} className={isLoading ? "hidden" : ""} data-testid="paypal-subscription-container" />
    </div>
  );
}
