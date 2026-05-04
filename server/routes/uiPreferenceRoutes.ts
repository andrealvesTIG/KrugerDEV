import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { getUserIdFromRequest } from "./helpers";

type UiPreferences = { aiMode?: boolean };

function sanitize(input: unknown): UiPreferences {
  const out: UiPreferences = {};
  if (!input || typeof input !== "object") return out;
  const raw = input as Record<string, unknown>;
  if (typeof raw.aiMode === "boolean") out.aiMode = raw.aiMode;
  return out;
}

async function loadPrefs(userId: string): Promise<UiPreferences> {
  const [row] = await db
    .select({ uiPreferences: users.uiPreferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return (row?.uiPreferences ?? {}) as UiPreferences;
}

export function registerUiPreferenceRoutes(app: Express) {
  // Read the current user's UI preferences. Returns `{}` for users who have
  // never set anything; the client applies its own defaults (AI Mode on).
  app.get("/api/profile/ui-preferences", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const prefs = await loadPrefs(userId);
      res.json(prefs);
    } catch (err) {
      console.error("Error fetching ui preferences:", err);
      res.status(500).json({ message: "Failed to load UI preferences" });
    }
  });

  // Merge-patch the current user's UI preferences. Only known keys are
  // accepted; everything else is silently dropped.
  app.patch("/api/profile/ui-preferences", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const incoming = sanitize(req.body);
      const current = await loadPrefs(userId);
      const merged: UiPreferences = { ...current, ...incoming };

      await db
        .update(users)
        .set({ uiPreferences: merged, updatedAt: new Date() })
        .where(eq(users.id, userId));

      res.json(merged);
    } catch (err) {
      console.error("Error updating ui preferences:", err);
      res.status(500).json({ message: "Failed to save UI preferences" });
    }
  });
}
