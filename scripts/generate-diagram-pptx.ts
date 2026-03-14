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
const WHITE = "FFFFFF";
const PW = 13.33;
const CX = PW / 2;

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

function addBox(slide: any, b: BoxDef) {
  const text: any[] = [
    { text: b.label, options: { fontSize: 14, bold: true, color: WHITE, align: "center", breakLine: !!b.sub } },
  ];
  if (b.sub) {
    text.push({ text: b.sub, options: { fontSize: 10, color: WHITE, align: "center" } });
  }
  slide.addText(text, {
    x: b.x, y: b.y, w: b.w, h: b.h,
    fill: { color: b.color },
    rectRadius: b.rounded ?? 0.1,
    valign: "middle",
  });
}

function addArrowRight(slide: any, x: number, y: number, len: number, color: string) {
  slide.addShape("rightArrow" as any, {
    x, y: y - 0.08, w: len, h: 0.16,
    fill: { color },
  });
}

function addArrowDown(slide: any, x: number, y: number, len: number, color: string, label?: string) {
  slide.addShape("downArrow" as any, {
    x: x - 0.08, y, w: 0.16, h: len,
    fill: { color },
  });
  if (label) {
    slide.addText(label, {
      x: x + 0.14, y: y + len / 2 - 0.1, w: 1.0, h: 0.2,
      fontSize: 9, italic: true, color, fontFace: "Segoe UI",
    });
  }
}

function addNote(slide: any, x: number, y: number, w: number, title: string, lines: string[], color: string) {
  const h = 0.32 + lines.length * 0.22 + 0.1;
  slide.addShape("rect" as any, {
    x, y, w, h,
    fill: { color: WHITE },
    line: { color, width: 1.5 },
    rectRadius: 0.06,
  });
  slide.addShape("rect" as any, {
    x, y, w, h: 0.06,
    fill: { color },
  });
  const text: any[] = [
    { text: title, options: { fontSize: 11, bold: true, color, breakLine: true } },
  ];
  for (const l of lines) {
    text.push({ text: "• " + l, options: { fontSize: 9, color: BRAND_DARK, breakLine: true } });
  }
  slide.addText(text, {
    x: x + 0.12, y: y + 0.1, w: w - 0.24, h: h - 0.2,
    valign: "top", fontFace: "Segoe UI",
  });
}

const PERM_COLOR = "9333EA";

function addPermissions(slide: any, x: number, y: number, w: number, role: string, permissions: string[]) {
  const h = 0.36 + permissions.length * 0.22 + 0.1;
  slide.addShape("rect" as any, {
    x, y, w, h,
    fill: { color: "FAF5FF" },
    line: { color: PERM_COLOR, width: 2 },
    rectRadius: 0.06,
  });
  slide.addShape("rect" as any, {
    x, y, w, h: 0.06,
    fill: { color: PERM_COLOR },
  });
  const text: any[] = [
    { text: "\uD83D\uDD12 PERMISSIONS REQUIRED", options: { fontSize: 9, bold: true, color: PERM_COLOR, breakLine: true } },
    { text: `Role: ${role}`, options: { fontSize: 9, bold: true, color: BRAND_DARK, breakLine: true } },
  ];
  for (const p of permissions) {
    text.push({ text: "• " + p, options: { fontSize: 9, color: BRAND_DARK, breakLine: true } });
  }
  slide.addText(text, {
    x: x + 0.12, y: y + 0.08, w: w - 0.24, h: h - 0.16,
    valign: "top", fontFace: "Segoe UI",
  });
}

function addSlideHeader(slide: any, stageNum: number, title: string, color: string) {
  slide.addShape("rect" as any, {
    x: 0, y: 0, w: PW, h: 0.08,
    fill: { color },
  });

  slide.addText(`STAGE ${stageNum}`, {
    x: 0.4, y: 0.25, w: 1.2, h: 0.36,
    fontSize: 13, bold: true, color: WHITE, align: "center",
    fontFace: "Segoe UI",
    fill: { color },
    rectRadius: 0.06,
  });

  slide.addText(title, {
    x: 1.8, y: 0.22, w: 8, h: 0.44,
    fontSize: 22, bold: true, color: BRAND_DARK, fontFace: "Segoe UI",
  });

  slide.addShape("rect" as any, {
    x: 0.4, y: 0.75, w: PW - 0.8, h: 0.02,
    fill: { color, transparency: 70 },
  });
}

