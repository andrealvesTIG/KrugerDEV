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
  const fridayLogoB64 = await loadLogoBase64("logo-white.png", 240);
  const pmiPmogaLogoB64 = await loadLogoBase64Inverted("pmi-pmoga-logo.png", 280, 55);

  let selfieB64 = "";
  if (data.selfieBuffer) {
    try {
      const resizedSelfie = await sharp(data.selfieBuffer)
        .resize(320, 400, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();
      selfieB64 = `data:image/png;base64,${resizedSelfie.toString("base64")}`;
    } catch {}
  }

  const userName = escapeXml((data.userName || "Attendee").toUpperCase());
  const interviewer = data.interviewer ? escapeXml(data.interviewer) : null;

  const selfieElement = selfieB64
    ? `<defs>
        <clipPath id="ovalClip">
          <ellipse cx="600" cy="290" rx="130" ry="160" />
        </clipPath>
      </defs>
      <ellipse cx="600" cy="290" rx="138" ry="168" fill="#FF751F" />
      <ellipse cx="600" cy="290" rx="133" ry="163" fill="#1a2a5e" />
      <image href="${selfieB64}" x="470" y="130" width="260" height="320" preserveAspectRatio="xMidYMid slice" clip-path="url(#ovalClip)" />`
    : `<ellipse cx="600" cy="290" rx="138" ry="168" fill="#FF751F" />
      <ellipse cx="600" cy="290" rx="133" ry="163" fill="#1a2a5e" />
      <text x="600" y="300" text-anchor="middle" font-size="56" font-family="system-ui,sans-serif">📸</text>`;

  const interviewerLine = interviewer
    ? `<text x="600" y="530" text-anchor="middle" font-size="16" fill="#d4a44a" font-family="system-ui,sans-serif">Interviewed by ${interviewer}</text>`
    : "";

  const pmiPmogaElement = pmiPmogaLogoB64
    ? `<image href="${pmiPmogaLogoB64}" x="120" y="560" width="280" height="55" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="260" y="592" text-anchor="middle" font-size="16" font-weight="700" fill="white" font-family="system-ui,sans-serif">Project Management Institute</text>`;

  const fridayLogoElement = fridayLogoB64
    ? `<image href="${fridayLogoB64}" x="780" y="566" width="240" height="42" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="900" y="592" text-anchor="middle" font-size="22" font-weight="800" fill="white" font-family="system-ui,sans-serif">FridayReport.AI</text>`;

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cardBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#17255A" />
      <stop offset="100%" stop-color="#0d1a3f" />
    </linearGradient>
  </defs>

  <rect width="1200" height="630" rx="32" fill="url(#cardBg)" />

  <text x="600" y="80" text-anchor="middle" font-size="28" font-weight="700" fill="#d4a44a" font-family="system-ui,sans-serif" letter-spacing="2">PMO UNCON 2026</text>

  ${selfieElement}

  <text x="600" y="498" text-anchor="middle" font-size="28" font-weight="800" fill="white" font-family="system-ui,-apple-system,sans-serif" letter-spacing="1.5">${userName}</text>
  ${interviewerLine}

  <line x1="120" y1="548" x2="1080" y2="548" stroke="rgba(255,255,255,0.1)" stroke-width="1" />

  ${pmiPmogaElement}
  ${fridayLogoElement}
</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer;
}
