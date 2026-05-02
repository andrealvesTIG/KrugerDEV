import type { Express, Request, Response } from "express";
import { openai } from "./client";
import { getUserIdFromRequest, getUserOrgIds } from "../../routes/helpers";
import {
  withAiCredits,
  sendLimitExceeded,
  getRequestIdempotencyKey,
} from "../../services/aiCredits";

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

      // Verify the caller belongs to the org they're billing — without
      // this any user could drain another org's credits by passing a
      // foreign organizationId in the body.
      const requestedOrgId = organizationId ? Number(organizationId) : null;
      if (requestedOrgId !== null) {
        const memberOrgs = await getUserOrgIds(userId);
        if (!memberOrgs.includes(requestedOrgId)) {
          return res.status(403).json({ error: "You are not a member of this organization" });
        }
      }

      const imgIdemKey = getRequestIdempotencyKey(req);
      const response = await withAiCredits(
        {
          userId,
          orgId: requestedOrgId,
          action: "integrations_image_generate",
          requestId: `integrations_image_generate_${userId}_${requestedOrgId ?? "no_org"}_${imgIdemKey}`,
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

