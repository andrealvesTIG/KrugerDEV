import { ConfidentialClientApplication, AuthorizationCodeRequest, Configuration } from "@azure/msal-node";
import { Express, Request, Response } from "express";
import crypto from "crypto";
import { db } from "../db";
import { organizationIntegrations, users, organizationMembers } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { encryptToken, decryptToken, isEncryptedFormat } from "../lib/tokenEncryption";

// Auth helpers for Planner routes
function getUserIdFromRequest(req: Request): string | undefined {
  const replitUserId = (req as any).user?.claims?.sub;
  if (replitUserId) return replitUserId;
  return (req.session as any)?.userId;
}

async function userHasOrgAccess(userId: string | undefined, orgId: number): Promise<boolean> {
  if (!userId) return false;
  
  // Check if user is super_admin
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (user?.role === 'super_admin') return true;
  
  // Check if user is a member of this organization
  const memberships = await db.select().from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));
  return memberships.some(m => m.organizationId === orgId);
}

declare module "express-session" {
  interface SessionData {
    plannerOAuthState?: string;
    plannerOAuthOrgId?: number; // Organization ID for the OAuth flow
    plannerAccessToken?: string;
    plannerRefreshToken?: string;
    plannerTokenExpiry?: number;
    entraOAuthState?: string;
    entraOAuthOrgId?: number; // Organization ID for the Entra OAuth flow
  }
}

// Helper functions for org-scoped integration storage (exported for use in routes.ts)
export async function getOrgIntegration(organizationId: number, integrationType: string) {
  const [integration] = await db
    .select()
    .from(organizationIntegrations)
    .where(
      and(
        eq(organizationIntegrations.organizationId, organizationId),
        eq(organizationIntegrations.integrationType, integrationType)
      )
    );
  
  if (integration) {
    if (integration.accessToken && isEncryptedFormat(integration.accessToken)) {
      try {
        integration.accessToken = decryptToken(integration.accessToken);
      } catch (err) {
        console.error(`Failed to decrypt access token for org ${organizationId}, type ${integrationType}:`, err);
        integration.accessToken = null;
      }
    }
    if (integration.refreshToken && isEncryptedFormat(integration.refreshToken)) {
      try {
        integration.refreshToken = decryptToken(integration.refreshToken);
      } catch (err) {
        console.error(`Failed to decrypt refresh token for org ${organizationId}, type ${integrationType}:`, err);
        integration.refreshToken = null;
      }
    }
  }
  
  return integration;
}

export async function upsertOrgIntegration(
  organizationId: number,
  integrationType: string,
  data: {
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiry?: Date | null;
    connectionStatus?: string;
    connectedBy?: string;
    connectedAt?: Date;
    additionalData?: string;
  }
) {
  const encryptedData = { ...data };
  if (encryptedData.accessToken) {
    encryptedData.accessToken = encryptToken(encryptedData.accessToken);
  }
  if (encryptedData.refreshToken) {
    encryptedData.refreshToken = encryptToken(encryptedData.refreshToken);
  }
  
  const existing = await getOrgIntegration(organizationId, integrationType);
  
  if (existing) {
    await db
      .update(organizationIntegrations)
      .set({
        ...encryptedData,
        updatedAt: new Date(),
      })
      .where(eq(organizationIntegrations.id, existing.id));
  } else {
    await db.insert(organizationIntegrations).values({
      organizationId,
      integrationType,
      accessToken: encryptedData.accessToken || null,
      refreshToken: encryptedData.refreshToken || null,
      tokenExpiry: data.tokenExpiry || null,
      connectionStatus: data.connectionStatus || "disconnected",
      connectedBy: data.connectedBy || null,
      connectedAt: data.connectedAt || null,
      additionalData: data.additionalData || null,
    });
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
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)
    || req.protocol
    || "https";
  const host = req.get("host") || "localhost:5000";
  return `${protocol}://${host}/api/planner/callback`;
}

