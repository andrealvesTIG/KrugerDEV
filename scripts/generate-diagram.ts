import sharp from "sharp";
import * as fs from "fs";

const W = 1200;
const BRAND_ORANGE = "#FF751F";
const BRAND_BLUE = "#075DD1";
const BRAND_DARK = "#17255A";
const GREEN = "#10B981";
const PURPLE = "#7C3AED";
const TEAL = "#0891B2";
const ROSE = "#E11D48";
const GRAY = "#6B7280";
const WHITE = "#FFFFFF";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

let _aid = 0;
function arrowMarker(color: string): { id: string; def: string } {
  const id = `am${++_aid}`;
  return {
    id,
    def: `<defs><marker id="${id}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${color}"/></marker></defs>`,
  };
}

function box(x: number, y: number, w: number, h: number, label: string, sub: string, color: string, opts?: { rounded?: number; textColor?: string }): string {
  const r = opts?.rounded ?? 10;
  const tc = opts?.textColor ?? WHITE;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${color}"/>`;
  const cx = x + w / 2;
  if (sub) {
    s += `<text x="${cx}" y="${y + h / 2 - 7}" text-anchor="middle" fill="${tc}" font-family="Segoe UI,Arial,sans-serif" font-size="15" font-weight="700">${esc(label)}</text>`;
    s += `<text x="${cx}" y="${y + h / 2 + 11}" text-anchor="middle" fill="${tc}" font-family="Segoe UI,Arial,sans-serif" font-size="11" opacity="0.9">${esc(sub)}</text>`;
  } else {
    s += `<text x="${cx}" y="${y + h / 2 + 5}" text-anchor="middle" fill="${tc}" font-family="Segoe UI,Arial,sans-serif" font-size="14" font-weight="600">${esc(label)}</text>`;
  }
  return s;
}

function arrow(x1: number, y1: number, x2: number, y2: number, color: string, label?: string, dashed?: boolean): string {
  const m = arrowMarker(color);
  const dash = dashed ? ` stroke-dasharray="6,4"` : "";
  let s = m.def + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2" marker-end="url(#${m.id})"${dash}/>`;
  if (label) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const vert = Math.abs(x2 - x1) < Math.abs(y2 - y1);
    s += `<text x="${vert ? mx + 8 : mx}" y="${vert ? my : my - 6}" text-anchor="${vert ? "start" : "middle"}" fill="${color}" font-family="Segoe UI,Arial,sans-serif" font-size="11" font-style="italic">${esc(label)}</text>`;
  }
  return s;
}

function sectionPanel(x: number, y: number, w: number, h: number, color: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${color}" opacity="0.06"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.2"/>`;
}

function sectionTitle(x: number, y: number, label: string, color: string): string {
  const tw = label.length * 8.5 + 24;
  return `<rect x="${x}" y="${y - 14}" width="${tw}" height="22" rx="4" fill="${color}" opacity="0.15"/>` +
    `<text x="${x + 12}" y="${y + 2}" fill="${color}" font-family="Segoe UI,Arial,sans-serif" font-size="12" font-weight="700" letter-spacing="0.8">${esc(label)}</text>`;
}

function noteBox(x: number, y: number, w: number, title: string, lines: string[], color: string): string {
  const lh = 16;
  const pad = 12;
  const h = 26 + lines.length * lh + pad;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${WHITE}" stroke="${color}" stroke-width="1.5"/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="4" rx="6" fill="${color}"/>`;
  s += `<rect x="${x}" y="${y + 2}" width="${w}" height="2" fill="${color}"/>`;
  s += `<text x="${x + pad}" y="${y + 20}" fill="${color}" font-family="Segoe UI,Arial,sans-serif" font-size="11" font-weight="700">${esc(title)}</text>`;
  let ty = y + 36;
  for (const l of lines) {
    s += `<text x="${x + pad}" y="${ty}" fill="${BRAND_DARK}" font-family="Segoe UI,Arial,sans-serif" font-size="10">${esc("• " + l)}</text>`;
    ty += lh;
  }
  return s;
}

