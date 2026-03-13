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

async function loadLogoWhite(filename: string, width: number, height?: number): Promise<string> {
  try {
    const logoPath = path.resolve(process.cwd(), "client", "public", filename);
    if (fs.existsSync(logoPath)) {
      const opts: sharp.ResizeOptions = { fit: 'inside' as const };
      let pipeline = sharp(logoPath).resize(width, height || null, opts);
      pipeline = pipeline.negate({ alpha: false });
      const buf = await pipeline.png().toBuffer();
      return `data:image/png;base64,${buf.toString("base64")}`;
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
    lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${isMain ? '#FF751F' : '#FFD700'}" stroke-width="${isMain ? '3' : '1.5'}" stroke-linecap="round" opacity="${isMain ? '0.5' : '0.25'}" />`);
  }
  return lines.join('\n    ');
}

export async function generateSelfieOgImage(data: SelfieOgData): Promise<Buffer> {
  const fridayLogoB64 = await loadLogoBase64("frai-logo-white.png", 240);
  const pmiPmogaLogoB64 = await loadLogoWhite("pmi-pmoga-logo.png", 200, 50);

  let selfieB64 = "";
  if (data.selfieBuffer) {
    try {
      const resizedSelfie = await sharp(data.selfieBuffer)
        .resize(360, 360, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer();
      selfieB64 = `data:image/png;base64,${resizedSelfie.toString("base64")}`;
    } catch {}
  }

  const userName = escapeXml(data.userName || "Attendee");
  const interviewer = data.interviewer ? escapeXml(data.interviewer) : null;

  const W = 630;
  const H = 1120;
  const cx = W / 2;
  const photoR = 140;
  const photoCy = 370;
  const sunRays = generateSunRays(cx, photoCy, photoR + 10, photoR + 80, 24);

  const selfieElement = selfieB64
    ? `<defs>
        <clipPath id="circleClip">
          <circle cx="${cx}" cy="${photoCy}" r="${photoR}" />
        </clipPath>
        <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FF751F" stop-opacity="0.3" />
          <stop offset="50%" stop-color="#FF751F" stop-opacity="0.1" />
          <stop offset="100%" stop-color="#FF751F" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="${cx}" cy="${photoCy}" r="${photoR + 90}" fill="url(#glowGrad)" />
      ${sunRays}
      <circle cx="${cx}" cy="${photoCy}" r="${photoR + 5}" fill="#FF751F" />
      <circle cx="${cx}" cy="${photoCy}" r="${photoR + 2}" fill="#17255A" />
      <image href="${selfieB64}" x="${cx - photoR}" y="${photoCy - photoR}" width="${photoR * 2}" height="${photoR * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#circleClip)" />`
    : `<circle cx="${cx}" cy="${photoCy}" r="${photoR + 5}" fill="#FF751F" />
      <circle cx="${cx}" cy="${photoCy}" r="${photoR + 2}" fill="#1e2d5a" />
      <text x="${cx}" y="${photoCy + 20}" text-anchor="middle" font-size="72" font-family="system-ui,sans-serif">📸</text>`;

  const interviewerLine = interviewer
    ? `<text x="${cx}" y="640" text-anchor="middle" font-size="18" fill="#D4A84A" font-family="system-ui,sans-serif" opacity="0.8">Interviewed by ${interviewer}</text>`
    : "";

  const pmiElement = pmiPmogaLogoB64
    ? `<image href="${pmiPmogaLogoB64}" x="${cx - 100}" y="50" width="200" height="50" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${cx}" y="80" text-anchor="middle" font-size="16" font-weight="700" fill="white" font-family="system-ui,sans-serif">Project Management Institute</text>`;

  const fridayElement = fridayLogoB64
    ? `<image href="${fridayLogoB64}" x="${cx - 120}" y="1020" width="240" height="50" preserveAspectRatio="xMidYMid meet" />`
    : `<text x="${cx}" y="1050" text-anchor="middle" font-size="24" font-weight="800" fill="white" font-family="system-ui,sans-serif">FridayReport.AI</text>`;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
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
    <linearGradient id="dividerLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="transparent" />
      <stop offset="20%" stop-color="#FF751F" />
      <stop offset="50%" stop-color="#FFD700" />
      <stop offset="80%" stop-color="#FF751F" />
      <stop offset="100%" stop-color="transparent" />
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bgGrad)" />

  <rect x="0" y="0" width="${W}" height="4" fill="url(#topLine)" />

  ${pmiElement}

  <text x="${cx}" y="150" text-anchor="middle" font-size="16" font-weight="800" fill="#D4A84A" font-family="system-ui,sans-serif" letter-spacing="6" opacity="0.8">PMO unCON 2026</text>

  ${selfieElement}

  <text x="${cx}" y="590" text-anchor="middle" font-size="36" font-weight="800" fill="white" font-family="system-ui,-apple-system,sans-serif" letter-spacing="-0.5">${userName}</text>
  ${interviewerLine}

  <text x="${cx}" y="${interviewer ? 700 : 670}" text-anchor="middle" font-size="18" fill="#FF751F" font-weight="600" font-family="system-ui,sans-serif" opacity="0.9">Great meeting you at PMO unCON 2026!</text>

  <rect x="80" y="940" width="${W - 160}" height="1" fill="url(#dividerLine)" opacity="0.3" />

  <text x="${cx}" y="975" text-anchor="middle" font-size="13" fill="#9ca3af" font-family="system-ui,sans-serif" opacity="0.5">Gold Sponsor</text>

  ${fridayElement}
</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer;
}
