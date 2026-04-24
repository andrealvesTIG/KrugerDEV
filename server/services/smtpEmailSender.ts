import nodemailer, { type Transporter } from "nodemailer";
import { db } from "../db";
import { systemEmailSettings, type SystemEmailSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { decryptToken, isEncryptedFormat } from "../lib/tokenEncryption";

const SETTINGS_CACHE_TTL_MS = 30_000;

let cachedSettings: { value: SystemEmailSettings | null; loadedAt: number } | null = null;
let cachedTransporter: { transporter: Transporter; signature: string } | null = null;

export function invalidateSmtpSettingsCache(): void {
  cachedSettings = null;
  cachedTransporter = null;
}

async function loadSettings(): Promise<SystemEmailSettings | null> {
  const now = Date.now();
  if (cachedSettings && now - cachedSettings.loadedAt < SETTINGS_CACHE_TTL_MS) {
    return cachedSettings.value;
  }
  try {
    const [row] = await db.select().from(systemEmailSettings).where(eq(systemEmailSettings.id, 1));
    cachedSettings = { value: row || null, loadedAt: now };
    return cachedSettings.value;
  } catch (err) {
    console.error("Failed to load system email settings:", err);
    cachedSettings = { value: null, loadedAt: now };
    return null;
  }
}

export async function getActiveSmtpSettings(): Promise<SystemEmailSettings | null> {
  const s = await loadSettings();
  if (!s) return null;
  if (!s.isEnabled) return null;
  if (s.provider !== "smtp") return null;
  if (!s.smtpHost || !s.smtpPort || !s.smtpUser || !s.smtpPasswordEncrypted) return null;
  return s;
}

function buildTransporter(s: SystemEmailSettings): Transporter {
  const pass = isEncryptedFormat(s.smtpPasswordEncrypted!) ? decryptToken(s.smtpPasswordEncrypted!) : s.smtpPasswordEncrypted!;
  const signature = `${s.smtpHost}:${s.smtpPort}:${s.smtpSecure ? "1" : "0"}:${s.smtpUser}:${pass.length}`;
  if (cachedTransporter && cachedTransporter.signature === signature) {
    return cachedTransporter.transporter;
  }
  const transporter = nodemailer.createTransport({
    host: s.smtpHost!,
    port: s.smtpPort!,
    secure: !!s.smtpSecure,
    auth: {
      user: s.smtpUser!,
      pass,
    },
    requireTLS: !s.smtpSecure,
  });
  cachedTransporter = { transporter, signature };
  return transporter;
}

function buildFromAddress(s: SystemEmailSettings, fallbackFrom?: string): string {
  if (s.fromAddress) {
    return s.fromName ? `${s.fromName} <${s.fromAddress}>` : s.fromAddress;
  }
  return fallbackFrom || s.smtpUser || "no-reply@localhost";
}

export interface SmtpSendInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  cc?: string[];
  from?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
    contentId?: string;
  }>;
}

export async function sendViaSmtp(input: SmtpSendInput): Promise<boolean> {
  const s = await getActiveSmtpSettings();
  if (!s) return false;
  try {
    const transporter = buildTransporter(s);
    const info = await transporter.sendMail({
      from: buildFromAddress(s, input.from),
      to: input.to,
      cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
      subject: input.subject,
      text: input.text,
      html: input.html || input.text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: typeof a.content === "string" ? Buffer.from(a.content, "base64") : a.content,
        contentType: a.contentType,
        cid: a.contentId,
      })),
    });
    console.log(`Email sent via SMTP to ${input.to}, messageId=${info.messageId}`);
    return true;
  } catch (err) {
    console.error("Failed to send email via SMTP:", err);
    return false;
  }
}

export interface SmtpTestInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromAddress: string;
  fromName?: string | null;
  to: string;
}

export async function sendSmtpTestEmail(input: SmtpTestInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: input.host,
      port: input.port,
      secure: input.secure,
      auth: { user: input.user, pass: input.pass },
      requireTLS: !input.secure,
    });
    const from = input.fromName ? `${input.fromName} <${input.fromAddress}>` : input.fromAddress;
    await transporter.sendMail({
      from,
      to: input.to,
      subject: "FridayReport.AI — SMTP test email",
      text: `This is a test message confirming your Office 365 / SMTP email configuration is working.\n\nHost: ${input.host}\nPort: ${input.port}\nUser: ${input.user}\n`,
      html: `<p>This is a test message confirming your Office 365 / SMTP email configuration is working.</p><ul><li><b>Host:</b> ${input.host}</li><li><b>Port:</b> ${input.port}</li><li><b>User:</b> ${input.user}</li></ul>`,
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
