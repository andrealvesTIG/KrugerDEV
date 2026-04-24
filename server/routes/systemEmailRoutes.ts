import type { Express } from "express";
import { db } from "../db";
import {
  systemEmailSettings,
  emailDeliveryLog,
  EMAIL_DELIVERY_PROVIDERS,
  EMAIL_DELIVERY_STATUSES,
  type EmailDeliveryProvider,
  type EmailDeliveryStatus,
} from "@shared/schema";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { storage } from "../storage";
import { getUserIdFromRequest } from "./helpers";
import { encryptToken, decryptToken, isEncryptedFormat } from "../lib/tokenEncryption";
import { invalidateSmtpSettingsCache, sendSmtpTestEmail } from "../services/smtpEmailSender";
import { invalidateGraphSettingsCache, sendGraphTestEmail } from "../services/graphEmailSender";

const PASSWORD_PLACEHOLDER = "__UNCHANGED__";

// Per-user rate limit for the test endpoint (max N sends per window) — prevents abuse/noise.
const TEST_RATE_LIMIT_WINDOW_MS = 60_000;
const TEST_RATE_LIMIT_MAX = 5;
const testRateLimit = new Map<string, number[]>();

function checkTestRateLimit(userId: string): boolean {
  const now = Date.now();
  const list = testRateLimit.get(userId) || [];
  const fresh = list.filter((t) => now - t < TEST_RATE_LIMIT_WINDOW_MS);
  if (fresh.length >= TEST_RATE_LIMIT_MAX) {
    testRateLimit.set(userId, fresh);
    return false;
  }
  fresh.push(now);
  testRateLimit.set(userId, fresh);
  return true;
}

type EmailRow = typeof systemEmailSettings.$inferSelect;

function maskRow(s: EmailRow | null) {
  if (!s) {
    return {
      provider: "resend" as const,
      smtpHost: null,
      smtpPort: null,
      smtpSecure: false,
      smtpUser: null,
      hasSmtpPassword: false,
      graphTenantId: null,
      graphClientId: null,
      hasGraphClientSecret: false,
      graphSenderAddress: null,
      fromAddress: null,
      fromName: null,
      isEnabled: false,
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestError: null,
      updatedBy: null,
      updatedAt: null,
    };
  }
  return {
    provider: s.provider,
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    smtpSecure: !!s.smtpSecure,
    smtpUser: s.smtpUser,
    hasSmtpPassword: !!s.smtpPasswordEncrypted,
    graphTenantId: s.graphTenantId,
    graphClientId: s.graphClientId,
    hasGraphClientSecret: !!s.graphClientSecretEncrypted,
    graphSenderAddress: s.graphSenderAddress,
    fromAddress: s.fromAddress,
    fromName: s.fromName,
    isEnabled: s.isEnabled,
    lastTestedAt: s.lastTestedAt,
    lastTestStatus: s.lastTestStatus,
    lastTestError: s.lastTestError,
    updatedBy: s.updatedBy,
    updatedAt: s.updatedAt,
  };
}

async function requireSuperAdmin(req: any, res: any): Promise<string | null> {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }
  const user = await storage.getUser(userId);
  // Strict super-admin only — system email credentials must not be touchable by other elevated roles.
  if (!user || user.role !== "super_admin") {
    res.status(403).json({ message: "Super admin access required" });
    return null;
  }
  return userId;
}

async function loadOrInit(): Promise<EmailRow | null> {
  const [row] = await db.select().from(systemEmailSettings).where(eq(systemEmailSettings.id, 1));
  return row || null;
}

