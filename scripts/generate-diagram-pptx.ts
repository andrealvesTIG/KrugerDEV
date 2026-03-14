import PptxGenJSModule from "pptxgenjs";
const PptxGenJS = (PptxGenJSModule as any).default || PptxGenJSModule;

const BRAND_ORANGE = "FF751F";
const BRAND_BLUE = "075DD1";
const BRAND_DARK = "17255A";
const GREEN = "10B981";
const PURPLE = "7C3AED";
const TEAL = "0891B2";
const ROSE = "E11D48";
const GRAY = "6B7280";
const LIGHT_BG = "F8F9FA";
const WHITE = "FFFFFF";

interface BoxDef {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  color: string;
  rounded?: number;
}

function addBox(slide: PptxGenJS.Slide, b: BoxDef) {
  const text: PptxGenJS.TextProps[] = [
    { text: b.label, options: { fontSize: 11, bold: true, color: WHITE, align: "center", breakLine: !!b.sub } },
  ];
  if (b.sub) {
    text.push({ text: b.sub, options: { fontSize: 8, color: WHITE, align: "center" } });
  }
  slide.addText(text, {
    x: b.x, y: b.y, w: b.w, h: b.h,
    fill: { color: b.color },
    rectRadius: b.rounded ?? 0.08,
    valign: "middle",
  });
}

function addArrowRight(slide: PptxGenJS.Slide, x: number, y: number, len: number, color: string) {
  slide.addShape("rightArrow" as any, {
    x, y: y - 0.06, w: len, h: 0.12,
    fill: { color },
  });
}

function addArrowDown(slide: PptxGenJS.Slide, x: number, y: number, len: number, color: string, label?: string) {
  slide.addShape("downArrow" as any, {
    x: x - 0.06, y, w: 0.12, h: len,
    fill: { color },
  });
  if (label) {
    slide.addText(label, {
      x: x + 0.1, y: y + len / 2 - 0.08, w: 0.8, h: 0.16,
      fontSize: 7, italic: true, color, fontFace: "Segoe UI",
    });
  }
}

function addSectionBg(slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, color: string) {
  slide.addShape("rect" as any, {
    x, y, w, h,
    fill: { color, transparency: 94 },
    line: { color, width: 1, transparency: 70 },
    rectRadius: 0.08,
  });
}

function addSectionLabel(slide: PptxGenJS.Slide, x: number, y: number, label: string, color: string) {
  slide.addText(label, {
    x, y, w: label.length * 0.075 + 0.3, h: 0.22,
    fontSize: 8, bold: true, color,
    fontFace: "Segoe UI",
    fill: { color, transparency: 85 },
    rectRadius: 0.04,
  });
}

function addNote(slide: PptxGenJS.Slide, x: number, y: number, w: number, title: string, lines: string[], color: string) {
  const h = 0.22 + lines.length * 0.16 + 0.06;
  slide.addShape("rect" as any, {
    x, y, w, h,
    fill: { color: WHITE },
    line: { color, width: 1 },
    rectRadius: 0.05,
  });
  slide.addShape("rect" as any, {
    x, y, w, h: 0.04,
    fill: { color },
  });
  const text: PptxGenJS.TextProps[] = [
    { text: title, options: { fontSize: 8, bold: true, color, breakLine: true } },
  ];
  for (const l of lines) {
    text.push({ text: "• " + l, options: { fontSize: 7, color: BRAND_DARK, breakLine: true } });
  }
  slide.addText(text, {
    x: x + 0.08, y: y + 0.06, w: w - 0.16, h: h - 0.12,
    valign: "top", fontFace: "Segoe UI",
  });
}

