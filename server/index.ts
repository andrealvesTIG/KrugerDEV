import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { setupSwagger } from "./swagger";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";
import { db } from "./db";
import { sql } from "drizzle-orm";
import cron from "node-cron";
import { checkAndSendDueReports } from "./services/scheduledReports";
import { runScheduledReminders } from "./services/timesheetReminderEngine";
import { checkAndRunDueAgentActions } from "./services/projectAgentService";
import { checkAndRunDueCustomScheduledAgents } from "./services/customAgentService";
import { checkDueDateNotifications } from "./services/dueDateNotifications";
import { cleanupDuplicateBillingCycles } from "./services/billing";
import { backfillFinancialEntries } from "./migrations/backfillFinancialEntries";
import { migrateMonthToCalendar } from "./migrations/migrateMonthToCalendar";

process.on('uncaughtException', (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Converting circular structure to JSON') || msg.includes('pg-pool')) {
    console.error('[process] Database pool connection error (recovered):', msg);
  } else {
    console.error('[process] Uncaught exception:', msg);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes('Converting circular structure to JSON') || msg.includes('pg-pool')) {
    console.error('[process] Database pool rejection (recovered):', msg);
  } else {
    console.error('[process] Unhandled rejection:', msg);
  }
});

const app = express();

// Cookie parser middleware (for OAuth state fallback)
app.use(cookieParser());

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  hsts: process.env.NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

const httpServer = createServer(app);

// Serve static files from public directory (avatars, logos, etc.)
app.use('/avatars', express.static(path.join(process.cwd(), 'public', 'avatars')));
app.use('/logos', express.static(path.join(process.cwd(), 'public', 'logos')));
// Serve videos from client/public/videos (large files not bundled by Vite)
app.use('/videos', express.static(path.join(process.cwd(), 'client', 'public', 'videos')));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Allow embedding in Microsoft Teams iframes
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.microsoft.com https://*.office.com https://*.office365.com https://*.sharepoint.com https://*.officeapps.live.com https://teams.live.com https://*.skype.com"
  );
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// API Request logging middleware for monitoring
async function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId: string | null,
  organizationId: number | null,
  userAgent: string | undefined,
  ipAddress: string | undefined,
  errorMessage: string | null
) {
  try {
    if (path.startsWith('/api/admin/monitoring')) {
      return;
    }
    
    const safeUserAgent = userAgent ?? null;
    const safeIpAddress = ipAddress ?? null;
    const safeUserId = userId ?? null;
    const safeOrgId = organizationId ?? null;
    const safeError = errorMessage ?? null;
    
    await db.execute(sql`
      INSERT INTO api_request_logs (method, path, status_code, duration, user_id, organization_id, user_agent, ip_address, error_message)
      VALUES (${method}, ${path}, ${statusCode}, ${duration}, ${safeUserId}, ${safeOrgId}, ${safeUserAgent}, ${safeIpAddress}, ${safeError})
    `);
  } catch (err) {
    console.error('Failed to log API request:', err);
  }
}

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;

      log(logLine);

      // Log to database for monitoring (async, non-blocking)
      const userId = (req as any).session?.userId || (req as any).user?.claims?.sub || (req as any).userId || (req as any).user?.id || null;
      const organizationId = (req as any).organizationId || null;
      const userAgent = req.get('user-agent');
      const ipAddress = req.ip || req.socket?.remoteAddress;
      const errorMessage = res.statusCode >= 400 ? capturedJsonResponse?.message || null : null;
      
      logApiRequest(
        req.method,
        reqPath,
        res.statusCode,
        duration,
        userId,
        organizationId,
        userAgent,
        ipAddress,
        errorMessage
      );
    }
  });

  next();
});

