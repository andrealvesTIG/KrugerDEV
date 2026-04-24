import type { Express } from "express";
import { db } from "../db";
import { systemEmailSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { hasAdminAccess, getUserIdFromRequest } from "./helpers";
import { encryptToken, decryptToken, isEncryptedFormat } from "../lib/tokenEncryption";
import { invalidateSmtpSettingsCache, sendSmtpTestEmail } from "../services/smtpEmailSender";

const PASSWORD_PLACEHOLDER = "__UNCHANGED__";

function maskPassword(s: typeof systemEmailSettings.$inferSelect | null) {
  if (!s) {
    return {
      provider: "resend" as const,
      smtpHost: null,
      smtpPort: null,
      smtpSecure: false,
      smtpUser: null,
      hasSmtpPassword: false,
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
  if (!hasAdminAccess(user)) {
    res.status(403).json({ message: "Super admin access required" });
    return null;
  }
  return userId;
}

async function loadOrInit(): Promise<typeof systemEmailSettings.$inferSelect | null> {
  const [row] = await db.select().from(systemEmailSettings).where(eq(systemEmailSettings.id, 1));
  return row || null;
}

async function upsertRow(updates: Partial<typeof systemEmailSettings.$inferInsert>): Promise<typeof systemEmailSettings.$inferSelect> {
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

export function registerSystemEmailRoutes(app: Express) {
  app.get("/api/admin/email-settings", async (req, res) => {
    try {
      const userId = await requireSuperAdmin(req, res);
      if (!userId) return;
      const row = await loadOrInit();
      res.json(maskPassword(row));
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
      const provider = body.provider === "smtp" ? "smtp" : "resend";

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
      } else {
        updates.isEnabled = false;
      }

      const saved = await upsertRow(updates);
      invalidateSmtpSettingsCache();
      res.json(maskPassword(saved));
    } catch (err: any) {
      console.error("Error saving email settings:", err);
      res.status(500).json({ message: err?.message || "Failed to save email settings" });
    }
  });

  app.post("/api/admin/email-settings/test", async (req, res) => {
    try {
      const userId = await requireSuperAdmin(req, res);
      if (!userId) return;
      const body = req.body || {};
      const to = typeof body.to === "string" ? body.to.trim() : "";
      if (!to) return res.status(400).json({ message: "Recipient email is required" });

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
        const existing = await loadOrInit();
        if (!existing?.smtpPasswordEncrypted) {
          return res.status(400).json({ message: "SMTP password is required" });
        }
        pass = isEncryptedFormat(existing.smtpPasswordEncrypted) ? decryptToken(existing.smtpPasswordEncrypted) : existing.smtpPasswordEncrypted;
      }

      const result = await sendSmtpTestEmail({ host, port, secure, user, pass, fromAddress, fromName: fromName || null, to });

      await upsertRow({
        lastTestedAt: new Date(),
        lastTestStatus: result.ok ? "success" : "failed",
        lastTestError: result.ok ? null : (result.error || "Unknown error"),
        updatedBy: userId,
      });
      invalidateSmtpSettingsCache();

      if (!result.ok) {
        return res.status(400).json({ ok: false, error: result.error || "Test send failed" });
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Error testing email settings:", err);
      res.status(500).json({ message: err?.message || "Failed to send test email" });
    }
  });
}
