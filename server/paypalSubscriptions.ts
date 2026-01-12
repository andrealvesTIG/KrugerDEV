import { Request, Response } from "express";

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;

const PAYPAL_API_BASE = process.env.NODE_ENV === "production"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

async function getAccessToken(): Promise<string> {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  return data.access_token;
}

export async function createProduct(req: Request, res: Response) {
  try {
    const { name, description } = req.body;
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v1/catalogs/products`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `product-${Date.now()}`,
      },
      body: JSON.stringify({
        name,
        description,
        type: "SERVICE",
        category: "SOFTWARE",
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Failed to create product:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
}

export async function createPlan(req: Request, res: Response) {
  try {
    const { productId, name, description, priceCents, intervalUnit = "MONTH", intervalCount = 1 } = req.body;
    const accessToken = await getAccessToken();

    const priceValue = (priceCents / 100).toFixed(2);

    const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `plan-${Date.now()}`,
      },
      body: JSON.stringify({
        product_id: productId,
        name,
        description,
        status: "ACTIVE",
        billing_cycles: [
          {
            frequency: {
              interval_unit: intervalUnit,
              interval_count: intervalCount,
            },
            tenure_type: "REGULAR",
            sequence: 1,
            total_cycles: 0,
            pricing_scheme: {
              fixed_price: {
                value: priceValue,
                currency_code: "USD",
              },
            },
          },
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee: {
            value: "0",
            currency_code: "USD",
          },
          setup_fee_failure_action: "CONTINUE",
          payment_failure_threshold: 3,
        },
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Failed to create plan:", error);
    res.status(500).json({ error: "Failed to create plan" });
  }
}

export async function createSubscription(req: Request, res: Response) {
  try {
    const { planId, returnUrl, cancelUrl, customId } = req.body;
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `sub-${Date.now()}`,
      },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: customId,
        application_context: {
          brand_name: "FridayReport.AI",
          locale: "en-US",
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Failed to create subscription:", error);
    res.status(500).json({ error: "Failed to create subscription" });
  }
}

export async function getSubscription(req: Request, res: Response) {
  try {
    const { subscriptionId } = req.params;
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Failed to get subscription:", error);
    res.status(500).json({ error: "Failed to get subscription" });
  }
}

export async function cancelSubscription(req: Request, res: Response) {
  try {
    const { subscriptionId } = req.params;
    const { reason } = req.body;
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: reason || "Cancelled by user" }),
    });

    if (response.status === 204) {
      res.status(200).json({ success: true, message: "Subscription cancelled" });
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error("Failed to cancel subscription:", error);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
}

export async function activateSubscription(req: Request, res: Response) {
  try {
    const { subscriptionId } = req.params;
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}/activate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "Reactivating subscription" }),
    });

    if (response.status === 204) {
      res.status(200).json({ success: true, message: "Subscription activated" });
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error("Failed to activate subscription:", error);
    res.status(500).json({ error: "Failed to activate subscription" });
  }
}

export async function listPlans(req: Request, res: Response) {
  try {
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans?page_size=20&page=1&total_required=true`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Failed to list plans:", error);
    res.status(500).json({ error: "Failed to list plans" });
  }
}

export function getPayPalClientId(req: Request, res: Response) {
  if (!PAYPAL_CLIENT_ID) {
    return res.status(500).json({ error: "PayPal is not configured" });
  }
  res.json({ clientId: PAYPAL_CLIENT_ID });
}
