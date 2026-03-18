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

  const overviewRow1 = [
    { num: "1", label: "Build & Containerize", col: GREEN },
    { num: "2", label: "Container Registry", col: BRAND_BLUE },
    { num: "3", label: "Azure Infrastructure", col: BRAND_DARK },
    { num: "4", label: "Deploy Container App", col: BRAND_ORANGE },
    { num: "5", label: "Runtime Architecture", col: ROSE },
  ];
  const overviewRow2 = [
    { num: "6", label: "Database Migration", col: BRAND_BLUE },
    { num: "7", label: "Env Vars Reference", col: PURPLE },
    { num: "8", label: "Networking & Security", col: BRAND_DARK },
    { num: "9", label: "Storage Migration", col: TEAL },
  ];
  const overviewRow3 = [
    { num: "10", label: "CI/CD Pipeline", col: GREEN },
    { num: "11", label: "Rollback & Updates", col: BRAND_ORANGE },
    { num: "12", label: "Pre-Deploy Checklist", col: GREEN },
    { num: "13", label: "Cost Estimation", col: TEAL },
  ];

  function renderOverviewRow(slide: any, items: typeof overviewRow1, y: number, boxW: number, gap: number) {
    const total = items.length * boxW + (items.length - 1) * gap;
    let x = (PW - total) / 2;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      slide.addText([
        { text: item.num, options: { fontSize: 16, bold: true, color: WHITE, align: "center", breakLine: true } },
        { text: item.label, options: { fontSize: 8, color: WHITE, align: "center" } },
      ], {
        x, y, w: boxW, h: 0.55,
        fill: { color: item.col },
        rectRadius: 0.08,
        valign: "middle",
      });
      if (i < items.length - 1) {
        addArrowRight(slide, x + boxW, y + 0.275, gap, GRAY);
      }
      x += boxW + gap;
    }
  }

  titleSlide.addText("DEPLOYMENT STAGES", {
    x: 0, y: 3.7, w: PW, h: 0.25,
    fontSize: 10, bold: true, color: GRAY, align: "center", fontFace: "Segoe UI", letterSpacing: 1,
  });
  renderOverviewRow(titleSlide, overviewRow1, 4.0, 1.9, 0.3);
  titleSlide.addText("OPERATIONS & GOVERNANCE", {
    x: 0, y: 4.7, w: PW, h: 0.25,
    fontSize: 10, bold: true, color: GRAY, align: "center", fontFace: "Segoe UI", letterSpacing: 1,
  });
  renderOverviewRow(titleSlide, overviewRow2, 5.0, 1.9, 0.3);
  renderOverviewRow(titleSlide, overviewRow3, 5.7, 1.9, 0.3);

  // ════════════════════════════════════════
  // SLIDE 1: BUILD & CONTAINERIZE
  // ════════════════════════════════════════
  const s1 = pptx.addSlide();
  s1.background = { color: WHITE };
  addSlideHeader(s1, 1, "Build & Containerize", GREEN);
  addFooter(s1, 1, 13, GREEN);

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
  addFooter(s2, 2, 13, BRAND_BLUE);

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
  addFooter(s3, 3, 13, BRAND_DARK);

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
  addFooter(s4, 4, 13, BRAND_ORANGE);

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
  addFooter(s5, 5, 13, ROSE);

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

  // ════════════════════════════════════════
  // SLIDE 6: DATABASE MIGRATION
  // ════════════════════════════════════════
  const s6 = pptx.addSlide();
  s6.background = { color: WHITE };
  addSlideHeader(s6, 6, "Database Migration", BRAND_BLUE);
  addFooter(s6, 6, 13, BRAND_BLUE);

  const migSteps = [
    { l: "Open Firewall", s: "Allow migration runner IP" },
    { l: "Set DATABASE_URL", s: "Azure PostgreSQL conn string" },
    { l: "Run Migrations", s: "drizzle-kit push / migrate" },
    { l: "Verify Schema", s: "Check tables & extensions" },
    { l: "Lock Firewall", s: "Remove temp IP rule" },
  ];
  const mw = 2.0, mh = 0.55, mGap = 0.28;
  const totalMw = migSteps.length * mw + (migSteps.length - 1) * mGap;
  let mx = (PW - totalMw) / 2;
  const my = 1.4;
  for (let i = 0; i < migSteps.length; i++) {
    addBox(s6, { x: mx, y: my, w: mw, h: mh, label: migSteps[i].l, sub: migSteps[i].s, color: BRAND_BLUE });
    if (i < migSteps.length - 1) addArrowRight(s6, mx + mw, my + mh / 2, mGap, BRAND_BLUE);
    mx += mw + mGap;
  }

  s6.addText("The database schema must be initialized on the Azure PostgreSQL server before the application can start. Drizzle ORM manages the schema via migration files.", {
    x: 0.6, y: 2.2, w: PW - 1.2, h: 0.35,
    fontSize: 11, color: GRAY, fontFace: "Segoe UI",
  });

  addNote(s6, 0.6, 2.8, 3.8, "Pre-Migration Setup", [
    "az postgres flexible-server firewall-rule create \\",
    "  --name allow-migration-runner \\",
    "  --start-ip-address <your-ip> --end-ip-address <your-ip>",
    "Enable extension: CREATE EXTENSION IF NOT EXISTS unaccent;",
    "Verify SSL mode: require (default for Azure PG)",
  ], BRAND_BLUE);

  addNote(s6, 4.8, 2.8, 3.8, "Migration Commands", [
    "export DATABASE_URL=\"postgresql://admin@server:5432/fridayreport?sslmode=require\"",
    "npx drizzle-kit push — Apply schema to database",
    "npx drizzle-kit migrate — Run pending migration files",
    "npm run db:seed — Seed initial data (if applicable)",
  ], BRAND_BLUE);

  addNote(s6, 9.0, 2.8, 3.8, "Post-Migration Verification", [
    "\\dt — List all tables in psql",
    "SELECT count(*) FROM information_schema.tables;",
    "Verify session table: connect_pg_simple_sessions",
    "Check extensions: SELECT * FROM pg_extension;",
    "Remove temp firewall rule after migration",
  ], GREEN);

  addPermissions(s6, 0.6, 4.8, 5.5, "Database Administrator", [
    "PostgreSQL server admin credentials",
    "Firewall rule create/delete on Azure PG Flexible Server",
    "CREATE EXTENSION privilege (for unaccent)",
    "Network access from migration runner to Azure PG (port 5432)",
  ]);

  addPermissions(s6, 6.5, 4.8, 6.2, "Application Service Account", [
    "PostgreSQL database owner or equivalent",
    "CREATE TABLE, ALTER TABLE, INSERT, UPDATE, DELETE",
    "CREATE INDEX for performance indexes",
    "USAGE on public schema",
  ]);

  // ════════════════════════════════════════
  // SLIDE 7: ENVIRONMENT VARIABLES REFERENCE
  // ════════════════════════════════════════
  const s7 = pptx.addSlide();
  s7.background = { color: WHITE };
  addSlideHeader(s7, 7, "Environment Variables Reference", PURPLE);
  addFooter(s7, 7, 13, PURPLE);

  s7.addText("Complete list of all environment variables required for deployment. Variables marked with a lock icon are secrets and should be stored in Azure Key Vault.", {
    x: 0.6, y: 1.0, w: PW - 1.2, h: 0.3,
    fontSize: 11, color: GRAY, fontFace: "Segoe UI",
  });

  addNote(s7, 0.6, 1.5, 3.8, "Core Infrastructure (Key Vault)", [
    "DATABASE_URL — PostgreSQL connection string",
    "SESSION_SECRET — Express session signing key",
    "PORT — Application port (default: 5000)",
    "NODE_ENV — Environment (production)",
    "APP_URL — Public application URL",
  ], BRAND_DARK);

  addNote(s7, 4.8, 1.5, 3.8, "Authentication — Google (Key Vault)", [
    "GOOGLE_CLIENT_ID — OAuth 2.0 client ID",
    "GOOGLE_CLIENT_SECRET — OAuth 2.0 client secret",
    "Redirect URI: {APP_URL}/auth/google/callback",
    "Scopes: profile, email",
  ], GREEN);

  addNote(s7, 9.0, 1.5, 3.8, "Authentication — Microsoft (Key Vault)", [
    "MICROSOFT_CLIENT_ID — Entra ID app client ID",
    "MICROSOFT_CLIENT_SECRET — Entra ID client secret",
    "MICROSOFT_TENANT_ID — Tenant ID (default: common)",
    "Redirect URI: {APP_URL}/auth/microsoft/callback",
    "Scopes: User.Read, Tasks.ReadWrite, etc.",
  ], BRAND_BLUE);

  addNote(s7, 0.6, 3.6, 3.8, "Email Service (Key Vault)", [
    "RESEND_API_KEY — Resend email service API key",
    "RESEND_FROM_EMAIL — Sender address (e.g. noreply@fridayreport.ai)",
    "Used for: welcome emails, password resets, report delivery",
  ], BRAND_ORANGE);

  addNote(s7, 4.8, 3.6, 3.8, "Azure Blob Storage (Plain Env Vars)", [
    "AZURE_STORAGE_ACCOUNT_NAME — Storage account name",
    "AZURE_STORAGE_CONTAINER_NAME — Blob container (uploads)",
    "Auth: Managed Identity (no key needed)",
    "Used for: file uploads, avatars, documents",
  ], TEAL);

  addNote(s7, 9.0, 3.6, 3.8, "Container App Plain Env Vars", [
    "NODE_ENV=production",
    "PORT=5000",
    "APP_URL=https://app.fridayreport.ai",
    "AZURE_STORAGE_ACCOUNT_NAME=fridayreportstorage",
    "AZURE_STORAGE_CONTAINER_NAME=uploads",
  ], GRAY);

  s7.addShape("rect" as any, {
    x: 0.6, y: 5.6, w: PW - 1.2, h: 0.5,
    fill: { color: "FAF5FF" },
    line: { color: PERM_COLOR, width: 1.5 },
    rectRadius: 0.06,
  });
  s7.addText([
    { text: "Key Vault vs Plain Env Vars: ", options: { fontSize: 10, bold: true, color: PERM_COLOR } },
    { text: "Secrets (DATABASE_URL, SESSION_SECRET, OAuth client IDs/secrets, RESEND_API_KEY) go in Key Vault and are referenced via ", options: { fontSize: 10, color: BRAND_DARK } },
    { text: "secretref:", options: { fontSize: 10, bold: true, color: PERM_COLOR } },
    { text: " in --env-vars. Non-sensitive values (PORT, NODE_ENV, APP_URL, storage names) are set as plain environment variables.", options: { fontSize: 10, color: BRAND_DARK } },
  ], {
    x: 0.8, y: 5.65, w: PW - 1.6, h: 0.4,
    valign: "middle", fontFace: "Segoe UI",
  });

  // ════════════════════════════════════════
  // SLIDE 8: NETWORKING & SECURITY
  // ════════════════════════════════════════
  const s8 = pptx.addSlide();
  s8.background = { color: WHITE };
  addSlideHeader(s8, 8, "Networking & Security", BRAND_DARK);
  addFooter(s8, 8, 13, BRAND_DARK);

  const netItems = [
    { l: "Virtual Network", s: "fridayreport-vnet", col: BRAND_DARK },
    { l: "Container Subnet", s: "container-app-subnet", col: BRAND_ORANGE },
    { l: "Database Subnet", s: "postgres-subnet", col: BRAND_BLUE },
    { l: "Private Endpoints", s: "PG + Key Vault + Blob", col: PURPLE },
  ];
  const nw = 2.4, nh = 0.55, nGap = 0.35;
  const totalNw = netItems.length * nw + (netItems.length - 1) * nGap;
  let nx = (PW - totalNw) / 2;
  const ny = 1.4;
  for (let i = 0; i < netItems.length; i++) {
    addBox(s8, { x: nx, y: ny, w: nw, h: nh, label: netItems[i].l, sub: netItems[i].s, color: netItems[i].col });
    if (i < netItems.length - 1) addArrowRight(s8, nx + nw, ny + nh / 2, nGap, BRAND_DARK);
    nx += nw + nGap;
  }

  s8.addText("All backend services communicate over private networks. Public access is limited to the Container App ingress endpoint with HTTPS/TLS.", {
    x: 0.6, y: 2.2, w: PW - 1.2, h: 0.35,
    fontSize: 11, color: GRAY, fontFace: "Segoe UI",
  });

  addNote(s8, 0.6, 2.8, 3.8, "VNet Configuration", [
    "Address space: 10.0.0.0/16",
    "Container App subnet: 10.0.0.0/23 (min /23 required)",
    "PostgreSQL subnet: 10.0.1.0/24 (delegated)",
    "Private endpoint subnet: 10.0.2.0/24",
    "DNS: Azure Private DNS zones for internal resolution",
  ], BRAND_DARK);

  addNote(s8, 4.8, 2.8, 3.8, "PostgreSQL Firewall", [
    "Public network access: Disabled",
    "Allow Azure services: Enabled (for Container App)",
    "VNet integration: postgres-subnet (delegated)",
    "Private DNS zone: privatelink.postgres.database.azure.com",
    "SSL enforcement: Enabled (sslmode=require)",
    "Temp rule for migration: remove after schema setup",
  ], BRAND_BLUE);

  addNote(s8, 9.0, 2.8, 3.8, "Key Vault & Blob Security", [
    "Key Vault: Private endpoint + Azure RBAC",
    "Key Vault: Disable vault access policies, use RBAC only",
    "Blob Storage: Private endpoint for data access",
    "Blob Storage: Managed Identity auth (no access keys)",
    "Both: Deny public network access in production",
  ], PURPLE);

  addNote(s8, 0.6, 4.8, 3.8, "Ingress, TLS & NSG Rules", [
    "External ingress: HTTPS only (port 443)",
    "Internal port: 5000 (Container App target)",
    "NSG: Allow 443 inbound, deny all other inbound",
    "NSG: Allow outbound to PG (5432), KV (443), Blob (443)",
    "Managed TLS certificate (auto-renewed)",
    "CSP headers: Allow Microsoft Teams iframe embedding",
  ], BRAND_ORANGE);

  addPermissions(s8, 4.8, 4.8, 3.8, "Network Administrator", [
    "Network Contributor on Resource Group",
    "Private DNS Zone Contributor",
    "Microsoft.Network/virtualNetworks/* — Create VNet",
    "Microsoft.Network/privateEndpoints/* — Create PE",
  ]);

  addPermissions(s8, 9.0, 4.8, 3.8, "Security Reviewer", [
    "Security Reader on subscription",
    "Review NSG flow logs",
    "Validate private endpoint DNS resolution",
    "Audit Key Vault access logs",
  ]);

  // ════════════════════════════════════════
  // SLIDE 9: STORAGE MIGRATION PRE-REQUISITE
  // ════════════════════════════════════════
  const s9 = pptx.addSlide();
  s9.background = { color: WHITE };
  addSlideHeader(s9, 9, "Storage Migration (Pre-requisite)", TEAL);
  addFooter(s9, 9, 13, TEAL);

  const storSteps = [
    { l: "Current State", s: "Platform Object Storage", col: GRAY },
    { l: "Code Change", s: "Replace with @azure/storage-blob", col: TEAL },
    { l: "Create Container", s: "Azure Blob uploads container", col: TEAL },
    { l: "Migrate Files", s: "Export → Upload to Blob", col: BRAND_ORANGE },
    { l: "Verify & Deploy", s: "Test uploads in staging", col: GREEN },
  ];
  const sw2 = 2.0, sh2 = 0.55, sGap2 = 0.28;
  const totalSw2 = storSteps.length * sw2 + (storSteps.length - 1) * sGap2;
  let sx2 = (PW - totalSw2) / 2;
  const sy2 = 1.4;
  for (let i = 0; i < storSteps.length; i++) {
    addBox(s9, { x: sx2, y: sy2, w: sw2, h: sh2, label: storSteps[i].l, sub: storSteps[i].s, color: storSteps[i].col });
    if (i < storSteps.length - 1) addArrowRight(s9, sx2 + sw2, sy2 + sh2 / 2, sGap2, TEAL);
    sx2 += sw2 + sGap2;
  }

  s9.addText("The application currently uses a platform-specific object storage integration that is NOT compatible with Azure. This code change is required before deployment.", {
    x: 0.6, y: 2.2, w: PW - 1.2, h: 0.35,
    fontSize: 11, color: ROSE, fontFace: "Segoe UI", bold: true,
  });

  addNote(s9, 0.6, 2.8, 3.8, "Affected Code Areas", [
    "File upload handlers (multer → Blob Storage)",
    "Avatar / logo image storage",
    "Document attachments (.mpp, .xlsx, .pdf)",
    "Report exports and generated files",
    "Storage module is isolated — contained change",
  ], TEAL);

  addNote(s9, 4.8, 2.8, 3.8, "Code Change Summary", [
    "Install: npm install @azure/storage-blob",
    "Replace object storage calls with BlobServiceClient",
    "Use DefaultAzureCredential (Managed Identity)",
    "No access keys or connection strings needed",
    "Estimated effort: 1-2 days",
  ], TEAL);

  addNote(s9, 9.0, 2.8, 3.8, "Data Migration Steps", [
    "1. Export all files from current storage",
    "2. Create Azure Blob container: uploads",
    "3. Upload files via az storage blob upload-batch",
    "4. Verify file counts and sizes match",
    "5. Update any stored URLs in database",
  ], BRAND_ORANGE);

  addPermissions(s9, 0.6, 4.8, 5.5, "Developer (code change)", [
    "Access to source code repository",
    "npm install permissions for @azure/storage-blob",
    "Staging environment for testing uploads",
    "Test with Azure Storage Emulator (Azurite) locally",
  ]);

  addPermissions(s9, 6.5, 4.8, 6.2, "Storage Admin (data migration)", [
    "Storage Blob Data Contributor on storage account",
    "az storage blob upload-batch permissions",
    "Access to current platform storage (export files)",
    "Verify blob container access policies",
  ]);

  // ════════════════════════════════════════
  // SLIDE 10: CI/CD PIPELINE
  // ════════════════════════════════════════
  const s10 = pptx.addSlide();
  s10.background = { color: WHITE };
  addSlideHeader(s10, 10, "CI/CD Pipeline", GREEN);
  addFooter(s10, 10, 13, GREEN);

  const ciSteps = [
    { l: "Code Push", s: "main branch", col: BRAND_DARK },
    { l: "Install & Build", s: "npm ci && npm run build", col: GREEN },
    { l: "Run Tests", s: "npm test", col: GREEN },
    { l: "Docker Build", s: "Build & tag image", col: GREEN },
    { l: "Push to ACR", s: "az acr login + push", col: BRAND_BLUE },
    { l: "Deploy Revision", s: "az containerapp update", col: BRAND_ORANGE },
  ];
  const cw = 1.65, ch = 0.55, cGap = 0.2;
  const totalCw = ciSteps.length * cw + (ciSteps.length - 1) * cGap;
  let cx2 = (PW - totalCw) / 2;
  const cy2 = 1.4;
  for (let i = 0; i < ciSteps.length; i++) {
    addBox(s10, { x: cx2, y: cy2, w: cw, h: ch, label: ciSteps[i].l, sub: ciSteps[i].s, color: ciSteps[i].col });
    if (i < ciSteps.length - 1) addArrowRight(s10, cx2 + cw, cy2 + ch / 2, cGap, GREEN);
    cx2 += cw + cGap;
  }

  s10.addText("Automated pipeline triggered on push to main. Builds the app, runs tests, creates a Docker image, pushes to ACR, and deploys a new Container App revision.", {
    x: 0.6, y: 2.2, w: PW - 1.2, h: 0.35,
    fontSize: 11, color: GRAY, fontFace: "Segoe UI",
  });

  addNote(s10, 0.6, 2.8, 3.8, "GitHub Actions Workflow", [
    "Trigger: push to main branch",
    "Runner: ubuntu-latest",
    "Steps: checkout → setup-node → npm ci → build → test",
    "Docker: build, tag with git SHA + latest",
    "Deploy: az containerapp update --image <tag>",
  ], GREEN);

  addNote(s10, 4.8, 2.8, 3.8, "Pipeline Secrets (GitHub)", [
    "AZURE_CLIENT_ID — Service principal app ID",
    "AZURE_CLIENT_SECRET — Service principal secret",
    "AZURE_TENANT_ID — Azure tenant ID",
    "AZURE_SUBSCRIPTION_ID — Target subscription",
    "ACR_LOGIN_SERVER — fridayreportacr.azurecr.io",
  ], PURPLE);

  addNote(s10, 9.0, 2.8, 3.8, "Azure DevOps Alternative", [
    "Pipeline: azure-pipelines.yml",
    "Service Connection: Azure Resource Manager",
    "ACR Task: Docker@2 with buildAndPush",
    "Deploy Task: AzureContainerApps@1",
    "Variable Groups for secrets management",
  ], BRAND_BLUE);

  addNote(s10, 0.6, 4.8, 3.8, "Deploy Commands", [
    "az login --service-principal",
    "az acr login --name fridayreportacr",
    "docker build -t fridayreportacr.azurecr.io/fridayreport:$SHA .",
    "docker push fridayreportacr.azurecr.io/fridayreport:$SHA",
    "az containerapp update --name fridayreport-app \\",
    "  --image fridayreportacr.azurecr.io/fridayreport:$SHA",
  ], BRAND_ORANGE);

  addPermissions(s10, 4.8, 4.8, 3.8, "CI Service Principal", [
    "AcrPush on Container Registry",
    "Contributor on Container App",
    "Reader on Resource Group",
    "Federated credential (OIDC) recommended over secrets",
  ]);

  addPermissions(s10, 9.0, 4.8, 3.8, "Pipeline Admin", [
    "GitHub repo admin (manage secrets)",
    "Azure AD: Create app registrations",
    "Create federated credentials for OIDC",
    "Assign roles to CI service principal",
  ]);

  // ════════════════════════════════════════
  // SLIDE 11: ROLLBACK & UPDATE STRATEGY
  // ════════════════════════════════════════
  const s11 = pptx.addSlide();
  s11.background = { color: WHITE };
  addSlideHeader(s11, 11, "Rollback & Update Strategy", BRAND_ORANGE);
  addFooter(s11, 11, 13, BRAND_ORANGE);

  const rlSteps = [
    { l: "New Image", s: "Build & push new tag", col: GREEN },
    { l: "New Revision", s: "az containerapp update", col: BRAND_ORANGE },
    { l: "Traffic Split", s: "Canary: 10% → 50% → 100%", col: BRAND_BLUE },
    { l: "Monitor", s: "Check logs & health", col: GRAY },
  ];
  const rlw = 2.4, rlh = 0.55, rlGap = 0.4;
  const totalRlw = rlSteps.length * rlw + (rlSteps.length - 1) * rlGap;
  let rlx = (PW - totalRlw) / 2;
  const rly = 1.4;
  for (let i = 0; i < rlSteps.length; i++) {
    addBox(s11, { x: rlx, y: rly, w: rlw, h: rlh, label: rlSteps[i].l, sub: rlSteps[i].s, color: rlSteps[i].col });
    if (i < rlSteps.length - 1) addArrowRight(s11, rlx + rlw, rly + rlh / 2, rlGap, BRAND_ORANGE);
    rlx += rlw + rlGap;
  }

  s11.addText("Azure Container Apps supports multiple active revisions with traffic splitting, enabling blue-green deployments and instant rollback.", {
    x: 0.6, y: 2.2, w: PW - 1.2, h: 0.35,
    fontSize: 11, color: GRAY, fontFace: "Segoe UI",
  });

  addNote(s11, 0.6, 2.8, 3.8, "Update Process", [
    "1. Build and push new image with version tag",
    "2. az containerapp update --image <new-tag>",
    "3. New revision created automatically",
    "4. Traffic shifts to new revision (single mode)",
    "5. Old revision deactivated after successful deploy",
  ], BRAND_ORANGE);

  addNote(s11, 4.8, 2.8, 3.8, "Blue-Green / Canary Deploy", [
    "Enable multiple revision mode:",
    "az containerapp revision set-mode --mode multiple",
    "Split traffic: --traffic latest=10 previous=90",
    "Gradually increase: 10% → 50% → 100%",
    "Monitor error rates between each shift",
  ], BRAND_BLUE);

  addNote(s11, 9.0, 2.8, 3.8, "Rollback Commands", [
    "List revisions:",
    "az containerapp revision list --name fridayreport-app",
    "Activate old revision:",
    "az containerapp revision activate --revision <name>",
    "Shift traffic: --traffic <old-rev>=100",
    "Instant rollback — no rebuild required",
  ], ROSE);

  addNote(s11, 0.6, 4.8, 5.5, "Database Migration Considerations", [
    "Forward-only migrations: Always add columns, never remove",
    "Two-phase migration: 1) Add new column 2) Deploy new code 3) Remove old column",
    "Test rollback compatibility: new code must work with old schema",
    "Backup database before destructive schema changes",
  ], PURPLE);

  addPermissions(s11, 6.5, 4.8, 6.2, "Release Manager", [
    "Container App Contributor — Update revisions and traffic",
    "az containerapp revision list/activate/deactivate",
    "az containerapp ingress traffic set",
    "Log Analytics Reader — Monitor rollback health",
  ]);

  // ════════════════════════════════════════
  // SLIDE 12: PRE-DEPLOYMENT CHECKLIST
  // ════════════════════════════════════════
  const s12 = pptx.addSlide();
  s12.background = { color: WHITE };
  addSlideHeader(s12, 12, "Pre-Deployment Checklist", GREEN);
  addFooter(s12, 12, 13, GREEN);

  s12.addText("Complete all items before go-live. Each section has verification commands to confirm readiness.", {
    x: 0.6, y: 1.0, w: PW - 1.2, h: 0.3,
    fontSize: 11, color: GRAY, fontFace: "Segoe UI",
  });

  addNote(s12, 0.6, 1.5, 3.8, "Infrastructure Ready", [
    "Resource Group created",
    "PostgreSQL Flexible Server running",
    "Azure Blob Storage account + uploads container",
    "Key Vault created with RBAC enabled",
    "Log Analytics workspace provisioned",
    "Container App Environment created",
    "ACR created with admin disabled",
    "Verify: az resource list -g fridayreport-rg -o table",
  ], BRAND_DARK);

  addNote(s12, 4.8, 1.5, 3.8, "Code Changes Complete", [
    "Storage layer migrated to @azure/storage-blob",
    "Dockerfile tested and builds successfully",
    "Health check endpoint: GET /api/health",
    "Environment variables read from process.env",
    "No hardcoded platform-specific references",
    "All tests pass: npm test",
    "Verify: docker build -t fridayreport . && docker run -p 5000:5000",
  ], GREEN);

  addNote(s12, 9.0, 1.5, 3.8, "Secrets Configured", [
    "DATABASE_URL set in Key Vault",
    "SESSION_SECRET generated and stored",
    "GOOGLE_CLIENT_ID + SECRET stored",
    "MICROSOFT_CLIENT_ID + SECRET stored",
    "RESEND_API_KEY stored",
    "Verify: az keyvault secret list --vault-name fridayreport-kv",
  ], PURPLE);

  addNote(s12, 0.6, 3.8, 3.8, "Networking & DNS", [
    "VNet with subnets configured",
    "Private endpoints for PG, KV, Blob",
    "Custom domain CNAME record created",
    "TXT verification record added",
    "TLS certificate provisioned (or pending)",
    "OAuth redirect URIs updated (Google + Microsoft)",
    "Verify: nslookup app.fridayreport.ai",
  ], BRAND_BLUE);

  addNote(s12, 4.8, 3.8, 3.8, "Database Ready", [
    "Schema migrations applied successfully",
    "Extensions installed: unaccent",
    "Session table verified: connect_pg_simple_sessions",
    "Initial data seeded (if applicable)",
    "Firewall temp rules removed",
    "Connection test from Container App subnet",
    "Verify: psql $DATABASE_URL -c '\\dt'",
  ], BRAND_BLUE);

  addNote(s12, 9.0, 3.8, 3.8, "Post-Deploy Smoke Tests", [
    "GET https://app.fridayreport.ai — returns 200",
    "GET /api/health — returns healthy status",
    "Login with email/password — session created",
    "Login with Google OAuth — redirect works",
    "Login with Microsoft OAuth — redirect works",
    "File upload — stored in Blob Storage",
    "Verify: curl -I https://app.fridayreport.ai",
  ], BRAND_ORANGE);

  s12.addShape("rect" as any, {
    x: 0.6, y: 6.0, w: PW - 1.2, h: 0.4,
    fill: { color: "FEF2F2" },
    line: { color: ROSE, width: 2 },
    rectRadius: 0.06,
  });
  s12.addText([
    { text: "GO / NO-GO: ", options: { fontSize: 11, bold: true, color: ROSE } },
    { text: "All checklist items must be verified before shifting production traffic. Schedule a go-live window with stakeholders and have rollback commands ready.", options: { fontSize: 10, color: BRAND_DARK } },
  ], {
    x: 0.8, y: 6.05, w: PW - 1.6, h: 0.3,
    valign: "middle", fontFace: "Segoe UI",
  });

  // ════════════════════════════════════════
  // SLIDE 13: COST ESTIMATION
  // ════════════════════════════════════════
  const s13 = pptx.addSlide();
  s13.background = { color: WHITE };
  addSlideHeader(s13, 13, "Cost Estimation (Monthly)", TEAL);
  addFooter(s13, 13, 13, TEAL);

  s13.addText("Estimated monthly Azure costs based on typical usage patterns. Prices are approximate and vary by region (East US shown). All prices in USD.", {
    x: 0.6, y: 1.0, w: PW - 1.2, h: 0.3,
    fontSize: 11, color: GRAY, fontFace: "Segoe UI",
  });

  const costHeaders = ["Service", "SKU / Tier", "Dev Estimate", "Prod Estimate"];
  const costRows = [
    ["Container App", "1 vCPU / 2 Gi (dev) — 2 vCPU / 4 Gi x2 (prod)", "$30-50", "$150-300"],
    ["PostgreSQL Flexible", "Standard_B1ms (dev) — Standard_D4ds_v4 (prod)", "$15-25", "$200-400"],
    ["Azure Blob Storage", "Standard LRS (dev) — Standard GRS (prod)", "$1-5", "$5-20"],
    ["Container Registry", "Basic (dev) — Standard (prod)", "$5", "$20"],
    ["Key Vault", "Standard tier", "$0-1", "$0-5"],
    ["Log Analytics", "Pay-per-GB ingestion", "$5-10", "$20-50"],
    ["VNet / Private Endpoints", "3 private endpoints", "$0", "$22"],
    ["Custom Domain + TLS", "Managed certificate", "$0", "$0"],
  ];

  const colW = [3.0, 4.5, 1.8, 1.8];
  const rowH = 0.32;
  const tableX = 0.6;
  let tableY = 1.5;

  for (let c = 0; c < costHeaders.length; c++) {
    const cx3 = tableX + colW.slice(0, c).reduce((a, b) => a + b, 0);
    s13.addText(costHeaders[c], {
      x: cx3, y: tableY, w: colW[c], h: rowH,
      fontSize: 10, bold: true, color: WHITE, align: "center", valign: "middle",
      fontFace: "Segoe UI",
      fill: { color: TEAL },
    });
  }
  tableY += rowH;

  for (let r = 0; r < costRows.length; r++) {
    const bgColor = r % 2 === 0 ? "F0FDFA" : WHITE;
    for (let c = 0; c < costRows[r].length; c++) {
      const cx3 = tableX + colW.slice(0, c).reduce((a, b) => a + b, 0);
      s13.addText(costRows[r][c], {
        x: cx3, y: tableY, w: colW[c], h: rowH,
        fontSize: 9, color: BRAND_DARK, align: c >= 2 ? "center" : "left", valign: "middle",
        fontFace: "Segoe UI",
        fill: { color: bgColor },
        line: { color: "E5E7EB", width: 0.5 },
      });
    }
    tableY += rowH;
  }

  const totalRowY = tableY;
  for (let c = 0; c < 4; c++) {
    const cx3 = tableX + colW.slice(0, c).reduce((a, b) => a + b, 0);
    const vals = ["TOTAL (estimated)", "", "$56-96", "$417-817"];
    s13.addText(vals[c], {
      x: cx3, y: totalRowY, w: colW[c], h: rowH,
      fontSize: 10, bold: true, color: WHITE, align: c >= 2 ? "center" : "left", valign: "middle",
      fontFace: "Segoe UI",
      fill: { color: TEAL },
    });
  }

  addNote(s13, 0.6, 5.0, 3.8, "Cost Optimization Tips", [
    "Use Reserved Instances for PostgreSQL (1-3 yr)",
    "Scale to zero in dev (Container App)",
    "Use Basic ACR tier in development",
    "Set log retention to 30 days (default 90)",
    "Use Spot instances for non-critical workloads",
  ], TEAL);

  addNote(s13, 4.8, 5.0, 3.8, "Scaling Cost Factors", [
    "Container App: billed per vCPU-second + memory",
    "Auto-scaling to 10 replicas: ~$1,500/mo peak",
    "PostgreSQL: largest cost driver in production",
    "Consider Burstable tier for predictable workloads",
  ], BRAND_ORANGE);

  addNote(s13, 9.0, 5.0, 3.8, "Free / Included Services", [
    "Managed TLS certificates: Free",
    "Managed Identity: Free",
    "Azure RBAC: Free",
    "Key Vault: First 10k operations free",
    "Blob Storage: 5 GB free (first 12 months)",
  ], GREEN);

  return pptx;
}

async function main() {
  const pptx = build();
  await pptx.writeFile({ fileName: "FridayReportAI_Azure_Deployment_Flow.pptx" });
  console.log("PowerPoint diagram generated: FridayReportAI_Azure_Deployment_Flow.pptx");
}

main().catch(console.error);
