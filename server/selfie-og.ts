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
  const fridayLogoB64 = await loadLogoBase64("logo-white.png", 200);
  const pmiPmogaLogoB64 = await loadLogoBase64Inverted("pmi-pmoga-logo.png", 240, 50);

  let selfieB64 = "";
  if (data.selfieBuffer) {
    try {
      const resizedSelfie = await sharp(data.selfieBuffer)
        .resize(820, 820, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();
      selfieB64 = `data:image/png;base64,${resizedSelfie.toString("base64")}`;
    } catch {}
  }

  const userName = escapeXml((data.userName || "Attendee").toUpperCase());
  const interviewer = data.interviewer ? escapeXml(data.interviewer) : null;

  const photoSize = 920;
  const photoX = (1200 - photoSize) / 2;
  const photoY = 40;

  const selfieElement = selfieB64
    ? `<defs>
        <clipPath id="squareClip">
          <rect x="${photoX}" y="${photoY}" width="${photoSize}" height="${photoSize}" rx="20" ry="20" />
        </clipPath>
      </defs>
      <rect x="${photoX - 4}" y="${photoY - 4}" width="${photoSize + 8}" height="${photoSize + 8}" rx="24" ry="24" fill="#FF751F" />
      <image href="${selfieB64}" x="${photoX}" y="${photoY}" width="${photoSize}" height="${photoSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#squareClip)" />`
    : `<rect x="${photoX - 4}" y="${photoY - 4}" width="${photoSize + 8}" height="${photoSize + 8}" rx="24" ry="24" fill="#FF751F" />
      <rect x="${photoX}" y="${photoY}" width="${photoSize}" height="${photoSize}" rx="20" ry="20" fill="#1a2a5e" />
      <text x="600" y="${photoY + photoSize / 2 + 20}" text-anchor="middle" font-size="72" font-family="system-ui,sans-serif">📸</text>`;

  const nameY = photoY + photoSize + 48;

  const interviewerLine = interviewer
    ? `<text x="600" y="${nameY + 30}" text-anchor="middle" font-size="16" fill="#d4a44a" font-family="system-ui,sans-serif">Interviewed by ${interviewer}</text>`
    : "";

  const badgeY = interviewer ? nameY + 44 : nameY + 18;

  const logoY = badgeY + 54;

  const pmiPmogaElement = pmiPmogaLogoB64
    ? `<image href="${pmiPmogaLogoB64}" x="80" y="${logoY}" width="240" height="50" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="200" y="${logoY + 30}" text-anchor="middle" font-size="14" font-weight="700" fill="white" font-family="system-ui,sans-serif">Project Management Institute</text>`;

  const fridayLogoElement = fridayLogoB64
    ? `<image href="${fridayLogoB64}" x="880" y="${logoY + 2}" width="200" height="40" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="980" y="${logoY + 28}" text-anchor="middle" font-size="20" font-weight="800" fill="white" font-family="system-ui,sans-serif">FridayReport.AI</text>`;

  const svg = `<svg width="1200" height="1200" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="1200" rx="24" fill="#111B3E" />

  ${selfieElement}

  <text x="600" y="${nameY}" text-anchor="middle" font-size="38" font-weight="800" fill="white" font-family="system-ui,-apple-system,sans-serif" letter-spacing="2">${userName}</text>
  ${interviewerLine}

  <rect x="440" y="${badgeY}" width="320" height="42" rx="21" fill="#FF751F" />
  <text x="600" y="${badgeY + 28}" text-anchor="middle" font-size="14" font-weight="700" fill="white" font-family="system-ui,sans-serif" letter-spacing="2">PMO UNCON 2026</text>

  ${pmiPmogaElement}
  ${fridayLogoElement}
</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer;
}
