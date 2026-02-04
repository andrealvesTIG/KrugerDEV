import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
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

const app = express();

// Cookie parser middleware (for OAuth state fallback)
app.use(cookieParser());
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
    // Skip logging for monitoring endpoints to avoid infinite recursion
    if (path.startsWith('/api/admin/monitoring')) {
      return;
    }
    
    await db.execute(sql`
      INSERT INTO api_request_logs (method, path, status_code, duration, user_id, organization_id, user_agent, ip_address, error_message)
      VALUES (${method}, ${path}, ${statusCode}, ${duration}, ${userId}, ${organizationId}, ${userAgent}, ${ipAddress}, ${errorMessage})
    `);
  } catch (err) {
    // Silently fail - we don't want logging failures to affect the app
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
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);

      // Log to database for monitoring (async, non-blocking)
      const userId = (req as any).userId || (req as any).user?.id || null;
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
  setupSwagger(app);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
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
    },
  );
})();
