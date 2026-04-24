import { db } from "../db";
import { systemEmailSettings, type SystemEmailSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { decryptToken, isEncryptedFormat } from "../lib/tokenEncryption";

const SETTINGS_CACHE_TTL_MS = 30_000;
const TOKEN_REFRESH_LEEWAY_MS = 60_000;

let cachedSettings: { value: SystemEmailSettings | null; loadedAt: number } | null = null;
let cachedToken: { signature: string; accessToken: string; expiresAt: number } | null = null;

export function invalidateGraphSettingsCache(): void {
  cachedSettings = null;
  cachedToken = null;
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
    console.error("Failed to load system email settings (graph):", err);
    cachedSettings = { value: null, loadedAt: now };
    return null;
  }
}

export async function getActiveGraphSettings(): Promise<SystemEmailSettings | null> {
  const s = await loadSettings();
  if (!s) return null;
  if (!s.isEnabled) return null;
  if (s.provider !== "graph") return null;
  if (!s.graphTenantId || !s.graphClientId || !s.graphClientSecretEncrypted || !s.graphSenderAddress) return null;
  return s;
}

function decryptSecret(stored: string): string {
  return isEncryptedFormat(stored) ? decryptToken(stored) : stored;
}

async function fetchAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<{ accessToken: string; expiresInSec: number }> {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const desc = (json && (json.error_description || json.error)) || `HTTP ${res.status}`;
    throw new Error(`Entra ID token request failed: ${desc}`);
  }
  const accessToken = json.access_token as string | undefined;
  const expiresIn = Number(json.expires_in) || 3600;
  if (!accessToken) throw new Error("Entra ID token response missing access_token");
  return { accessToken, expiresInSec: expiresIn };
}

async function getCachedAccessToken(s: SystemEmailSettings): Promise<string> {
  const secret = decryptSecret(s.graphClientSecretEncrypted!);
  const signature = `${s.graphTenantId}|${s.graphClientId}|${secret.length}`;
  const now = Date.now();
  if (cachedToken && cachedToken.signature === signature && cachedToken.expiresAt - TOKEN_REFRESH_LEEWAY_MS > now) {
    return cachedToken.accessToken;
  }
  const { accessToken, expiresInSec } = await fetchAccessToken(s.graphTenantId!, s.graphClientId!, secret);
  cachedToken = { signature, accessToken, expiresAt: now + expiresInSec * 1000 };
  return accessToken;
}

export interface GraphSendInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  cc?: string[];
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
    contentId?: string;
  }>;
}

function toBase64(content: Buffer | string): string {
  if (Buffer.isBuffer(content)) return content.toString("base64");
  // assume already base64 if it's a string (matches existing email service contract)
  return content;
}

function buildGraphMessage(input: GraphSendInput, opts?: { fromAddress?: string | null; fromName?: string | null }) {
  const isHtml = !!input.html;
  const fromAddress = opts?.fromAddress?.trim();
  const fromName = opts?.fromName?.trim();
  // Graph requires the sender mailbox to match the URL segment unless SendAs is granted.
  // We always include the display name (and address when provided); Graph falls back to
  // the mailbox identity if the address doesn't match permissions.
  const fromEmail = fromAddress
    ? { emailAddress: { address: fromAddress, ...(fromName ? { name: fromName } : {}) } }
    : fromName
      ? { emailAddress: { name: fromName, address: "" } }
      : undefined;

  const message: Record<string, unknown> = {
    subject: input.subject,
    body: {
      contentType: isHtml ? "HTML" : "Text",
      content: input.html || input.text,
    },
    toRecipients: [{ emailAddress: { address: input.to } }],
    ccRecipients: input.cc?.map((address) => ({ emailAddress: { address } })) || [],
  };
  if (fromEmail && fromEmail.emailAddress.address) {
    message.from = fromEmail;
  }
  if (input.attachments && input.attachments.length > 0) {
    message.attachments = input.attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.filename,
      contentType: a.contentType || "application/octet-stream",
      contentBytes: toBase64(a.content),
      contentId: a.contentId,
      isInline: !!a.contentId,
    }));
  }
  return { message, saveToSentItems: false };
}

async function postSendMail(senderAddress: string, accessToken: string, payload: unknown): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderAddress)}/sendMail`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 202) return;
  let detail = `HTTP ${res.status}`;
  try {
    const json = await res.json();
    const code = json?.error?.code;
    const message = json?.error?.message;
    if (code && message) {
      detail = `${code}: ${message}`;
    } else if (message) {
      detail = message;
    } else {
      detail = JSON.stringify(json);
    }
  } catch {
    try { detail = await res.text(); } catch { /* ignore */ }
  }
  throw new Error(`Microsoft Graph sendMail failed (HTTP ${res.status}): ${detail}`);
}

export interface GraphSendResult {
  ok: boolean;
  error?: string;
}

export async function sendViaGraph(input: GraphSendInput): Promise<GraphSendResult> {
  const s = await getActiveGraphSettings();
  if (!s) return { ok: false, error: "Microsoft Graph is not configured or not enabled" };
  try {
    const accessToken = await getCachedAccessToken(s);
    const payload = buildGraphMessage(input, { fromAddress: s.fromAddress || s.graphSenderAddress, fromName: s.fromName });
    await postSendMail(s.graphSenderAddress!, accessToken, payload);
    console.log(`Email sent via Microsoft Graph to ${input.to}`);
    return { ok: true };
  } catch (err: any) {
    console.error("Failed to send email via Microsoft Graph:", err);
    return { ok: false, error: err?.message || String(err) };
  }
}

export interface GraphTestInput {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderAddress: string;
  to: string;
  fromAddress?: string | null;
  fromName?: string | null;
}

export async function sendGraphTestEmail(input: GraphTestInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const { accessToken } = await fetchAccessToken(input.tenantId, input.clientId, input.clientSecret);
    const payload = buildGraphMessage({
      to: input.to,
      subject: "FridayReport.AI — Microsoft Graph test email",
      text: `This is a test message confirming your Microsoft Graph (Entra ID) email configuration is working.\n\nTenant: ${input.tenantId}\nClient ID: ${input.clientId}\nSender: ${input.senderAddress}\n`,
      html: `<p>This is a test message confirming your <b>Microsoft Graph (Entra ID)</b> email configuration is working.</p><ul><li><b>Tenant:</b> ${input.tenantId}</li><li><b>Client ID:</b> ${input.clientId}</li><li><b>Sender:</b> ${input.senderAddress}</li></ul>`,
    }, { fromAddress: input.fromAddress || input.senderAddress, fromName: input.fromName });
    await postSendMail(input.senderAddress, accessToken, payload);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