function buildDiagram(): string {
  let c = "";
  const CX = W / 2;

  c += `<text x="${CX}" y="38" text-anchor="middle" fill="${BRAND_DARK}" font-family="Segoe UI,Arial,sans-serif" font-size="24" font-weight="700">FridayReport.AI — Azure Deployment Flow</text>`;
  c += `<text x="${CX}" y="58" text-anchor="middle" fill="${GRAY}" font-family="Segoe UI,Arial,sans-serif" font-size="13">End-to-end pipeline from source code to production on Azure Container Apps</text>`;

  // ════════════════════════════════════════
  // STAGE 1: BUILD
  // ════════════════════════════════════════
  const s1y = 80;
  c += sectionPanel(30, s1y, W - 60, 200, GREEN);
  c += sectionTitle(46, s1y + 20, "STAGE 1: BUILD & CONTAINERIZE", GREEN);

  const bw = 160, bh = 48, bGap = 24;
  const steps = [
    { l: "Source Code", s: "TypeScript + React" },
    { l: "npm run build", s: "Vite + esbuild" },
    { l: "Build Artifacts", s: "dist/index.cjs + public/" },
    { l: "Docker Build", s: "Multi-stage Dockerfile" },
    { l: "Container Image", s: "Node.js 20 + JRE 17" },
  ];
  const totalBw = steps.length * bw + (steps.length - 1) * bGap;
  let bx = (W - totalBw) / 2;
  const by = s1y + 55;

  for (let i = 0; i < steps.length; i++) {
    c += box(bx, by, bw, bh, steps[i].l, steps[i].s, GREEN);
    if (i < steps.length - 1) {
      c += arrow(bx + bw, by + bh / 2, bx + bw + bGap, by + bh / 2, GREEN);
    }
    bx += bw + bGap;
  }

  c += noteBox(50, by + bh + 20, 220, "Build Output", [
    "dist/index.cjs (server bundle)",
    "dist/public/ (React SPA)",
    "lib/ (MPXJ JARs for .mpp)",
  ], GREEN);

  c += noteBox(290, by + bh + 20, 220, "Dockerfile Highlights", [
    "Multi-stage: build → runtime",
    "JRE 17 for MPP parser",
    "~400-600 MB final image",
  ], GREEN);

  // ════════════════════════════════════════
  // STAGE 2: REGISTRY
  // ════════════════════════════════════════
  const s2y = s1y + 220;
  c += sectionPanel(30, s2y, W - 60, 110, BRAND_BLUE);
  c += sectionTitle(46, s2y + 20, "STAGE 2: CONTAINER REGISTRY", BRAND_BLUE);

  c += box(CX - 140, s2y + 45, 280, 48, "Azure Container Registry", "docker push / az acr build", BRAND_BLUE);

  c += arrow(CX, s1y + 200 - 8, CX, s2y + 45, BRAND_BLUE, "push image");

  c += noteBox(CX + 170, s2y + 35, 220, "ACR Config", [
    "SKU: Standard or Premium",
    "Auth: Managed Identity (AcrPull)",
    "Alternative: az acr build (cloud)",
  ], BRAND_BLUE);

  // ════════════════════════════════════════
  // STAGE 3: INFRASTRUCTURE
  // ════════════════════════════════════════
  const s3y = s2y + 130;
  c += sectionPanel(30, s3y, W - 60, 230, BRAND_DARK);
  c += sectionTitle(46, s3y + 20, "STAGE 3: AZURE INFRASTRUCTURE", BRAND_DARK);

  c += arrow(CX, s2y + 110 - 8, CX, s3y + 8, BRAND_DARK, "provision");

  const infraW = 150, infraH = 55, infraGap = 20;
  const infraItems = [
    { l: "Resource Group", s: "fridayreport-rg", col: BRAND_DARK },
    { l: "PostgreSQL", s: "Flexible Server", col: BRAND_BLUE },
    { l: "Blob Storage", s: "File Uploads", col: TEAL },
    { l: "Key Vault", s: "Secrets Mgmt", col: PURPLE },
    { l: "Log Analytics", s: "Monitoring", col: GRAY },
    { l: "Container Env", s: "Hosting Env", col: BRAND_DARK },
  ];
  const totalIw = infraItems.length * infraW + (infraItems.length - 1) * infraGap;
  let ix = (W - totalIw) / 2;
  const iy = s3y + 50;

  for (let i = 0; i < infraItems.length; i++) {
    c += box(ix, iy, infraW, infraH, infraItems[i].l, infraItems[i].s, infraItems[i].col);
    if (i < infraItems.length - 1) {
      c += arrow(ix + infraW, iy + infraH / 2, ix + infraW + infraGap, iy + infraH / 2, BRAND_DARK);
    }
    ix += infraW + infraGap;
  }

  c += noteBox(50, iy + infraH + 18, 240, "PostgreSQL Config", [
    "Version 15+, SKU: Standard_D4ds_v4",
    "Extensions: unaccent",
    "HA: Zone-redundant (prod)",
  ], BRAND_BLUE);

  c += noteBox(310, iy + infraH + 18, 240, "Key Vault Secrets", [
    "DATABASE_URL, SESSION_SECRET",
    "GOOGLE_CLIENT_ID/SECRET",
    "MICROSOFT_CLIENT_ID/SECRET",
    "RESEND_API_KEY",
  ], PURPLE);

  // ════════════════════════════════════════
  // STAGE 4: DEPLOY
  // ════════════════════════════════════════
  const s4y = s3y + 250;
  c += sectionPanel(30, s4y, W - 60, 230, BRAND_ORANGE);
  c += sectionTitle(46, s4y + 20, "STAGE 4: DEPLOY CONTAINER APP", BRAND_ORANGE);

  c += arrow(CX, s3y + 230 - 8, CX, s4y + 8, BRAND_ORANGE, "deploy");

  const depW = 200, depH = 55, depGap = 40;
  const depItems = [
    { l: "Create Container App", s: "az containerapp create", col: BRAND_ORANGE },
    { l: "Managed Identity", s: "ACR + Key Vault + Blob", col: PURPLE },
    { l: "Ingress & Domain", s: "HTTPS + TLS Certificate", col: BRAND_BLUE },
  ];
  const totalDw = depItems.length * depW + (depItems.length - 1) * depGap;
  let dx = (W - totalDw) / 2;
  const dy = s4y + 50;

  for (let i = 0; i < depItems.length; i++) {
    c += box(dx, dy, depW, depH, depItems[i].l, depItems[i].s, depItems[i].col);
    if (i < depItems.length - 1) {
      c += arrow(dx + depW, dy + depH / 2, dx + depW + depGap, dy + depH / 2, BRAND_ORANGE);
    }
    dx += depW + depGap;
  }

  c += noteBox(50, dy + depH + 18, 220, "Container App Config", [
    "CPU: 1.0-2.0 vCPU",
    "Memory: 2.0-4.0 Gi",
    "Min replicas: 2 (prod)",
    "Max replicas: 10",
    "Target port: 5000",
  ], BRAND_ORANGE);

  c += noteBox(290, dy + depH + 18, 220, "Identity Roles", [
    "AcrPull on Container Registry",
    "Key Vault Secrets User",
    "Storage Blob Data Contributor",
  ], PURPLE);

  c += noteBox(530, dy + depH + 18, 220, "DNS Setup", [
    "CNAME → *.azurecontainerapps.io",
    "TXT verification record",
    "Managed TLS certificate",
    "Update OAuth redirect URIs",
  ], BRAND_BLUE);

  // ════════════════════════════════════════
  // STAGE 5: RUNTIME
  // ════════════════════════════════════════
  const s5y = s4y + 250;
  c += sectionPanel(30, s5y, W - 60, 270, ROSE);
  c += sectionTitle(46, s5y + 20, "STAGE 5: RUNTIME ARCHITECTURE", ROSE);

  c += arrow(CX, s4y + 230 - 8, CX, s5y + 8, ROSE, "live");

  c += box(CX - 30, s5y + 40, 200, 40, "End Users", "HTTPS Traffic", BRAND_DARK, { rounded: 20 });
  c += arrow(CX + 70, s5y + 80, CX + 70, s5y + 100, BRAND_DARK, "ingress");

  c += box(CX - 140, s5y + 100, 280, 55, "FridayReport.AI", "Container App (Node.js + Express + React SPA)", ROSE);

  const rtY = s5y + 185;
  const rtItems = [
    { l: "PostgreSQL", s: "Data", col: BRAND_BLUE },
    { l: "Blob Storage", s: "Files", col: TEAL },
    { l: "Key Vault", s: "Secrets", col: PURPLE },
    { l: "Log Analytics", s: "Logs", col: GRAY },
  ];
  const rtW = 140, rtGap = 24;
  const totalRw = rtItems.length * rtW + (rtItems.length - 1) * rtGap;
  let rx = (W - totalRw) / 2;

  for (const item of rtItems) {
    c += box(rx, rtY, rtW, 45, item.l, item.s, item.col);
    c += arrow(CX - 70 + rtItems.indexOf(item) * 50, s5y + 155, rx + rtW / 2, rtY, item.col);
    rx += rtW + rtGap;
  }

  c += noteBox(CX + 170, s5y + 90, 220, "Background Jobs", [
    "Scheduled reports (every 15 min)",
    "Timesheet reminders (weekdays)",
    "node-cron inside container",
  ], ROSE);

  // External services row
  const extY = rtY + 60;
  const extItems = [
    { l: "Microsoft Graph", s: "Planner / Dataverse", col: BRAND_BLUE },
    { l: "Google OAuth", s: "Authentication", col: GREEN },
    { l: "Resend", s: "Email Delivery", col: BRAND_ORANGE },
  ];
  const extW = 160, extGap = 30;
  const totalEw = extItems.length * extW + (extItems.length - 1) * extGap;
  let ex = (W - totalEw) / 2;
  c += `<text x="${ex}" y="${extY - 4}" fill="${GRAY}" font-family="Segoe UI,Arial,sans-serif" font-size="10" font-weight="600" letter-spacing="0.5">EXTERNAL SERVICES (OUTBOUND)</text>`;

  for (const item of extItems) {
    c += box(ex, extY + 4, extW, 38, item.l, item.s, item.col);
    ex += extW + extGap;
  }

  // ════════════════════════════════════════
  // LEGEND
  // ════════════════════════════════════════
  const legendY = s5y + 290;
  c += `<rect x="30" y="${legendY}" width="${W - 60}" height="36" rx="8" fill="${BRAND_DARK}" opacity="0.05"/>`;
  const legendItems = [
    { color: GREEN, label: "Build" },
    { color: BRAND_BLUE, label: "Registry / Network" },
    { color: BRAND_DARK, label: "Infrastructure" },
    { color: BRAND_ORANGE, label: "Deployment" },
    { color: PURPLE, label: "Security" },
    { color: ROSE, label: "Runtime" },
  ];
  const legendGap = (W - 100) / legendItems.length;
  let lx = 60;
  for (const item of legendItems) {
    c += `<rect x="${lx}" y="${legendY + 11}" width="14" height="14" rx="3" fill="${item.color}"/>`;
    c += `<text x="${lx + 20}" y="${legendY + 23}" fill="${BRAND_DARK}" font-family="Segoe UI,Arial,sans-serif" font-size="11" font-weight="600">${esc(item.label)}</text>`;
    lx += legendGap;
  }

  const totalH = legendY + 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}">
    <rect width="${W}" height="${totalH}" fill="${WHITE}"/>
    ${c}
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
