import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ShadingType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  ImageRun,
  convertInchesToTwip,
} from "docx";
import * as fs from "fs";

const BRAND_ORANGE = "FF751F";
const BRAND_BLUE = "075DD1";
const BRAND_DARK = "17255A";
const LIGHT_GRAY = "F2F4F7";
const WHITE = "FFFFFF";
const BLACK = "333333";
const MEDIUM_GRAY = "667085";

function headerCell(text: string): TableCell {
  return new TableCell({
    shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: WHITE, size: 20, font: "Calibri" })],
        spacing: { before: 60, after: 60 },
      }),
    ],
  });
}

function cell(text: string, shaded = false): TableCell {
  return new TableCell({
    shading: shaded ? { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY } : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20, font: "Calibri", color: BLACK })],
        spacing: { before: 40, after: 40 },
      }),
    ],
  });
}

function makeTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    },
    rows: [
      new TableRow({ children: headers.map((h) => headerCell(h)) }),
      ...rows.map(
        (row, i) => new TableRow({ children: row.map((c) => cell(c, i % 2 === 0)) })
      ),
    ],
  });
}

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true, color: BRAND_DARK, font: "Calibri" })],
    spacing: { before: 360, after: 180 },
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, color: BRAND_BLUE, font: "Calibri" })],
    spacing: { before: 280, after: 140 },
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, bold: true, color: BRAND_DARK, font: "Calibri" })],
    spacing: { before: 200, after: 100 },
  });
}

function para(text: string, opts?: { bold?: boolean; italic?: boolean; color?: string }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: "Calibri", color: opts?.color || BLACK, bold: opts?.bold, italics: opts?.italic })],
    spacing: { before: 80, after: 80 },
  });
}

function bullet(text: string, level = 0): Paragraph {
  return new Paragraph({
    bullet: { level },
    children: [new TextRun({ text, size: 22, font: "Calibri", color: BLACK })],
    spacing: { before: 40, after: 40 },
  });
}

function code(text: string): Paragraph {
  return new Paragraph({
    shading: { type: ShadingType.SOLID, color: LIGHT_GRAY, fill: LIGHT_GRAY },
    indent: { left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.2) },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: "Consolas", size: 18, color: BRAND_DARK })],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { before: 120, after: 120 }, children: [] });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

function boldPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: "Calibri", color: BLACK, bold: true })],
    spacing: { before: 140, after: 60 },
  });
}

const commonHeader = new Header({
  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "FridayReport.AI \u2014 Azure Container App Deployment Guide", font: "Calibri", size: 16, color: MEDIUM_GRAY, italics: true })] })],
});

const commonFooter = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Confidential \u2014 Page ", font: "Calibri", size: 16, color: MEDIUM_GRAY }),
        new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: 16, color: MEDIUM_GRAY }),
      ],
    }),
  ],
});

