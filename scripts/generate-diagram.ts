import sharp from "sharp";
import * as fs from "fs";

const W = 2400;
const H = 2200;

const BRAND_ORANGE = "#FF751F";
const BRAND_BLUE = "#075DD1";
const BRAND_DARK = "#17255A";
const GREEN = "#10B981";
const PURPLE = "#7C3AED";
const TEAL = "#0891B2";
const ROSE = "#E11D48";
const GRAY = "#6B7280";
const LIGHT_GRAY = "#F3F4F6";
const WHITE = "#FFFFFF";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sublabel?: string;
  color: string;
  textColor?: string;
  rounded?: number;
  icon?: string;
}

interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  color?: string;
  dashed?: boolean;
}

interface Note {
  x: number;
  y: number;
  w: number;
  lines: string[];
  color: string;
  title?: string;
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function roundedRect(x: number, y: number, w: number, h: number, r: number, fill: string, stroke: string, strokeWidth = 2): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function renderBox(b: Box): string {
  const r = b.rounded ?? 12;
  const tc = b.textColor ?? WHITE;
  let svg = roundedRect(b.x, b.y, b.w, b.h, r, b.color, b.color, 0);
  const cx = b.x + b.w / 2;
  if (b.sublabel) {
    svg += `<text x="${cx}" y="${b.y + b.h / 2 - 8}" text-anchor="middle" fill="${tc}" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700">${escXml(b.label)}</text>`;
    svg += `<text x="${cx}" y="${b.y + b.h / 2 + 14}" text-anchor="middle" fill="${tc}" font-family="Segoe UI, Arial, sans-serif" font-size="13" opacity="0.85">${escXml(b.sublabel)}</text>`;
  } else {
    svg += `<text x="${cx}" y="${b.y + b.h / 2 + 6}" text-anchor="middle" fill="${tc}" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="600">${escXml(b.label)}</text>`;
  }
  return svg;
}

let arrowCounter = 0;

function renderArrow(a: Arrow): string {
  const color = a.color ?? GRAY;
  const markerId = `ah${++arrowCounter}`;
  let svg = `<defs><marker id="${markerId}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${color}"/></marker></defs>`;
  const dash = a.dashed ? ` stroke-dasharray="8,4"` : "";
  svg += `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke="${color}" stroke-width="2.5" marker-end="url(#${markerId})"${dash}/>`;
  if (a.label) {
    const mx = (a.x1 + a.x2) / 2;
    const my = (a.y1 + a.y2) / 2;
    const isVertical = Math.abs(a.x2 - a.x1) < Math.abs(a.y2 - a.y1);
    const tx = isVertical ? mx + 8 : mx;
    const ty = isVertical ? my : my - 8;
    svg += `<text x="${tx}" y="${ty}" text-anchor="${isVertical ? 'start' : 'middle'}" fill="${color}" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-style="italic">${escXml(a.label)}</text>`;
  }
  return svg;
}

function renderNote(n: Note): string {
  const lineH = 18;
  const padding = 14;
  const h = (n.title ? lineH + 6 : 0) + n.lines.length * lineH + padding * 2;
  let svg = roundedRect(n.x, n.y, n.w, h, 8, WHITE, n.color, 2);
  svg += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="6" rx="8" ry="8" fill="${n.color}"/>`;
  svg += `<rect x="${n.x}" y="${n.y + 3}" width="${n.w}" height="3" fill="${n.color}"/>`;
  let ty = n.y + padding + 14;
  if (n.title) {
    svg += `<text x="${n.x + padding}" y="${ty}" fill="${n.color}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">${escXml(n.title)}</text>`;
    ty += lineH + 4;
  }
  for (const line of n.lines) {
    svg += `<text x="${n.x + padding}" y="${ty}" fill="${BRAND_DARK}" font-family="Segoe UI, Arial, sans-serif" font-size="12">${escXml(line)}</text>`;
    ty += lineH;
  }
  return svg;
}

function renderSectionLabel(x: number, y: number, w: number, label: string, color: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="32" rx="6" ry="6" fill="${color}" opacity="0.12"/>` +
    `<text x="${x + 14}" y="${y + 21}" fill="${color}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="1">${escXml(label)}</text>`;
}

function renderTitle(x: number, y: number, text: string, size: number, color: string, opts?: { bold?: boolean; anchor?: string }): string {
  const fw = opts?.bold !== false ? ` font-weight="700"` : "";
  const ta = opts?.anchor ?? "middle";
  return `<text x="${x}" y="${y}" text-anchor="${ta}" fill="${color}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}"${fw}>${escXml(text)}</text>`;
}

function buildDiagram(): string {
  let content = "";

  content += renderTitle(W / 2, 50, "FridayReport.AI - Azure Container App Deployment Flow", 28, BRAND_DARK);
  content += renderTitle(W / 2, 78, "End-to-end deployment pipeline from source code to production", 15, GRAY, { bold: false });

  // ── SECTION 1: BUILD (left column, top) ──
  content += renderSectionLabel(40, 110, 540, "STAGE 1: BUILD / CONTAINERIZE", GREEN);

  const buildBoxes: Box[] = [
    { x: 60, y: 160, w: 200, h: 60, label: "Source Code", sublabel: "TypeScript / React", color: GREEN },
    { x: 60, y: 260, w: 200, h: 60, label: "npm run build", sublabel: "Vite + esbuild", color: GREEN },
    { x: 60, y: 360, w: 200, h: 60, label: "Build Artifacts", sublabel: "dist/index.cjs + dist/public/", color: GREEN },
    { x: 60, y: 460, w: 200, h: 60, label: "Docker Build", sublabel: "Multi-stage Dockerfile", color: GREEN },
    { x: 60, y: 560, w: 200, h: 60, label: "Container Image", sublabel: "Node.js 20 + JRE 17", color: GREEN },
  ];

  for (const b of buildBoxes) content += renderBox(b);

  content += renderArrow({ x1: 160, y1: 220, x2: 160, y2: 260 });
  content += renderArrow({ x1: 160, y1: 320, x2: 160, y2: 360 });
  content += renderArrow({ x1: 160, y1: 420, x2: 160, y2: 460 });
  content += renderArrow({ x1: 160, y1: 520, x2: 160, y2: 560 });

  // Build notes
  content += renderNote({
    x: 300, y: 160, w: 260, title: "Build Output",
    lines: ["dist/index.cjs (bundled server)", "dist/public/ (React SPA)", "public/ (avatars, logos)", "lib/ (MPXJ JARs)"],
    color: GREEN,
  });

  // ── SECTION 2: REGISTRY ──
  content += renderSectionLabel(40, 660, 540, "STAGE 2: REGISTRY", BRAND_BLUE);

  content += renderBox({ x: 60, y: 710, w: 200, h: 60, label: "Push to ACR", sublabel: "Azure Container Registry", color: BRAND_BLUE });

  content += renderArrow({ x1: 160, y1: 620, x2: 160, y2: 710, label: "docker push" });

  content += renderNote({
    x: 300, y: 700, w: 260, title: "ACR Configuration",
    lines: ["SKU: Standard (or Premium)", "Auth: Managed Identity (AcrPull)", "Alt: az acr build (cloud build)"],
    color: BRAND_BLUE,
  });

  // ── SECTION 3: AZURE INFRASTRUCTURE (right side) ──
  content += renderSectionLabel(640, 110, 580, "STAGE 3: AZURE INFRASTRUCTURE", BRAND_DARK);

  const infraBoxes: Box[] = [
    { x: 660, y: 160, w: 220, h: 55, label: "Resource Group", sublabel: "fridayreport-rg", color: BRAND_DARK },
    { x: 660, y: 250, w: 220, h: 55, label: "PostgreSQL Flexible", sublabel: "Database Server", color: BRAND_BLUE },
    { x: 660, y: 340, w: 220, h: 55, label: "Azure Blob Storage", sublabel: "File Uploads & Documents", color: TEAL },
    { x: 660, y: 430, w: 220, h: 55, label: "Azure Key Vault", sublabel: "Secrets Management", color: PURPLE },
    { x: 660, y: 520, w: 220, h: 55, label: "Log Analytics", sublabel: "Monitoring Workspace", color: GRAY },
    { x: 660, y: 610, w: 220, h: 55, label: "Container App Env", sublabel: "Hosting Environment", color: BRAND_DARK },
  ];

  for (const b of infraBoxes) content += renderBox(b);

  content += renderArrow({ x1: 770, y1: 215, x2: 770, y2: 250, color: BRAND_DARK });
  content += renderArrow({ x1: 770, y1: 305, x2: 770, y2: 340, color: BRAND_DARK });
  content += renderArrow({ x1: 770, y1: 395, x2: 770, y2: 430, color: BRAND_DARK });
  content += renderArrow({ x1: 770, y1: 485, x2: 770, y2: 520, color: BRAND_DARK });
  content += renderArrow({ x1: 770, y1: 575, x2: 770, y2: 610, color: BRAND_DARK });

  // Infrastructure notes
  content += renderNote({
    x: 920, y: 240, w: 280, title: "PostgreSQL Config",
    lines: ["Version: 15+", "SKU: Standard_D4ds_v4 (prod)", "Extension: unaccent", "HA: zone-redundant"],
    color: BRAND_BLUE,
  });

  content += renderNote({
    x: 920, y: 420, w: 280, title: "Key Vault Secrets",
    lines: ["DATABASE_URL", "SESSION_SECRET", "GOOGLE_CLIENT_ID/SECRET", "MICROSOFT_CLIENT_ID/SECRET", "RESEND_API_KEY"],
    color: PURPLE,
  });

  // ── SECTION 4: DEPLOYMENT (center-bottom) ──
  content += renderSectionLabel(40, 810, 1180, "STAGE 4: DEPLOY CONTAINER APP", BRAND_ORANGE);

  content += renderBox({ x: 60, y: 870, w: 250, h: 70, label: "Deploy Container App", sublabel: "az containerapp create", color: BRAND_ORANGE });

  // Arrow from ACR to deploy
  content += renderArrow({ x1: 160, y1: 770, x2: 160, y2: 870, label: "pull image", color: BRAND_ORANGE });
  // Arrow from Container App Env to deploy
  content += renderArrow({ x1: 770, y1: 665, x2: 770, y2: 810, color: BRAND_DARK, dashed: true });
  content += renderArrow({ x1: 770, y1: 810, x2: 310, y2: 905, color: BRAND_DARK, dashed: true });

  content += renderBox({ x: 370, y: 870, w: 250, h: 70, label: "Managed Identity", sublabel: "ACR + Key Vault + Blob", color: PURPLE });
  content += renderArrow({ x1: 310, y1: 905, x2: 370, y2: 905, color: BRAND_ORANGE });

  content += renderBox({ x: 680, y: 870, w: 250, h: 70, label: "Ingress & Custom Domain", sublabel: "HTTPS + TLS Certificate", color: BRAND_BLUE });
  content += renderArrow({ x1: 620, y1: 905, x2: 680, y2: 905, color: BRAND_ORANGE });

  // Deploy notes
  content += renderNote({
    x: 60, y: 970, w: 280, title: "Container App Config",
    lines: ["CPU: 1.0-2.0 vCPU", "Memory: 2.0-4.0 Gi", "Min replicas: 2 (prod)", "Max replicas: 10", "Target port: 5000"],
    color: BRAND_ORANGE,
  });

  content += renderNote({
    x: 370, y: 970, w: 280, title: "Identity Role Assignments",
    lines: ["AcrPull on Container Registry", "Key Vault Secrets User", "Storage Blob Data Contributor"],
    color: PURPLE,
  });

  content += renderNote({
    x: 680, y: 970, w: 280, title: "DNS Configuration",
    lines: ["CNAME: app -> *.azurecontainerapps.io", "TXT: asuid.app -> verification ID", "Managed TLS certificate", "Update OAuth redirect URIs"],
    color: BRAND_BLUE,
  });

  // ── SECTION 5: RUNTIME (bottom) ──
  content += renderSectionLabel(40, 1150, 1180, "STAGE 5: RUNTIME ARCHITECTURE", ROSE);

  // Central running app
  content += renderBox({ x: 340, y: 1210, w: 320, h: 80, label: "FridayReport.AI", sublabel: "Container App (Node.js + Express + React SPA)", color: ROSE });

  // Connected services
  const runtimeServices: Box[] = [
    { x: 60, y: 1340, w: 180, h: 55, label: "PostgreSQL", sublabel: "Data Persistence", color: BRAND_BLUE },
    { x: 270, y: 1340, w: 180, h: 55, label: "Blob Storage", sublabel: "File Storage", color: TEAL },
    { x: 480, y: 1340, w: 180, h: 55, label: "Key Vault", sublabel: "Secrets", color: PURPLE },
    { x: 690, y: 1340, w: 180, h: 55, label: "Log Analytics", sublabel: "Monitoring", color: GRAY },
  ];
  for (const b of runtimeServices) content += renderBox(b);

  content += renderArrow({ x1: 400, y1: 1290, x2: 150, y2: 1340, color: BRAND_BLUE });
  content += renderArrow({ x1: 450, y1: 1290, x2: 360, y2: 1340, color: TEAL });
  content += renderArrow({ x1: 550, y1: 1290, x2: 570, y2: 1340, color: PURPLE });
  content += renderArrow({ x1: 600, y1: 1290, x2: 780, y2: 1340, color: GRAY });

  // External services
  content += renderSectionLabel(40, 1430, 1180, "EXTERNAL SERVICES (Outbound)", GRAY);

  const externalServices: Box[] = [
    { x: 120, y: 1480, w: 180, h: 50, label: "Microsoft Graph", sublabel: "Planner / Dataverse", color: BRAND_BLUE },
    { x: 340, y: 1480, w: 180, h: 50, label: "Google OAuth", sublabel: "Authentication", color: GREEN },
    { x: 560, y: 1480, w: 180, h: 50, label: "Resend", sublabel: "Email Delivery", color: BRAND_ORANGE },
  ];
  for (const b of externalServices) content += renderBox(b);

  // Users at top
  content += renderBox({ x: 400, y: 1130, w: 200, h: 50, label: "End Users", sublabel: "HTTPS Traffic", color: BRAND_DARK, rounded: 25 });
  content += renderArrow({ x1: 500, y1: 1180, x2: 500, y2: 1210, color: BRAND_DARK, label: "Ingress" });

  // Cron jobs note
  content += renderNote({
    x: 720, y: 1200, w: 260, title: "Background Jobs",
    lines: ["Scheduled reports (every 15 min)", "Timesheet reminders (weekdays)", "node-cron inside container"],
    color: ROSE,
  });

  // ── LEGEND ──
  const legendY = 1580;
  content += `<text x="60" y="${legendY}" fill="${BRAND_DARK}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">LEGEND</text>`;
  const legendItems = [
    { color: GREEN, label: "Build / Containerize" },
    { color: BRAND_BLUE, label: "Registry / Networking" },
    { color: BRAND_DARK, label: "Infrastructure" },
    { color: BRAND_ORANGE, label: "Deployment" },
    { color: PURPLE, label: "Security / Identity" },
    { color: ROSE, label: "Runtime" },
  ];
  let lx = 60;
  for (const item of legendItems) {
    content += `<rect x="${lx}" y="${legendY + 10}" width="16" height="16" rx="3" fill="${item.color}"/>`;
    content += `<text x="${lx + 22}" y="${legendY + 23}" fill="${BRAND_DARK}" font-family="Segoe UI, Arial, sans-serif" font-size="13">${escXml(item.label)}</text>`;
    lx += 170;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="1640" viewBox="0 0 ${W} 1640">
    <rect width="${W}" height="1640" fill="${WHITE}"/>
    ${content}
  </svg>`;
}

async function main() {
  const svg = buildDiagram();
  fs.writeFileSync("scripts/deployment-flow.svg", svg);

  const pngBuffer = await sharp(Buffer.from(svg)).png({ quality: 100 }).toBuffer();
  fs.writeFileSync("scripts/deployment-flow.png", pngBuffer);

  console.log("Diagram generated: scripts/deployment-flow.png");
  console.log(`Size: ${(pngBuffer.length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
