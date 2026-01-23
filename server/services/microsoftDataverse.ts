import { ConfidentialClientApplication, AuthorizationCodeRequest, Configuration } from "@azure/msal-node";
import { Express, Request, Response } from "express";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    dataverseOAuthState?: string;
    dataverseAccessToken?: string;
    dataverseRefreshToken?: string;
    dataverseTokenExpiry?: number;
    dataverseEnvironmentUrl?: string;
  }
}

interface DataversePlannerPlan {
  msdyn_projectid: string;
  msdyn_subject: string;
  createdon: string;
  modifiedon: string;
  statecode: number;
  statuscode: number;
  _ownerid_value: string;
}

interface DataversePlannerTask {
  msdyn_projecttaskid: string;
  msdyn_subject: string;
  msdyn_scheduledstart?: string;
  msdyn_scheduledend?: string;
  msdyn_progress?: number;
  msdyn_priority?: number;
  msdyn_description?: string;
  msdyn_wbsid?: string;
  msdyn_parenttask?: string;
  _msdyn_project_value?: string;
  statecode: number;
  statuscode: number;
  createdon: string;
  modifiedon: string;
}

let dataverseMsalClient: ConfidentialClientApplication | null = null;

function getDataverseMsalConfig(): Configuration | null {
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

function getDataverseMsalClient(): ConfidentialClientApplication | null {
  if (dataverseMsalClient) return dataverseMsalClient;
  const config = getDataverseMsalConfig();
  if (!config) return null;
  dataverseMsalClient = new ConfidentialClientApplication(config);
  return dataverseMsalClient;
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getDataverseRedirectUri(req: Request): string {
  const protocol = req.protocol || "https";
  const host = req.get("host") || "localhost:5000";
  return `${protocol}://${host}/api/dataverse/callback`;
}

function getDataverseScopes(environmentUrl: string): string[] {
  const baseUrl = environmentUrl.replace(/\/$/, "");
  return [
    `${baseUrl}/.default`,
    "offline_access",
  ];
}

async function fetchDataverse(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      "Accept": "application/json",
      "Prefer": "odata.include-annotations=*",
    },
  });
  return response;
}

