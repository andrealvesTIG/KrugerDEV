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
  const fridayLogoB64 = await loadLogoBase64("logo-white.png", 340);
  const pmiPmogaLogoB64 = await loadLogoBase64Inverted("pmi-pmoga-logo.png", 380, 78);

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
    ? `<image href="${pmiPmogaLogoB64}" x="60" y="${logoY}" width="380" height="78" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="250" y="${logoY + 45}" text-anchor="middle" font-size="18" font-weight="700" fill="white" font-family="system-ui,sans-serif">Project Management Institute</text>`;

  const fridayLogoElement = fridayLogoB64
    ? `<image href="${fridayLogoB64}" x="780" y="${logoY + 8}" width="340" height="60" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="950" y="${logoY + 42}" text-anchor="middle" font-size="26" font-weight="800" fill="white" font-family="system-ui,sans-serif">FridayReport.AI</text>`;

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
