import { ConfidentialClientApplication, AuthorizationCodeRequest, Configuration } from "@azure/msal-node";
import { Express, Request, Response } from "express";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    plannerOAuthState?: string;
    plannerAccessToken?: string;
    plannerRefreshToken?: string;
    plannerTokenExpiry?: number;
  }
}

interface PlannerPlan {
  id: string;
  title: string;
  createdDateTime: string;
  owner: string;
  container?: {
    containerId: string;
    type: string;
    url?: string;
  };
}

interface PlannerTask {
  id: string;
  planId: string;
  bucketId: string | null;
  title: string;
  orderHint: string;
  assigneePriority: string | null;
  percentComplete: number;
  startDateTime: string | null;
  dueDateTime: string | null;
  hasDescription: boolean;
  previewType: string;
  createdDateTime: string;
  createdBy: {
    user?: {
      displayName: string | null;
      id: string;
    };
  };
  assignments: Record<string, {
    assignedBy: { user?: { id: string } };
    assignedDateTime: string;
    orderHint: string;
  }>;
  priority: number;
}

interface PlannerBucket {
  id: string;
  name: string;
  planId: string;
  orderHint: string;
}

interface PlannerTaskDetails {
  id: string;
  description: string;
  checklist: Record<string, {
    isChecked: boolean;
    title: string;
    orderHint: string;
  }>;
}

let plannerMsalClient: ConfidentialClientApplication | null = null;

function getPlannerMsalConfig(): Configuration | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  };
}

