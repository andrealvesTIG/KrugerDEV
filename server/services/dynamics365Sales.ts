import { ConfidentialClientApplication, AuthorizationCodeRequest, Configuration } from "@azure/msal-node";
import { Express, Request, Response } from "express";
import crypto from "crypto";
import { getOrgIntegration, upsertOrgIntegration } from "./microsoftPlanner";
import { db } from "../db";
import { users, organizationMembers } from "@shared/schema";
import { eq } from "drizzle-orm";

// Auth helpers for Dynamics 365 routes
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
    dynamics365OAuthState?: string;
    dynamics365OrgId?: number;
    dynamics365EnvironmentUrl?: string;
    dynamics365ReturnUrl?: string;
  }
}

export interface Dynamics365Invoice {
  invoiceid: string;
  invoicenumber: string;
  name: string;
  description?: string;
  totalamount?: number;
  totaltax?: number;
  totallineitemamount?: number;
  totaldiscountamount?: number;
  transactioncurrencyid?: string;
  _transactioncurrencyid_value?: string;
  statecode: number;
  statuscode: number;
  createdon: string;
  modifiedon: string;
  duedate?: string;
  datedelivered?: string;
  _customerid_value?: string;
  customername?: string;
  customeraddress?: string;
  billto_name?: string;
  billto_line1?: string;
  billto_city?: string;
  billto_stateorprovince?: string;
  billto_postalcode?: string;
  billto_country?: string;
}

interface Dynamics365InvoiceResponse {
  "@odata.context"?: string;
  value: Dynamics365Invoice[];
  "@odata.nextLink"?: string;
}

let dynamics365MsalClient: ConfidentialClientApplication | null = null;

