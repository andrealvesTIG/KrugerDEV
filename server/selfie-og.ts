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

async function loadLogoBase64(filename: string, width: number, height?: number): Promise<string> {
  try {
    const logoPath = path.resolve(process.cwd(), "client", "public", filename);
    if (fs.existsSync(logoPath)) {
      const opts: sharp.ResizeOptions = { fit: 'inside' as const };
      const resized = await sharp(logoPath).resize(width, height || null, opts).png().toBuffer();
      return `data:image/png;base64,${resized.toString("base64")}`;
    }
  } catch {}
  return "";
}

async function loadLogoBase64Inverted(filename: string, width: number, height?: number): Promise<string> {
  try {
    const logoPath = path.resolve(process.cwd(), "client", "public", filename);
    if (fs.existsSync(logoPath)) {
      const opts: sharp.ResizeOptions = { fit: 'inside' as const };
      const resized = await sharp(logoPath).resize(width, height || null, opts).negate({ alpha: false }).png().toBuffer();
      return `data:image/png;base64,${resized.toString("base64")}`;
    }
  } catch {}
  return "";
}

export async function generateSelfieOgImage(data: SelfieOgData): Promise<Buffer> {
  const fridayLogoB64 = await loadLogoBase64("logo-white.png", 280);
  const pmiPmogaLogoB64 = await loadLogoBase64Inverted("pmi-pmoga-logo.png", 320, 65);

  let selfieB64 = "";
  if (data.selfieBuffer) {
    try {
      const resizedSelfie = await sharp(data.selfieBuffer)
        .resize(600, 600, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();
      selfieB64 = `data:image/png;base64,${resizedSelfie.toString("base64")}`;
    } catch {}
  }

  const userName = escapeXml((data.userName || "Attendee").toUpperCase());
  const interviewer = data.interviewer ? escapeXml(data.interviewer) : null;

  const photoSize = 600;
  const photoX = (1200 - photoSize) / 2;
  const photoY = 160;
  const borderW = photoSize + 12;
  const borderX = photoX - 6;
  const borderY = photoY - 6;

  const selfieElement = selfieB64
    ? `<defs>
        <clipPath id="squareClip">
          <rect x="${photoX}" y="${photoY}" width="${photoSize}" height="${photoSize}" rx="32" ry="32" />
        </clipPath>
      </defs>
      <rect x="${borderX}" y="${borderY}" width="${borderW}" height="${borderW}" rx="36" ry="36" fill="#FF751F" />
      <image href="${selfieB64}" x="${photoX}" y="${photoY}" width="${photoSize}" height="${photoSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#squareClip)" />`
    : `<rect x="${borderX}" y="${borderY}" width="${borderW}" height="${borderW}" rx="36" ry="36" fill="#FF751F" />
      <rect x="${photoX}" y="${photoY}" width="${photoSize}" height="${photoSize}" rx="32" ry="32" fill="#1a2a5e" />
      <text x="600" y="${photoY + photoSize / 2 + 20}" text-anchor="middle" font-size="72" font-family="system-ui,sans-serif">📸</text>`;

  const nameY = photoY + photoSize + 60;
  const interviewerLine = interviewer
    ? `<text x="600" y="${nameY + 40}" text-anchor="middle" font-size="18" fill="#d4a44a" font-family="system-ui,sans-serif">Interviewed by ${interviewer}</text>`
    : "";

  const pmiPmogaElement = pmiPmogaLogoB64
    ? `<image href="${pmiPmogaLogoB64}" x="100" y="1105" width="320" height="65" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="260" y="1140" text-anchor="middle" font-size="18" font-weight="700" fill="white" font-family="system-ui,sans-serif">Project Management Institute</text>`;

  const fridayLogoElement = fridayLogoB64
    ? `<image href="${fridayLogoB64}" x="780" y="1112" width="280" height="50" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="920" y="1140" text-anchor="middle" font-size="24" font-weight="800" fill="white" font-family="system-ui,sans-serif">FridayReport.AI</text>`;

  const svg = `<svg width="1200" height="1200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cardBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#17255A" />
      <stop offset="100%" stop-color="#0d1a3f" />
    </linearGradient>
  </defs>

  <rect width="1200" height="1200" rx="32" fill="url(#cardBg)" />

  <text x="600" y="100" text-anchor="middle" font-size="32" font-weight="700" fill="#d4a44a" font-family="system-ui,sans-serif" letter-spacing="3">PMO UNCON 2026</text>

  ${selfieElement}

  <text x="600" y="${nameY}" text-anchor="middle" font-size="36" font-weight="800" fill="white" font-family="system-ui,-apple-system,sans-serif" letter-spacing="2">${userName}</text>
  ${interviewerLine}

  <rect x="420" y="${nameY + 30}" width="360" height="48" rx="24" fill="#FF751F" />
  <text x="600" y="${nameY + 61}" text-anchor="middle" font-size="15" font-weight="700" fill="white" font-family="system-ui,sans-serif" letter-spacing="1">I WAS THERE! 🎉</text>

  <line x1="100" y1="1080" x2="1100" y2="1080" stroke="#1e3070" stroke-width="1" />

  ${pmiPmogaElement}
  ${fridayLogoElement}
</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer;
}
