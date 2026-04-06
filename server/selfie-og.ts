import sharp from "sharp";
import path from "path";
import fs from "fs";

export interface SelfieOgData {
  userName: string;
  interviewer: string | null;
  selfieBuffer: Buffer | null;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const MAX_SELFIE_BUFFER_SIZE = 15 * 1024 * 1024;

async function loadLogoPng(filename: string, width: number, height?: number): Promise<Buffer | null> {
  try {
    const logoPath = path.resolve(process.cwd(), "client", "public", filename);
    if (fs.existsSync(logoPath)) {
      const opts: sharp.ResizeOptions = { fit: 'inside' as const };
      return await sharp(logoPath).resize(width, height || null, opts).png().toBuffer();
    }
  } catch (err) {
    console.error(`[selfie-og] Failed to load logo ${filename}:`, err);
  }
  return null;
}

async function loadLogoPngInverted(filename: string, width: number, height?: number): Promise<Buffer | null> {
  try {
    const logoPath = path.resolve(process.cwd(), "client", "public", filename);
    if (fs.existsSync(logoPath)) {
      const opts: sharp.ResizeOptions = { fit: 'inside' as const };
      return await sharp(logoPath).resize(width, height || null, opts).negate({ alpha: false }).png().toBuffer();
    }
  } catch (err) {
    console.error(`[selfie-og] Failed to load inverted logo ${filename}:`, err);
  }
  return null;
}

async function validateAndResizeSelfie(buffer: Buffer): Promise<Buffer | null> {
  if (buffer.length > MAX_SELFIE_BUFFER_SIZE) {
    console.warn(`[selfie-og] Selfie buffer too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB), skipping`);
    return null;
  }
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height || !metadata.format) {
      console.warn('[selfie-og] Invalid image metadata, skipping');
      return null;
    }
    return await sharp(buffer)
      .resize(600, 600, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
  } catch (err) {
    console.error('[selfie-og] Failed to validate/resize selfie:', err);
    return null;
  }
}

export async function generateSelfieOgImage(data: SelfieOgData): Promise<Buffer> {
  const userName = escapeXml((data.userName || "Attendee").toUpperCase());
  const interviewer = data.interviewer ? escapeXml(data.interviewer) : null;

  let selfieResized: Buffer | null = null;
  if (data.selfieBuffer) {
    selfieResized = await validateAndResizeSelfie(data.selfieBuffer);
  }

  const photoSize = 620;
  const photoX = (1200 - photoSize) / 2;
  const photoY = 50;
  const nameY = photoY + photoSize + 56;

  const interviewerLine = interviewer
    ? `<text x="600" y="${nameY + 30}" text-anchor="middle" font-size="16" fill="#d4a44a" font-family="system-ui,sans-serif">Interviewed by ${interviewer}</text>`
    : "";

  const badgeY = interviewer ? nameY + 44 : nameY + 18;
  const logoY = badgeY + 54;

  const selfieElement = selfieResized
    ? `<rect x="${photoX - 4}" y="${photoY - 4}" width="${photoSize + 8}" height="${photoSize + 8}" rx="24" ry="24" fill="#FF751F" />`
    : `<rect x="${photoX - 4}" y="${photoY - 4}" width="${photoSize + 8}" height="${photoSize + 8}" rx="24" ry="24" fill="#FF751F" />
      <rect x="${photoX}" y="${photoY}" width="${photoSize}" height="${photoSize}" rx="20" ry="20" fill="#1a2a5e" />`;

  const svg = `<svg width="1200" height="1200" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="1200" rx="24" fill="#111B3E" />

  ${selfieElement}

  <text x="600" y="${nameY}" text-anchor="middle" font-size="38" font-weight="800" fill="white" font-family="system-ui,-apple-system,sans-serif" letter-spacing="2">${userName}</text>
  ${interviewerLine}

  <rect x="440" y="${badgeY}" width="320" height="42" rx="21" fill="#FF751F" />
  <text x="600" y="${badgeY + 28}" text-anchor="middle" font-size="14" font-weight="700" fill="white" font-family="system-ui,sans-serif" letter-spacing="2">PMO UNCON 2026</text>
</svg>`;

  let baseImage = await sharp(Buffer.from(svg)).png().toBuffer();

  const compositeInputs: sharp.OverlayOptions[] = [];

  if (selfieResized) {
    const roundedSelfie = await sharp(selfieResized)
      .resize(photoSize, photoSize, { fit: 'cover' })
      .composite([{
        input: Buffer.from(
          `<svg width="${photoSize}" height="${photoSize}">
            <rect width="${photoSize}" height="${photoSize}" rx="20" ry="20" fill="white"/>
          </svg>`
        ),
        blend: 'dest-in',
      }])
      .png()
      .toBuffer();

    compositeInputs.push({
      input: roundedSelfie,
      top: photoY,
      left: photoX,
    });
  }

  const [fridayLogoPng, pmiPmogaLogoPng] = await Promise.all([
    loadLogoPng("logo-white.png", 340),
    loadLogoPngInverted("pmi-pmoga-logo.png", 380, 78),
  ]);

  if (pmiPmogaLogoPng) {
    compositeInputs.push({
      input: pmiPmogaLogoPng,
      top: logoY,
      left: 60,
    });
  }

  if (fridayLogoPng) {
    compositeInputs.push({
      input: fridayLogoPng,
      top: logoY + 8,
      left: 780,
    });
  }

  if (compositeInputs.length > 0) {
    baseImage = await sharp(baseImage).composite(compositeInputs).png().toBuffer();
  }

  return baseImage;
}
