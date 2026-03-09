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
} from "docx";
import * as fs from "fs";

const BLUE = "2B579A";
const LIGHT_BLUE = "D6E4F0";
const DARK_GRAY = "333333";
const WHITE = "FFFFFF";

function headerCell(text: string): TableCell {
  return new TableCell({
    shading: { type: ShadingType.SOLID, color: BLUE, fill: BLUE },
    width: { size: 50, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: WHITE, size: 22, font: "Calibri" })],
        spacing: { before: 60, after: 60 },
      }),
    ],
  });
}

function cell(text: string, shaded = false): TableCell {
  return new TableCell({
    shading: shaded ? { type: ShadingType.SOLID, color: LIGHT_BLUE, fill: LIGHT_BLUE } : undefined,
    width: { size: 50, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 21, font: "Calibri", color: DARK_GRAY })],
        spacing: { before: 40, after: 40 },
      }),
    ],
  });
}

function makeTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" },
    },
    rows: [
      new TableRow({ children: headers.map((h) => headerCell(h)) }),
      ...rows.map(
        (row, i) => new TableRow({ children: row.map((c) => cell(c, i % 2 === 0)) })
      ),
    ],
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true, color: BLUE, font: "Calibri" })],
    spacing: { before: 300, after: 150 },
  });
}

function para(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: "Calibri", color: DARK_GRAY })],
    spacing: { before: 80, after: 80 },
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 22, font: "Calibri", color: DARK_GRAY })],
    spacing: { before: 40, after: 40 },
  });
}

function boldPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: "Calibri", color: DARK_GRAY, bold: true })],
    spacing: { before: 120, after: 40 },
  });
}