function build() {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "FridayReport.AI";
  pptx.title = "Azure Deployment Flow";

  const slide = pptx.addSlide();
  slide.background = { color: WHITE };

  slide.addText("FridayReport.AI — Azure Deployment Flow", {
    x: 0, y: 0.15, w: 13.33, h: 0.4,
    fontSize: 22, bold: true, color: BRAND_DARK, align: "center", fontFace: "Segoe UI",
  });
  slide.addText("End-to-end pipeline from source code to production on Azure Container Apps", {
    x: 0, y: 0.5, w: 13.33, h: 0.22,
    fontSize: 10, color: GRAY, align: "center", fontFace: "Segoe UI",
  });

  // ════════════════════════════════════════
  // STAGE 1: BUILD
  // ════════════════════════════════════════
  const s1y = 0.85;
  addSectionBg(slide, 0.2, s1y, 12.93, 1.55, GREEN);
  addSectionLabel(slide, 0.32, s1y + 0.08, "STAGE 1: BUILD & CONTAINERIZE", GREEN);

  const bw = 1.7, bh = 0.42, bGap = 0.2;
  const steps = [
    { l: "Source Code", s: "TypeScript + React" },
    { l: "npm run build", s: "Vite + esbuild" },
    { l: "Build Artifacts", s: "dist/index.cjs + public/" },
    { l: "Docker Build", s: "Multi-stage Dockerfile" },
    { l: "Container Image", s: "Node.js 20 + JRE 17" },
  ];
  const totalBw = steps.length * bw + (steps.length - 1) * bGap;
  let bx = (13.33 - totalBw) / 2;
  const by = s1y + 0.4;

  for (let i = 0; i < steps.length; i++) {
    addBox(slide, { x: bx, y: by, w: bw, h: bh, label: steps[i].l, sub: steps[i].s, color: GREEN });
    if (i < steps.length - 1) addArrowRight(slide, bx + bw, by + bh / 2, bGap, GREEN);
    bx += bw + bGap;
  }

  addNote(slide, 0.4, by + bh + 0.15, 2.4, "Build Output", [
    "dist/index.cjs (server bundle)",
    "dist/public/ (React SPA)",
    "lib/ (MPXJ JARs for .mpp parsing)",
  ], GREEN);

  addNote(slide, 3.0, by + bh + 0.15, 2.4, "Dockerfile Highlights", [
    "Multi-stage: build → runtime",
    "JRE 17 for MPP parser",
    "~400-600 MB final image",
  ], GREEN);

  // ════════════════════════════════════════
  // STAGE 2: REGISTRY
  // ════════════════════════════════════════
  const s2y = s1y + 1.7;
  addSectionBg(slide, 0.2, s2y, 12.93, 0.8, BRAND_BLUE);
  addSectionLabel(slide, 0.32, s2y + 0.08, "STAGE 2: CONTAINER REGISTRY", BRAND_BLUE);

  addArrowDown(slide, 6.66, s1y + 1.55, 0.15, BRAND_BLUE, "push image");

  addBox(slide, { x: 4.5, y: s2y + 0.3, w: 3.0, h: 0.42, label: "Azure Container Registry", sub: "docker push / az acr build", color: BRAND_BLUE });

  addNote(slide, 7.8, s2y + 0.2, 2.5, "ACR Config", [
    "SKU: Standard or Premium",
    "Auth: Managed Identity (AcrPull)",
    "Alternative: az acr build (cloud)",
  ], BRAND_BLUE);

  // ════════════════════════════════════════
  // STAGE 3: INFRASTRUCTURE
  // ════════════════════════════════════════
  const s3y = s2y + 0.95;
  addSectionBg(slide, 0.2, s3y, 12.93, 1.55, BRAND_DARK);
  addSectionLabel(slide, 0.32, s3y + 0.08, "STAGE 3: AZURE INFRASTRUCTURE", BRAND_DARK);

  addArrowDown(slide, 6.66, s2y + 0.8, 0.15, BRAND_DARK, "provision");

  const infraItems = [
    { l: "Resource Group", s: "fridayreport-rg", col: BRAND_DARK },
    { l: "PostgreSQL", s: "Flexible Server", col: BRAND_BLUE },
    { l: "Blob Storage", s: "File Uploads", col: TEAL },
    { l: "Key Vault", s: "Secrets Mgmt", col: PURPLE },
    { l: "Log Analytics", s: "Monitoring", col: GRAY },
    { l: "Container Env", s: "Hosting Env", col: BRAND_DARK },
  ];
  const iw = 1.6, ih = 0.42, iGap = 0.18;
  const totalIw = infraItems.length * iw + (infraItems.length - 1) * iGap;
  let ix = (13.33 - totalIw) / 2;
  const iy = s3y + 0.4;

  for (let i = 0; i < infraItems.length; i++) {
    addBox(slide, { x: ix, y: iy, w: iw, h: ih, label: infraItems[i].l, sub: infraItems[i].s, color: infraItems[i].col });
    if (i < infraItems.length - 1) addArrowRight(slide, ix + iw, iy + ih / 2, iGap, BRAND_DARK);
    ix += iw + iGap;
  }

  addNote(slide, 0.4, iy + ih + 0.15, 2.6, "PostgreSQL Config", [
    "Version 15+, SKU: Standard_D4ds_v4",
    "Extensions: unaccent",
    "HA: Zone-redundant (prod)",
  ], BRAND_BLUE);

  addNote(slide, 3.2, iy + ih + 0.15, 2.8, "Key Vault Secrets", [
    "DATABASE_URL, SESSION_SECRET",
    "GOOGLE_CLIENT_ID / SECRET",
    "MICROSOFT_CLIENT_ID / SECRET",
    "RESEND_API_KEY",
  ], PURPLE);

  // ════════════════════════════════════════
  // STAGE 4: DEPLOY
  // ════════════════════════════════════════
  const s4y = s3y + 1.7;
  addSectionBg(slide, 0.2, s4y, 12.93, 1.55, BRAND_ORANGE);
  addSectionLabel(slide, 0.32, s4y + 0.08, "STAGE 4: DEPLOY CONTAINER APP", BRAND_ORANGE);

  addArrowDown(slide, 6.66, s3y + 1.55, 0.15, BRAND_ORANGE, "deploy");

  const depItems = [
    { l: "Create Container App", s: "az containerapp create", col: BRAND_ORANGE },
    { l: "Managed Identity", s: "ACR + Key Vault + Blob", col: PURPLE },
    { l: "Ingress & Domain", s: "HTTPS + TLS Certificate", col: BRAND_BLUE },
  ];
  const dw = 2.4, dh = 0.42, dGap = 0.4;
  const totalDw = depItems.length * dw + (depItems.length - 1) * dGap;
  let dx = (13.33 - totalDw) / 2;
  const dy = s4y + 0.4;

  for (let i = 0; i < depItems.length; i++) {
    addBox(slide, { x: dx, y: dy, w: dw, h: dh, label: depItems[i].l, sub: depItems[i].s, color: depItems[i].col });
    if (i < depItems.length - 1) addArrowRight(slide, dx + dw, dy + dh / 2, dGap, BRAND_ORANGE);
    dx += dw + dGap;
  }

  addNote(slide, 0.4, dy + dh + 0.15, 2.4, "Container App Config", [
    "CPU: 1.0-2.0 vCPU",
    "Memory: 2.0-4.0 Gi",
    "Min replicas: 2 (prod)",
    "Max replicas: 10",
    "Target port: 5000",
  ], BRAND_ORANGE);

  addNote(slide, 3.0, dy + dh + 0.15, 2.6, "Identity Roles", [
    "AcrPull on Container Registry",
    "Key Vault Secrets User",
    "Storage Blob Data Contributor",
  ], PURPLE);

  addNote(slide, 5.8, dy + dh + 0.15, 2.6, "DNS Setup", [
    "CNAME → *.azurecontainerapps.io",
    "TXT verification record",
    "Managed TLS certificate",
    "Update OAuth redirect URIs",
  ], BRAND_BLUE);

  // ════════════════════════════════════════
  // STAGE 5: RUNTIME
  // ════════════════════════════════════════
  const s5y = s4y + 1.7;
  addSectionBg(slide, 0.2, s5y, 12.93, 2.0, ROSE);
  addSectionLabel(slide, 0.32, s5y + 0.08, "STAGE 5: RUNTIME ARCHITECTURE", ROSE);

  addArrowDown(slide, 6.66, s4y + 1.55, 0.15, ROSE, "live");

  addBox(slide, { x: 5.2, y: s5y + 0.3, w: 2.2, h: 0.32, label: "End Users", sub: "HTTPS Traffic", color: BRAND_DARK, rounded: 0.16 });
  addArrowDown(slide, 6.3, s5y + 0.62, 0.1, BRAND_DARK);

  addBox(slide, { x: 4.5, y: s5y + 0.75, w: 3.5, h: 0.45, label: "FridayReport.AI", sub: "Container App (Node.js + Express + React SPA)", color: ROSE });

  addNote(slide, 8.5, s5y + 0.65, 2.5, "Background Jobs", [
    "Scheduled reports (every 15 min)",
    "Timesheet reminders (weekdays)",
    "node-cron inside container",
  ], ROSE);

  const rtItems = [
    { l: "PostgreSQL", s: "Data", col: BRAND_BLUE },
    { l: "Blob Storage", s: "Files", col: TEAL },
    { l: "Key Vault", s: "Secrets", col: PURPLE },
    { l: "Log Analytics", s: "Logs", col: GRAY },
  ];
  const rw = 1.6, rh = 0.36, rGap = 0.25;
  const totalRw = rtItems.length * rw + (rtItems.length - 1) * rGap;
  let rx = (13.33 - totalRw) / 2;
  const ry = s5y + 1.35;

  for (let i = 0; i < rtItems.length; i++) {
    addBox(slide, { x: rx, y: ry, w: rw, h: rh, label: rtItems[i].l, sub: rtItems[i].s, color: rtItems[i].col });
    addArrowDown(slide, rx + rw / 2, s5y + 1.2, 0.15, rtItems[i].col);
    rx += rw + rGap;
  }

  const extItems = [
    { l: "Microsoft Graph", s: "Planner / Dataverse", col: BRAND_BLUE },
    { l: "Google OAuth", s: "Authentication", col: GREEN },
    { l: "Resend", s: "Email Delivery", col: BRAND_ORANGE },
  ];
  const ew = 1.8, eh = 0.3, eGap = 0.3;
  const totalEw = extItems.length * ew + (extItems.length - 1) * eGap;
  let ex = (13.33 - totalEw) / 2;
  const ey = ry + rh + 0.12;

  slide.addText("EXTERNAL SERVICES (OUTBOUND)", {
    x: ex, y: ey - 0.14, w: 2.5, h: 0.14,
    fontSize: 7, bold: true, color: GRAY, fontFace: "Segoe UI",
  });

  for (let i = 0; i < extItems.length; i++) {
    addBox(slide, { x: ex, y: ey, w: ew, h: eh, label: extItems[i].l, sub: extItems[i].s, color: extItems[i].col });
    ex += ew + eGap;
  }

  // ════════════════════════════════════════
  // LEGEND
  // ════════════════════════════════════════
  const ly = s5y + 2.1;
  slide.addShape("rect" as any, {
    x: 0.2, y: ly, w: 12.93, h: 0.28,
    fill: { color: BRAND_DARK, transparency: 95 },
    rectRadius: 0.06,
  });

  const legendItems = [
    { color: GREEN, label: "Build" },
    { color: BRAND_BLUE, label: "Registry / Network" },
    { color: BRAND_DARK, label: "Infrastructure" },
    { color: BRAND_ORANGE, label: "Deployment" },
    { color: PURPLE, label: "Security" },
    { color: ROSE, label: "Runtime" },
  ];
  const lGap = 12.93 / legendItems.length;
  for (let i = 0; i < legendItems.length; i++) {
    const lx = 0.4 + i * lGap;
    slide.addShape("rect" as any, {
      x: lx, y: ly + 0.07, w: 0.14, h: 0.14,
      fill: { color: legendItems[i].color },
      rectRadius: 0.03,
    });
    slide.addText(legendItems[i].label, {
      x: lx + 0.2, y: ly + 0.04, w: 1.5, h: 0.2,
      fontSize: 8, bold: true, color: BRAND_DARK, fontFace: "Segoe UI",
    });
  }

  return pptx;
}

async function main() {
  const pptx = build();
  await pptx.writeFile({ fileName: "FridayReportAI_Azure_Deployment_Flow.pptx" });
  console.log("PowerPoint diagram generated: FridayReportAI_Azure_Deployment_Flow.pptx");
}

main().catch(console.error);