export async function setupDataverseRoutes(app: Express) {
  app.get("/api/dataverse/status", (req, res) => {
    const isConfigured = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    const hasToken = !!req.session.dataverseAccessToken;
    const isExpired = req.session.dataverseTokenExpiry ? Date.now() > req.session.dataverseTokenExpiry : true;
    const environmentUrl = req.session.dataverseEnvironmentUrl || null;
    
    res.json({ 
      configured: isConfigured, 
      connected: hasToken && !isExpired,
      environmentUrl,
      needsRefresh: hasToken && isExpired && !!req.session.dataverseRefreshToken
    });
  });

  app.post("/api/dataverse/set-environment", async (req, res) => {
    const { environmentUrl } = req.body;
    
    if (!environmentUrl) {
      return res.status(400).json({ message: "Environment URL is required" });
    }

    const urlPattern = /^https:\/\/[\w-]+\.crm[\d]*\.dynamics\.com\/?$/i;
    if (!urlPattern.test(environmentUrl)) {
      return res.status(400).json({ 
        message: "Invalid Dataverse URL. Expected format: https://yourorg.crm.dynamics.com" 
      });
    }

    req.session.dataverseEnvironmentUrl = environmentUrl.replace(/\/$/, "");
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ success: true, environmentUrl: req.session.dataverseEnvironmentUrl });
  });

  app.post("/api/dataverse/connect", async (req, res) => {
    const client = getDataverseMsalClient();
    if (!client) {
      return res.status(503).json({ 
        message: "Microsoft authentication is not configured. Please add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET." 
      });
    }

    const environmentUrl = req.session.dataverseEnvironmentUrl;
    if (!environmentUrl) {
      return res.status(400).json({
        message: "Dataverse environment URL not set. Please configure your environment first."
      });
    }

    // Save return URL if provided
    const { returnUrl } = req.body;
    if (returnUrl && typeof returnUrl === 'string' && returnUrl.startsWith('/')) {
      req.session.dataverseReturnUrl = returnUrl;
    }

    const state = generateSecureToken();
    req.session.dataverseOAuthState = state;
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const redirectUri = getDataverseRedirectUri(req);
    const scopes = getDataverseScopes(environmentUrl);
    
    const authCodeUrlParameters = {
      scopes,
      redirectUri,
      prompt: "consent" as const,
      state,
    };

    try {
      const authUrl = await client.getAuthCodeUrl(authCodeUrlParameters);
      res.json({ authUrl });
    } catch (error) {
      console.error("Dataverse auth URL error:", error);
      res.status(500).json({ message: "Failed to initiate Dataverse connection" });
    }
  });

  app.get("/api/dataverse/callback", async (req, res) => {
    const { code, error, error_description, state } = req.query;

    if (error) {
      console.error("Dataverse OAuth error:", error, error_description);
      return res.redirect(`/projects?error=${encodeURIComponent(String(error_description || error))}`);
    }

    const savedState = req.session.dataverseOAuthState;
    delete req.session.dataverseOAuthState;

    if (!state || state !== savedState) {
      console.error("CSRF state mismatch");
      return res.redirect("/projects?error=Security validation failed");
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/projects?error=No authorization code received");
    }

    const client = getDataverseMsalClient();
    if (!client) {
      return res.redirect("/projects?error=Configuration error");
    }

    const environmentUrl = req.session.dataverseEnvironmentUrl;
    if (!environmentUrl) {
      return res.redirect("/projects?error=Environment URL not configured");
    }

    try {
      const redirectUri = getDataverseRedirectUri(req);
      const scopes = getDataverseScopes(environmentUrl);
      
      const tokenRequest: AuthorizationCodeRequest = {
        code,
        scopes,
        redirectUri,
      };

      const response = await client.acquireTokenByCode(tokenRequest);
      
      if (!response || !response.accessToken) {
        throw new Error("No access token received");
      }

      req.session.dataverseAccessToken = response.accessToken;
      if (response.expiresOn) {
        req.session.dataverseTokenExpiry = response.expiresOn.getTime();
      }
      
      // Get return URL before clearing it
      const returnUrl = req.session.dataverseReturnUrl;
      delete req.session.dataverseReturnUrl;
      
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Redirect to return URL if provided, otherwise default
      if (returnUrl && returnUrl.startsWith('/')) {
        res.redirect(`${returnUrl}?dataverseConnected=true`);
      } else {
        res.redirect("/org-settings?tab=integrations&dataverseConnected=true");
      }
    } catch (error) {
      console.error("Dataverse token error:", error);
      const returnUrl = req.session.dataverseReturnUrl;
      delete req.session.dataverseReturnUrl;
      if (returnUrl && returnUrl.startsWith('/')) {
        res.redirect(`${returnUrl}?error=Failed to complete Dataverse authentication`);
      } else {
        res.redirect("/org-settings?tab=integrations&error=Failed to complete Dataverse authentication");
      }
    }
  });

  app.post("/api/dataverse/disconnect", (req, res) => {
    delete req.session.dataverseAccessToken;
    delete req.session.dataverseRefreshToken;
    delete req.session.dataverseTokenExpiry;
    res.json({ success: true });
  });

  app.get("/api/dataverse/plans", async (req, res) => {
    const token = req.session.dataverseAccessToken;
    const environmentUrl = req.session.dataverseEnvironmentUrl;

    if (!token) {
      return res.status(401).json({ message: "Not connected to Dataverse" });
    }

    if (!environmentUrl) {
      return res.status(400).json({ message: "Dataverse environment not configured" });
    }

    try {
      const apiUrl = `${environmentUrl}/api/data/v9.2/msdyn_projects?$select=msdyn_projectid,msdyn_subject,createdon,modifiedon,statecode,statuscode,_ownerid_value&$filter=statecode eq 0&$orderby=createdon desc`;
      
      const response = await fetchDataverse(apiUrl, token);

      if (!response.ok) {
        if (response.status === 401) {
          delete req.session.dataverseAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect." });
        }
        if (response.status === 403) {
          return res.status(403).json({ 
            message: "Access denied. Ensure your Azure AD app has Dynamics CRM permissions and the user has access to Project for the Web." 
          });
        }
        const errorText = await response.text();
        console.error("Dataverse API error:", response.status, errorText);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const plans: DataversePlannerPlan[] = data.value || [];
      
      res.json({ 
        plans: plans.map((p) => ({
          id: p.msdyn_projectid,
          title: p.msdyn_subject,
          createdDateTime: p.createdon,
          modifiedDateTime: p.modifiedon,
          owner: p._ownerid_value,
          isPremium: true,
        }))
      });
    } catch (error) {
      console.error("Error fetching Dataverse plans:", error);
      res.status(500).json({ message: "Failed to fetch Premium plans from Dataverse" });
    }
  });

  app.get("/api/dataverse/plans/:planId/tasks", async (req, res) => {
    const token = req.session.dataverseAccessToken;
    const environmentUrl = req.session.dataverseEnvironmentUrl;
    const { planId } = req.params;

    if (!token) {
      return res.status(401).json({ message: "Not connected to Dataverse" });
    }

    if (!environmentUrl) {
      return res.status(400).json({ message: "Dataverse environment not configured" });
    }

    try {
      const apiUrl = `${environmentUrl}/api/data/v9.2/msdyn_projecttasks?$select=msdyn_projecttaskid,msdyn_subject,msdyn_scheduledstart,msdyn_scheduledend,msdyn_progress,msdyn_priority,msdyn_description,msdyn_wbsid,_msdyn_parenttask_value,statecode,statuscode,createdon,modifiedon&$filter=_msdyn_project_value eq ${planId}&$orderby=msdyn_wbsid asc`;
      
      const response = await fetchDataverse(apiUrl, token);

      if (!response.ok) {
        if (response.status === 401) {
          delete req.session.dataverseAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect." });
        }
        const errorText = await response.text();
        console.error("Dataverse tasks API error:", response.status, errorText);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const tasks: DataversePlannerTask[] = data.value || [];

      res.json({ 
        tasks: tasks.map((t) => ({
          id: t.msdyn_projecttaskid,
          title: t.msdyn_subject,
          startDateTime: t.msdyn_scheduledstart || null,
          dueDateTime: t.msdyn_scheduledend || null,
          percentComplete: t.msdyn_progress || 0,
          priority: mapDataversePriority(t.msdyn_priority),
          description: t.msdyn_description || null,
          wbsId: t.msdyn_wbsid || null,
          parentTaskId: t.msdyn_parenttask || null,
          createdDateTime: t.createdon,
          hasDescription: !!t.msdyn_description,
          bucketId: null,
          bucketName: null,
          assignmentCount: 0,
        })),
        buckets: []
      });
    } catch (error) {
      console.error("Error fetching Dataverse tasks:", error);
      res.status(500).json({ message: "Failed to fetch Premium plan tasks" });
    }
  });

  app.get("/api/dataverse/plans/:planId", async (req, res) => {
    const token = req.session.dataverseAccessToken;
    const environmentUrl = req.session.dataverseEnvironmentUrl;
    const { planId } = req.params;

    if (!token) {
      return res.status(401).json({ message: "Not connected to Dataverse" });
    }

    if (!environmentUrl) {
      return res.status(400).json({ message: "Dataverse environment not configured" });
    }

    try {
      const apiUrl = `${environmentUrl}/api/data/v9.2/msdyn_projects(${planId})?$select=msdyn_projectid,msdyn_subject,createdon,modifiedon,statecode,statuscode,_ownerid_value`;
      
      const response = await fetchDataverse(apiUrl, token);

      if (!response.ok) {
        if (response.status === 401) {
          delete req.session.dataverseAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect." });
        }
        throw new Error(`API error: ${response.status}`);
      }

      const plan: DataversePlannerPlan = await response.json();
      
      res.json({ 
        plan: {
          id: plan.msdyn_projectid,
          title: plan.msdyn_subject,
          createdDateTime: plan.createdon,
          owner: plan._ownerid_value,
          isPremium: true,
        }
      });
    } catch (error) {
      console.error("Error fetching Dataverse plan:", error);
      res.status(500).json({ message: "Failed to fetch Premium plan details" });
    }
  });
}

function mapDataversePriority(priority: number | undefined): number {
  if (priority === undefined || priority === null) return 5;
  switch (priority) {
    case 192350000: return 1;
    case 192350001: return 3;
    case 192350002: return 5;
    case 192350003: return 9;
    default: return 5;
  }
}

export function mapDataversePriorityToProjectPriority(priority: number): string {
  switch (priority) {
    case 1:
    case 2:
      return "Critical";
    case 3:
    case 4:
      return "High";
    case 5:
    case 6:
      return "Medium";
    default:
      return "Low";
  }
}

export function mapDataverseProgressToStatus(progress: number): string {
  if (progress >= 100) return "Completed";
  if (progress > 0) return "In Progress";
  return "Not Started";
}