function getPlannerMsalClient(): ConfidentialClientApplication | null {
  if (plannerMsalClient) return plannerMsalClient;
  const config = getPlannerMsalConfig();
  if (!config) return null;
  plannerMsalClient = new ConfidentialClientApplication(config);
  return plannerMsalClient;
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getPlannerRedirectUri(req: Request): string {
  const protocol = req.protocol || "https";
  const host = req.get("host") || "localhost:5000";
  return `${protocol}://${host}/api/planner/callback`;
}

const PLANNER_SCOPES = [
  "https://graph.microsoft.com/Tasks.Read",
  "https://graph.microsoft.com/Group.Read.All",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
];

async function fetchWithToken(url: string, token: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  return response as unknown as Response;
}

export async function setupPlannerRoutes(app: Express) {
  app.get("/api/planner/status", (req, res) => {
    const isConfigured = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    const hasToken = !!req.session.plannerAccessToken;
    const isExpired = req.session.plannerTokenExpiry ? Date.now() > req.session.plannerTokenExpiry : true;
    res.json({ 
      configured: isConfigured, 
      connected: hasToken && !isExpired,
      needsRefresh: hasToken && isExpired && !!req.session.plannerRefreshToken
    });
  });

  app.post("/api/planner/connect", async (req, res) => {
    const client = getPlannerMsalClient();
    if (!client) {
      return res.status(503).json({ 
        message: "Microsoft authentication is not configured. Please add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET." 
      });
    }

    const state = generateSecureToken();
    req.session.plannerOAuthState = state;
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const redirectUri = getPlannerRedirectUri(req);
    
    const authCodeUrlParameters = {
      scopes: PLANNER_SCOPES,
      redirectUri,
      prompt: "consent" as const,
      state,
    };

    try {
      const authUrl = await client.getAuthCodeUrl(authCodeUrlParameters);
      res.json({ authUrl });
    } catch (error) {
      console.error("Planner auth URL error:", error);
      res.status(500).json({ message: "Failed to initiate Planner connection" });
    }
  });

  app.get("/api/planner/callback", async (req, res) => {
    const { code, error, error_description, state } = req.query;

    if (error) {
      console.error("Planner OAuth error:", error, error_description);
      return res.redirect(`/projects?error=${encodeURIComponent(String(error_description || error))}`);
    }

    const savedState = req.session.plannerOAuthState;
    delete req.session.plannerOAuthState;

    if (!state || state !== savedState) {
      console.error("CSRF state mismatch");
      return res.redirect("/projects?error=Security validation failed");
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/projects?error=No authorization code received");
    }

    const client = getPlannerMsalClient();
    if (!client) {
      return res.redirect("/projects?error=Configuration error");
    }

    try {
      const redirectUri = getPlannerRedirectUri(req);
      
      const tokenRequest: AuthorizationCodeRequest = {
        code,
        scopes: PLANNER_SCOPES,
        redirectUri,
      };

      const response = await client.acquireTokenByCode(tokenRequest);
      
      if (!response || !response.accessToken) {
        throw new Error("No access token received");
      }

      req.session.plannerAccessToken = response.accessToken;
      if (response.expiresOn) {
        req.session.plannerTokenExpiry = response.expiresOn.getTime();
      }
      
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.redirect("/projects?plannerConnected=true");
    } catch (error) {
      console.error("Planner token error:", error);
      res.redirect("/projects?error=Failed to complete authentication");
    }
  });

  app.post("/api/planner/disconnect", (req, res) => {
    delete req.session.plannerAccessToken;
    delete req.session.plannerRefreshToken;
    delete req.session.plannerTokenExpiry;
    res.json({ success: true });
  });

  app.get("/api/planner/plans", async (req, res) => {
    const token = req.session.plannerAccessToken;

    if (!token) {
      return res.status(401).json({ message: "Not connected to Planner" });
    }

    try {
      const response = await fetch("https://graph.microsoft.com/v1.0/me/planner/plans", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          delete req.session.plannerAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect." });
        }
        const errorText = await response.text();
        console.error("Planner API error:", response.status, errorText);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const plans: PlannerPlan[] = data.value || [];
      
      res.json({ 
        plans: plans.map((p) => ({
          id: p.id,
          title: p.title,
          createdDateTime: p.createdDateTime,
          owner: p.owner,
        }))
      });
    } catch (error) {
      console.error("Error fetching Planner plans:", error);
      res.status(500).json({ message: "Failed to fetch Planner plans" });
    }
  });

  app.get("/api/planner/plans/:planId/tasks", async (req, res) => {
    const token = req.session.plannerAccessToken;
    const { planId } = req.params;

    if (!token) {
      return res.status(401).json({ message: "Not connected to Planner" });
    }

    try {
      const [tasksResponse, bucketsResponse] = await Promise.all([
        fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}/tasks`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
        fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}/buckets`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
      ]);

      if (!tasksResponse.ok) {
        if (tasksResponse.status === 401) {
          delete req.session.plannerAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect." });
        }
        throw new Error(`API error: ${tasksResponse.status}`);
      }

      const tasksData = await tasksResponse.json();
      const tasks: PlannerTask[] = tasksData.value || [];

      let buckets: PlannerBucket[] = [];
      if (bucketsResponse.ok) {
        const bucketsData = await bucketsResponse.json();
        buckets = bucketsData.value || [];
      }

      const bucketMap = new Map(buckets.map(b => [b.id, b.name]));

      res.json({ 
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          percentComplete: t.percentComplete,
          startDateTime: t.startDateTime,
          dueDateTime: t.dueDateTime,
          priority: t.priority,
          bucketId: t.bucketId,
          bucketName: t.bucketId ? bucketMap.get(t.bucketId) || null : null,
          hasDescription: t.hasDescription,
          assignmentCount: Object.keys(t.assignments || {}).length,
          createdDateTime: t.createdDateTime,
        })),
        buckets: buckets.map(b => ({
          id: b.id,
          name: b.name,
        }))
      });
    } catch (error) {
      console.error("Error fetching Planner tasks:", error);
      res.status(500).json({ message: "Failed to fetch Planner tasks" });
    }
  });

  app.get("/api/planner/plans/:planId", async (req, res) => {
    const token = req.session.plannerAccessToken;
    const { planId } = req.params;

    if (!token) {
      return res.status(401).json({ message: "Not connected to Planner" });
    }

    try {
      const response = await fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          delete req.session.plannerAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect." });
        }
        throw new Error(`API error: ${response.status}`);
      }

      const plan = await response.json();
      
      res.json({ 
        plan: {
          id: plan.id,
          title: plan.title,
          createdDateTime: plan.createdDateTime,
          owner: plan.owner,
        }
      });
    } catch (error) {
      console.error("Error fetching Planner plan:", error);
      res.status(500).json({ message: "Failed to fetch Planner plan" });
    }
  });
}

export function mapPlannerPriorityToProjectPriority(plannerPriority: number): string {
  switch (plannerPriority) {
    case 0:
    case 1:
      return "Critical";
    case 2:
    case 3:
      return "High";
    case 4:
    case 5:
      return "Medium";
    default:
      return "Low";
  }
}

export function mapPlannerPercentToStatus(percentComplete: number): string {
  if (percentComplete === 100) return "Completed";
  if (percentComplete > 0) return "In Progress";
  return "Not Started";
}
