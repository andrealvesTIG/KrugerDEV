import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";

interface PayPalSubscriptionButtonProps {
  planId: string;
  onSuccess?: (subscriptionId: string, subscriptionData: any) => void;
  onError?: (error: any) => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}

export default function PayPalSubscriptionButton({
  planId,
  onSuccess,
  onError,
  onCancel,
  disabled = false,
  className = "",
}: PayPalSubscriptionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const paypalButtonRendered = useRef(false);

  useEffect(() => {
    const loadPayPalSDK = async () => {
      // Check if PayPal SDK is already loaded with correct settings
      const existingScript = document.querySelector('script[src*="paypal.com/sdk/js"]');
      if (existingScript && existingScript.getAttribute('src')?.includes('disable-funding')) {
        if ((window as any).paypal?.Buttons) {
          setSdkReady(true);
          return;
        }
      }
      
      // Remove any existing PayPal SDK scripts to ensure fresh load with correct params
      if (existingScript) {
        existingScript.remove();
        delete (window as any).paypal;
      }

      try {
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
        // Only show credit/debit card option - disable PayPal button and other funding sources
        script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&vault=true&intent=subscription&enable-funding=card&disable-funding=paypal,paylater,venmo,credit`;
        script.async = true;
        script.onload = () => setSdkReady(true);
        script.onerror = () => {
          const error = new Error("Failed to load PayPal SDK");
          setSdkError(error.message);
          if (onError) onError(error);
        };
        document.body.appendChild(script);
      } catch (error: any) {
        console.error("Failed to get PayPal client ID:", error);
        setSdkError(error.message || "PayPal is not available");
        if (onError) onError(error);
      }
    };

    loadPayPalSDK();
  }, []);

  useEffect(() => {
    if (!sdkReady || !buttonContainerRef.current || paypalButtonRendered.current || disabled) {
      return;
    }

    const paypal = (window as any).paypal;
    if (!paypal?.Buttons) {
      return;
    }

    const container = buttonContainerRef.current;
    paypalButtonRendered.current = true;

    const buttons = paypal.Buttons({
      style: {
        shape: "rect",
        color: "gold",
        layout: "vertical",
        label: "subscribe",
      },
      createSubscription: async (data: any, actions: any) => {
        return actions.subscription.create({
          plan_id: planId,
        });
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
        }
      },
      onCancel: () => {
        if (onCancel) onCancel();
      },
      onError: (err: any) => {
        console.error("PayPal subscription error:", err);
        if (onError) onError(err);
      },
    });
    
    buttons.render(container);

    return () => {
      paypalButtonRendered.current = false;
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [sdkReady, planId, disabled]);

  if (disabled) {
    return (
      <Button disabled className={className}>
        Subscribe with PayPal
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
        Loading PayPal...
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
