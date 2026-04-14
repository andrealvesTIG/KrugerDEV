import type { Express, Request, Response } from "express";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "../services/email";
import { apiRoute, body, r200, r201, inputRes, authRes } from "../route-registry";

export function registerInvestorRoutes(app: Express) {
  apiRoute(app, 'post', '/api/investor/verify-password', {
    tag: 'Other',
    summary: 'Verify investor room password (legacy)',
    security: [],
    requestBody: body({ type: 'object', properties: { password: { type: 'string' } }, required: ['password'] }),
    responses: { ...r200('Access granted', { type: 'object' }), '401': { description: 'Incorrect password' } },
  }, (req: Request, res: Response) => {
    const { password } = req.body;
    const correctPassword = process.env.INVESTOR_ACCESS_PASSWORD;
    if (!correctPassword) {
      return res.status(503).json({ success: false, message: "Investor access is not configured" });
    }

    if (password === correctPassword) {
      (req.session as any).investorAccess = true;
      return res.json({ success: true });
    }

    res.status(401).json({ success: false, message: "Incorrect password" });
  });

  apiRoute(app, 'post', '/api/investor/verify', {
    tag: 'Other',
    summary: 'Verify investor room password',
    security: [],
    requestBody: body({ type: 'object', properties: { password: { type: 'string' } }, required: ['password'] }),
    responses: { ...r200('Access granted', { type: 'object' }), '401': { description: 'Incorrect password' } },
  }, (req: Request, res: Response) => {
    const { password } = req.body;
    const correctPassword = process.env.INVESTOR_ACCESS_PASSWORD;
    if (!correctPassword) {
      return res.status(503).json({ success: false, message: "Investor access is not configured" });
    }

    if (password === correctPassword) {
      (req.session as any).investorAccess = true;
      return res.json({ success: true });
    }

    res.status(401).json({ error: "Incorrect password" });
  });

  apiRoute(app, 'get', '/api/investor/session', {
    tag: 'Other',
    summary: 'Check investor session status',
    security: [],
    responses: r200('Session status', { type: 'object' }),
  }, (req: Request, res: Response) => {
    const hasAccess = !!(req.session as any)?.investorAccess;
    res.json({ authenticated: hasAccess });
  });

  apiRoute(app, 'post', '/api/investor/logout', {
    tag: 'Other',
    summary: 'End investor session',
    security: [],
    responses: r200('Logged out', { type: 'array', items: { type: 'object' } }),
  }, (req: Request, res: Response) => {
    if ((req.session as any)?.investorAccess) {
      delete (req.session as any).investorAccess;
    }
    res.json({ success: true });
  });

  apiRoute(app, 'get', '/api/investor/check-access', {
    tag: 'Other',
    summary: 'Check investor access level',
    security: [],
    responses: r200('Access check result', { type: 'object' }),
  }, async (req: Request, res: Response) => {
    if ((req.session as any)?.investorAccess) {
      return res.json({ hasAccess: true });
    }

    const userId = req.session?.userId || (req.user as any)?.id;
    if (userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user && (user.role === "super_admin" || user.role === "marketing")) {
        return res.json({ hasAccess: true });
      }
    }

    res.json({ hasAccess: false });
  });

  apiRoute(app, 'post', '/api/investor/email-pdf', {
    tag: 'Other',
    summary: 'Email investor deck PDF',
    security: [],
    requestBody: body({
      type: 'object',
      properties: {
        email: { type: 'string' },
        recipientEmail: { type: 'string' },
        recipientName: { type: 'string' },
        pdfBase64: { type: 'string', format: 'byte' },
      },
    }),
    responses: { ...r200('Email sent', { type: 'object' }), ...inputRes, ...authRes },
  }, async (req: Request, res: Response) => {
    try {
      const hasSessionAccess = (req.session as any)?.investorAccess;
      const userId = req.session?.userId || (req.user as any)?.id;
      let hasRoleAccess = false;
      if (userId) {
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user && (user.role === "super_admin" || user.role === "marketing")) {
          hasRoleAccess = true;
        }
      }
      if (!hasSessionAccess && !hasRoleAccess) {
        return res.status(403).json({ message: "Access denied. Please verify investor access first." });
      }

      const { email, recipientEmail, recipientName, pdfBase64 } = req.body;
      const toEmail = email || recipientEmail;

      if (!toEmail || !pdfBase64) {
        return res.status(400).json({ message: "Recipient email and PDF data are required" });
      }

      const pdfBuffer = Buffer.from(pdfBase64, "base64");

      const success = await sendEmail({
        to: toEmail,
        subject: "FridayReport.AI — Investor Deck",
        text: `Hi ${recipientName || "there"},\n\nPlease find attached the FridayReport.AI investor deck.\n\nBest regards,\nFridayReport.AI Team`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #3b82f6, #6366f1); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">FridayReport.AI</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Investor Deck</p>
            </div>
            <div style="padding: 30px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
              <p>Hi ${recipientName || "there"},</p>
              <p>Please find attached the FridayReport.AI investor deck for your review.</p>
              <p>We'd love to discuss how we're transforming project portfolio management with AI-powered insights.</p>
              <p style="margin-top: 24px;">Best regards,<br/>The FridayReport.AI Team</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px;">
              <p style="font-size: 11px; color: #9ca3af; margin: 0; text-align: center;"><a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a></p>
            </div>
          </div>
        `,
        attachments: [
          {
            filename: "FridayReport-AI-Investor-Deck.pdf",
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      if (success) {
        res.json({ success: true, message: "Investor deck sent successfully" });
      } else {
        res.json({ success: false, message: "Email service not configured, but PDF was generated" });
      }
    } catch (error: any) {
      console.error("[investor] Email error:", error.message);
      res.status(500).json({ message: "Failed to send email" });
    }
  });
}