const PLANNER_SCOPES = [
  "https://graph.microsoft.com/Tasks.Read",
  "https://graph.microsoft.com/Group.Read.All",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/User.Read.All",
  "offline_access",
];

// Entra ID scopes for directory/user lookup only.
// We use Graph's `/.default` scope (mirrors how the Project Online flow uses
// `${sharePointHost}/.default`) so Microsoft honours the admin-granted
// consent already configured in the app registration and doesn't prompt the
// user for incremental consent on every connect. The actual permissions
// returned in the access token are exactly those configured on the app
// registration in Entra (User.Read, User.Read.All, Directory.Read.All).
const ENTRA_ID_SCOPES = [
  "https://graph.microsoft.com/.default",
  "offline_access",
];

function getEntraRedirectUri(req: Request): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.get("host") || "localhost:5000";
  return `${protocol}://${host}/api/entra/callback`;
}

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
  // Organization-scoped status endpoint
  app.get("/api/planner/status", async (req, res) => {
    const isConfigured = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
    
    if (!organizationId) {
      // Fallback to session-based check for backward compatibility
      const hasToken = !!req.session.plannerAccessToken;
      const isExpired = req.session.plannerTokenExpiry ? Date.now() > req.session.plannerTokenExpiry : true;
      return res.json({ 
        configured: isConfigured, 
        connected: hasToken && !isExpired,
        needsRefresh: hasToken && isExpired && !!req.session.plannerRefreshToken
      });
    }
    
    // Verify user has access to this organization
    const userId = getUserIdFromRequest(req);
    if (!await userHasOrgAccess(userId, organizationId)) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }
    
    // Check organization-scoped integration
    const integration = await getOrgIntegration(organizationId, "planner");
    const hasToken = !!integration?.accessToken;
    const isExpired = integration?.tokenExpiry ? Date.now() > new Date(integration.tokenExpiry).getTime() : true;
    
    res.json({ 
      configured: isConfigured, 
      connected: hasToken && !isExpired,
      needsRefresh: hasToken && isExpired && !!integration?.refreshToken
    });
  });

  app.post("/api/planner/connect", async (req, res) => {
    const client = getPlannerMsalClient();
    if (!client) {
      return res.status(503).json({ 
        message: "Microsoft authentication is not configured. Please add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET." 
      });
    }

    const organizationId = req.body.organizationId ? Number(req.body.organizationId) : null;
    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }

    // Verify user has access to this organization
    const userId = getUserIdFromRequest(req);
    if (!await userHasOrgAccess(userId, organizationId)) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const state = generateSecureToken();
    req.session.plannerOAuthState = state;
    req.session.plannerOAuthOrgId = organizationId;
    
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
      return res.redirect(`/integrations?error=${encodeURIComponent(String(error_description || error))}`);
    }

    const savedState = req.session.plannerOAuthState;
    const organizationId = req.session.plannerOAuthOrgId;
    delete req.session.plannerOAuthState;
    delete req.session.plannerOAuthOrgId;

    if (!state || state !== savedState) {
      console.error("CSRF state mismatch");
      return res.redirect("/integrations?error=Security validation failed");
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/integrations?error=No authorization code received");
    }

    if (!organizationId) {
      return res.redirect("/integrations?error=Organization context lost");
    }

    const client = getPlannerMsalClient();
    if (!client) {
      return res.redirect("/integrations?error=Configuration error");
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

      // Store tokens in organization-scoped integration
      const userId = (req.session as any)?.passport?.user?.id || req.session.userId;
      await upsertOrgIntegration(organizationId, "planner", {
        accessToken: response.accessToken,
        refreshToken: null, // MSAL doesn't always return refresh token
        tokenExpiry: response.expiresOn || null,
        connectionStatus: "connected",
        connectedBy: userId,
        connectedAt: new Date(),
      });

      // Also store in session for backward compatibility
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

      res.redirect("/integrations?plannerConnected=true");
    } catch (error) {
      console.error("Planner token error:", error);
      res.redirect("/integrations?error=Failed to complete authentication");
    }
  });

  app.post("/api/planner/disconnect", async (req, res) => {
    const organizationId = req.body.organizationId ? Number(req.body.organizationId) : null;
    
    if (organizationId) {
      // Verify user has access to this organization
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Clear organization-scoped integration
      await upsertOrgIntegration(organizationId, "planner", {
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
        connectionStatus: "disconnected",
      });
    }
    
    // Also clear session for backward compatibility
    delete req.session.plannerAccessToken;
    delete req.session.plannerRefreshToken;
    delete req.session.plannerTokenExpiry;
    res.json({ success: true });
  });

  // ============================================
  // Microsoft Entra ID Integration (User Directory)
  // ============================================
  
  app.get("/api/entra/status", async (req, res) => {
    const isConfigured = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
    
    if (!organizationId) {
      return res.json({ configured: isConfigured, connected: false });
    }

    // Verify user has access to this organization
    const userId = getUserIdFromRequest(req);
    if (!await userHasOrgAccess(userId, organizationId)) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const integration = await getOrgIntegration(organizationId, "entra");
    const hasToken = !!integration?.accessToken;
    const isExpired = integration?.tokenExpiry ? Date.now() > new Date(integration.tokenExpiry).getTime() : true;
    
    res.json({ 
      configured: isConfigured, 
      connected: hasToken && !isExpired,
      needsRefresh: hasToken && isExpired && !!integration?.refreshToken
    });
  });

  app.post("/api/entra/connect", async (req, res) => {
    const client = getPlannerMsalClient();
    if (!client) {
      return res.status(503).json({ 
        message: "Microsoft authentication is not configured. Please add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET." 
      });
    }

    const organizationId = req.body.organizationId ? Number(req.body.organizationId) : null;
    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }

    // Verify user has access to this organization
    const userId = getUserIdFromRequest(req);
    if (!await userHasOrgAccess(userId, organizationId)) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }

    const state = generateSecureToken();
    req.session.entraOAuthState = state;
    req.session.entraOAuthOrgId = organizationId;
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const redirectUri = getEntraRedirectUri(req);
    
    const authCodeUrlParameters = {
      scopes: ENTRA_ID_SCOPES,
      redirectUri,
      state,
    };

    try {
      const authUrl = await client.getAuthCodeUrl(authCodeUrlParameters);
      res.json({ authUrl });
    } catch (error) {
      console.error("Entra auth URL error:", error);
      res.status(500).json({ message: "Failed to initiate Entra ID connection" });
    }
  });

  app.get("/api/entra/callback", async (req, res) => {
    const { code, error, error_description, state } = req.query;

    if (error) {
      console.error("Entra OAuth error:", error, error_description);
      return res.redirect(`/integrations?error=${encodeURIComponent(String(error_description || error))}`);
    }

    const savedState = req.session.entraOAuthState;
    const organizationId = req.session.entraOAuthOrgId;
    delete req.session.entraOAuthState;
    delete req.session.entraOAuthOrgId;

    if (!state || state !== savedState) {
      console.error("CSRF state mismatch");
      return res.redirect("/integrations?error=Security validation failed");
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/integrations?error=No authorization code received");
    }

    if (!organizationId) {
      return res.redirect("/integrations?error=Organization context lost");
    }

    const client = getPlannerMsalClient();
    if (!client) {
      return res.redirect("/integrations?error=Configuration error");
    }

    try {
      const redirectUri = getEntraRedirectUri(req);
      
      const tokenRequest: AuthorizationCodeRequest = {
        code,
        scopes: ENTRA_ID_SCOPES,
        redirectUri,
      };

      const response = await client.acquireTokenByCode(tokenRequest);
      
      if (!response || !response.accessToken) {
        throw new Error("No access token received");
      }

      // Store tokens in organization-scoped integration
      const userId = (req.session as any)?.passport?.user?.id || req.session.userId;
      await upsertOrgIntegration(organizationId, "entra", {
        accessToken: response.accessToken,
        refreshToken: null,
        tokenExpiry: response.expiresOn || null,
        connectionStatus: "connected",
        connectedBy: userId,
        connectedAt: new Date(),
      });
      
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.redirect("/integrations?entraConnected=true");
    } catch (error) {
      console.error("Entra token error:", error);
      res.redirect("/integrations?error=Failed to complete authentication");
    }
  });

  app.post("/api/entra/disconnect", async (req, res) => {
    const organizationId = req.body.organizationId ? Number(req.body.organizationId) : null;
    
    if (organizationId) {
      // Verify user has access to this organization
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      await upsertOrgIntegration(organizationId, "entra", {
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
        connectionStatus: "disconnected",
      });
    }
    
    res.json({ success: true });
  });

  app.get("/api/planner/plans", async (req, res) => {
    const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
    
    // Verify user has access to this organization if specified
    if (organizationId) {
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
    }
    
    // Try org-scoped token first, fallback to session
    let token = req.session.plannerAccessToken;
    if (organizationId) {
      const integration = await getOrgIntegration(organizationId, "planner");
      if (integration?.accessToken) {
        const isExpired = integration.tokenExpiry ? Date.now() > new Date(integration.tokenExpiry).getTime() : false;
        if (!isExpired) {
          token = integration.accessToken;
        }
      }
    }

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
          if (organizationId) {
            await upsertOrgIntegration(organizationId, "planner", { connectionStatus: "expired" });
          }
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
    const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
    const { planId } = req.params;
    
    // Verify user has access to this organization if specified
    if (organizationId) {
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
    }
    
    // Try org-scoped token first, fallback to session
    let token = req.session.plannerAccessToken;
    if (organizationId) {
      const integration = await getOrgIntegration(organizationId, "planner");
      if (integration?.accessToken) {
        const isExpired = integration.tokenExpiry ? Date.now() > new Date(integration.tokenExpiry).getTime() : false;
        if (!isExpired) {
          token = integration.accessToken;
        }
      }
    }

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
          if (organizationId) {
            await upsertOrgIntegration(organizationId, "planner", { connectionStatus: "expired" });
          }
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
    const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
    const { planId } = req.params;
    
    // Verify user has access to this organization if specified
    if (organizationId) {
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
    }
    
    // Try org-scoped token first, fallback to session
    let token = req.session.plannerAccessToken;
    if (organizationId) {
      const integration = await getOrgIntegration(organizationId, "planner");
      if (integration?.accessToken) {
        const isExpired = integration.tokenExpiry ? Date.now() > new Date(integration.tokenExpiry).getTime() : false;
        if (!isExpired) {
          token = integration.accessToken;
        }
      }
    }

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
          if (organizationId) {
            await upsertOrgIntegration(organizationId, "planner", { connectionStatus: "expired" });
          }
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

  // Endpoint to fetch Microsoft 365 profile photo by email
  app.get("/api/microsoft/user-photo", async (req, res) => {
    const organizationId = parseInt(req.query.organizationId as string);
    const email = req.query.email as string;

    if (!organizationId || !email) {
      return res.status(400).json({ message: "Missing organizationId or email" });
    }

    try {
      const integration = await getOrgIntegration(organizationId, "planner");
      if (!integration?.accessToken) {
        return res.status(404).json({ photoUrl: null, message: "Not connected to Microsoft" });
      }

      // Fetch user photo from Microsoft Graph
      const photoResponse = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/photo/$value`,
        {
          headers: {
            Authorization: `Bearer ${integration.accessToken}`,
          },
        }
      );

      if (!photoResponse.ok) {
        return res.status(404).json({ photoUrl: null });
      }

      // Convert to base64 data URL
      const arrayBuffer = await photoResponse.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const contentType = photoResponse.headers.get('content-type') || 'image/jpeg';
      const dataUrl = `data:${contentType};base64,${base64}`;

      res.json({ photoUrl: dataUrl });
    } catch (error) {
      console.error("Error fetching Microsoft user photo:", error);
      res.status(404).json({ photoUrl: null });
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