function qaPair(question: string, answer: string): Paragraph[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: `Q: ${question}`, bold: true, size: 22, font: "Calibri", color: BLUE })],
      spacing: { before: 200, after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `A: ${answer}`, size: 22, font: "Calibri", color: DARK_GRAY, italics: true })],
      spacing: { before: 0, after: 120 },
    }),
  ];
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22, color: DARK_GRAY },
      },
    },
  },
  numbering: {
    config: [
      {
        reference: "default-bullet",
        levels: [
          {
            level: 0,
            format: "bullet",
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      children: [
        new Paragraph({ spacing: { before: 3000 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "FridayReport.AI",
              bold: true,
              size: 56,
              font: "Calibri",
              color: BLUE,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [
            new TextRun({
              text: "Azure Container App Deployment",
              size: 40,
              font: "Calibri",
              color: DARK_GRAY,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100 },
          children: [
            new TextRun({
              text: "Architecture & Deployment Guide",
              size: 32,
              font: "Calibri",
              color: DARK_GRAY,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600 },
          children: [
            new TextRun({
              text: `Prepared: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
              size: 24,
              font: "Calibri",
              color: "888888",
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100 },
          children: [
            new TextRun({
              text: "Confidential",
              size: 24,
              font: "Calibri",
              color: "CC0000",
              bold: true,
            }),
          ],
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // SECTION 1: Current Architecture
        heading("1. Current Application Architecture", HeadingLevel.HEADING_1),
        para(
          "FridayReport.AI is an enterprise-grade Project and Portfolio Management (PPM) platform built as a full-stack TypeScript monolithic application. It provides project tracking, resource allocation, AI-driven risk assessments, and deep integrations with the Microsoft ecosystem."
        ),

        heading("1.1 Technology Stack", HeadingLevel.HEADING_2),
        makeTable(
          ["Layer", "Technology"],
          [
            ["Frontend", "React 18 (SPA) with Vite, Tailwind CSS, Radix UI (Shadcn), Recharts, Framer Motion"],
            ["Backend", "Node.js + Express (TypeScript)"],
            ["Database", "PostgreSQL 16 (via Drizzle ORM)"],
            ["Authentication", "Passport.js (Email/Password, Google OAuth, Microsoft OAuth)"],
            ["AI Services", "OpenAI API (GPT-4o) for risk assessment, dashboard generation, resource optimization"],
            ["File Processing", "Java-based MPP parser (MPXJ library) for Microsoft Project files"],
            ["Email", "Resend API for transactional emails"],
            ["File Storage", "Currently Replit Object Storage (Google Cloud Storage-compatible client)"],
            ["Scheduling", "node-cron for automated report generation"],
            ["Port", "Listens on port 5000"],
          ]
        ),

        heading("1.2 Architecture Overview", HeadingLevel.HEADING_2),
        para(
          "The application follows a monolithic tiered architecture common for SaaS applications:"
        ),
        bullet("Client Layer: A React Single Page Application (SPA) served as static files in production."),
        bullet("Server Layer: A RESTful Express API handling business logic, authentication, and external service integrations."),
        bullet("Shared Layer: Contains Drizzle ORM schema and Zod validation types used by both frontend and backend for type safety."),
        bullet("Service Layer: Specialized business logic isolated in dedicated service modules (notifications, AI, Microsoft integrations)."),
        para(
          "In production, Express serves both the API endpoints and the pre-built React static files from a single process."
        ),

        heading("1.3 Key Directory Structure", HeadingLevel.HEADING_2),
        makeTable(
          ["Directory", "Purpose"],
          [
            ["client/src/components/", "React UI components organized by functional area (dashboard, project, resources)"],
            ["client/src/pages/", "Route-level page components"],
            ["server/auth/", "Multi-provider authentication logic"],
            ["server/services/", "Business logic and third-party integrations (Microsoft, OpenAI)"],
            ["shared/", "Database schema (Drizzle) and shared type definitions"],
            ["lib/", "JAR files and Java source for the MPP file parser"],
            ["migrations/", "Database schema migration history (Drizzle)"],
          ]
        ),

        // SECTION 2: Containerization Requirements
        new Paragraph({ children: [new PageBreak()] }),
        heading("2. Containerization Requirements", HeadingLevel.HEADING_1),
        para(
          "The application currently runs on the Replit platform and does not have a Dockerfile. A containerization strategy is needed for Azure deployment."
        ),

        heading("2.1 Dockerfile Considerations", HeadingLevel.HEADING_2),
        bullet("Multi-stage build: Use Node.js for building the frontend and running the server."),
        bullet("Java Runtime: The MPP file parser requires a JRE to be available in the container. This is a notable requirement that increases image size."),
        bullet("Build step: 'npm run build' produces a dist/ folder with the bundled server (dist/index.cjs) and static files (dist/public/)."),
        bullet("Production command: 'node ./dist/index.cjs'"),
        bullet("Exposed port: 5000 (configurable via PORT environment variable)."),
        bullet("Expected image size: 400-600MB due to Node.js runtime + Java JRE + application code + MPXJ JAR files."),

        heading("2.2 Alternative: Extract MPP Parser", HeadingLevel.HEADING_2),
        para(
          "To reduce container complexity and image size, the Java-based MPP parser could be extracted into a separate Azure Function or a dedicated sidecar container. This would allow the main application container to use a lightweight Node.js-only image."
        ),

        // SECTION 3: Azure Services Required
        new Paragraph({ children: [new PageBreak()] }),
        heading("3. Azure Services Required", HeadingLevel.HEADING_1),
        para(
          "The following Azure services are required (or recommended) to host FridayReport.AI as a container application:"
        ),

        makeTable(
          ["Azure Service", "Purpose"],
          [
            ["Azure Container Apps", "Hosts the containerized application. Handles auto-scaling, ingress, and TLS termination."],
            ["Azure Container Registry (ACR)", "Stores and manages Docker container images. Integrates with Container Apps for image pulls."],
            ["Azure Database for PostgreSQL (Flexible Server)", "Managed PostgreSQL 16 service replacing the current database. Supports high availability and automated backups."],
            ["Azure Blob Storage", "Replaces Replit Object Storage for file uploads, project documents, and profile photos."],
            ["Azure Key Vault", "Securely manages all secrets: database credentials, API keys, OAuth secrets, session secrets."],
            ["Azure Entra ID (Azure AD)", "Microsoft OAuth authentication (already integrated via MSAL in the application)."],
            ["Azure Virtual Network (VNet)", "Secures communication between Container Apps and PostgreSQL via private networking."],
            ["Azure Log Analytics Workspace", "Required by Container Apps for centralized logging and monitoring."],
            ["Azure Application Insights (Optional)", "Advanced application performance monitoring, request tracing, and error tracking for the Node.js backend."],
          ]
        ),

        heading("3.1 Architecture Diagram (Logical)", HeadingLevel.HEADING_2),
        para("The high-level deployment topology:"),
        bullet("Internet traffic enters via Azure Container Apps ingress (HTTPS with managed TLS certificates)."),
        bullet("Container App runs the FridayReport.AI application container pulled from ACR."),
        bullet("Container App connects to Azure Database for PostgreSQL via VNet private endpoint."),
        bullet("Container App connects to Azure Blob Storage for file operations."),
        bullet("Container App retrieves secrets from Azure Key Vault at startup."),
        bullet("External API calls go out to OpenAI, Resend, Google (OAuth), and Microsoft Graph APIs."),

        // SECTION 4: Environment Variables
        new Paragraph({ children: [new PageBreak()] }),
        heading("4. Environment Variables & Secrets Configuration", HeadingLevel.HEADING_1),
        para(
          "The following environment variables must be configured in Azure Container Apps (ideally sourced from Azure Key Vault):"
        ),

        heading("4.1 Core Infrastructure", HeadingLevel.HEADING_2),
        makeTable(
          ["Variable", "Description"],
          [
            ["DATABASE_URL", "PostgreSQL connection string (Azure Database for PostgreSQL Flexible Server)"],
            ["SESSION_SECRET", "Secret key for signing Express session cookies"],
            ["TOKEN_ENCRYPTION_KEY", "Key used to encrypt sensitive stored tokens (e.g., integration API keys)"],
            ["PORT", "Application listening port (default: 5000)"],
            ["NODE_ENV", "Set to 'production' for the deployed environment"],
          ]
        ),

        heading("4.2 AI Services", HeadingLevel.HEADING_2),
        makeTable(
          ["Variable", "Description"],
          [
            ["AI_INTEGRATIONS_OPENAI_API_KEY", "OpenAI API key for GPT-4o features (risk assessment, dashboards, resource optimization)"],
            ["AI_INTEGRATIONS_OPENAI_BASE_URL", "OpenAI API base URL (if using a custom endpoint or Azure OpenAI)"],
          ]
        ),

        heading("4.3 Authentication", HeadingLevel.HEADING_2),
        makeTable(
          ["Variable", "Description"],
          [
            ["GOOGLE_CLIENT_ID", "Google OAuth 2.0 client ID"],
            ["GOOGLE_CLIENT_SECRET", "Google OAuth 2.0 client secret"],
            ["AZURE_AD_CLIENT_ID", "Microsoft Entra ID (Azure AD) application client ID"],
            ["AZURE_AD_CLIENT_SECRET", "Microsoft Entra ID (Azure AD) application client secret"],
          ]
        ),

        heading("4.4 Email", HeadingLevel.HEADING_2),
        makeTable(
          ["Variable", "Description"],
          [
            ["RESEND_API_KEY", "Resend API key for sending transactional emails (password resets, verifications, invitations)"],
          ]
        ),

        heading("4.5 Storage (New for Azure)", HeadingLevel.HEADING_2),
        makeTable(
          ["Variable", "Description"],
          [
            ["AZURE_STORAGE_CONNECTION_STRING", "Azure Blob Storage connection string (new, replaces Replit Object Storage)"],
            ["AZURE_STORAGE_CONTAINER_NAME", "Blob container name for file uploads"],
          ]
        ),

        para(
          "Note: Replit-specific variables (REPLIT_*, PRIVATE_OBJECT_DIR) will no longer be needed and should be removed."
        ),

        // SECTION 5: Q&A
        new Paragraph({ children: [new PageBreak()] }),
        heading("5. Anticipated Questions & Answers", HeadingLevel.HEADING_1),

        heading("5.1 Architecture & Containerization", HeadingLevel.HEADING_2),
        ...qaPair(
          "Is the application already containerized?",
          "Not yet. It currently runs on Replit's managed platform. We need to create a Dockerfile. The app is a single-process Node.js application that serves both the API and frontend, which makes containerization straightforward — with one exception: the MPP file parser requires Java, so the container image needs both Node.js and a JRE."
        ),
        ...qaPair(
          "Can the application scale horizontally (multiple container instances)?",
          "With some adjustments. Sessions are already stored in PostgreSQL (via connect-pg-simple), which supports multiple instances. However, the cron jobs for scheduled reports (node-cron) would need careful handling to avoid duplicate executions — either by using a leader election pattern, database-based locking, or moving scheduled jobs to a separate single-instance container."
        ),
        ...qaPair(
          "Why does the container need Java?",
          "The application parses Microsoft Project (.mpp) files using the MPXJ Java library. A JRE must be present in the container image. This increases the image size to approximately 400-600MB. An alternative would be to extract the MPP parser into a separate microservice or Azure Function."
        ),
        ...qaPair(
          "What is the expected container image size?",
          "Approximately 400-600MB due to the Node.js runtime + Java JRE + application code + MPXJ JAR files. Using Alpine-based images and multi-stage builds can help reduce this. If the Java parser is extracted as a separate service, the main container would be significantly smaller (~150-200MB)."
        ),

        heading("5.2 Database", HeadingLevel.HEADING_2),
        ...qaPair(
          "How do we handle database migrations?",
          "The project uses Drizzle ORM with migrations stored in a migrations/ folder. Migrations can be run as a pre-deployment step or as an init container in Azure Container Apps using 'npx drizzle-kit migrate'."
        ),
        ...qaPair(
          "What PostgreSQL version is required?",
          "The project currently uses PostgreSQL 16. Azure Database for PostgreSQL Flexible Server supports this version."
        ),
        ...qaPair(
          "How is session data managed?",
          "User sessions are stored in a PostgreSQL 'sessions' table using connect-pg-simple. This means sessions survive container restarts and work correctly across multiple container instances."
        ),

        heading("5.3 Storage", HeadingLevel.HEADING_2),
        ...qaPair(
          "How does file storage work and what changes are needed?",
          "Currently, the application uses Replit Object Storage via a Google Cloud Storage-compatible client. For Azure, this needs to be replaced with Azure Blob Storage using the @azure/storage-blob SDK. The storage abstraction layer in the codebase makes this a contained change — only the storage service implementation needs to be swapped."
        ),

        heading("5.4 Authentication", HeadingLevel.HEADING_2),
        ...qaPair(
          "How does Microsoft authentication work?",
          "Already integrated using MSAL (@azure/msal-node). For Azure deployment, the redirect URIs in the Azure AD App Registration need to be updated to point to the new Azure Container Apps domain. The authentication flow itself remains unchanged."
        ),
        ...qaPair(
          "What about Google OAuth?",
          "Google OAuth is also already integrated. The Google Cloud Console OAuth configuration needs to be updated with the new redirect URIs matching the Azure Container Apps domain."
        ),
        ...qaPair(
          "Will Replit Auth still work?",
          "No. Replit Auth is specific to the Replit platform and should be removed or disabled for the Azure deployment. The remaining authentication methods (Email/Password, Google, Microsoft) will work without changes to their core logic."
        ),

        heading("5.5 Networking & Security", HeadingLevel.HEADING_2),
        ...qaPair(
          "How do we secure the database connection?",
          "Use Azure VNet integration. Place the Container App and PostgreSQL Flexible Server in the same VNet or use private endpoints. Azure PostgreSQL Flexible Server supports SSL/TLS connections natively and can be configured to deny public access entirely."
        ),
        ...qaPair(
          "How is HTTPS handled?",
          "Azure Container Apps provides built-in TLS termination with automatic certificate management. The application listens on HTTP (port 5000) internally, and Azure handles HTTPS at the ingress level. Custom domains with managed certificates are also supported."
        ),
        ...qaPair(
          "How are secrets managed?",
          "We recommend Azure Key Vault integrated with Container Apps. Container Apps can reference Key Vault secrets directly in environment variable configuration, avoiding hardcoded secrets and enabling centralized secret rotation."
        ),

        heading("5.6 CI/CD & Deployment", HeadingLevel.HEADING_2),
        ...qaPair(
          "What does the deployment pipeline look like?",
          "Typical flow: Push code to Git repository -> CI/CD pipeline builds Docker image -> Push image to Azure Container Registry (ACR) -> Deploy new revision to Azure Container Apps. This can be implemented with GitHub Actions or Azure DevOps Pipelines."
        ),
        ...qaPair(
          "Does the application support zero-downtime deployments?",
          "Yes. Azure Container Apps supports revision-based deployments with traffic splitting, enabling blue-green or canary deployment strategies natively. New revisions can be deployed alongside existing ones, with traffic gradually shifted."
        ),

        heading("5.7 Cost & Performance", HeadingLevel.HEADING_2),
        ...qaPair(
          "What Azure Container Apps plan should we use?",
          "Start with the Consumption plan (pay-per-use, scales to zero when idle). If dedicated resources, VNet integration with private endpoints, or specific SLAs are required, consider the Dedicated (Workload Profiles) plan."
        ),
        ...qaPair(
          "What are the key cost drivers?",
          "The main cost components are: Azure Database for PostgreSQL Flexible Server (typically the largest cost), Container Apps compute (vCPU/memory hours), Azure Blob Storage (storage + transactions), network egress, and external API costs (OpenAI, Resend — these remain the same regardless of hosting)."
        ),

        heading("5.8 Microsoft Integrations", HeadingLevel.HEADING_2),
        ...qaPair(
          "Do the Microsoft Planner/Project Online integrations need changes?",
          "The integration code itself does not change. However, the Azure AD App Registration needs to be updated with the correct redirect URIs and API permissions for the new domain. If the customer already uses Azure AD, this simplifies things significantly since they can leverage their existing tenant."
        ),
        ...qaPair(
          "What about Power BI integration?",
          "The Power BI templates (.pbit files) and Power Query files included in the codebase work independently of the deployment platform. They connect directly to the database, so they only need to be updated with the new Azure PostgreSQL connection details."
        ),

        // SECTION 6: Key Architectural Decisions
        new Paragraph({ children: [new PageBreak()] }),
        heading("6. Key Architectural Decisions for Discussion", HeadingLevel.HEADING_1),

        boldPara("1. Monolith vs. Microservices"),
        para(
          "The application is currently a monolith and can remain so for Azure deployment in a single container. This is the simplest and fastest path to production. Consider extracting the Java-based MPP parser into a separate Azure Function or Container App as a future optimization to reduce image size and enable independent scaling."
        ),

        boldPara("2. Storage Migration"),
        para(
          "Switching from Replit Object Storage to Azure Blob Storage requires code changes in the storage abstraction layer. This is a contained change within the storage service module. Existing files will need to be migrated from Replit storage to Azure Blob Storage."
        ),

        boldPara("3. Scheduled Jobs Strategy"),
        para(
          "The node-cron scheduled jobs (automated report generation) need a strategy for multi-instance scenarios. Options include: (a) running a single dedicated container instance for background jobs, (b) using Azure Functions with Timer triggers, or (c) implementing database-based distributed locking to prevent duplicate execution."
        ),

        boldPara("4. Custom Domain & DNS"),
        para(
          "Azure Container Apps supports custom domains with managed TLS certificates. DNS configuration needs to be planned, including CNAME/A record setup and any existing domain migration."
        ),

        boldPara("5. Monitoring & Observability"),
        para(
          "Azure Application Insights can be integrated into the Node.js application for detailed telemetry, request tracing, dependency tracking, and error monitoring. Azure Log Analytics provides centralized log management. Consider implementing structured logging for better searchability."
        ),

        boldPara("6. Replit-Specific Code Removal"),
        para(
          "The following Replit-specific integrations will need to be removed or replaced for Azure deployment: Replit Auth (remove entirely), Replit Object Storage (replace with Azure Blob Storage), and any Replit-specific environment variable references."
        ),

        boldPara("7. AI Services: OpenAI vs. Azure OpenAI"),
        para(
          "The application currently uses OpenAI directly. Consider whether to switch to Azure OpenAI Service for data residency, compliance, and integrated billing. The OpenAI SDK supports Azure OpenAI endpoints with minimal code changes (just changing the base URL and API key)."
        ),
      ],
    },
  ],
});

async function generate() {
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync("FridayReportAI_Azure_Deployment_Architecture.docx", buffer);
  console.log("Document generated: FridayReportAI_Azure_Deployment_Architecture.docx");
}

generate().catch(console.error);