function getDynamics365MsalConfig(): Configuration | null {
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

function getDynamics365MsalClient(): ConfidentialClientApplication | null {
  if (dynamics365MsalClient) return dynamics365MsalClient;
  const config = getDynamics365MsalConfig();
  if (!config) return null;
  dynamics365MsalClient = new ConfidentialClientApplication(config);
  return dynamics365MsalClient;
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getDynamics365RedirectUri(req: Request): string {
  const protocol = req.protocol || "https";
  const host = req.get("host") || "localhost:5000";
  return `${protocol}://${host}/api/dynamics365/callback`;
}

function getDynamics365Scopes(environmentUrl: string): string[] {
  const baseUrl = environmentUrl.replace(/\/$/, "");
  return [
    `${baseUrl}/.default`,
    "offline_access",
  ];
}

async function refreshDynamics365Token(organizationId: number, environmentUrl: string): Promise<{ accessToken: string; expiresOn: Date | null } | null> {
  const client = getDynamics365MsalClient();
  const integration = await getOrgIntegration(organizationId, "dynamics365");
  const refreshToken = integration?.refreshToken;
  
  if (!client || !environmentUrl || !refreshToken) {
    return null;
  }
  
  try {
    const scopes = getDynamics365Scopes(environmentUrl);
    const response = await client.acquireTokenByRefreshToken({
      refreshToken,
      scopes,
    });
    
    if (response && response.accessToken) {
      await upsertOrgIntegration(organizationId, "dynamics365", {
        accessToken: response.accessToken,
        refreshToken: (response as any).refreshToken || refreshToken,
        tokenExpiry: response.expiresOn || null,
        connectionStatus: "connected",
      });
      return { accessToken: response.accessToken, expiresOn: response.expiresOn || null };
    }
    return null;
  } catch (error) {
    console.error("Failed to refresh Dynamics 365 token:", error);
    await upsertOrgIntegration(organizationId, "dynamics365", {
      connectionStatus: "error",
    });
    return null;
  }
}

async function getValidDynamics365Token(organizationId: number): Promise<{ token: string; environmentUrl: string } | null> {
  const integration = await getOrgIntegration(organizationId, "dynamics365");
  if (!integration?.accessToken) return null;
  
  let additionalData: { environmentUrl?: string } = {};
  try {
    additionalData = integration.additionalData ? JSON.parse(integration.additionalData) : {};
  } catch (e) {
    console.error("Failed to parse Dynamics 365 additionalData:", e);
    return null;
  }
  const environmentUrl = additionalData.environmentUrl;
  if (!environmentUrl) return null;
  
  // Check if token is expired or about to expire (within 5 minutes)
  const isExpired = integration.tokenExpiry ? Date.now() > new Date(integration.tokenExpiry).getTime() - 5 * 60 * 1000 : true;
  
  if (isExpired && integration.refreshToken) {
    const result = await refreshDynamics365Token(organizationId, environmentUrl);
    if (result) {
      return { token: result.accessToken, environmentUrl };
    }
    return null;
  }
  
  return isExpired ? null : { token: integration.accessToken, environmentUrl };
}

async function fetchDynamics365(url: string, token: string) {
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

function mapInvoiceStatus(statecode: number, statuscode: number): string {
  if (statecode === 2) return "Cancelled";
  if (statecode === 3) return "Paid";
  switch (statuscode) {
    case 1: return "New";
    case 2: return "Partially Shipped";
    case 4: return "Billed";
    case 5: return "Booked";
    case 6: return "Installed";
    case 100001: return "Complete";
    case 100002: return "Partial";
    case 100003: return "Cancelled";
    default: return "Draft";
  }
}

export async function setupDynamics365Routes(app: Express) {
  app.get("/api/dynamics365/status", async (req, res) => {
    const isConfigured = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    const organizationId = parseInt(req.query.organizationId as string);
    
    if (!organizationId) {
      return res.json({ configured: isConfigured, connected: false, environmentUrl: null });
    }
    
    // Auth check: verify user has access to this organization
    const userId = getUserIdFromRequest(req);
    if (!await userHasOrgAccess(userId, organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const integration = await getOrgIntegration(organizationId, "dynamics365");
    const hasToken = !!integration?.accessToken;
    const isExpired = integration?.tokenExpiry ? Date.now() > new Date(integration.tokenExpiry).getTime() : true;
    let additionalData: { environmentUrl?: string } = {};
    try {
      additionalData = integration?.additionalData ? JSON.parse(integration.additionalData) : {};
    } catch (e) {
      console.error("Failed to parse Dynamics 365 additionalData:", e);
    }
    const environmentUrl = additionalData.environmentUrl || null;
    const connectionStatus = integration?.connectionStatus || null;
    
    res.json({ 
      configured: isConfigured, 
      connected: hasToken && !isExpired && connectionStatus !== "error",
      environmentUrl,
      needsRefresh: hasToken && isExpired && !!integration?.refreshToken,
      connectionStatus
    });
  });

  app.post("/api/dynamics365/set-environment", async (req, res) => {
    const { environmentUrl, organizationId } = req.body;
    
    if (!environmentUrl) {
      return res.status(400).json({ message: "Environment URL is required" });
    }
    
    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }
    
    // Auth check: verify user has access to this organization
    const userId = getUserIdFromRequest(req);
    if (!await userHasOrgAccess(userId, organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const urlPattern = /^https:\/\/[\w-]+\.crm[\d]*\.dynamics\.com\/?$/i;
    if (!urlPattern.test(environmentUrl)) {
      return res.status(400).json({ 
        message: "Invalid Dynamics 365 URL. Expected format: https://yourorg.crm.dynamics.com" 
      });
    }

    const cleanUrl = environmentUrl.replace(/\/$/, "");
    
    // Store environment URL temporarily in session for the OAuth flow
    req.session.dynamics365EnvironmentUrl = cleanUrl;
    req.session.dynamics365OrgId = organizationId;
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ success: true, environmentUrl: cleanUrl });
  });

  app.post("/api/dynamics365/connect", async (req, res) => {
    const client = getDynamics365MsalClient();
    if (!client) {
      return res.status(503).json({ 
        message: "Microsoft authentication is not configured. Please add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET." 
      });
    }

    const organizationId = req.body.organizationId ? Number(req.body.organizationId) : req.session.dynamics365OrgId;
    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }
    
    // Auth check: verify user has access to this organization
    const userId = getUserIdFromRequest(req);
    if (!await userHasOrgAccess(userId, organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const environmentUrl = req.session.dynamics365EnvironmentUrl;
    if (!environmentUrl) {
      return res.status(400).json({
        message: "Dynamics 365 environment URL not set. Please configure your environment first."
      });
    }

    const { returnUrl } = req.body;
    if (returnUrl && typeof returnUrl === 'string' && returnUrl.startsWith('/')) {
      req.session.dynamics365ReturnUrl = returnUrl;
    }
    
    req.session.dynamics365OrgId = organizationId;

    const state = generateSecureToken();
    req.session.dynamics365OAuthState = state;
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const redirectUri = getDynamics365RedirectUri(req);
    const scopes = getDynamics365Scopes(environmentUrl);
    
    const authCodeUrlParameters = {
      scopes,
      redirectUri,
      state,
    };

    try {
      const authUrl = await client.getAuthCodeUrl(authCodeUrlParameters);
      console.log("Dynamics 365 auth URL generated successfully:", authUrl.substring(0, 100) + "...");
      const responseBody = { authUrl };
      console.log("Sending response:", JSON.stringify(responseBody).substring(0, 200));
      res.setHeader('Content-Type', 'application/json');
      res.json(responseBody);
    } catch (error) {
      console.error("Dynamics 365 auth URL error:", error);
      res.status(500).json({ message: "Failed to initiate Dynamics 365 connection" });
    }
  });

  app.get("/api/dynamics365/callback", async (req, res) => {
    const { code, error, error_description, state } = req.query;

    const returnUrl = req.session.dynamics365ReturnUrl || "/integrations";
    const organizationId = req.session.dynamics365OrgId;
    const environmentUrl = req.session.dynamics365EnvironmentUrl;

    if (error) {
      console.error("Dynamics 365 OAuth error:", error, error_description);
      delete req.session.dynamics365ReturnUrl;
      delete req.session.dynamics365OrgId;
      delete req.session.dynamics365EnvironmentUrl;
      return res.redirect(`${returnUrl}?error=${encodeURIComponent(String(error_description || error))}`);
    }

    const savedState = req.session.dynamics365OAuthState;
    delete req.session.dynamics365OAuthState;

    if (!state || state !== savedState) {
      console.error("CSRF state mismatch");
      delete req.session.dynamics365ReturnUrl;
      return res.redirect(`${returnUrl}?error=Security validation failed`);
    }

    if (!code || typeof code !== "string") {
      delete req.session.dynamics365ReturnUrl;
      return res.redirect(`${returnUrl}?error=No authorization code received`);
    }

    const client = getDynamics365MsalClient();
    if (!client) {
      delete req.session.dynamics365ReturnUrl;
      return res.redirect(`${returnUrl}?error=Configuration error`);
    }

    if (!environmentUrl) {
      delete req.session.dynamics365ReturnUrl;
      return res.redirect(`${returnUrl}?error=Environment URL not configured`);
    }

    if (!organizationId) {
      delete req.session.dynamics365ReturnUrl;
      return res.redirect(`${returnUrl}?error=Organization not specified`);
    }

    try {
      const redirectUri = getDynamics365RedirectUri(req);
      const scopes = getDynamics365Scopes(environmentUrl);
      
      const tokenRequest: AuthorizationCodeRequest = {
        code,
        scopes,
        redirectUri,
      };

      const response = await client.acquireTokenByCode(tokenRequest);
      
      if (!response || !response.accessToken) {
        throw new Error("No access token received");
      }

      // Store tokens in organization-scoped integration
      const userId = (req.session as any)?.passport?.user?.id || (req.session as any).userId;
      await upsertOrgIntegration(organizationId, "dynamics365", {
        accessToken: response.accessToken,
        refreshToken: (response as any).refreshToken || null,
        tokenExpiry: response.expiresOn || null,
        connectionStatus: "connected",
        connectedBy: userId,
        connectedAt: new Date(),
        additionalData: JSON.stringify({ environmentUrl }),
      });
      
      const finalReturnUrl = req.session.dynamics365ReturnUrl;
      delete req.session.dynamics365ReturnUrl;
      delete req.session.dynamics365OrgId;
      delete req.session.dynamics365EnvironmentUrl;
      
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      if (finalReturnUrl && finalReturnUrl.startsWith('/')) {
        res.redirect(`${finalReturnUrl}?dynamics365Connected=true`);
      } else {
        res.redirect("/integrations?dynamics365Connected=true");
      }
    } catch (error) {
      console.error("Dynamics 365 token error:", error);
      const finalReturnUrl = req.session.dynamics365ReturnUrl;
      delete req.session.dynamics365ReturnUrl;
      delete req.session.dynamics365OrgId;
      delete req.session.dynamics365EnvironmentUrl;
      if (finalReturnUrl && finalReturnUrl.startsWith('/')) {
        res.redirect(`${finalReturnUrl}?error=Failed to complete Dynamics 365 authentication`);
      } else {
        res.redirect("/integrations?error=Failed to complete Dynamics 365 authentication");
      }
    }
  });

  app.post("/api/dynamics365/disconnect", async (req, res) => {
    const organizationId = req.body.organizationId ? Number(req.body.organizationId) : null;
    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }
    
    // Auth check: verify user has access to this organization
    const userId = getUserIdFromRequest(req);
    if (!await userHasOrgAccess(userId, organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    await upsertOrgIntegration(organizationId, "dynamics365", {
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null,
      connectionStatus: "disconnected",
    });
    res.json({ success: true });
  });

  app.post("/api/dynamics365/refresh", async (req, res) => {
    const organizationId = req.body.organizationId ? Number(req.body.organizationId) : null;
    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }
    
    // Auth check: verify user has access to this organization
    const userId = getUserIdFromRequest(req);
    if (!await userHasOrgAccess(userId, organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const integration = await getOrgIntegration(organizationId, "dynamics365");
    let additionalData: { environmentUrl?: string } = {};
    try {
      additionalData = integration?.additionalData ? JSON.parse(integration.additionalData) : {};
    } catch (e) {
      console.error("Failed to parse Dynamics 365 additionalData:", e);
      return res.status(500).json({ message: "Invalid integration configuration" });
    }
    const environmentUrl = additionalData.environmentUrl;
    
    if (!environmentUrl) {
      return res.status(400).json({ message: "Environment URL not configured" });
    }
    
    const result = await refreshDynamics365Token(organizationId, environmentUrl);
    if (!result) {
      return res.status(401).json({ message: "Failed to refresh token. Please reconnect." });
    }
    res.json({ success: true });
  });

  app.get("/api/dynamics365/invoices", async (req, res) => {
    const organizationId = parseInt(req.query.organizationId as string);
    const { search, status, top = "50" } = req.query;

    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }
    
    // Auth check: verify user has access to this organization
    const userId = getUserIdFromRequest(req);
    if (!await userHasOrgAccess(userId, organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const tokenResult = await getValidDynamics365Token(organizationId);
    if (!tokenResult) {
      return res.status(401).json({ message: "Not connected to Dynamics 365. Please reconnect." });
    }
    
    const { token, environmentUrl } = tokenResult;

    try {
      let filter = "";
      const filters: string[] = [];
      
      if (search && typeof search === "string") {
        filters.push(`(contains(invoicenumber,'${search}') or contains(name,'${search}'))`);
      }
      
      if (status && typeof status === "string") {
        switch (status.toLowerCase()) {
          case "paid":
            filters.push("statecode eq 3");
            break;
          case "cancelled":
            filters.push("statecode eq 2");
            break;
          case "active":
            filters.push("statecode eq 0");
            break;
        }
      }

      if (filters.length > 0) {
        filter = `&$filter=${filters.join(" and ")}`;
      }

      const apiUrl = `${environmentUrl}/api/data/v9.2/invoices?$select=invoiceid,invoicenumber,name,description,totalamount,totaltax,totallineitemamount,transactioncurrencyid,statecode,statuscode,createdon,modifiedon,duedate,datedelivered,_customerid_value,billto_name,billto_line1,billto_city,billto_stateorprovince,billto_postalcode,billto_country&$orderby=createdon desc&$top=${top}${filter}`;
      
      const response = await fetchDynamics365(apiUrl, token);

      if (!response.ok) {
        if (response.status === 401) {
          await upsertOrgIntegration(organizationId, "dynamics365", { connectionStatus: "expired" });
          return res.status(401).json({ message: "Session expired. Please reconnect to Dynamics 365." });
        }
        if (response.status === 403) {
          return res.status(403).json({ 
            message: "Access denied. Ensure your Azure AD app has Dynamics CRM permissions and the user has access to invoices." 
          });
        }
        const errorText = await response.text();
        console.error("Dynamics 365 API error:", response.status, errorText);
        throw new Error(`API error: ${response.status}`);
      }

      const data: Dynamics365InvoiceResponse = await response.json();
      const invoices = data.value || [];
      
      res.json({ 
        invoices: invoices.map((inv) => ({
          id: inv.invoiceid,
          invoiceNumber: inv.invoicenumber || "",
          name: inv.name || "",
          description: inv.description || "",
          amount: inv.totalamount || 0,
          tax: inv.totaltax || 0,
          lineItemAmount: inv.totallineitemamount || 0,
          status: mapInvoiceStatus(inv.statecode, inv.statuscode),
          createdOn: inv.createdon,
          modifiedOn: inv.modifiedon,
          dueDate: inv.duedate || null,
          deliveredDate: inv.datedelivered || null,
          customerId: inv._customerid_value || null,
          customerName: inv.billto_name || "",
          customerAddress: inv.billto_line1 ? 
            `${inv.billto_line1}${inv.billto_city ? `, ${inv.billto_city}` : ""}${inv.billto_stateorprovince ? `, ${inv.billto_stateorprovince}` : ""}${inv.billto_postalcode ? ` ${inv.billto_postalcode}` : ""}${inv.billto_country ? `, ${inv.billto_country}` : ""}` 
            : "",
        }))
      });
    } catch (error) {
      console.error("Error fetching Dynamics 365 invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices from Dynamics 365" });
    }
  });

  app.get("/api/dynamics365/invoices/:invoiceId", async (req, res) => {
    const organizationId = parseInt(req.query.organizationId as string);
    const { invoiceId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }
    
    // Auth check: verify user has access to this organization
    const userId = getUserIdFromRequest(req);
    if (!await userHasOrgAccess(userId, organizationId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const tokenResult = await getValidDynamics365Token(organizationId);
    if (!tokenResult) {
      return res.status(401).json({ message: "Not connected to Dynamics 365. Please reconnect." });
    }
    
    const { token, environmentUrl } = tokenResult;

    try {
      const apiUrl = `${environmentUrl}/api/data/v9.2/invoices(${invoiceId})?$select=invoiceid,invoicenumber,name,description,totalamount,totaltax,totallineitemamount,transactioncurrencyid,statecode,statuscode,createdon,modifiedon,duedate,datedelivered,_customerid_value,billto_name,billto_line1,billto_city,billto_stateorprovince,billto_postalcode,billto_country`;
      
      const response = await fetchDynamics365(apiUrl, token);

      if (!response.ok) {
        if (response.status === 401) {
          await upsertOrgIntegration(organizationId, "dynamics365", { connectionStatus: "expired" });
          return res.status(401).json({ message: "Session expired. Please reconnect." });
        }
        if (response.status === 404) {
          return res.status(404).json({ message: "Invoice not found" });
        }
        throw new Error(`API error: ${response.status}`);
      }

      const inv: Dynamics365Invoice = await response.json();
      
      res.json({ 
        invoice: {
          id: inv.invoiceid,
          invoiceNumber: inv.invoicenumber || "",
          name: inv.name || "",
          description: inv.description || "",
          amount: inv.totalamount || 0,
          tax: inv.totaltax || 0,
          lineItemAmount: inv.totallineitemamount || 0,
          status: mapInvoiceStatus(inv.statecode, inv.statuscode),
          createdOn: inv.createdon,
          modifiedOn: inv.modifiedon,
          dueDate: inv.duedate || null,
          deliveredDate: inv.datedelivered || null,
          customerId: inv._customerid_value || null,
          customerName: inv.billto_name || "",
          customerAddress: inv.billto_line1 ? 
            `${inv.billto_line1}${inv.billto_city ? `, ${inv.billto_city}` : ""}${inv.billto_stateorprovince ? `, ${inv.billto_stateorprovince}` : ""}${inv.billto_postalcode ? ` ${inv.billto_postalcode}` : ""}${inv.billto_country ? `, ${inv.billto_country}` : ""}` 
            : "",
        }
      });
    } catch (error) {
      console.error("Error fetching Dynamics 365 invoice:", error);
      res.status(500).json({ message: "Failed to fetch invoice details" });
    }
  });
}
