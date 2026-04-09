import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth/emailAuth";
import { db } from "../db";
import { users, organizationMembers } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { chat } from "../services/jarvisService";

export function registerJarvisRoutes(app: Express) {
  app.post("/api/jarvis/chat", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { message, conversationHistory, conciseMode } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "Message is required" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const membership = await db
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.userId, userId)))
        .limit(1);

      const organizationId = membership[0]?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ message: "No organization found. Please join an organization first." });
      }

      const response = await chat(
        message,
        organizationId,
        conversationHistory || [],
        conciseMode || false
      );

      res.json({ response });
    } catch (error: any) {
      console.error("[jarvis] Route error:", error.message);
      res.status(500).json({ message: "Failed to get AI response" });
    }
  });
}
