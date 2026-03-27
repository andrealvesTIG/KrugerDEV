import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { partnerApplications } from "@shared/schema";

const partnerApplicationRequestSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(300),
  company: z.string().max(200).optional(),
  partnerType: z.enum(["consulting", "independent", "trainer"]),
  message: z.string().max(2000).optional(),
  honeypot1: z.string().default(""),
  honeypot2: z.string().default(""),
  formLoadTime: z.number(),
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

      const elapsed = Date.now() - formLoadTime;
      if (elapsed < 500) {
        return res.status(200).json({ success: true });
      }

      await db.insert(partnerApplications).values({
        name: applicationData.name,
        email: applicationData.email,
        company: applicationData.company || null,
        partnerType: applicationData.partnerType,
        message: applicationData.message || null,
      });

      recordSubmission(clientIp);

      return res.status(201).json({ success: true });
    } catch (err) {
      console.error("Failed to create partner application:", err);
      return res.status(500).json({ message: "Failed to submit application" });
    }
  });
}
