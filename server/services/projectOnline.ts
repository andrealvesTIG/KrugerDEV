import { ConfidentialClientApplication, AuthorizationCodeRequest, Configuration } from "@azure/msal-node";
import { Express, Request, Response } from "express";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    projectOnlineState?: string;
    projectOnlineToken?: string;
    projectOnlineSiteUrl?: string;
    projectOnlineTokenCache?: string;
    projectOnlineHomeAccountId?: string;
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
      // Persist the MSAL token cache + account id so we can silently refresh
      // the access token (using the cached refresh token) during long bulk
      // imports without forcing the user to reconnect.
      try {
        req.session.projectOnlineTokenCache = client.getTokenCache().serialize();
        req.session.projectOnlineHomeAccountId = response.account?.homeAccountId;
      } catch (cacheErr) {
        console.error("Project Online token cache serialize error:", cacheErr);
      }

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
    let token = req.session.projectOnlineToken;
    const siteUrl = req.session.projectOnlineSiteUrl;
    const { projectIds, organizationId, portfolioId } = req.body;
    const importMode: 'skip' | 'update' | 'duplicate' =
      req.body.importMode === 'update' || req.body.importMode === 'duplicate'
        ? req.body.importMode
        : 'skip';

    if (!token || !siteUrl) {
      return res.status(401).json({ message: "Not connected to Project Online" });
    }

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      return res.status(400).json({ message: "No projects selected" });
    }

    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }

    // Verify the caller is actually a member of the target organization before
    // doing anything else. Without this, a forged organizationId could write
    // into another tenant on top of a valid Project Online integration session.
    const { enforceMembership } = await import("./authorizationService");
    const userId =
      (req as any).user?.claims?.sub ||
      (req as any).user?.id ||
      (req as any).session?.userId ||
      (req as any).bearerAuth?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (await enforceMembership(req, res, userId, Number(organizationId))) {
      return;
    }

    // Bulk imports can run long. Disable per-request timeouts so the proxy
    // and Node don't terminate mid-batch when the user selects many projects.
    req.setTimeout(0);
    res.setTimeout(0);

    // Stream NDJSON progress events to the client so the wizard can show a
    // live progress bar instead of waiting for the entire batch to finish.
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    (res as any).flushHeaders?.();
    const send = (obj: any) => {
      try {
        res.write(JSON.stringify(obj) + "\n");
        (res as any).flush?.();
      } catch {
        /* client may have disconnected */
      }
    };

    // Silently refresh the access token using the cached refresh token. Bulk
    // imports often run longer than the access-token lifetime, which caused
    // 401s mid-batch before this was wired in.
    const refreshAccessToken = async (): Promise<string | null> => {
      try {
        const client = getProjectOnlineMsalClient();
        if (!client || !req.session.projectOnlineHomeAccountId || !req.session.projectOnlineTokenCache) {
          return null;
        }
        const cache = client.getTokenCache();
        await cache.deserialize(req.session.projectOnlineTokenCache);
        const account = await cache.getAccountByHomeId(req.session.projectOnlineHomeAccountId);
        if (!account) return null;
        const sharePointHost = new URL(siteUrl).origin;
        const refreshed = await client.acquireTokenSilent({
          account,
          scopes: [`${sharePointHost}/.default`],
        });
        if (!refreshed?.accessToken) return null;
        req.session.projectOnlineToken = refreshed.accessToken;
        req.session.projectOnlineTokenCache = cache.serialize();
        // Persist the refreshed token so a subsequent request in the same
        // session doesn't fall back to the stale one.
        await new Promise<void>((resolve) => {
          req.session.save(() => resolve());
        });
        return refreshed.accessToken;
      } catch (err) {
        console.error('[project-online] token refresh failed:', err);
        return null;
      }
    };

    const fetchWithTimeout = async (url: string, ms = 30000): Promise<Awaited<ReturnType<typeof fetch>>> => {
      const doFetch = async (bearer: string) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ms);
        try {
          return await fetch(url, {
            headers: {
              "Authorization": `Bearer ${bearer}`,
              "Accept": "application/json;odata=verbose",
            },
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(t);
        }
      };
      let resp = await doFetch(token!);
      if (resp.status === 401) {
        const fresh = await refreshAccessToken();
        if (fresh) {
          token = fresh;
          resp = await doFetch(fresh);
        }
      }
      return resp;
    };

    try {
      const { storage } = await import("../storage");
      const importedProjects: any[] = [];
      const skippedProjects: { projectId: string; name?: string; existingId: number }[] = [];
      const updatedProjects: { projectId: string; name?: string; id: number }[] = [];
      const failedProjects: { projectId: string; name?: string; error: string }[] = [];
      const EXTERNAL_SOURCE = 'project_online';

      send({ type: "start", total: projectIds.length, importMode });

      let index = 0;
      for (const projectId of projectIds) {
        index += 1;
        send({ type: "progress", current: index, total: projectIds.length, projectId });
        // Wrap each project so one failure can't abort the whole batch.
        try {
          // Look up an existing import of this Project Online project so we can
          // honour the user's chosen importMode (skip / update / duplicate).
          const existing = await storage.getProjectByExternalId(organizationId, EXTERNAL_SOURCE, String(projectId));

          if (existing && importMode === 'skip') {
            skippedProjects.push({ projectId, name: existing.name, existingId: existing.id });
            send({
              type: 'project-skipped',
              current: index,
              total: projectIds.length,
              projectId,
              id: existing.id,
              name: existing.name,
            });
            continue;
          }

          const projectUrl = `${siteUrl}/_api/ProjectServer/Projects('${projectId}')`;
          let projectResponse: Awaited<ReturnType<typeof fetch>>;
          try {
            projectResponse = await fetchWithTimeout(projectUrl);
          } catch (e: any) {
            failedProjects.push({ projectId, error: `Fetch failed: ${e?.message || e}` });
            continue;
          }

          if (!projectResponse.ok) {
            if (projectResponse.status === 401) {
              // Token refresh already attempted inside fetchWithTimeout — if
              // we still see 401, the session is unrecoverable. Stop the
              // batch cleanly so the user can reconnect.
              send({
                type: 'session-expired',
                current: index,
                total: projectIds.length,
                message: 'Project Online session expired. Please reconnect and re-run the import.',
              });
              delete req.session.projectOnlineToken;
              break;
            }
            failedProjects.push({ projectId, error: `Project Online responded ${projectResponse.status}` });
            send({
              type: 'project-failed',
              current: index,
              total: projectIds.length,
              projectId,
              error: `Project Online responded ${projectResponse.status}`,
            });
            continue;
          }

          const projectData = await projectResponse.json();
          const p = projectData.d;

          let newProject;
          let wasUpdated = false;
          if (existing && importMode === 'update') {
            newProject = await storage.updateProject(existing.id, {
              name: p.Name,
              description: p.Description || null,
              startDate: p.StartDate ? new Date(p.StartDate).toISOString().split("T")[0] : null,
              endDate: p.FinishDate ? new Date(p.FinishDate).toISOString().split("T")[0] : null,
              completionPercentage: Math.round(p.PercentComplete || 0),
            } as any);
            wasUpdated = true;
          } else {
            newProject = await storage.createProject({
              organizationId,
              portfolioId: portfolioId || null,
              name: p.Name,
              description: p.Description || null,
              status: "Execution",
              priority: "Medium",
              health: "Green",
              startDate: p.StartDate ? new Date(p.StartDate).toISOString().split("T")[0] : null,
              endDate: p.FinishDate ? new Date(p.FinishDate).toISOString().split("T")[0] : null,
              budget: 0,
              completionPercentage: Math.round(p.PercentComplete || 0),
              source: "imported",
              // In `duplicate` mode we deliberately omit externalId so future
              // `skip` / `update` runs aren't ambiguous about which copy to
              // target. Only mark the canonical first import with the
              // external link.
              externalSource: importMode === 'duplicate' ? null : EXTERNAL_SOURCE,
              externalId: importMode === 'duplicate' ? null : String(projectId),
            } as any);
          }

          await storage.createProjectChangeLog({
            projectId: newProject.id,
            changedBy: null,
            changedByName: 'System',
            changeType: wasUpdated ? 'updated' : 'created',
            changeSummary: wasUpdated
              ? `Project "${newProject.name}" updated by System — re-imported from Microsoft Project Online`
              : `Project "${newProject.name}" created by System — imported from Microsoft Project Online`,
            previousValues: null,
            newValues: null,
          });

          // On update, wipe the previous tasks/milestones so the re-import
          // doesn't pile up duplicates underneath the project.
          if (wasUpdated) {
            // If we can't clear the previous children, abort this project so
            // the user doesn't end up with both stale and re-imported rows.
            const existingTasks = await storage.getTasks(newProject.id);
            for (const t of existingTasks) {
              await storage.deleteTask(t.id);
            }
            const existingMilestones = await storage.getMilestones(newProject.id);
            for (const m of existingMilestones) {
              await storage.deleteMilestone(m.id);
            }
          }

          // Tasks are best-effort — if they fail we still count the project as imported.
          try {
            const tasksUrl = `${siteUrl}/_api/ProjectServer/Projects('${projectId}')/Tasks`;
            const tasksResponse = await fetchWithTimeout(tasksUrl, 60000);

            if (tasksResponse.ok) {
              const tasksData = await tasksResponse.json();
              const tasks = tasksData.d?.results || [];

              for (const task of tasks) {
                try {
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
                } catch (taskErr) {
                  console.error(`[project-online] failed to import task for project ${projectId}:`, taskErr);
                }
              }
            }
          } catch (tasksErr) {
            console.error(`[project-online] failed to fetch tasks for project ${projectId}:`, tasksErr);
          }

          if (wasUpdated) {
            updatedProjects.push({ projectId, name: newProject.name, id: newProject.id });
          } else {
            importedProjects.push({ id: newProject.id, name: newProject.name });
          }
          send({
            type: wasUpdated ? "project-updated" : "project-done",
            current: index,
            total: projectIds.length,
            projectId,
            id: newProject.id,
            name: newProject.name,
          });
        } catch (projErr: any) {
          console.error(`[project-online] failed to import project ${projectId}:`, projErr);
          const errMsg = projErr?.message || String(projErr);
          failedProjects.push({ projectId, error: errMsg });
          send({
            type: "project-failed",
            current: index,
            total: projectIds.length,
            projectId,
            error: errMsg,
          });
        }
      }

      send({
        type: "done",
        success: true,
        imported: importedProjects.length,
        updated: updatedProjects.length,
        skipped: skippedProjects.length,
        failed: failedProjects.length,
        projects: importedProjects,
        updatedProjects,
        skippedProjects,
        failures: failedProjects,
        importMode,
      });
      res.end();
    } catch (error: any) {
      console.error("Error importing projects:", error);
      send({ type: "error", message: error?.message || "Failed to import projects" });
      res.end();
    }
  });
}