(async () => {
  registerObjectStorageRoutes(app);
  await registerRoutes(httpServer, app);
  setupSwagger(app);

  // Boot-time seed: ensure every existing organization has at least one
  // intake workflow and one project workflow (adopting any legacy steps).
  (async () => {
    try {
      const { storage } = await import("./storage");
      const orgs = await storage.getOrganizations();
      let seeded = 0;
      for (const org of orgs) {
        try {
          await storage.ensureDefaultIntakeWorkflow(org.id);
          await storage.ensureDefaultProjectWorkflow(org.id);
          seeded++;
        } catch (e) {
          console.error(`[seed] Failed for org ${org.id}:`, e);
        }
      }
      if (seeded > 0) console.log(`[seed] Ensured default workflows for ${seeded} organization(s)`);
    } catch (e) {
      console.error("[seed] Workflow seed failed:", e);
    }
  })();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Server-side OG tag injection for /friday route (social media previews)
  const { getGifUrlFromQuery, injectFridayOgTags } = await import("./friday-og");
  app.get("/friday", async (req, res, next) => {
    try {
      const gifParam = req.query.gif as string | undefined;
      const gifUrl = getGifUrlFromQuery(gifParam ?? null);

      if (process.env.NODE_ENV === "production") {
        const distPath = path.resolve(__dirname, "public");
        const fs = await import("fs");
        let html = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
        html = injectFridayOgTags(html, gifUrl);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } else {
        const fs = await import("fs");
        const clientTemplate = path.resolve(process.cwd(), "client", "index.html");
        let html = await fs.promises.readFile(clientTemplate, "utf-8");
        html = injectFridayOgTags(html, gifUrl);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      }
    } catch (e) {
      next(e);
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      // Migrations run in a strict order:
      //   1) Rewrite legacy FY-relative `financial_entries` rows into
      //      calendar-anchored (year, month). Marker-guarded; runs once.
      //   2) Backfill any legacy `cost_items` rows that haven't been
      //      normalized yet — also calendar-anchored from day one.
      // Step 1 must come first so step 2's idempotency check (36 cells per
      // item) keeps working in either order across deploys.
      migrateMonthToCalendar()
        .then(({ alreadyApplied, rowsRewritten }) => {
          if (!alreadyApplied) {
            log(`Financial entries calendar migration: rewrote ${rowsRewritten} rows`, "migration");
          }
          return backfillFinancialEntries();
        })
        .then(({ migrated, skipped }) => {
          if (migrated > 0 || skipped > 0) {
            log(`Financial entries backfill: ${migrated} migrated, ${skipped} already migrated`, "migration");
          }
        })
        .catch(err => console.error("[migration] Failed financial-entries migration:", err));

      // Cron jobs only run in production by default. Set ENABLE_CRON=true to
      // enable them in development for manual testing.
      const cronEnabled = process.env.NODE_ENV === "production" || process.env.ENABLE_CRON === "true";

      if (cronEnabled) {
        // Schedule report check every 15 minutes
        cron.schedule('*/15 * * * *', async () => {
          try {
            const sentCount = await checkAndSendDueReports();
            if (sentCount > 0) {
              log(`Sent ${sentCount} scheduled reports`, "cron");
            }
          } catch (error) {
            console.error("Error in scheduled reports cron job:", error);
          }
        });
        log("Scheduled reports cron job started (every 15 minutes)", "cron");

        cleanupDuplicateBillingCycles().then(count => {
          if (count > 0) log(`Cleaned up ${count} duplicate billing cycle(s)`, "billing");
        }).catch(err => {
          console.error("[billing] Failed to cleanup duplicate cycles:", err);
        });

        cron.schedule('*/15 * * * 1-5', async () => {
          try {
            const result = await runScheduledReminders();
            const total = result.submissionReminders + result.approvalReminders + result.escalations + result.digestsSent;
            if (total > 0) {
              log(`Timesheet reminders: ${result.submissionReminders} submission, ${result.approvalReminders} approval, ${result.escalations} escalations, ${result.digestsSent} digests`, "cron");
            }
            if (result.errors.length > 0) {
              console.error("Timesheet reminder errors:", result.errors);
            }
          } catch (error) {
            console.error("Error in timesheet reminder cron job:", error);
          }
        });
        log("Timesheet reminder cron job started (weekdays, checks every 15 min for org-scheduled times)", "cron");

        cron.schedule('*/15 * * * *', async () => {
          try {
            const count = await checkAndRunDueAgentActions();
            if (count > 0) {
              log(`AI Project Agent: executed ${count} action(s)`, "cron");
            }
          } catch (error) {
            console.error("Error in project agent cron job:", error);
          }
          try {
            const count = await checkAndRunDueCustomScheduledAgents();
            if (count > 0) {
              log(`Custom scheduled agents: executed ${count} run(s)`, "cron");
            }
          } catch (error) {
            console.error("Error in custom scheduled agent cron job:", error);
          }
        });
        log("AI Project Agent cron job started (every 15 minutes)", "cron");

        cron.schedule('0 8 * * *', async () => {
          try {
            const count = await checkDueDateNotifications();
            if (count > 0) {
              log(`Due date notifications: sent ${count} notification(s)`, "cron");
            }
          } catch (error) {
            console.error("Error in due date notification cron job:", error);
          }
        });
        log("RFI/Submittal due date notification cron job started (daily at 8 AM)", "cron");

        // Daily telemetry retention sweep at 03:17 UTC: hash old IPs, delete
        // raw page-events older than 90 days, purge unlinked anonymous events
        // older than 7 days.
        cron.schedule('17 3 * * *', async () => {
          try {
            const { runTelemetryRetentionSweep } = await import("./services/telemetryRetention");
            const r = await runTelemetryRetentionSweep();
            log(
              `Telemetry retention sweep: hashedIps=${r.hashedPageEventIps + r.hashedAcquisitionIps} `
              + `deletedOld=${r.deletedOldPageEvents} purgedAnon=${r.deletedUnlinkedAnonEvents}`,
              "cron",
            );
          } catch (error) {
            console.error("Error in telemetry retention sweep:", error);
          }
        });
        log("Telemetry retention sweep scheduled (daily 03:17 UTC)", "cron");
      } else {
        log("Cron jobs disabled in development (set ENABLE_CRON=true to enable)", "cron");
      }
    },
  );
})();
