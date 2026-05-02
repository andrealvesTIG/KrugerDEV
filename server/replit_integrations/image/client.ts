import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";
import { withAiCredits, type AiCreditContext } from "../../services/aiCredits";

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

/**
 * Required metering option for every direct OpenAI image helper in this
 * module. Pass an `AiCreditContext` to charge 1 AI credit when the call
 * succeeds. Pass `"skip"` ONLY when the caller has already enforced +
 * recorded credits at its own request boundary (e.g. `image/routes.ts`
 * meters once around its own `openai.images.generate` invocation).
 */
export type AiMeter = AiCreditContext | "skip";

async function runMetered<T>(meter: AiMeter, fn: () => Promise<T>): Promise<T> {
  if (meter === "skip") return fn();
  return withAiCredits(meter, fn);
}

/**
 * Generate an image and return as Buffer.
 * Uses gpt-image-1 model via Replit AI Integrations.
 */
export async function generateImageBuffer(
  meter: AiMeter,
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<Buffer> {
  return runMetered(meter, async () => {
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size,
    });
    const base64 = response.data?.[0]?.b64_json ?? "";
    return Buffer.from(base64, "base64");
  });
}

/**
 * Edit/combine multiple images into a composite.
 * Uses gpt-image-1 model via Replit AI Integrations.
 */
export async function editImages(
  meter: AiMeter,
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  return runMetered(meter, async () => {
    const images = await Promise.all(
      imageFiles.map((file) =>
        toFile(fs.createReadStream(file), file, {
          type: "image/png",
        })
      )
    );

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: images,
      prompt,
    });

    const imageBase64 = response.data?.[0]?.b64_json ?? "";
    const imageBytes = Buffer.from(imageBase64, "base64");

    if (outputPath) {
      fs.writeFileSync(outputPath, imageBytes);
    }

    return imageBytes;
  });
}
