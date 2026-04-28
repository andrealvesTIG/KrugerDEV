import type { Express } from "express";
import { getUserIdFromRequest } from "./helpers";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "../services/userNotificationPreferences";

export function registerNotificationPreferenceRoutes(app: Express) {
  app.get("/api/profile/notification-preferences", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const data = await getUserNotificationPreferences(userId);
      res.json(data);
    } catch (err) {
      console.error("Error fetching notification preferences:", err);
      res.status(500).json({ message: "Failed to load notification preferences" });
    }
  });

  app.put("/api/profile/notification-preferences", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const body = req.body || {};
      const reset = body.reset === true;
      const incoming =
        body.preferences && typeof body.preferences === "object"
          ? (body.preferences as Record<string, unknown>)
          : {};

      const { saved, rejected } = await updateUserNotificationPreferences(userId, incoming, { reset });
      const data = await getUserNotificationPreferences(userId);
      res.json({ ...data, rejected, lastUpdate: saved });
    } catch (err) {
      console.error("Error updating notification preferences:", err);
      res.status(500).json({ message: "Failed to save notification preferences" });
    }
  });
}