const pageProps = {
  page: {
    margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) },
  },
};

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22, color: BLACK } },
    },
  },
  numbering: {
    config: [
      {
        reference: "steps",
        levels: [
          {
            level: 0,
            format: NumberFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } },
          },
        ],
      },
    ],
  },
  sections: [
    // ═══════════════════════════════════════════════
    //  COVER PAGE
    // ═══════════════════════════════════════════════
    {
      properties: pageProps,
      children: [
        new Paragraph({ spacing: { before: 3600 }, children: [] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "FridayReport.AI", bold: true, size: 60, font: "Calibri", color: BRAND_ORANGE })] }),
        spacer(),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Azure Container App", size: 44, font: "Calibri", bold: true, color: BRAND_DARK })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [new TextRun({ text: "Deployment Guide", size: 44, font: "Calibri", bold: true, color: BRAND_DARK })] }),
        spacer(),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: "Enterprise Project & Portfolio Management Platform", size: 24, font: "Calibri", color: MEDIUM_GRAY })] }),
        new Paragraph({ spacing: { before: 2400 }, children: [] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Version 1.0", font: "Calibri", size: 22, color: MEDIUM_GRAY })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [new TextRun({ text: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), font: "Calibri", size: 22, color: MEDIUM_GRAY })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [new TextRun({ text: "CONFIDENTIAL", font: "Calibri", size: 20, bold: true, color: "CC0000" })] }),
      ],
    },

    // ═══════════════════════════════════════════════
    //  MAIN CONTENT
    // ═══════════════════════════════════════════════
    {
      properties: pageProps,
      headers: { default: commonHeader },
      footers: { default: commonFooter },
      children: [
        // ── TABLE OF CONTENTS ──
        h1("Table of Contents"),
        spacer(),
        para("1.  Executive Summary"),
        para("2.  Application Architecture"),
        para("    2.1  Technology Stack"),
        para("    2.2  Architecture Overview"),
        para("    2.3  Key Directory Structure"),
        para("3.  Azure Target Architecture"),
        para("    3.1  Azure Services Required"),
        para("    3.2  Architecture Topology"),
        para("4.  Deployment Flow"),
        para("    4.1  Build the Application"),
        para("    4.2  Create the Dockerfile"),
        para("    4.3  Build & Tag the Docker Image"),
        para("    4.4  Provision Azure Resource Group"),
        para("    4.5  Set Up Azure Container Registry (ACR)"),
        para("    4.6  Push Image to ACR"),
        para("    4.7  Provision Azure Database for PostgreSQL"),
        para("    4.8  Provision Azure Blob Storage"),
        para("    4.9  Configure Azure Key Vault"),
        para("    4.10 Create Container App Environment"),
        para("    4.11 Deploy the Container App"),
        para("    4.12 Configure Managed Identity & Role Assignments"),
        para("    4.13 Configure Ingress & Custom Domain"),
        para("5.  Environment Variables Reference"),
        para("6.  Scaling & Performance"),
        para("7.  Networking & Security"),
        para("8.  Monitoring & Logging"),
        para("9.  CI/CD Integration Overview"),
        para("10. Architectural Decisions"),
        para("11. Appendix \u2014 Azure CLI Quick Reference"),

        // ═══════════════════════════════════════════════
        //  1. EXECUTIVE SUMMARY
        // ═══════════════════════════════════════════════
        pageBreak(),
        h1("1. Executive Summary"),
        para("This document provides a comprehensive, step-by-step guide for deploying the FridayReport.AI application to Microsoft Azure using Azure Container Apps. It covers the complete deployment pipeline from building the application source code through containerization, registry management, infrastructure provisioning, and production configuration."),
        para("FridayReport.AI is an enterprise-grade Project & Portfolio Management (PPM) platform built on a modern TypeScript stack. The application uses a React 18 frontend with Tailwind CSS, an Express.js backend with PostgreSQL via Drizzle ORM, and integrates with Microsoft Graph for Planner/Dataverse connectivity."),
        para("The target deployment architecture leverages Azure Container Apps for serverless container hosting, Azure Database for PostgreSQL Flexible Server for data persistence, Azure Blob Storage for file management, and Azure Key Vault for secrets management."),
        para("The target audience for this document includes DevOps engineers, cloud architects, and IT administrators responsible for deploying and maintaining the FridayReport.AI platform in an Azure environment."),

        // ═══════════════════════════════════════════════
        //  2. APPLICATION ARCHITECTURE
        // ═══════════════════════════════════════════════
        pageBreak(),
        h1("2. Application Architecture"),
        para("FridayReport.AI is an enterprise-grade Project and Portfolio Management (PPM) platform built as a full-stack TypeScript monolithic application. It provides project tracking, resource allocation, AI-driven risk assessments, timesheet management, and deep integrations with the Microsoft ecosystem."),

        h2("2.1 Technology Stack"),
        makeTable(
          ["Layer", "Technology"],
          [
            ["Frontend", "React 18 (SPA) with Vite, Tailwind CSS, Radix UI (Shadcn), Recharts, Framer Motion"],
            ["Backend", "Node.js 20 + Express.js (TypeScript)"],
            ["Database", "PostgreSQL 15+ (via Drizzle ORM)"],
            ["Authentication", "Passport.js (Email/Password, Google OAuth 2.0, Microsoft Entra ID OAuth)"],
            ["File Processing", "Java-based MPP parser (MPXJ library) for Microsoft Project files"],
            ["Email", "Resend API for transactional emails"],
            ["Scheduling", "node-cron for automated report generation and timesheet reminders"],
            ["Application Port", "5000 (configurable via PORT environment variable)"],
          ]
        ),

        h2("2.2 Architecture Overview"),
        para("The application follows a monolithic tiered architecture:"),
        bullet("Client Layer: A React Single Page Application (SPA) served as static files in production."),
        bullet("Server Layer: A RESTful Express API handling business logic, authentication, and external service integrations."),
        bullet("Shared Layer: Drizzle ORM schema and Zod validation types used by both frontend and backend for type safety."),
        bullet("Service Layer: Specialized business logic in dedicated service modules (notifications, AI, Microsoft integrations, scheduled reports)."),
        para("In production, Express serves both the API endpoints and the pre-built React static files from a single Node.js process."),

        h2("2.3 Key Directory Structure"),
        makeTable(
          ["Directory", "Purpose"],
          [
            ["client/src/components/", "React UI components organized by functional area"],
            ["client/src/pages/", "Route-level page components"],
            ["server/auth/", "Multi-provider authentication logic (email, Google, Microsoft)"],
            ["server/services/", "Business logic and third-party integrations (Microsoft Graph, email)"],
            ["shared/", "Database schema (Drizzle ORM) and shared type definitions"],
            ["lib/", "JAR files and Java source for the MPP file parser"],
            ["script/", "Build script (build.ts) and database migration runner (migrate.ts)"],
            ["dist/", "Build output: index.cjs (server bundle) + public/ (frontend assets)"],
          ]
        ),

        // ═══════════════════════════════════════════════
        //  3. AZURE TARGET ARCHITECTURE
        // ═══════════════════════════════════════════════
        pageBreak(),
        h1("3. Azure Target Architecture"),
        para("The following Azure services are required to host FridayReport.AI as a containerized application."),

        h2("3.1 Azure Services Required"),
        makeTable(
          ["Azure Service", "Purpose"],
          [
            ["Azure Container Apps", "Hosts the containerized application with auto-scaling, ingress, and TLS termination"],
            ["Azure Container Registry (ACR)", "Stores and manages Docker container images; integrates with Container Apps for image pulls"],
            ["Azure Database for PostgreSQL (Flexible Server)", "Managed PostgreSQL service with high availability and automated backups"],
            ["Azure Blob Storage", "File storage for uploads, project documents, avatars, and exported reports"],
            ["Azure Key Vault", "Securely manages all secrets: database credentials, API keys, OAuth secrets, session tokens"],
            ["Azure Entra ID (Azure AD)", "Microsoft OAuth authentication (integrated via MSAL in the application)"],
            ["Azure Virtual Network (VNet)", "Secures communication between Container Apps and PostgreSQL via private networking"],
            ["Azure Log Analytics Workspace", "Required by Container Apps for centralized logging and monitoring"],
            ["Azure Application Insights (optional)", "Advanced APM, request tracing, and error tracking for the Node.js backend"],
            ["Azure Front Door (optional)", "Global load balancing, WAF, and CDN for enterprise-scale deployments"],
          ]
        ),

        h2("3.2 Architecture Topology"),
        para("The diagram below illustrates the complete deployment flow and runtime architecture:"),
        spacer(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: fs.readFileSync("scripts/deployment-flow.png"),
              transformation: { width: 720, height: 492 },
              type: "png",
            }),
          ],
        }),
        spacer(),
        para("Figure 1: FridayReport.AI Azure Container App Deployment Flow", { italic: true, color: MEDIUM_GRAY }),
        spacer(),
        para("Key data flows:"),
        bullet("Internet traffic enters via Azure Container Apps ingress (HTTPS with managed TLS certificates) or Azure Front Door."),
        bullet("Container App runs the FridayReport.AI container image pulled from Azure Container Registry."),
        bullet("Container App connects to Azure Database for PostgreSQL via VNet private endpoint."),
        bullet("Container App connects to Azure Blob Storage for file operations via Managed Identity."),
        bullet("Container App retrieves secrets from Azure Key Vault at startup via Managed Identity."),
        bullet("Outbound API calls go to Resend, Google (OAuth), and Microsoft Graph."),
        bullet("Cron jobs (scheduled reports, timesheet reminders) run within the container process."),

        // ═══════════════════════════════════════════════
        //  4. DEPLOYMENT FLOW
        // ═══════════════════════════════════════════════
        pageBreak(),
        h1("4. Deployment Flow"),
        para("This section provides step-by-step instructions for deploying the application from source code to a running Azure Container App."),

        // 4.1
        h2("4.1 Build the Application"),
        para("The FridayReport.AI build process produces two primary artifacts:"),
        bullet("dist/index.cjs \u2014 The bundled Express.js server (CommonJS format, minified via esbuild)."),
        bullet("dist/public/ \u2014 The Vite-built React frontend (static HTML, JS, CSS, and assets)."),
        spacer(),
        para("Run the build:"),
        code("npm install"),
        code("npm run build"),
        spacer(),
        para("The build script (script/build.ts) performs the following automatically:", { italic: true }),
        bullet("Synchronizes the database schema using Drizzle Kit (drizzle-kit push --force)."),
        bullet("Applies additional database migrations and indexes (script/migrate.ts)."),
        bullet("Builds the React frontend with Vite \u2192 output to dist/public/."),
        bullet("Bundles the Express server with esbuild \u2192 output to dist/index.cjs."),
        spacer(),
        para("Important: The build process requires a valid DATABASE_URL because it pushes schema changes. For CI/CD pipelines, point this at a staging database or run schema sync as a separate step.", { bold: true }),

        // 4.2
        pageBreak(),
        h2("4.2 Create the Dockerfile"),
        para("Create a multi-stage Dockerfile in the project root:"),
        spacer(),
        code("# Stage 1: Build"),
        code("FROM node:20-alpine AS builder"),
        code("WORKDIR /app"),
        code("COPY package*.json ./"),
        code("RUN npm ci --ignore-scripts"),
        code("COPY . ."),
        code("# Note: Run schema push separately against the target database"),
        code("# RUN npm run build  (requires DATABASE_URL)"),
        code(""),
        code("# Stage 2: Production Runtime"),
        code("FROM node:20-alpine AS production"),
        code(""),
        code("# Install JRE for MPP file parsing (MPXJ library)"),
        code("RUN apk add --no-cache openjdk17-jre-headless"),
        code(""),
        code("WORKDIR /app"),
        code("ENV NODE_ENV=production"),
        code(""),
        code("COPY --from=builder /app/dist ./dist"),
        code("COPY --from=builder /app/node_modules ./node_modules"),
        code("COPY --from=builder /app/package.json ./package.json"),
        code("COPY --from=builder /app/public ./public"),
        code("COPY --from=builder /app/lib ./lib"),
        code(""),
        code("EXPOSE 5000"),
        code("CMD [\"node\", \"dist/index.cjs\"]"),
        spacer(),
        para("Dockerfile notes:", { bold: true }),
        bullet("Multi-stage build keeps the final image lean."),
        bullet("Java JRE is required for the MPXJ library that parses Microsoft Project (.mpp) files."),
        bullet("node_modules are included because esbuild marks some packages as external."),
        bullet("The lib/ directory contains JAR files for the MPP parser."),
        bullet("The public/ directory contains static assets (avatars, logos) served outside of Vite."),
        bullet("Expected image size: 400\u2013600 MB (due to Node.js + JRE + dependencies)."),

        // 4.3
        h2("4.3 Build & Tag the Docker Image"),
        para("Build the image locally and tag it for Azure Container Registry:"),
        code("docker build -t fridayreport-ai:latest ."),
        code("docker tag fridayreport-ai:latest <acr-name>.azurecr.io/fridayreport-ai:v1.0.0"),

        // 4.4 (Resource Group first — required by all subsequent resources)
        h2("4.4 Provision Azure Resource Group"),
        para("Create a resource group to organize all deployment resources. This must be done first as all other Azure resources are created within it."),
        code("az group create \\"),
        code("  --name fridayreport-rg \\"),
        code("  --location eastus"),
        spacer(),
        para("Choose a region close to your primary user base (e.g., eastus, westeurope, southeastasia).", { italic: true }),

        // 4.5
        h2("4.5 Set Up Azure Container Registry (ACR)"),
        para("Create an Azure Container Registry:"),
        code("az acr create \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --name fridayreportacr \\"),
        code("  --sku Standard"),
        spacer(),
        code("az acr login --name fridayreportacr"),
        spacer(),
        para("Note: Managed Identity with AcrPull role is the recommended authentication method (configured in step 4.12). Avoid --admin-enabled for production.", { italic: true }),
        para("SKU recommendation: Standard for production. Premium if geo-replication or private endpoints are needed.", { italic: true }),

        // 4.6
        h2("4.6 Push Image to ACR"),
        code("docker push fridayreportacr.azurecr.io/fridayreport-ai:v1.0.0"),
        spacer(),
        para("Alternative \u2014 build directly in Azure (no local Docker required):", { italic: true }),
        code("az acr build --registry fridayreportacr --image fridayreport-ai:v1.0.0 ."),

        // 4.7
        pageBreak(),
        h2("4.7 Provision Azure Database for PostgreSQL"),
        code("az postgres flexible-server create \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --name fridayreport-db \\"),
        code("  --location eastus \\"),
        code("  --admin-user fridayadmin \\"),
        code("  --admin-password <secure-password> \\"),
        code("  --sku-name Standard_B2s \\"),
        code("  --storage-size 64 \\"),
        code("  --version 15"),
        spacer(),
        para("Create the application database:"),
        code("az postgres flexible-server db create \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --server-name fridayreport-db \\"),
        code("  --database-name fridayreport"),
        spacer(),
        para("Enable the required PostgreSQL extension:"),
        code("az postgres flexible-server parameter set \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --server-name fridayreport-db \\"),
        code("  --name azure.extensions \\"),
        code("  --value unaccent"),
        spacer(),
        para("SKU recommendations:", { bold: true }),
        bullet("Development/Testing: Standard_B2s (2 vCores, 4 GB RAM)"),
        bullet("Production: Standard_D4ds_v4 or higher (4+ vCores, 16+ GB RAM)"),
        bullet("Enable zone-redundant high availability for production workloads."),

        // 4.8
        h2("4.8 Provision Azure Blob Storage"),
        para("Create a storage account for file uploads, documents, and exported reports:"),
        code("az storage account create \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --name fridayreportstorage \\"),
        code("  --location eastus \\"),
        code("  --sku Standard_LRS \\"),
        code("  --kind StorageV2"),
        spacer(),
        code("az storage container create \\"),
        code("  --account-name fridayreportstorage \\"),
        code("  --name uploads"),
        spacer(),
        para("Use Managed Identity for credential-free access (see Section 7).", { italic: true }),

        // 4.9
        h2("4.9 Configure Azure Key Vault"),
        code("az keyvault create \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --name fridayreport-kv \\"),
        code("  --location eastus"),
        spacer(),
        para("Store required secrets (see Section 5 for the complete list):"),
        code("az keyvault secret set --vault-name fridayreport-kv --name DATABASE-URL \\"),
        code("  --value \"postgresql://fridayadmin:<pwd>@fridayreport-db.postgres.database.azure.com:5432/fridayreport?sslmode=require\""),
        code(""),
        code("az keyvault secret set --vault-name fridayreport-kv --name SESSION-SECRET \\"),
        code("  --value \"$(openssl rand -hex 32)\""),
        code(""),

        // 4.10
        pageBreak(),
        h2("4.10 Create Container App Environment"),
        code("az monitor log-analytics workspace create \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --workspace-name fridayreport-logs"),
        code(""),
        code("LOG_ID=$(az monitor log-analytics workspace show \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --workspace-name fridayreport-logs \\"),
        code("  --query customerId -o tsv)"),
        code(""),
        code("LOG_KEY=$(az monitor log-analytics workspace get-shared-keys \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --workspace-name fridayreport-logs \\"),
        code("  --query primarySharedKey -o tsv)"),
        code(""),
        code("az containerapp env create \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --name fridayreport-env \\"),
        code("  --location eastus \\"),
        code("  --logs-workspace-id $LOG_ID \\"),
        code("  --logs-workspace-key $LOG_KEY"),

        // 4.11
        h2("4.11 Deploy the Container App"),
        para("First, create the Container App secrets (these are referenced by env vars below):"),
        code("az containerapp create \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --name fridayreport-app \\"),
        code("  --environment fridayreport-env \\"),
        code("  --image fridayreportacr.azurecr.io/fridayreport-ai:v1.0.0 \\"),
        code("  --registry-server fridayreportacr.azurecr.io \\"),
        code("  --registry-username fridayreportacr \\"),
        code("  --registry-password $(az acr credential show --name fridayreportacr --query passwords[0].value -o tsv) \\"),
        code("  --target-port 5000 \\"),
        code("  --ingress external \\"),
        code("  --min-replicas 1 \\"),
        code("  --max-replicas 5 \\"),
        code("  --cpu 1.0 \\"),
        code("  --memory 2.0Gi \\"),
        code("  --secrets \\"),
        code("    database-url=\"<your-database-url>\" \\"),
        code("    session-secret=\"<your-session-secret>\" \\"),
        code("    google-client-id=\"<your-google-client-id>\" \\"),
        code("    google-client-secret=\"<your-google-client-secret>\" \\"),
        code("    microsoft-client-id=\"<your-ms-client-id>\" \\"),
        code("    microsoft-client-secret=\"<your-ms-client-secret>\" \\"),
        code("    resend-api-key=\"<your-resend-api-key>\" \\"),
        code("  --env-vars \\"),
        code("    NODE_ENV=production \\"),
        code("    PORT=5000 \\"),
        code("    DATABASE_URL=secretref:database-url \\"),
        code("    SESSION_SECRET=secretref:session-secret \\"),
        code("    GOOGLE_CLIENT_ID=secretref:google-client-id \\"),
        code("    GOOGLE_CLIENT_SECRET=secretref:google-client-secret \\"),
        code("    MICROSOFT_CLIENT_ID=secretref:microsoft-client-id \\"),
        code("    MICROSOFT_CLIENT_SECRET=secretref:microsoft-client-secret \\"),
        code("    RESEND_API_KEY=secretref:resend-api-key \\"),
        code("    RESEND_FROM_EMAIL=noreply@fridayreport.ai \\"),
        code("    AZURE_STORAGE_ACCOUNT_NAME=fridayreportstorage \\"),
        code("    AZURE_STORAGE_CONTAINER_NAME=uploads \\"),
        code("    APP_URL=https://fridayreport-app.<region>.azurecontainerapps.io"),
        spacer(),
        para("Note: Initial deployment uses admin credentials for ACR. After creating the Container App, step 4.12 configures Managed Identity for credential-free ACR pulls (recommended for production).", { italic: true }),
        para("For Key Vault-based secret management (recommended), secrets can be sourced from Key Vault using the --secret-volume-mount approach or by using the Azure SDK in the application to fetch secrets at startup.", { italic: true }),

        // 4.12
        h2("4.12 Configure Managed Identity & Role Assignments"),
        para("Assign a system-managed identity to the Container App and grant it access to ACR, Key Vault, and Blob Storage:"),
        spacer(),
        h3("Assign Managed Identity"),
        code("az containerapp identity assign \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --name fridayreport-app \\"),
        code("  --system-assigned"),
        spacer(),
        code("IDENTITY_ID=$(az containerapp show --resource-group fridayreport-rg \\"),
        code("  --name fridayreport-app --query identity.principalId -o tsv)"),
        spacer(),
        h3("Grant ACR Pull Access"),
        code("ACR_ID=$(az acr show --name fridayreportacr --query id -o tsv)"),
        code("az role assignment create --role AcrPull --assignee $IDENTITY_ID --scope $ACR_ID"),
        spacer(),
        h3("Grant Key Vault Access"),
        code("az keyvault set-policy --name fridayreport-kv \\"),
        code("  --object-id $IDENTITY_ID \\"),
        code("  --secret-permissions get list"),
        spacer(),
        h3("Grant Blob Storage Access"),
        code("STORAGE_ID=$(az storage account show --name fridayreportstorage --query id -o tsv)"),
        code("az role assignment create \\"),
        code("  --role \"Storage Blob Data Contributor\" \\"),
        code("  --assignee $IDENTITY_ID \\"),
        code("  --scope $STORAGE_ID"),
        spacer(),
        para("After assigning the managed identity, update the Container App to use identity-based ACR authentication:"),
        code("az containerapp registry set \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --name fridayreport-app \\"),
        code("  --server fridayreportacr.azurecr.io \\"),
        code("  --identity system"),

        // 4.13
        pageBreak(),
        h2("4.13 Configure Ingress & Custom Domain"),
        para("The Container App is created with external ingress. To add a custom domain:"),
        spacer(),
        h3("Add Custom Domain"),
        code("az containerapp hostname add \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --name fridayreport-app \\"),
        code("  --hostname app.fridayreport.ai"),
        spacer(),
        h3("Bind Managed TLS Certificate"),
        code("az containerapp hostname bind \\"),
        code("  --resource-group fridayreport-rg \\"),
        code("  --name fridayreport-app \\"),
        code("  --hostname app.fridayreport.ai \\"),
        code("  --environment fridayreport-env \\"),
        code("  --validation-method CNAME"),
        spacer(),
        h3("DNS Records"),
        para("Add the following DNS records at your domain registrar:"),
        makeTable(
          ["Record Type", "Name", "Value"],
          [
            ["CNAME", "app", "fridayreport-app.<region>.azurecontainerapps.io"],
            ["TXT", "asuid.app", "<domain-verification-id from Azure>"],
          ]
        ),
        spacer(),
        para("After binding, update APP_URL:"),
        code("az containerapp update --resource-group fridayreport-rg --name fridayreport-app \\"),
        code("  --set-env-vars APP_URL=https://app.fridayreport.ai"),
        spacer(),
        para("Also update OAuth redirect URIs in Google Cloud Console and Azure AD App Registrations to use the new domain.", { bold: true }),

        // ═══════════════════════════════════════════════
        //  5. ENVIRONMENT VARIABLES
        // ═══════════════════════════════════════════════
        pageBreak(),
        h1("5. Environment Variables Reference"),
        para("All sensitive values should be stored in Azure Key Vault and referenced as secrets in the Container App configuration."),
        spacer(),

        h2("5.1 Core Application"),
        makeTable(
          ["Variable", "Description", "Example / Notes"],
          [
            ["DATABASE_URL", "PostgreSQL connection string", "postgresql://user:pass@host:5432/db?sslmode=require"],
            ["SESSION_SECRET", "Session signing key (64+ random chars)", "openssl rand -hex 32"],
            ["TOKEN_ENCRYPTION_KEY", "Token encryption key (falls back to SESSION_SECRET)", "Optional separate key"],
            ["NODE_ENV", "Runtime environment", "production"],
            ["PORT", "HTTP listen port", "5000 (default)"],
            ["APP_URL", "Public-facing application URL", "https://app.fridayreport.ai"],
          ]
        ),
        spacer(),

        h2("5.2 Authentication \u2014 Google OAuth"),
        makeTable(
          ["Variable", "Description", "Example / Notes"],
          [
            ["GOOGLE_CLIENT_ID", "Google OAuth 2.0 client ID", "From Google Cloud Console"],
            ["GOOGLE_CLIENT_SECRET", "Google OAuth 2.0 client secret", "From Google Cloud Console"],
          ]
        ),
        spacer(),

        h2("5.3 Authentication \u2014 Microsoft Entra ID"),
        makeTable(
          ["Variable", "Description", "Example / Notes"],
          [
            ["MICROSOFT_CLIENT_ID", "Entra ID application client ID", "From Azure Portal \u2192 App Registrations"],
            ["MICROSOFT_CLIENT_SECRET", "Entra ID application client secret", "From Azure Portal \u2192 App Registrations"],
          ]
        ),
        spacer(),

        h2("5.4 Email Service"),
        makeTable(
          ["Variable", "Description", "Example / Notes"],
          [
            ["RESEND_API_KEY", "Resend email service API key", "From resend.com dashboard"],
            ["RESEND_FROM_EMAIL", "Sender email address", "noreply@fridayreport.ai"],
          ]
        ),
        spacer(),

        h2("5.5 Storage \u2014 Azure Blob"),
        makeTable(
          ["Variable", "Description", "Example / Notes"],
          [
            ["AZURE_STORAGE_ACCOUNT_NAME", "Storage account name", "fridayreportstorage"],
            ["AZURE_STORAGE_CONTAINER_NAME", "Blob container for file uploads", "uploads"],
          ]
        ),
        para("When using Managed Identity, no connection string or access key is needed.", { italic: true }),

        // ═══════════════════════════════════════════════
        //  6. SCALING & PERFORMANCE
        // ═══════════════════════════════════════════════
        pageBreak(),
        h1("6. Scaling & Performance"),

        h2("6.1 Recommended Scaling Configuration"),
        makeTable(
          ["Parameter", "Development", "Production"],
          [
            ["Min Replicas", "0", "2"],
            ["Max Replicas", "2", "10"],
            ["CPU per replica", "0.5 vCPU", "1.0\u20132.0 vCPU"],
            ["Memory per replica", "1.0 Gi", "2.0\u20134.0 Gi"],
            ["Scale Rule", "HTTP (10 concurrent)", "HTTP (50 concurrent)"],
          ]
        ),

        h2("6.2 Health Checks"),
        bullet("Liveness probe: GET / (React SPA serves index.html)."),
        bullet("Readiness probe: GET /api/health (add a simple endpoint returning 200 OK)."),
        bullet("Startup probe: Allow 30 seconds for initial database connection and schema validation."),

        h2("6.3 Performance Considerations"),
        bullet("The application bundles key dependencies into dist/index.cjs to minimize cold start time."),
        bullet("The React SPA is served as static files \u2014 consider Azure Front Door CDN for global distribution."),
        bullet("Cron jobs (scheduled reports, timesheet reminders) run inside each container replica. Use min-replicas \u2265 1 to ensure scheduled tasks execute reliably."),
        bullet("For multi-replica deployments, implement database-based locking for cron jobs to prevent duplicate execution."),
        bullet("PostgreSQL connection pooling: The application uses node-postgres Pool. For high-replica deployments, consider PgBouncer or set pool limits per replica."),

        // ═══════════════════════════════════════════════
        //  7. NETWORKING & SECURITY
        // ═══════════════════════════════════════════════
        pageBreak(),
        h1("7. Networking & Security"),

        h2("7.1 Network Architecture"),
        bullet("Azure Container Apps run within a managed VNet by default."),
        bullet("For enhanced security, deploy in a custom VNet with private endpoints for PostgreSQL, Key Vault, and Blob Storage."),
        bullet("External ingress provides automatic TLS termination with managed certificates."),

        h2("7.2 Managed Identity"),
        para("System-assigned managed identity eliminates credential management for Azure service-to-service communication. See step 4.12 for the complete setup."),
        spacer(),
        para("Required role assignments:"),
        bullet("ACR: AcrPull role \u2014 for pulling container images."),
        bullet("Key Vault: Key Vault Secrets User role \u2014 for reading secrets at runtime."),
        bullet("Blob Storage: Storage Blob Data Contributor role \u2014 for file upload/download operations."),
        spacer(),
        para("The only credential that remains as a traditional secret is the PostgreSQL connection string (DATABASE_URL)."),

        h2("7.3 Security Best Practices"),
        bullet("Store all secrets in Azure Key Vault \u2014 never in environment variables directly."),
        bullet("Enable Azure Defender for Containers for vulnerability scanning."),
        bullet("Use private endpoints for PostgreSQL and Blob Storage to restrict access to the VNet."),
        bullet("Enable Azure DDoS Protection on the VNet for production workloads."),
        bullet("Rotate secrets on a regular cadence (90 days recommended)."),
        bullet("The application includes Content-Security-Policy headers for Microsoft Teams iframe embedding."),
        bullet("All authentication flows use HTTPS with secure cookie settings in production."),

        // ═══════════════════════════════════════════════
        //  8. MONITORING & LOGGING
        // ═══════════════════════════════════════════════
        pageBreak(),
        h1("8. Monitoring & Logging"),

        h2("8.1 Application Logs"),
        para("Container App logs are collected by the Log Analytics workspace. Query with KQL:"),
        code("ContainerAppConsoleLogs_CL"),
        code("| where ContainerAppName_s == 'fridayreport-app'"),
        code("| where Log_s contains 'ERROR'"),
        code("| order by TimeGenerated desc"),
        code("| take 50"),

        h2("8.2 Recommended Alerts"),
        bullet("HTTP 5xx error rate > 1% over 5 minutes."),
        bullet("CPU utilization > 80% sustained for 10 minutes."),
        bullet("Memory utilization > 85% sustained for 10 minutes."),
        bullet("Replica restart count > 3 within 15 minutes."),
        bullet("Database connection failures."),

        h2("8.3 Built-in Application Monitoring"),
        para("FridayReport.AI includes API request logging to the api_request_logs database table:"),
        bullet("Request method, path, status code, and response duration."),
        bullet("User and organization context per request."),
        bullet("Error messages for failed requests (4xx/5xx)."),
        bullet("Accessible via the admin monitoring dashboard within the application."),

        // ═══════════════════════════════════════════════
        //  9. CI/CD
        // ═══════════════════════════════════════════════
        pageBreak(),
        h1("9. CI/CD Integration Overview"),
        para("For automated deployments, integrate the pipeline with GitHub Actions or Azure DevOps."),

        h2("9.1 Pipeline Stages"),
        bullet("Source \u2014 Trigger on push/merge to the main branch."),
        bullet("Build \u2014 npm install && npm run build to produce dist/ artifacts."),
        bullet("Test \u2014 Run vitest (npm test) for unit and integration tests."),
        bullet("Containerize \u2014 Build the Docker image and tag with git SHA + semantic version."),
        bullet("Push \u2014 Authenticate to ACR and push the image."),
        bullet("Deploy \u2014 Update the Container App revision with the new image tag."),
        bullet("Verify \u2014 Run smoke tests against the deployed endpoint."),

        h2("9.2 Deployment Strategy"),
        para("Azure Container Apps supports revision-based deployments:"),
        bullet("Single revision mode (default): New revisions replace the old one immediately."),
        bullet("Multiple revision mode: Enables traffic splitting for blue/green or canary deployments."),
        spacer(),
        para("For production, use multiple revision mode with 90/10 traffic split for canary releases.", { italic: true }),

        h2("9.3 Database Migrations in CI/CD"),
        para("Run schema synchronization as a separate pipeline step before deploying the new container revision:"),
        code("# In CI/CD pipeline, run against the production database"),
        code("DATABASE_URL=$PROD_DB_URL npx drizzle-kit push --force"),
        code("DATABASE_URL=$PROD_DB_URL npx tsx script/migrate.ts"),
        spacer(),
        para("Alternatively, use an Azure Container Apps init container to run migrations at startup.", { italic: true }),

        // ═══════════════════════════════════════════════
        //  10. ARCHITECTURAL DECISIONS
        // ═══════════════════════════════════════════════
        pageBreak(),
        h1("10. Architectural Decisions"),

        boldPara("1. Monolith vs. Microservices"),
        para("The application is a monolith and can remain so for Azure deployment. This is the simplest and fastest path to production. Consider extracting the Java-based MPP parser into a separate Azure Function or sidecar container as a future optimization."),

        boldPara("2. MPP Parser Strategy"),
        para("The Java-based MPXJ library requires a JRE in the container, increasing image size to ~400\u2013600 MB. Options: (a) include JRE in the main container (simplest), (b) extract to a separate Azure Function (reduces main image to ~150\u2013200 MB), or (c) run as a sidecar container in the same Container App."),

        boldPara("3. Scheduled Jobs Strategy"),
        para("The node-cron jobs for automated reports and timesheet reminders need a strategy for multi-instance deployments. Options: (a) single dedicated container for background jobs, (b) Azure Functions with Timer triggers, or (c) database-based distributed locking."),

        boldPara("4. Storage Migration (Required)"),
        para("The application currently uses a platform-specific object storage integration that is not compatible with Azure. Before deployment, the storage layer must be replaced with an Azure Blob Storage adapter using the @azure/storage-blob SDK. The storage integration is isolated in a dedicated module, making this a contained code change. Existing files must be migrated to Azure Blob Storage."),


        boldPara("5. Custom Domain & DNS"),
        para("Azure Container Apps supports custom domains with managed TLS certificates. Plan DNS configuration including CNAME records and domain verification."),

        boldPara("6. Session Management"),
        para("Sessions are stored in PostgreSQL via connect-pg-simple, which supports horizontal scaling. Sessions survive container restarts and work correctly across multiple replicas."),

        // ═══════════════════════════════════════════════
        //  11. APPENDIX
        // ═══════════════════════════════════════════════
        pageBreak(),
        h1("11. Appendix \u2014 Azure CLI Quick Reference"),

        h3("View Application Status"),
        code("az containerapp show --resource-group fridayreport-rg --name fridayreport-app -o table"),

        h3("View Live Logs"),
        code("az containerapp logs show --resource-group fridayreport-rg --name fridayreport-app --follow"),

        h3("Update Container Image"),
        code("az containerapp update --resource-group fridayreport-rg --name fridayreport-app \\"),
        code("  --image fridayreportacr.azurecr.io/fridayreport-ai:v1.1.0"),

        h3("Scale Manually"),
        code("az containerapp update --resource-group fridayreport-rg --name fridayreport-app \\"),
        code("  --min-replicas 3 --max-replicas 10"),

        h3("List Revisions"),
        code("az containerapp revision list --resource-group fridayreport-rg --name fridayreport-app -o table"),

        h3("Restart Application"),
        code("az containerapp revision restart --resource-group fridayreport-rg \\"),
        code("  --app fridayreport-app --name <revision-name>"),

        h3("Update Environment Variables"),
        code("az containerapp update --resource-group fridayreport-rg --name fridayreport-app \\"),
        code("  --set-env-vars KEY=value"),

        h3("Delete All Resources"),
        code("az group delete --name fridayreport-rg --yes --no-wait"),

        spacer(),
        spacer(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
          children: [new TextRun({ text: "\u2014 End of Document \u2014", font: "Calibri", size: 20, color: MEDIUM_GRAY, italics: true })],
        }),
      ],
    },
  ],
});

async function generate() {
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync("FridayReportAI_Azure_Container_App_Deployment_Guide.docx", buffer);
  console.log("Document generated: FridayReportAI_Azure_Container_App_Deployment_Guide.docx");
}

generate().catch((err) => {
  console.error("Error generating document:", err);
  process.exit(1);
});
