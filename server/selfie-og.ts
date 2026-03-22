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
        .resize(420, 520, { fit: 'cover', position: 'centre' })
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
          <ellipse cx="600" cy="480" rx="170" ry="210" />
        </clipPath>
      </defs>
      <ellipse cx="600" cy="480" rx="178" ry="218" fill="#FF751F" />
      <ellipse cx="600" cy="480" rx="173" ry="213" fill="#1a2a5e" />
      <image href="${selfieB64}" x="430" y="270" width="340" height="420" preserveAspectRatio="xMidYMid slice" clip-path="url(#ovalClip)" />`
    : `<ellipse cx="600" cy="480" rx="178" ry="218" fill="#FF751F" />
      <ellipse cx="600" cy="480" rx="173" ry="213" fill="#1a2a5e" />
      <text x="600" y="490" text-anchor="middle" font-size="72" font-family="system-ui,sans-serif">📸</text>`;

  const interviewerLine = interviewer
    ? `<text x="600" y="780" text-anchor="middle" font-size="18" fill="#d4a44a" font-family="system-ui,sans-serif">Interviewed by ${interviewer}</text>`
    : "";

  const pmiPmogaElement = pmiPmogaLogoB64
    ? `<image href="${pmiPmogaLogoB64}" x="100" y="1100" width="320" height="65" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="260" y="1140" text-anchor="middle" font-size="18" font-weight="700" fill="white" font-family="system-ui,sans-serif">Project Management Institute</text>`;

  const fridayLogoElement = fridayLogoB64
    ? `<image href="${fridayLogoB64}" x="780" y="1108" width="280" height="50" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="920" y="1140" text-anchor="middle" font-size="24" font-weight="800" fill="white" font-family="system-ui,sans-serif">FridayReport.AI</text>`;

  const svg = `<svg width="1200" height="1200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cardBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#17255A" />
      <stop offset="100%" stop-color="#0d1a3f" />
    </linearGradient>
  </defs>

  <rect width="1200" height="1200" rx="32" fill="url(#cardBg)" />

  <text x="600" y="120" text-anchor="middle" font-size="36" font-weight="700" fill="#d4a44a" font-family="system-ui,sans-serif" letter-spacing="3">PMO UNCON 2026</text>
  <text x="600" y="170" text-anchor="middle" font-size="18" font-weight="400" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif" letter-spacing="4">NORTH AMERICA</text>

  ${selfieElement}

  <text x="600" y="750" text-anchor="middle" font-size="34" font-weight="800" fill="white" font-family="system-ui,-apple-system,sans-serif" letter-spacing="2">${userName}</text>
  ${interviewerLine}

  <rect x="400" y="820" width="400" height="52" rx="26" fill="#FF751F" />
  <text x="600" y="853" text-anchor="middle" font-size="16" font-weight="700" fill="white" font-family="system-ui,sans-serif" letter-spacing="1">I WAS THERE! 🎉</text>

  <line x1="100" y1="920" x2="1100" y2="920" stroke="rgba(255,255,255,0.08)" stroke-width="1" />

  <text x="600" y="970" text-anchor="middle" font-size="16" fill="rgba(255,255,255,0.5)" font-family="system-ui,sans-serif" letter-spacing="1">PROJECT PORTFOLIO MANAGEMENT, REIMAGINED</text>

  <rect x="380" y="1000" width="440" height="54" rx="27" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
  <text x="600" y="1034" text-anchor="middle" font-size="16" font-weight="600" fill="#FF751F" font-family="system-ui,sans-serif">fridayreport.ai</text>

  <line x1="100" y1="1080" x2="1100" y2="1080" stroke="rgba(255,255,255,0.08)" stroke-width="1" />

  ${pmiPmogaElement}
  ${fridayLogoElement}
</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer;
}
