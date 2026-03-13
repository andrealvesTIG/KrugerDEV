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

export async function generateSelfieOgImage(data: SelfieOgData): Promise<Buffer> {
  const fridayLogoB64 = await loadLogoBase64("logo-full.png", 220);
  const pmiPmogaLogoB64 = await loadLogoBase64("pmi-pmoga-logo.png", 280, 50);

  let selfieB64 = "";
  if (data.selfieBuffer) {
    try {
      const resizedSelfie = await sharp(data.selfieBuffer)
        .resize(280, 350, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();
      selfieB64 = `data:image/png;base64,${resizedSelfie.toString("base64")}`;
    } catch {}
  }

  const userName = escapeXml(data.userName || "Attendee");
  const interviewer = data.interviewer ? escapeXml(data.interviewer) : null;

  const selfieElement = selfieB64
    ? `<defs>
        <clipPath id="ovalClip">
          <ellipse cx="600" cy="260" rx="110" ry="138" />
        </clipPath>
      </defs>
      <ellipse cx="600" cy="260" rx="116" ry="144" fill="#FF751F" />
      <ellipse cx="600" cy="260" rx="113" ry="141" fill="white" />
      <image href="${selfieB64}" x="490" y="122" width="220" height="276" preserveAspectRatio="xMidYMid slice" clip-path="url(#ovalClip)" />`
    : `<ellipse cx="600" cy="260" rx="116" ry="144" fill="#FF751F" />
      <ellipse cx="600" cy="260" rx="113" ry="141" fill="#f5f6fa" />
      <text x="600" y="270" text-anchor="middle" font-size="56" font-family="system-ui,sans-serif">📸</text>`;

  const interviewerLine = interviewer
    ? `<text x="600" y="488" text-anchor="middle" font-size="16" fill="#6b7280" font-family="system-ui,sans-serif">Interviewed by ${interviewer}</text>`
    : "";

  const pmiPmogaElement = pmiPmogaLogoB64
    ? `<image href="${pmiPmogaLogoB64}" x="110" y="552" width="280" height="50" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="250" y="582" text-anchor="middle" font-size="14" font-weight="700" fill="#9ca3af" font-family="system-ui,sans-serif">PMI \u00B7 PMO Global Alliance</text>`;

  const fridayLogoElement = fridayLogoB64
    ? `<image href="${fridayLogoB64}" x="790" y="556" width="220" height="38" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="900" y="580" text-anchor="middle" font-size="20" font-weight="800" fill="#17255A" font-family="system-ui,sans-serif">FridayReport.AI</text>`;

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#f5f6fa" />

  <rect x="60" y="16" width="1080" height="598" rx="24" fill="white" stroke="#e8eaf0" stroke-width="1" />

  <rect x="60" y="16" width="1080" height="70" rx="24" fill="#17255A" />
  <rect x="60" y="62" width="1080" height="24" fill="#17255A" />
  <text x="600" y="62" text-anchor="middle" font-size="22" font-weight="700" fill="white" font-family="system-ui,sans-serif">PMO unCON 2026 \u00B7 SELFIE EXPERIENCE</text>

  ${selfieElement}

  <text x="600" y="438" text-anchor="middle" font-size="30" font-weight="800" fill="#17255A" font-family="system-ui,-apple-system,sans-serif" letter-spacing="-0.5">${userName}</text>
  <text x="600" y="466" text-anchor="middle" font-size="16" fill="#FF751F" font-weight="600" font-family="system-ui,sans-serif">Great meeting you at PMO unCON 2026!</text>
  ${interviewerLine}

  <line x1="100" y1="520" x2="1100" y2="520" stroke="#f0f1f5" stroke-width="1" />

  <text x="600" y="545" text-anchor="middle" font-size="12" fill="#b0b5c0" font-family="system-ui,sans-serif">Gold Sponsor</text>

  ${pmiPmogaElement}
  ${fridayLogoElement}
</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer;
}
