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

function generateSunRays(cx: number, cy: number, innerR: number, outerR: number, count: number): string {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i * 360) / count;
    const rad = (angle * Math.PI) / 180;
    const x1 = cx + Math.cos(rad) * innerR;
    const y1 = cy + Math.sin(rad) * innerR;
    const x2 = cx + Math.cos(rad) * outerR;
    const y2 = cy + Math.sin(rad) * outerR;
    const isMain = i % 2 === 0;
    lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${isMain ? '#FF751F' : '#FFD700'}" stroke-width="${isMain ? '3' : '1.5'}" stroke-linecap="round" opacity="${isMain ? '0.6' : '0.35'}" />`);
  }
  return lines.join('\n    ');
}

export async function generateSelfieOgImage(data: SelfieOgData): Promise<Buffer> {
  const fridayLogoB64 = await loadLogoBase64("frai-logo-white.png", 200);
  const pmiPmogaLogoB64 = await loadLogoBase64("pmi-pmoga-logo.png", 200, 40);

  let selfieB64 = "";
  if (data.selfieBuffer) {
    try {
      const resizedSelfie = await sharp(data.selfieBuffer)
        .resize(240, 240, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();
      selfieB64 = `data:image/png;base64,${resizedSelfie.toString("base64")}`;
    } catch {}
  }

  const userName = escapeXml(data.userName || "Attendee");
  const interviewer = data.interviewer ? escapeXml(data.interviewer) : null;

  const cx = 600;
  const cy = 265;
  const photoR = 100;
  const sunRays = generateSunRays(cx, cy, photoR + 8, photoR + 55, 20);

  const selfieElement = selfieB64
    ? `<defs>
        <clipPath id="circleClip">
          <circle cx="${cx}" cy="${cy}" r="${photoR}" />
        </clipPath>
        <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FF751F" stop-opacity="0.25" />
          <stop offset="60%" stop-color="#FF751F" stop-opacity="0.08" />
          <stop offset="100%" stop-color="#FF751F" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${photoR + 65}" fill="url(#glowGrad)" />
      ${sunRays}
      <circle cx="${cx}" cy="${cy}" r="${photoR + 4}" fill="#FF751F" />
      <circle cx="${cx}" cy="${cy}" r="${photoR + 1}" fill="#17255A" />
      <image href="${selfieB64}" x="${cx - photoR}" y="${cy - photoR}" width="${photoR * 2}" height="${photoR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#circleClip)" />`
    : `<circle cx="${cx}" cy="${cy}" r="${photoR + 4}" fill="#FF751F" />
      <circle cx="${cx}" cy="${cy}" r="${photoR + 1}" fill="#1e2d5a" />
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="56" font-family="system-ui,sans-serif">📸</text>`;

  const interviewerLine = interviewer
    ? `<text x="${cx}" y="448" text-anchor="middle" font-size="15" fill="#D4A84A" font-family="system-ui,sans-serif" opacity="0.8">Interviewed by ${interviewer}</text>`
    : "";

  const pmiPmogaElement = pmiPmogaLogoB64
    ? `<image href="${pmiPmogaLogoB64}" x="${cx - 100}" y="30" width="200" height="40" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${cx}" y="55" text-anchor="middle" font-size="14" font-weight="700" fill="#9ca3af" font-family="system-ui,sans-serif">PMI · PMO Global Alliance</text>`;

  const fridayLogoElement = fridayLogoB64
    ? `<image href="${fridayLogoB64}" x="${cx - 100}" y="555" width="200" height="40" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${cx}" y="580" text-anchor="middle" font-size="20" font-weight="800" fill="white" font-family="system-ui,sans-serif">FridayReport.AI</text>`;

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#17255A" />
      <stop offset="50%" stop-color="#0F1B3D" />
      <stop offset="100%" stop-color="#0A1128" />
    </linearGradient>
    <linearGradient id="topLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#FFD700" />
      <stop offset="25%" stop-color="#FF751F" />
      <stop offset="50%" stop-color="#DC2626" />
      <stop offset="75%" stop-color="#FF751F" />
      <stop offset="100%" stop-color="#FFD700" />
    </linearGradient>
    <linearGradient id="bottomLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="transparent" />
      <stop offset="20%" stop-color="#FF751F" />
      <stop offset="50%" stop-color="#FFD700" />
      <stop offset="80%" stop-color="#FF751F" />
      <stop offset="100%" stop-color="transparent" />
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bgGrad)" />

  <rect x="80" y="20" width="1040" height="590" rx="20" fill="none" stroke="rgba(255,117,31,0.2)" stroke-width="1" />

  <rect x="80" y="20" width="1040" height="3" rx="1.5" fill="url(#topLine)" />

  ${pmiPmogaElement}

  <text x="${cx}" y="105" text-anchor="middle" font-size="12" font-weight="800" fill="#D4A84A" font-family="system-ui,sans-serif" letter-spacing="4" opacity="0.7">PMO unCON 2026</text>

  ${selfieElement}

  <text x="${cx}" y="420" text-anchor="middle" font-size="28" font-weight="800" fill="white" font-family="system-ui,-apple-system,sans-serif" letter-spacing="-0.5">${userName}</text>
  ${interviewerLine}

  <text x="${cx}" y="480" text-anchor="middle" font-size="14" fill="#FF751F" font-weight="600" font-family="system-ui,sans-serif" opacity="0.9">Great meeting you at PMO unCON 2026!</text>

  <rect x="200" y="520" width="800" height="1" fill="url(#bottomLine)" opacity="0.3" />

  <text x="${cx}" y="545" text-anchor="middle" font-size="11" fill="#9ca3af" font-family="system-ui,sans-serif" opacity="0.5">Gold Sponsor</text>

  ${fridayLogoElement}
</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer;
}
