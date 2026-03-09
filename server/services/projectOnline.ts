import { ConfidentialClientApplication, AuthorizationCodeRequest, Configuration } from "@azure/msal-node";
import { Express, Request, Response } from "express";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    projectOnlineState?: string;
    projectOnlineToken?: string;
    projectOnlineSiteUrl?: string;
  }
}

interface ProjectOnlineProject {
  Id: string;
  Name: string;
  Description: string;
  StartDate: string;
  FinishDate: string;
  PercentComplete: number;
  ProjectType: number;
  IsCheckedOut: boolean;
}

interface ProjectOnlineTask {
  Id: string;
  Name: string;
  Start: string;
  Finish: string;
  PercentComplete: number;
  Duration: string;
  OutlineLevel: number;
  IsSummary: boolean;
  IsMilestone: boolean;
  ParentId: string | null;
}

let projectOnlineMsalClient: ConfidentialClientApplication | null = null;

function getProjectOnlineMsalConfig(): Configuration | null {
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

function getProjectOnlineMsalClient(): ConfidentialClientApplication | null {
  if (projectOnlineMsalClient) return projectOnlineMsalClient;
  const config = getProjectOnlineMsalConfig();
  if (!config) return null;
  projectOnlineMsalClient = new ConfidentialClientApplication(config);
  return projectOnlineMsalClient;
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getProjectOnlineRedirectUri(req: Request): string {
  const protocol = req.protocol || "https";
  const host = req.get("host") || "localhost:5000";
  return `${protocol}://${host}/api/project-online/callback`;
}

export async function setupProjectOnlineRoutes(app: Express) {
  app.get("/api/project-online/status", (req, res) => {
    const isConfigured = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
    const hasToken = !!req.session.projectOnlineToken;
    const siteUrl = req.session.projectOnlineSiteUrl || null;
    res.json({ configured: isConfigured, connected: hasToken, siteUrl });
  });

  app.post("/api/project-online/connect", async (req, res) => {
    const { siteUrl } = req.body;
    
    if (!siteUrl) {
      return res.status(400).json({ message: "Project Online site URL is required" });
    }

    const client = getProjectOnlineMsalClient();
    if (!client) {
      return res.status(503).json({ 
        message: "Microsoft authentication is not configured. Please add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET." 
      });
    }

    const state = generateSecureToken();
    req.session.projectOnlineState = state;
    req.session.projectOnlineSiteUrl = siteUrl;
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const redirectUri = getProjectOnlineRedirectUri(req);
    const sharePointHost = new URL(siteUrl).origin;
    
    const authCodeUrlParameters = {
      scopes: [
        `${sharePointHost}/.default`
      ],
      redirectUri,
      prompt: "consent" as const,
      state,
    };

    try {
      const authUrl = await client.getAuthCodeUrl(authCodeUrlParameters);
      res.json({ authUrl });
    } catch (error) {
      console.error("Project Online auth URL error:", error);
      res.status(500).json({ message: "Failed to initiate Project Online connection" });
    }
  });

  app.get("/api/project-online/callback", async (req, res) => {
    const { code, error, error_description, state } = req.query;

    if (error) {
      console.error("Project Online OAuth error:", error, error_description);
      return res.redirect(`/org-settings?tab=integrations&error=${encodeURIComponent(String(error_description || error))}`);
    }

    const savedState = req.session.projectOnlineState;
    const siteUrl = req.session.projectOnlineSiteUrl;
    
    delete req.session.projectOnlineState;

    if (!state || state !== savedState) {
      console.error("CSRF state mismatch");
      return res.redirect("/org-settings?tab=integrations&error=Security validation failed");
    }

    if (!code || typeof code !== "string") {
      return res.redirect("/org-settings?tab=integrations&error=No authorization code received");
    }

    const client = getProjectOnlineMsalClient();
    if (!client || !siteUrl) {
      return res.redirect("/org-settings?tab=integrations&error=Configuration error");
    }

    try {
      const redirectUri = getProjectOnlineRedirectUri(req);
      const sharePointHost = new URL(siteUrl).origin;
      
      const tokenRequest: AuthorizationCodeRequest = {
        code,
        scopes: [`${sharePointHost}/.default`],
        redirectUri,
      };

      const response = await client.acquireTokenByCode(tokenRequest);
      
      if (!response || !response.accessToken) {
        throw new Error("No access token received");
      }

      req.session.projectOnlineToken = response.accessToken;
      
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.redirect("/org-settings?tab=integrations&success=connected");
    } catch (error) {
      console.error("Project Online token error:", error);
      res.redirect("/org-settings?tab=integrations&error=Failed to complete authentication");
    }
  });

  app.post("/api/project-online/disconnect", (req, res) => {
    delete req.session.projectOnlineToken;
    delete req.session.projectOnlineSiteUrl;
    res.json({ success: true });
  });

  app.get("/api/project-online/projects", async (req, res) => {
    const token = req.session.projectOnlineToken;
    const siteUrl = req.session.projectOnlineSiteUrl;

    if (!token || !siteUrl) {
      return res.status(401).json({ message: "Not connected to Project Online" });
    }

    try {
      const apiUrl = `${siteUrl}/_api/ProjectServer/Projects`;
      const response = await fetch(apiUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json;odata=verbose",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          delete req.session.projectOnlineToken;
          return res.status(401).json({ message: "Session expired. Please reconnect." });
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const projects = data.d?.results || [];
      
      res.json({ 
        projects: projects.map((p: any) => ({
          id: p.Id,
          name: p.Name,
          description: p.Description || "",
          startDate: p.StartDate,
          finishDate: p.FinishDate,
          percentComplete: p.PercentComplete || 0,
        }))
      });
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects from Project Online" });
    }
  });

  app.get("/api/project-online/projects/:projectId/tasks", async (req, res) => {
    const token = req.session.projectOnlineToken;
    const siteUrl = req.session.projectOnlineSiteUrl;
    const { projectId } = req.params;

    if (!token || !siteUrl) {
      return res.status(401).json({ message: "Not connected to Project Online" });
    }

    try {
      const apiUrl = `${siteUrl}/_api/ProjectServer/Projects('${projectId}')/Tasks`;
      const response = await fetch(apiUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json;odata=verbose",
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const tasks = data.d?.results || [];
      
      res.json({ 
        tasks: tasks.map((t: any) => ({
          id: t.Id,
          name: t.Name,
          start: t.Start,
          finish: t.Finish,
          percentComplete: t.PercentComplete || 0,
          duration: t.Duration,
          outlineLevel: t.OutlineLevel || 1,
          isSummary: t.IsSummary || false,
          isMilestone: t.IsMilestone || false,
        }))
      });
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  app.post("/api/project-online/import", async (req, res) => {
    const token = req.session.projectOnlineToken;
    const siteUrl = req.session.projectOnlineSiteUrl;
    const { projectIds, organizationId, portfolioId } = req.body;

    if (!token || !siteUrl) {
      return res.status(401).json({ message: "Not connected to Project Online" });
    }

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ message: "No projects selected" });
    }

    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }

    try {
      const { storage } = await import("../storage");
      const importedProjects: any[] = [];

      for (const projectId of projectIds) {
        const projectUrl = `${siteUrl}/_api/ProjectServer/Projects('${projectId}')`;
        const projectResponse = await fetch(projectUrl, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json;odata=verbose",
          },
        });

        if (!projectResponse.ok) continue;
        
        const projectData = await projectResponse.json();
        const p = projectData.d;

        const newProject = await storage.createProject({
          organizationId,
          portfolioId: portfolioId || null,
          name: p.Name,
          description: p.Description || null,
          status: "Execution",
          priority: "Medium",
          health: "Green",
          startDate: p.StartDate ? new Date(p.StartDate).toISOString().split("T")[0] : null,
          endDate: p.FinishDate ? new Date(p.FinishDate).toISOString().split("T")[0] : null,
          budget: "0",
          completionPercentage: Math.round(p.PercentComplete || 0),
          source: "imported",
        });

        await storage.createProjectChangeLog({
          projectId: newProject.id,
          changedBy: null,
          changedByName: 'System',
          changeType: 'created',
          changeSummary: `Project "${newProject.name}" created by System — imported from Microsoft Project Online`,
          previousValues: null,
          newValues: null,
        });

        const tasksUrl = `${siteUrl}/_api/ProjectServer/Projects('${projectId}')/Tasks`;
        const tasksResponse = await fetch(tasksUrl, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json;odata=verbose",
          },
        });

        if (tasksResponse.ok) {
          const tasksData = await tasksResponse.json();
          const tasks = tasksData.d?.results || [];

          for (const task of tasks) {
            if (task.IsSummary) continue;
            
            const taskName = task.Name || task.Title || `Task ${task.Id || 'Unknown'}`;
            if (!taskName) continue;

            if (task.IsMilestone) {
              const milestoneDueDate = task.Finish ? new Date(task.Finish).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
              await storage.createMilestone({
                projectId: newProject.id,
                title: taskName,
                dueDate: milestoneDueDate,
                status: task.PercentComplete >= 100 ? "Completed" : "Pending",
              });
            } else {
              const today = new Date().toISOString().split("T")[0];
              const taskData: any = {
                projectId: newProject.id,
                name: taskName,
                description: null,
                status: task.PercentComplete >= 100 ? "Completed" : task.PercentComplete > 0 ? "In Progress" : "Not Started",
                progress: Math.round(task.PercentComplete || 0),
                startDate: task.Start ? new Date(task.Start).toISOString().split("T")[0] : today,
                endDate: task.Finish ? new Date(task.Finish).toISOString().split("T")[0] : today,
              };
              await storage.createTask(taskData);
            }
          }
        }

        importedProjects.push({
          id: newProject.id,
          name: newProject.name,
        });
      }

      res.json({ 
        success: true, 
        imported: importedProjects.length,
        projects: importedProjects,
      });
    } catch (error) {
      console.error("Error importing projects:", error);
      res.status(500).json({ message: "Failed to import projects" });
    }
  });
}
