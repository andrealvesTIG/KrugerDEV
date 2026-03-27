import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { partnerApplications } from "@shared/schema";
import { sendEmail } from "../services/email";

const partnerApplicationRequestSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(300),
  company: z.string().max(200).optional(),
  partnerType: z.enum(["consulting", "independent", "trainer"]),
  message: z.string().max(2000).optional(),
  honeypot1: z.string().default(""),
  honeypot2: z.string().default(""),
  formLoadTime: z.number().optional(),
});

const ipSubmissionTracker = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = ipSubmissionTracker.get(ip) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  ipSubmissionTracker.set(ip, recent);
  return recent.length >= MAX_SUBMISSIONS_PER_WINDOW;
}

function recordSubmission(ip: string) {
  const timestamps = ipSubmissionTracker.get(ip) || [];
  timestamps.push(Date.now());
  ipSubmissionTracker.set(ip, timestamps);
}

const PARTNER_TYPE_LABELS: Record<string, string> = {
  consulting: "PMO Consulting Firm",
  independent: "Independent Consultant",
  trainer: "Trainer / Educator",
};

function sendPartnerConfirmationEmail(name: string, email: string, partnerType: string) {
  const typeLabel = PARTNER_TYPE_LABELS[partnerType] || partnerType;
  const subject = "Partner Application Received - FridayReport.AI";
  const text = `Hi ${name},

Thank you for applying to the FridayReport.AI Partner Program as a ${typeLabel}.

We've received your application and our partnerships team will review it shortly. You can expect to hear back from us within 24 hours.

In the meantime, feel free to explore our platform at https://fridayreport.ai

Best regards,
The FridayReport.AI Partnerships Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">FridayReport.AI</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Partner Program</p>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="margin-top: 0; color: #1f2937;">Application Received!</h2>
    <p>Hi <strong>${name}</strong>,</p>
    <p>Thank you for applying to the FridayReport.AI Partner Program.</p>
    <div style="background: #f0f9ff; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #3b82f6;">
      <p style="margin: 0 0 8px 0;"><strong>Partner Type:</strong> ${typeLabel}</p>
      <p style="margin: 0;"><strong>Status:</strong> Under Review</p>
    </div>
    <p>Our partnerships team will review your application and reach out within <strong>24 hours</strong>.</p>
    <p style="font-size: 14px; color: #6b7280;">In the meantime, feel free to explore our platform and resources.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      This is an automated confirmation from FridayReport.AI Partner Program.
    </p>
  </div>
</body>
</html>`;

  sendEmail({ to: email, subject, text, html }).catch(err => {
    console.error("[partner] Failed to send confirmation email to applicant:", err);
  });
}

function sendPartnerNotificationEmail(name: string, email: string, company: string | null, partnerType: string, message: string | null) {
  const typeLabel = PARTNER_TYPE_LABELS[partnerType] || partnerType;
  const subject = `New Partner Application: ${name} (${typeLabel})`;
  const text = `New partner application received:

Name: ${name}
Email: ${email}
Company: ${company || "Not provided"}
Partner Type: ${typeLabel}
Message: ${message || "No message provided"}

Please review this application in the database.`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">FridayReport.AI</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">New Partner Application</p>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="margin-top: 0; color: #1f2937;">New Partner Application</h2>
    <p>A new partner application has been submitted:</p>
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; font-weight: 600; color: #374151; width: 120px;">Name:</td><td style="padding: 8px 0;">${name}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">Email:</td><td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #3b82f6;">${email}</a></td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">Company:</td><td style="padding: 8px 0;">${company || "<em style='color: #9ca3af;'>Not provided</em>"}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; color: #374151;">Partner Type:</td><td style="padding: 8px 0;"><span style="background: #dbeafe; color: #1e40af; padding: 2px 10px; border-radius: 12px; font-size: 13px; font-weight: 500;">${typeLabel}</span></td></tr>
      </table>
    </div>
    ${message ? `
    <div style="background: #f0fdf4; padding: 16px 20px; border-radius: 6px; margin: 16px 0; border-left: 4px solid #22c55e;">
      <p style="margin: 0 0 4px 0; font-weight: 600; color: #374151; font-size: 13px;">Message from applicant:</p>
      <p style="margin: 0; color: #4b5563;">${message}</p>
    </div>` : ""}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">
      This is an automated notification from the FridayReport.AI Partner Program.
    </p>
  </div>
</body>
</html>`;

  sendEmail({ to: "info@fridayreport.ai", subject, text, html }).catch(err => {
    console.error("[partner] Failed to send notification email to team:", err);
  });
}

export function registerPartnerRoutes(app: Express) {
  app.post("/api/partner-applications", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      if (isRateLimited(clientIp)) {
        return res.status(429).json({ message: "Too many submissions. Please try again later." });
      }

      const parsed = partnerApplicationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid form data", errors: parsed.error.flatten().fieldErrors });
      }

      const { honeypot1, honeypot2, formLoadTime, ...applicationData } = parsed.data;

      if (honeypot1 || honeypot2) {
        return res.status(200).json({ success: true });
      }

      if (formLoadTime) {
        const elapsed = Date.now() - formLoadTime;
        if (elapsed < 500) {
          return res.status(200).json({ success: true });
        }
      }

      const appName = applicationData.name;
      const appEmail = applicationData.email;
      const appCompany = applicationData.company || null;
      const appPartnerType = applicationData.partnerType;
      const appMessage = applicationData.message || null;

      await db.insert(partnerApplications).values({
        name: appName,
        email: appEmail,
        company: appCompany,
        partnerType: appPartnerType,
        message: appMessage,
      });

      recordSubmission(clientIp);

      sendPartnerConfirmationEmail(appName, appEmail, appPartnerType);
      sendPartnerNotificationEmail(appName, appEmail, appCompany, appPartnerType, appMessage);

      return res.status(201).json({ success: true });
    } catch (err) {
      console.error("Failed to create partner application:", err);
      return res.status(500).json({ message: "Failed to submit application" });
    }
  });
}