function addFooter(slide: any, stageNum: number, totalStages: number, color: string) {
  slide.addText(`FridayReport.AI — Azure Deployment Flow  |  Stage ${stageNum} of ${totalStages}`, {
    x: 0.4, y: 7.0, w: PW - 0.8, h: 0.3,
    fontSize: 8, color: GRAY, fontFace: "Segoe UI", align: "center",
  });
  slide.addShape("rect" as any, {
    x: 0, y: 7.42, w: PW, h: 0.08,
    fill: { color },
  });
}

function build() {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "FridayReport.AI";
  pptx.title = "Azure Deployment Flow";

  // ════════════════════════════════════════
  // TITLE SLIDE
  // ════════════════════════════════════════
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: WHITE };

  titleSlide.addShape("rect" as any, {
    x: 0, y: 0, w: PW, h: 0.12,
    fill: { color: BRAND_DARK },
  });
  titleSlide.addShape("rect" as any, {
    x: 0, y: 7.38, w: PW, h: 0.12,
    fill: { color: BRAND_DARK },
  });

  titleSlide.addText("FridayReport.AI", {
    x: 0, y: 1.8, w: PW, h: 0.7,
    fontSize: 40, bold: true, color: BRAND_DARK, align: "center", fontFace: "Segoe UI",
  });
  titleSlide.addText("Azure Container App Deployment Flow", {
    x: 0, y: 2.5, w: PW, h: 0.5,
    fontSize: 24, color: BRAND_BLUE, align: "center", fontFace: "Segoe UI",
  });
  titleSlide.addText("End-to-end pipeline from source code to production", {
    x: 0, y: 3.2, w: PW, h: 0.35,
    fontSize: 14, color: GRAY, align: "center", fontFace: "Segoe UI",
  });

  const overviewItems = [
    { num: "1", label: "Build & Containerize", col: GREEN },
    { num: "2", label: "Container Registry", col: BRAND_BLUE },
    { num: "3", label: "Azure Infrastructure", col: BRAND_DARK },
    { num: "4", label: "Deploy Container App", col: BRAND_ORANGE },
    { num: "5", label: "Runtime Architecture", col: ROSE },
  ];
  const ow = 2.0, oGap = 0.35;
  const totalOw = overviewItems.length * ow + (overviewItems.length - 1) * oGap;
  let ox = (PW - totalOw) / 2;

  for (let i = 0; i < overviewItems.length; i++) {
    const item = overviewItems[i];
    titleSlide.addText([
      { text: item.num, options: { fontSize: 20, bold: true, color: WHITE, align: "center", breakLine: true } },
      { text: item.label, options: { fontSize: 10, color: WHITE, align: "center" } },
    ], {
      x: ox, y: 4.2, w: ow, h: 0.7,
      fill: { color: item.col },
      rectRadius: 0.1,
      valign: "middle",
    });
    if (i < overviewItems.length - 1) {
      addArrowRight(titleSlide, ox + ow, 4.55, oGap, GRAY);
    }
    ox += ow + oGap;
  }

  // ════════════════════════════════════════
  // SLIDE 1: BUILD & CONTAINERIZE
  // ════════════════════════════════════════
  const s1 = pptx.addSlide();
  s1.background = { color: WHITE };
  addSlideHeader(s1, 1, "Build & Containerize", GREEN);
  addFooter(s1, 1, 5, GREEN);

  const bw = 2.0, bh = 0.55, bGap = 0.3;
  const steps = [
    { l: "Source Code", s: "TypeScript + React" },
    { l: "npm run build", s: "Vite + esbuild" },
    { l: "Build Artifacts", s: "dist/index.cjs + public/" },
    { l: "Docker Build", s: "Multi-stage Dockerfile" },
    { l: "Container Image", s: "Node.js 20 + JRE 17" },
  ];
  const totalBw = steps.length * bw + (steps.length - 1) * bGap;
  let bx = (PW - totalBw) / 2;
  const by = 1.4;

  for (let i = 0; i < steps.length; i++) {
    addBox(s1, { x: bx, y: by, w: bw, h: bh, label: steps[i].l, sub: steps[i].s, color: GREEN });
    if (i < steps.length - 1) addArrowRight(s1, bx + bw, by + bh / 2, bGap, GREEN);
    bx += bw + bGap;
  }

  s1.addText("The build pipeline compiles TypeScript source into production-ready artifacts, then packages them into a Docker container image.", {
    x: 0.6, y: 2.2, w: PW - 1.2, h: 0.35,
    fontSize: 11, color: GRAY, fontFace: "Segoe UI",
  });

  addNote(s1, 0.6, 2.8, 3.8, "Build Output", [
    "dist/index.cjs — Bundled Express server (single file)",
    "dist/public/ — React SPA assets (HTML, JS, CSS)",
    "public/ — Static assets (avatars, logos, favicons)",
    "lib/ — MPXJ JAR files for Microsoft Project parsing",
  ], GREEN);

  addNote(s1, 4.8, 2.8, 3.8, "Dockerfile Highlights", [
    "Multi-stage build: build stage → slim runtime stage",
    "Base: node:20-slim with JRE 17 (for MPXJ library)",
    "Final image size: ~400-600 MB",
    "Entrypoint: node dist/index.cjs",
  ], GREEN);

  addNote(s1, 9.0, 2.8, 3.8, "Build Commands", [
    "npm ci — Install dependencies",
    "npm run build — Vite frontend + esbuild backend",
    "docker build -t fridayreport . — Build image",
    "docker tag fridayreport <acr>.azurecr.io/fridayreport:latest",
  ], GREEN);

  addPermissions(s1, 0.6, 4.8, 5.5, "Developer / CI Pipeline", [
    "Read access to source code repository",
    "Docker daemon access (local or CI runner)",
    "npm registry access for package installation",
    "No Azure permissions needed at this stage",
  ]);

  addPermissions(s1, 6.5, 4.8, 6.2, "CI/CD Service Principal (if automated)", [
    "Azure DevOps: Build Agent access",
    "GitHub Actions: GITHUB_TOKEN (for checkout)",
    "Docker socket or Docker-in-Docker capability",
  ]);

  // ════════════════════════════════════════
  // SLIDE 2: CONTAINER REGISTRY
  // ════════════════════════════════════════
  const s2 = pptx.addSlide();
  s2.background = { color: WHITE };
  addSlideHeader(s2, 2, "Container Registry", BRAND_BLUE);
  addFooter(s2, 2, 5, BRAND_BLUE);

  addBox(s2, { x: 1.5, y: 1.6, w: 2.5, h: 0.6, label: "Container Image", sub: "Local Docker Image", color: GREEN });
  addArrowRight(s2, 4.0, 1.9, 1.5, BRAND_BLUE);
  addBox(s2, { x: 5.5, y: 1.4, w: 3.5, h: 0.8, label: "Azure Container Registry", sub: "fridayreportacr.azurecr.io", color: BRAND_BLUE });
  addArrowRight(s2, 9.0, 1.8, 1.2, BRAND_DARK);
  addBox(s2, { x: 10.2, y: 1.6, w: 2.5, h: 0.6, label: "Container App", sub: "Pulls image at deploy", color: BRAND_DARK });

  s2.addText([
    { text: "docker push", options: { fontSize: 10, italic: true, color: BRAND_BLUE } },
  ], { x: 4.2, y: 1.45, w: 1.2, h: 0.2, fontFace: "Segoe UI" });

  s2.addText([
    { text: "AcrPull", options: { fontSize: 10, italic: true, color: BRAND_DARK } },
  ], { x: 9.2, y: 1.45, w: 1.0, h: 0.2, fontFace: "Segoe UI" });

  s2.addText("The container image is pushed to Azure Container Registry, which acts as the private image store. Container Apps pull the image from ACR using Managed Identity.", {
    x: 0.6, y: 2.7, w: PW - 1.2, h: 0.35,
    fontSize: 11, color: GRAY, fontFace: "Segoe UI",
  });

  addNote(s2, 0.6, 3.3, 3.8, "ACR Configuration", [
    "SKU: Standard (dev) or Premium (prod)",
    "Geo-replication available on Premium",
    "Admin access: Disabled (use Managed Identity)",
    "Retention policy: 30 days for untagged manifests",
  ], BRAND_BLUE);

  addNote(s2, 4.8, 3.3, 3.8, "Push Commands", [
    "az acr login --name fridayreportacr",
    "docker tag fridayreport fridayreportacr.azurecr.io/fridayreport:v1.0",
    "docker push fridayreportacr.azurecr.io/fridayreport:v1.0",
    "Alternative: az acr build -t fridayreport:v1.0 .",
  ], BRAND_BLUE);

  addNote(s2, 9.0, 3.3, 3.8, "Image Tagging Strategy", [
    "latest — Most recent build",
    "v1.0, v1.1 — Semantic version tags",
    "git-<sha> — Git commit hash for traceability",
    "Use immutable tags in production",
  ], BRAND_BLUE);

  addPermissions(s2, 0.6, 5.0, 5.5, "Deployer / CI Service Principal", [
    "AcrPush — Push images to Container Registry",
    "AcrPull — Pull images (assigned to Container App identity)",
    "az acr login — Requires AAD authentication",
    "If using az acr build: AcrPush + Contributor on ACR",
  ]);

  addPermissions(s2, 6.5, 5.0, 6.2, "ACR Admin (initial setup only)", [
    "Contributor on ACR resource (to create/configure)",
    "User Access Administrator (to assign AcrPush/AcrPull roles)",
    "Disable admin user — use RBAC-only access",
  ]);

  // ════════════════════════════════════════
  // SLIDE 3: AZURE INFRASTRUCTURE
  // ════════════════════════════════════════
  const s3 = pptx.addSlide();
  s3.background = { color: WHITE };
  addSlideHeader(s3, 3, "Azure Infrastructure", BRAND_DARK);
  addFooter(s3, 3, 5, BRAND_DARK);

  const infraItems = [
    { l: "Resource Group", s: "fridayreport-rg", col: BRAND_DARK },
    { l: "PostgreSQL", s: "Flexible Server", col: BRAND_BLUE },
    { l: "Blob Storage", s: "File Uploads", col: TEAL },
    { l: "Key Vault", s: "Secrets Mgmt", col: PURPLE },
    { l: "Log Analytics", s: "Monitoring", col: GRAY },
    { l: "Container Env", s: "Hosting Env", col: BRAND_DARK },
  ];
  const iw = 1.7, ih = 0.55, iGap = 0.22;
  const totalIw = infraItems.length * iw + (infraItems.length - 1) * iGap;
  let ix = (PW - totalIw) / 2;
  const iy = 1.5;

  for (let i = 0; i < infraItems.length; i++) {
    addBox(s3, { x: ix, y: iy, w: iw, h: ih, label: infraItems[i].l, sub: infraItems[i].s, color: infraItems[i].col });
    if (i < infraItems.length - 1) addArrowRight(s3, ix + iw, iy + ih / 2, iGap, BRAND_DARK);
    ix += iw + iGap;
  }

  s3.addText("All Azure resources are provisioned inside a single Resource Group. Resources are created in order — each step depends on the previous one.", {
    x: 0.6, y: 2.3, w: PW - 1.2, h: 0.35,
    fontSize: 11, color: GRAY, fontFace: "Segoe UI",
  });

  addNote(s3, 0.6, 2.9, 3.8, "PostgreSQL Config", [
    "Version: 15+",
    "SKU: Standard_D4ds_v4 (production)",
    "SKU: Standard_B1ms (development)",
    "Extension: unaccent",
    "HA: Zone-redundant in production",
  ], BRAND_BLUE);

  addNote(s3, 4.8, 2.9, 3.8, "Key Vault Secrets", [
    "DATABASE_URL — PostgreSQL connection string",
    "SESSION_SECRET — Express session signing key",
    "GOOGLE_CLIENT_ID / SECRET — Google OAuth",
    "MICROSOFT_CLIENT_ID / SECRET — Entra ID OAuth",
    "RESEND_API_KEY — Email service key",
  ], PURPLE);

  addNote(s3, 9.0, 2.9, 3.8, "Storage & Monitoring", [
    "Blob Storage: Standard LRS (dev) / GRS (prod)",
    "Container: uploads (file attachments)",
    "Log Analytics workspace for Container App logs",
    "Log retention: 30 days (configurable)",
  ], TEAL);

  addPermissions(s3, 0.6, 4.8, 5.5, "Infrastructure Admin / Terraform SP", [
    "Contributor on Resource Group (create all resources)",
    "Microsoft.DBforPostgreSQL/* — Create PostgreSQL server",
    "Microsoft.Storage/* — Create Storage Account",
    "Microsoft.KeyVault/* — Create and configure Key Vault",
    "Microsoft.OperationalInsights/* — Create Log Analytics",
    "Microsoft.App/* — Create Container App Environment",
  ]);

  addPermissions(s3, 6.5, 4.8, 6.2, "Key Vault Secrets Officer", [
    "Key Vault Administrator or Secrets Officer",
    "Set secrets: DATABASE_URL, SESSION_SECRET",
    "Set secrets: GOOGLE/MICROSOFT OAuth credentials",
    "Set secrets: RESEND_API_KEY",
    "Uses Azure RBAC (not vault access policies)",
  ]);

  // ════════════════════════════════════════
  // SLIDE 4: DEPLOY CONTAINER APP
  // ════════════════════════════════════════
  const s4 = pptx.addSlide();
  s4.background = { color: WHITE };
  addSlideHeader(s4, 4, "Deploy Container App", BRAND_ORANGE);
  addFooter(s4, 4, 5, BRAND_ORANGE);

  const depItems = [
    { l: "Create Container App", s: "az containerapp create", col: BRAND_ORANGE },
    { l: "Managed Identity", s: "ACR + Key Vault + Blob", col: PURPLE },
    { l: "Ingress & Domain", s: "HTTPS + TLS Certificate", col: BRAND_BLUE },
  ];
  const dw = 2.8, dh = 0.6, dGap = 0.6;
  const totalDw = depItems.length * dw + (depItems.length - 1) * dGap;
  let dx = (PW - totalDw) / 2;
  const dy = 1.5;

  for (let i = 0; i < depItems.length; i++) {
    addBox(s4, { x: dx, y: dy, w: dw, h: dh, label: depItems[i].l, sub: depItems[i].s, color: depItems[i].col });
    if (i < depItems.length - 1) addArrowRight(s4, dx + dw, dy + dh / 2, dGap, BRAND_ORANGE);
    dx += dw + dGap;
  }

  s4.addText("The Container App is created with secrets, environment variables, scaling rules, and ingress configuration. Managed Identity replaces stored credentials.", {
    x: 0.6, y: 2.4, w: PW - 1.2, h: 0.35,
    fontSize: 11, color: GRAY, fontFace: "Segoe UI",
  });

  addNote(s4, 0.6, 3.0, 3.8, "Container App Config", [
    "CPU: 1.0 vCPU (dev) / 2.0 vCPU (prod)",
    "Memory: 2.0 Gi (dev) / 4.0 Gi (prod)",
    "Min replicas: 1 (dev) / 2 (prod)",
    "Max replicas: 3 (dev) / 10 (prod)",
    "Target port: 5000",
    "Health probe: /api/health",
  ], BRAND_ORANGE);

  addNote(s4, 4.8, 3.0, 3.8, "Identity Role Assignments", [
    "AcrPull — Pull images from Container Registry",
    "Key Vault Secrets User — Read secrets at startup",
    "Storage Blob Data Contributor — Upload/download files",
    "Uses system-assigned Managed Identity",
    "No client secrets or connection strings needed",
  ], PURPLE);

  addNote(s4, 9.0, 3.0, 3.8, "DNS & Ingress Setup", [
    "CNAME: app.fridayreport.ai → *.azurecontainerapps.io",
    "TXT: asuid.app → domain verification ID",
    "Managed TLS certificate (auto-renewed)",
    "Update Google OAuth redirect URIs",
    "Update Microsoft Entra ID redirect URIs",
  ], BRAND_BLUE);

  addPermissions(s4, 0.6, 5.0, 3.8, "Container App Deployer", [
    "Contributor on Container App Environment",
    "Microsoft.App/containerApps/* — Create/update apps",
    "AcrPull on ACR (assigned to app's Managed Identity)",
  ]);

  addPermissions(s4, 4.8, 5.0, 3.8, "Identity & Role Admin", [
    "User Access Administrator on Resource Group",
    "Assign AcrPull to Container App identity",
    "Assign Key Vault Secrets User to app identity",
    "Assign Storage Blob Data Contributor to app identity",
  ]);

  addPermissions(s4, 9.0, 5.0, 3.8, "DNS Administrator", [
    "DNS zone management (external registrar)",
    "Create CNAME and TXT records",
    "Google Cloud Console access (OAuth config)",
    "Azure Portal: App Registrations (Entra ID)",
  ]);

  // ════════════════════════════════════════
  // SLIDE 5: RUNTIME ARCHITECTURE
  // ════════════════════════════════════════
  const s5 = pptx.addSlide();
  s5.background = { color: WHITE };
  addSlideHeader(s5, 5, "Runtime Architecture", ROSE);
  addFooter(s5, 5, 5, ROSE);

  addBox(s5, { x: CX - 1.3, y: 1.2, w: 2.6, h: 0.45, label: "End Users", sub: "HTTPS Traffic", color: BRAND_DARK, rounded: 0.22 });
  addArrowDown(s5, CX, 1.65, 0.25, BRAND_DARK, "ingress");

  addBox(s5, { x: CX - 2.2, y: 2.0, w: 4.4, h: 0.65, label: "FridayReport.AI", sub: "Container App (Node.js + Express + React SPA)", color: ROSE });

  addNote(s5, 9.0, 1.8, 3.6, "Background Jobs", [
    "Scheduled reports — every 15 min",
    "Timesheet reminders — weekdays",
    "Runs via node-cron inside container",
    "No external scheduler needed",
  ], ROSE);

  const rtItems = [
    { l: "PostgreSQL", s: "Data Persistence", col: BRAND_BLUE },
    { l: "Blob Storage", s: "File Storage", col: TEAL },
    { l: "Key Vault", s: "Secrets", col: PURPLE },
    { l: "Log Analytics", s: "Monitoring", col: GRAY },
  ];
  const rw = 2.0, rh = 0.5, rGap = 0.35;
  const totalRw = rtItems.length * rw + (rtItems.length - 1) * rGap;
  let rx = (PW - totalRw) / 2;
  const ry = 3.15;

  for (let i = 0; i < rtItems.length; i++) {
    addBox(s5, { x: rx, y: ry, w: rw, h: rh, label: rtItems[i].l, sub: rtItems[i].s, color: rtItems[i].col });
    addArrowDown(s5, rx + rw / 2, 2.65, 0.5, rtItems[i].col);
    rx += rw + rGap;
  }

  s5.addText("EXTERNAL SERVICES (OUTBOUND)", {
    x: 0.6, y: 4.05, w: 3, h: 0.2,
    fontSize: 9, bold: true, color: GRAY, fontFace: "Segoe UI", letterSpacing: 0.5,
  });

  const extItems = [
    { l: "Microsoft Graph", s: "Planner / Dataverse", col: BRAND_BLUE },
    { l: "Google OAuth", s: "Authentication", col: GREEN },
    { l: "Resend", s: "Email Delivery", col: BRAND_ORANGE },
  ];
  const ew = 2.4, eh = 0.45, eGap = 0.45;
  const totalEw = extItems.length * ew + (extItems.length - 1) * eGap;
  let ex = (PW - totalEw) / 2;
  const ey = 4.3;

  for (let i = 0; i < extItems.length; i++) {
    addBox(s5, { x: ex, y: ey, w: ew, h: eh, label: extItems[i].l, sub: extItems[i].s, color: extItems[i].col });
    ex += ew + eGap;
  }

  addNote(s5, 0.6, 5.1, 3.8, "Scaling Behavior", [
    "HTTP-based auto-scaling",
    "Scale to zero: disabled in production",
    "Replicas share PostgreSQL sessions",
    "Stateless design — no sticky sessions needed",
  ], ROSE);

  addNote(s5, 4.8, 5.1, 3.8, "Health & Readiness", [
    "Liveness probe: GET /api/health",
    "Readiness probe: GET /api/health",
    "Startup probe: 30s initial delay",
    "Graceful shutdown on SIGTERM",
  ], BRAND_ORANGE);

  addNote(s5, 9.0, 5.1, 3.8, "Monitoring Queries (KQL)", [
    "ContainerAppConsoleLogs_CL for app logs",
    "ContainerAppSystemLogs_CL for platform",
    "Alert on 5xx error rate > 1%",
    "Alert on container restart count",
  ], GRAY);

  addPermissions(s5, 0.6, 6.0, 6.0, "Container App Managed Identity (runtime)", [
    "AcrPull — Pull container images on restart/scale-out",
    "Key Vault Secrets User — Read secrets at startup",
    "Storage Blob Data Contributor — Read/write file uploads",
    "PostgreSQL access via DATABASE_URL connection string (not RBAC)",
  ]);

  addPermissions(s5, 7.0, 6.0, 5.7, "Operations / SRE Team", [
    "Reader on Resource Group — View all resources",
    "Log Analytics Reader — Query logs and dashboards",
    "Container App Contributor — Restart, scale, update revisions",
    "Monitoring Contributor — Create alerts and action groups",
  ]);

  return pptx;
}

async function main() {
  const pptx = build();
  await pptx.writeFile({ fileName: "FridayReportAI_Azure_Deployment_Flow.pptx" });
  console.log("PowerPoint diagram generated: FridayReportAI_Azure_Deployment_Flow.pptx");
}

main().catch(console.error);
