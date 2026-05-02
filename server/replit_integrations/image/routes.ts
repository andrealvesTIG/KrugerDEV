import type { Express, Request, Response } from "express";
import { createHash } from "node:crypto";
import { openai } from "./client";
import { getUserIdFromRequest } from "../../routes/helpers";
import { withAiCredits, sendLimitExceeded } from "../../services/aiCredits";

export function registerImageRoutes(app: Express): void {
  app.post("/api/generate-image", async (req: Request, res: Response) => {
    try {
      const { prompt, size = "1024x1024", organizationId } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Stable per-request requestId so identical retries dedupe.
      const promptHash = createHash("sha256")
        .update(`${prompt}|${size}`)
        .digest("hex")
        .slice(0, 16);
      const response = await withAiCredits(
        {
          userId,
          orgId: organizationId ? Number(organizationId) : null,
          action: "integrations_image_generate",
          requestId: `integrations_image_generate_${promptHash}`,
        },
        () => openai.images.generate({
          model: "gpt-image-1",
          prompt,
          n: 1,
          size: size as "1024x1024" | "512x512" | "256x256",
        }),
      );

      const imageData = response.data?.[0];
      res.json({
        url: imageData?.url,
        b64_json: imageData?.b64_json,
      });
    } catch (error) {
      if (sendLimitExceeded(res, error)) return;
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Failed to generate image" });
    }
  });
}