async function upsertRow(updates: Partial<typeof systemEmailSettings.$inferInsert>): Promise<EmailRow> {
  const existing = await loadOrInit();
  if (existing) {
    const [updated] = await db.update(systemEmailSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(systemEmailSettings.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(systemEmailSettings)
    .values({
      id: 1,
      provider: "resend",
      isEnabled: false,
      ...updates,
    })
    .returning();
  return created;
}

function invalidateAllCaches() {
  invalidateSmtpSettingsCache();
  invalidateGraphSettingsCache();
}

function isValidProvider(v: unknown): v is "resend" | "smtp" | "graph" {
  return v === "resend" || v === "smtp" || v === "graph";
}

export function registerSystemEmailRoutes(app: Express) {
  app.get("/api/admin/email-settings", async (req, res) => {
    try {
      const userId = await requireSuperAdmin(req, res);
      if (!userId) return;
      const row = await loadOrInit();
      res.json(maskRow(row));
    } catch (err: any) {
      console.error("Error loading email settings:", err);
      res.status(500).json({ message: err?.message || "Failed to load email settings" });
    }
  });

  app.put("/api/admin/email-settings", async (req, res) => {
    try {
      const userId = await requireSuperAdmin(req, res);
      if (!userId) return;
      const body = req.body || {};
      const provider = isValidProvider(body.provider) ? body.provider : "resend";

      const existing = await loadOrInit();
      const updates: Partial<typeof systemEmailSettings.$inferInsert> = {
        provider,
        isEnabled: !!body.isEnabled,
        updatedBy: userId,
      };

      if (provider === "smtp") {
        const host = typeof body.smtpHost === "string" ? body.smtpHost.trim() : "";
        const portRaw = body.smtpPort;
        const port = typeof portRaw === "number" ? portRaw : Number(portRaw);
        const user = typeof body.smtpUser === "string" ? body.smtpUser.trim() : "";
        const fromAddress = typeof body.fromAddress === "string" ? body.fromAddress.trim() : "";
        const fromName = typeof body.fromName === "string" ? body.fromName.trim() : "";

        if (!host) return res.status(400).json({ message: "SMTP host is required" });
        if (!port || port < 1 || port > 65535) return res.status(400).json({ message: "Valid SMTP port is required" });
        if (!user) return res.status(400).json({ message: "SMTP username is required" });
        if (!fromAddress) return res.status(400).json({ message: "From address is required" });

        updates.smtpHost = host;
        updates.smtpPort = port;
        updates.smtpSecure = !!body.smtpSecure;
        updates.smtpUser = user;
        updates.fromAddress = fromAddress;
        updates.fromName = fromName || null;

        const incomingPass = typeof body.smtpPassword === "string" ? body.smtpPassword : "";
        if (incomingPass && incomingPass !== PASSWORD_PLACEHOLDER) {
          updates.smtpPasswordEncrypted = encryptToken(incomingPass);
        } else if (!existing?.smtpPasswordEncrypted) {
          return res.status(400).json({ message: "SMTP password is required" });
        }

        if (updates.isEnabled && !updates.smtpPasswordEncrypted && !existing?.smtpPasswordEncrypted) {
          return res.status(400).json({ message: "SMTP password is required to enable SMTP delivery" });
        }
      } else if (provider === "graph") {
        const tenantId = typeof body.graphTenantId === "string" ? body.graphTenantId.trim() : "";
        const clientId = typeof body.graphClientId === "string" ? body.graphClientId.trim() : "";
        const sender = typeof body.graphSenderAddress === "string" ? body.graphSenderAddress.trim() : "";
        const fromAddress = typeof body.fromAddress === "string" ? body.fromAddress.trim() : sender;
        const fromName = typeof body.fromName === "string" ? body.fromName.trim() : "";

        if (!tenantId) return res.status(400).json({ message: "Tenant ID is required" });
        if (!clientId) return res.status(400).json({ message: "Client ID is required" });
        if (!sender) return res.status(400).json({ message: "Sender mailbox is required" });

        updates.graphTenantId = tenantId;
        updates.graphClientId = clientId;
        updates.graphSenderAddress = sender;
        updates.fromAddress = fromAddress || sender;
        updates.fromName = fromName || null;

        const incomingSecret = typeof body.graphClientSecret === "string" ? body.graphClientSecret : "";
        if (incomingSecret && incomingSecret !== PASSWORD_PLACEHOLDER) {
          updates.graphClientSecretEncrypted = encryptToken(incomingSecret);
        } else if (!existing?.graphClientSecretEncrypted) {
          return res.status(400).json({ message: "Client secret is required" });
        }

        if (updates.isEnabled && !updates.graphClientSecretEncrypted && !existing?.graphClientSecretEncrypted) {
          return res.status(400).json({ message: "Client secret is required to enable Microsoft Graph delivery" });
        }
      } else {
        updates.isEnabled = false;
      }

      const saved = await upsertRow(updates);
      invalidateAllCaches();
      res.json(maskRow(saved));
    } catch (err: any) {
      console.error("Error saving email settings:", err);
      res.status(500).json({ message: err?.message || "Failed to save email settings" });
    }
  });

  app.post("/api/admin/email-settings/test", async (req, res) => {
    try {
      const userId = await requireSuperAdmin(req, res);
      if (!userId) return;
      if (!checkTestRateLimit(userId)) {
        return res.status(429).json({ message: `Too many test sends. Try again in a minute (max ${TEST_RATE_LIMIT_MAX}/min).` });
      }
      const body = req.body || {};
      const to = typeof body.to === "string" ? body.to.trim() : "";
      if (!to) return res.status(400).json({ message: "Recipient email is required" });

      const provider = isValidProvider(body.provider) ? body.provider : "smtp";
      const existing = await loadOrInit();

      let result: { ok: boolean; error?: string };

      if (provider === "graph") {
        const tenantId = typeof body.graphTenantId === "string" ? body.graphTenantId.trim() : "";
        const clientId = typeof body.graphClientId === "string" ? body.graphClientId.trim() : "";
        const sender = typeof body.graphSenderAddress === "string" ? body.graphSenderAddress.trim() : "";
        const fromAddress = typeof body.fromAddress === "string" ? body.fromAddress.trim() : "";
        const fromName = typeof body.fromName === "string" ? body.fromName.trim() : "";
        if (!tenantId || !clientId || !sender) {
          return res.status(400).json({ message: "Tenant ID, Client ID and sender mailbox are required" });
        }
        let secret = typeof body.graphClientSecret === "string" ? body.graphClientSecret : "";
        if (!secret || secret === PASSWORD_PLACEHOLDER) {
          if (!existing?.graphClientSecretEncrypted) {
            return res.status(400).json({ message: "Client secret is required" });
          }
          secret = isEncryptedFormat(existing.graphClientSecretEncrypted) ? decryptToken(existing.graphClientSecretEncrypted) : existing.graphClientSecretEncrypted;
        }
        result = await sendGraphTestEmail({ tenantId, clientId, clientSecret: secret, senderAddress: sender, to, fromAddress: fromAddress || sender, fromName: fromName || null });
      } else {
        // SMTP test (default)
        const host = typeof body.smtpHost === "string" ? body.smtpHost.trim() : "";
        const portRaw = body.smtpPort;
        const port = typeof portRaw === "number" ? portRaw : Number(portRaw);
        const user = typeof body.smtpUser === "string" ? body.smtpUser.trim() : "";
        const fromAddress = typeof body.fromAddress === "string" ? body.fromAddress.trim() : "";
        const fromName = typeof body.fromName === "string" ? body.fromName.trim() : "";
        const secure = !!body.smtpSecure;
        if (!host || !port || !user || !fromAddress) {
          return res.status(400).json({ message: "Host, port, username and From address are required" });
        }
        let pass = typeof body.smtpPassword === "string" ? body.smtpPassword : "";
        if (!pass || pass === PASSWORD_PLACEHOLDER) {
          if (!existing?.smtpPasswordEncrypted) {
            return res.status(400).json({ message: "SMTP password is required" });
          }
          pass = isEncryptedFormat(existing.smtpPasswordEncrypted) ? decryptToken(existing.smtpPasswordEncrypted) : existing.smtpPasswordEncrypted;
        }
        result = await sendSmtpTestEmail({ host, port, secure, user, pass, fromAddress, fromName: fromName || null, to });
      }

      await upsertRow({
        lastTestedAt: new Date(),
        lastTestStatus: result.ok ? "success" : "failed",
        lastTestError: result.ok ? null : (result.error || "Unknown error"),
        updatedBy: userId,
      });
      invalidateAllCaches();

      if (!result.ok) {
        return res.status(400).json({ ok: false, error: result.error || "Test send failed" });
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Error testing email settings:", err);
      res.status(500).json({ message: err?.message || "Failed to send test email" });
    }
  });

  app.get("/api/admin/email-log", async (req, res) => {
    try {
      const userId = await requireSuperAdmin(req, res);
      if (!userId) return;

      const providerParam = typeof req.query.provider === "string" ? req.query.provider.trim() : "";
      const statusParam = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 100;

      const validProvider: EmailDeliveryProvider | null =
        providerParam && (EMAIL_DELIVERY_PROVIDERS as readonly string[]).includes(providerParam)
          ? (providerParam as EmailDeliveryProvider)
          : null;
      const validStatus: EmailDeliveryStatus | null =
        statusParam && (EMAIL_DELIVERY_STATUSES as readonly string[]).includes(statusParam)
          ? (statusParam as EmailDeliveryStatus)
          : null;

      const conditions: SQL<unknown>[] = [];
      if (validProvider) {
        conditions.push(eq(emailDeliveryLog.provider, validProvider));
      }
      if (validStatus) {
        conditions.push(eq(emailDeliveryLog.status, validStatus));
      }

      const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);
      const rows = where
        ? await db.select().from(emailDeliveryLog).where(where).orderBy(desc(emailDeliveryLog.createdAt)).limit(limit)
        : await db.select().from(emailDeliveryLog).orderBy(desc(emailDeliveryLog.createdAt)).limit(limit);

      const totalsRaw = await db
        .select({
          provider: emailDeliveryLog.provider,
          status: emailDeliveryLog.status,
          count: sql<number>`count(*)::int`,
        })
        .from(emailDeliveryLog)
        .groupBy(emailDeliveryLog.provider, emailDeliveryLog.status);

      res.json({
        entries: rows,
        totals: totalsRaw,
        limit,
        filters: {
          provider: validProvider,
          status: validStatus,
        },
      });
    } catch (err: any) {
      console.error("Error loading email delivery log:", err);
      res.status(500).json({ message: err?.message || "Failed to load email log" });
    }
  });
}
