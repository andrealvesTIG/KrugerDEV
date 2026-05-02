import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { organizationMembers, resources } from "@shared/schema";
import { users } from "@shared/models/auth";
import { sendEmail, type EmailAttachment } from "./email";
import { getGeneratedFileForUser } from "./fridayGeneratedFiles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineHtml(line: string): string {
  let s = escapeHtml(line);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s;
}

function markdownToHtml(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  let paraBuf: string[] = [];
  const flushPara = () => {
    if (paraBuf.length) {
      out.push(`<p style="margin:0 0 12px 0;">${paraBuf.map(renderInlineHtml).join("<br>")}</p>`);
      paraBuf = [];
    }
  };
  const closeList = () => {
    if (inList) { out.push("</ul>"); inList = false; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); closeList(); continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      if (!inList) { out.push('<ul style="margin:0 0 12px 20px; padding:0;">'); inList = true; }
      out.push(`<li>${renderInlineHtml(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
    } else if (/^#{1,3}\s+/.test(line)) {
      flushPara(); closeList();
      const m = line.match(/^(#{1,3})\s+(.*)$/)!;
      const level = m[1].length + 2;
      out.push(`<h${level} style="margin:16px 0 8px 0; color:#1f2937;">${renderInlineHtml(m[2])}</h${level}>`);
    } else {
      closeList();
      paraBuf.push(line);
    }
  }
  flushPara(); closeList();
  return out.join("\n");
}

function htmlEmail(subject: string, bodyHtml: string, senderName: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.55;color:#1f2937;max-width:640px;margin:0 auto;padding:20px;">
<div style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:18px 24px;border-radius:8px 8px 0 0;">
  <div style="color:#fff;font-size:14px;letter-spacing:0.5px;opacity:0.9;">FridayReport.AI</div>
  <h1 style="color:#fff;margin:4px 0 0;font-size:20px;">${escapeHtml(subject)}</h1>
</div>
<div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">
  <p style="font-size:12px;color:#6b7280;margin:0;">Sent on behalf of <strong>${escapeHtml(senderName)}</strong> via Friday in FridayReport.AI.</p>
</div>
</body></html>`;
}

export async function sendFridayEmail(
  orgId: number,
  userId: string,
  args: Record<string, any>,
): Promise<string> {
  const toRaw = Array.isArray(args.to) ? args.to : (typeof args.to === "string" ? [args.to] : []);
  const ccRaw = Array.isArray(args.cc) ? args.cc : (typeof args.cc === "string" && args.cc ? [args.cc] : []);
  const subject = typeof args.subject === "string" ? args.subject.trim().slice(0, 200) : "";
  const body = typeof args.body === "string" ? args.body : "";
  const pdfId = typeof args.pdfId === "string" ? args.pdfId : undefined;

  if (!subject) return JSON.stringify({ success: false, message: "Subject is required." });
  if (!body.trim()) return JSON.stringify({ success: false, message: "Body is required." });

  const normalize = (e: string) => e.trim().toLowerCase();
  const toList = Array.from(new Set(toRaw.map(normalize).filter((e: string) => EMAIL_RE.test(e))));
  const ccList = Array.from(new Set(ccRaw.map(normalize).filter((e: string) => EMAIL_RE.test(e))));
  if (toList.length === 0) {
    return JSON.stringify({ success: false, message: "At least one valid recipient email address is required." });
  }
  if (toList.length + ccList.length > 20) {
    return JSON.stringify({ success: false, message: "Too many recipients (limit is 20 total)." });
  }

  const allRequested = Array.from(new Set([...toList, ...ccList]));

  // Allowed = org member emails + resource emails for this org.
  const [memberEmails, resourceEmails] = await Promise.all([
    db.select({ email: sql<string>`LOWER(${users.email})` })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, orgId)),
    db.select({ email: sql<string>`LOWER(${resources.email})` })
      .from(resources)
      .where(and(
        eq(resources.organizationId, orgId),
        isNull(resources.deletedAt),
      )),
  ]);
  const allowed = new Set<string>();
  for (const r of memberEmails) if (r.email) allowed.add(r.email);
  for (const r of resourceEmails) if (r.email) allowed.add(r.email);

  const disallowed = allRequested.filter(e => !allowed.has(e));
  if (disallowed.length > 0) {
    return JSON.stringify({
      success: false,
      message: `These addresses are not in the organization (members or resources) so Friday cannot email them: ${disallowed.join(", ")}. Ask the user to add them as a resource or org member first, or pick a different recipient.`,
    });
  }

  // Sender info
  const [sender] = await db.select({
    email: users.email,
    firstName: users.firstName,
    lastName: users.lastName,
  }).from(users).where(eq(users.id, userId));
  const senderName = [sender?.firstName, sender?.lastName].filter(Boolean).join(" ").trim() || sender?.email || "FridayReport.AI user";

  const attachments: EmailAttachment[] = [];
  if (pdfId) {
    const file = getGeneratedFileForUser(pdfId, userId, orgId);
    if (!file) {
      return JSON.stringify({
        success: false,
        message: "The referenced PDF could not be found or has expired. Generate it again with generate_pdf and retry.",
      });
    }
    attachments.push({ filename: file.filename, content: file.buffer, contentType: file.contentType });
  }

  const html = htmlEmail(subject, markdownToHtml(body), senderName);
  const text = `${body}\n\n— Sent on behalf of ${senderName} via Friday in FridayReport.AI`;

  // sendEmail() accepts a single `to` per call. Send one email per primary
  // recipient (sharing the same CC list) so no `to` address is silently
  // downgraded into CC.
  const sentTo: string[] = [];
  const failedTo: string[] = [];
  for (const recipient of toList) {
    const ok = await sendEmail({
      to: recipient,
      cc: ccList.length ? ccList : undefined,
      subject,
      text,
      html,
      attachments: attachments.length ? attachments : undefined,
    });
    if (ok) sentTo.push(recipient);
    else failedTo.push(recipient);
  }

  if (sentTo.length === 0) {
    return JSON.stringify({
      success: false,
      message: "Email could not be sent to any recipient. The mail provider may not be configured. Tell the user to check the org's email/SMTP settings.",
      failedTo,
    });
  }

  const summary = `Email sent to ${sentTo.join(", ")}${ccList.length ? ` (cc ${ccList.join(", ")})` : ""}${attachments.length ? ` with ${attachments.length} attachment(s)` : ""}${failedTo.length ? `. Failed to deliver to ${failedTo.join(", ")}` : ""}.`;
  return JSON.stringify({
    success: failedTo.length === 0,
    message: summary,
    to: sentTo,
    cc: ccList,
    failedTo,
    attachedFilenames: attachments.map(a => a.filename),
  });
}
