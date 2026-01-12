import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth as setupReplitAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { setupAuth as setupEmailAuth } from "./auth/emailAuth";
import { setupMicrosoftAuth } from "./auth/microsoftAuth";
import { sendEmail, sendAccessRequestNotification, sendAccessRequestDecisionNotification } from "./services/email";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import multer from "multer";
import xml2js from "xml2js";
import Papa from "papaparse";

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Configure multer for file uploads (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for MPP files
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xml', '.csv', '.mpp'];
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only MPP, XML, and CSV files are allowed'));
    }
  }
});

// Parse MPP file using MPXJ Java library
function parseMppFile(fileBuffer: Buffer): Array<{
  taskId?: number;
  wbs?: string;
  taskName: string;
  startDate?: string;
  finishDate?: string;
  duration?: string;
  durationDays?: number;
  percentComplete?: number;
  outlineLevel?: number;
  parentTaskId?: number;
  isSummary?: boolean;
  isMilestone?: boolean;
  notes?: string;
}> {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `mpp_${Date.now()}.mpp`);
  
  try {
    // Write buffer to temp file
    fs.writeFileSync(tempFile, fileBuffer);
    
    // Build classpath for MPXJ
    const libDir = path.join(process.cwd(), 'lib');
    const jars = [
      'mpxj.jar', 'poi.jar', 'poi-ooxml.jar', 'commons-io.jar',
      'commons-collections4.jar', 'commons-compress.jar', 'log4j-api.jar', 'xmlbeans.jar',
      'rtfparserkit.jar'
    ].map(jar => path.join(libDir, jar)).join(':');
    
    const classpath = `${jars}:${libDir}`;
    
    // Execute Java parser
    const result = execSync(`java -cp "${classpath}" MppParser "${tempFile}"`, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000,
    });
    
    const parsed = JSON.parse(result);
    return parsed.tasks || [];
    
  } catch (error: any) {
    console.error('Error parsing MPP file:', error.message);
    if (error.stderr) {
      console.error('STDERR:', error.stderr);
    }
    if (error.stdout) {
      console.error('STDOUT:', error.stdout);
    }
    console.error('Full error:', error);
    throw new Error(`Failed to parse MPP file: ${error.message || 'Unknown error'}. Please ensure it is a valid Microsoft Project file.`);
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Parse MSPDI XML (MS Project XML format)
async function parseXmlMspdi(xmlContent: string): Promise<Array<{
  taskId?: number;
  wbs?: string;
  taskName: string;
  startDate?: string;
  finishDate?: string;
  duration?: string;
  durationDays?: number;
  percentComplete?: number;
  outlineLevel?: number;
  parentTaskId?: number;
  isSummary?: boolean;
  isMilestone?: boolean;
  notes?: string;
}>> {
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xmlContent);
  
  const tasks: any[] = [];
  
  // Handle MSPDI format (Microsoft Project XML)
  if (result.Project?.Tasks?.Task) {
    const xmlTasks = Array.isArray(result.Project.Tasks.Task) 
      ? result.Project.Tasks.Task 
      : [result.Project.Tasks.Task];
    
    for (const task of xmlTasks) {
      // Skip project summary (UID 0) which is typically the project itself
      if (task.UID === '0' || task.UID === 0) continue;
      
      const taskName = task.Name || task.Title || 'Unnamed Task';
      if (!taskName) continue;
      
      // Parse duration string (e.g., "PT40H0M0S" for 40 hours)
      let durationDays: number | undefined;
      let durationStr = task.Duration || '';
      if (durationStr.startsWith('PT')) {
        const hoursMatch = durationStr.match(/(\d+)H/);
        if (hoursMatch) {
          durationDays = Math.ceil(parseInt(hoursMatch[1]) / 8);
        }
      }
      
      tasks.push({
        taskId: task.UID ? parseInt(task.UID) : undefined,
        wbs: task.WBS || task.OutlineNumber,
        taskName,
        startDate: task.Start ? task.Start.split('T')[0] : undefined,
        finishDate: task.Finish ? task.Finish.split('T')[0] : undefined,
        duration: task.Duration,
        durationDays,
        percentComplete: task.PercentComplete ? parseInt(task.PercentComplete) : 0,
        outlineLevel: task.OutlineLevel ? parseInt(task.OutlineLevel) : 1,
        isSummary: task.Summary === '1' || task.Summary === 'true' || task.Summary === true,
        isMilestone: task.Milestone === '1' || task.Milestone === 'true' || task.Milestone === true,
        notes: task.Notes,
      });
    }
  }
  
  return tasks;
}

// Parse CSV format using papaparse for robust RFC-compliant parsing
function parseCsv(csvContent: string): Array<{
  taskId?: number;
  wbs?: string;
  taskName: string;
  startDate?: string;
  finishDate?: string;
  duration?: string;
  durationDays?: number;
  percentComplete?: number;
  outlineLevel?: number;
  parentTaskId?: number;
  isSummary?: boolean;
  isMilestone?: boolean;
  notes?: string;
}> {
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().toLowerCase(),
  });
  
  if (parseResult.errors.length > 0 || !parseResult.data.length) {
    console.error('CSV parsing errors:', parseResult.errors);
    return [];
  }
  
  const tasks: any[] = [];
  const headers = parseResult.meta.fields || [];
  
  // Find column names (flexible matching)
  const findColumn = (patterns: string[]): string | undefined => {
    return headers.find(h => patterns.some(p => h.includes(p)));
  };
  
  const nameCol = findColumn(['name', 'task']);
  const startCol = findColumn(['start']);
  const finishCol = findColumn(['finish', 'end']);
  const durationCol = findColumn(['duration']);
  const percentCol = findColumn(['percent', '%', 'complete']);
  const wbsCol = findColumn(['wbs']);
  
  parseResult.data.forEach((row: any, index: number) => {
    const taskName = nameCol ? row[nameCol]?.trim() : '';
    
    if (!taskName) return;
    
    // Parse duration (e.g., "5 days" or "5d")
    let durationDays: number | undefined;
    const durationStr = durationCol ? row[durationCol] || '' : '';
    const daysMatch = durationStr.match(/(\d+)/);
    if (daysMatch) {
      durationDays = parseInt(daysMatch[1]);
    }
    
    // Parse percent complete
    let percentComplete = 0;
    if (percentCol && row[percentCol]) {
      const pctStr = row[percentCol].replace('%', '').trim();
      percentComplete = parseInt(pctStr) || 0;
    }
    
    tasks.push({
      taskId: index + 1,
      wbs: wbsCol ? row[wbsCol]?.trim() : undefined,
      taskName,
      startDate: startCol ? parseDate(row[startCol]) : undefined,
      finishDate: finishCol ? parseDate(row[finishCol]) : undefined,
      duration: durationStr,
      durationDays,
      percentComplete,
      outlineLevel: 1,
      isSummary: false,
      isMilestone: false,
    });
  });
  
  return tasks;
}

// Helper to parse various date formats
function parseDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split('T')[0];
  }
  
  // Try MM/DD/YYYY or DD/MM/YYYY
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(p => parseInt(p));
    // Assume MM/DD/YYYY if first number is <= 12
    if (a <= 12 && c > 1900) {
      return `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    }
    // Try DD/MM/YYYY
    if (b <= 12 && c > 1900) {
      return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
  }
  
  return undefined;
}

// Seed data function with software development focused demo data
async function seedDatabase() {
  const portfolios = await storage.getPortfolios();
  if (portfolios.length === 0) {
    console.log("Seeding database with software development demo data...");
    
    // ==================== PORTFOLIOS ====================
    const mobilePortfolio = await storage.createPortfolio({
      name: "Mobile Applications",
      description: "Native and cross-platform mobile app development initiatives.",
      strategy: "React Native first with native modules for performance-critical features.",
      managerId: null
    });

    const webPlatformPortfolio = await storage.createPortfolio({
      name: "Web Platform",
      description: "Enterprise web applications and customer-facing portals.",
      strategy: "Modern React/TypeScript stack with microservices backend.",
      managerId: null
    });

    const infraPortfolio = await storage.createPortfolio({
      name: "Infrastructure & DevOps",
      description: "Cloud infrastructure, CI/CD pipelines, and developer tooling.",
      strategy: "AWS-first with Kubernetes orchestration and GitOps practices.",
      managerId: null
    });

    // ==================== PROJECTS ====================
    
    // Mobile Portfolio Projects
    const ecommerceApp = await storage.createProject({
      portfolioId: mobilePortfolio.id,
      name: "E-Commerce Mobile App",
      description: "Full-featured shopping app with payment integration, push notifications, and AR product preview.",
      status: "Execution",
      priority: "High",
      startDate: "2025-01-01",
      endDate: "2025-06-30",
      budget: "450000",
      managerId: null,
      health: "Green",
      completionPercentage: 45
    });

    const bankingApp = await storage.createProject({
      portfolioId: mobilePortfolio.id,
      name: "Mobile Banking App v2.0",
      description: "Redesign of the banking app with biometric auth, real-time notifications, and investment tracking.",
      status: "Planning",
      priority: "Critical",
      startDate: "2025-02-15",
      endDate: "2025-09-15",
      budget: "800000",
      managerId: null,
      health: "Yellow",
      completionPercentage: 15
    });

    // Web Platform Projects
    const saasApp = await storage.createProject({
      portfolioId: webPlatformPortfolio.id,
      name: "SaaS Analytics Dashboard",
      description: "Real-time analytics platform with customizable dashboards, reports, and data visualizations.",
      status: "Execution",
      priority: "High",
      startDate: "2024-11-01",
      endDate: "2025-05-31",
      budget: "350000",
      managerId: null,
      health: "Green",
      completionPercentage: 60
    });

    const crmApp = await storage.createProject({
      portfolioId: webPlatformPortfolio.id,
      name: "CRM Platform Modernization",
      description: "Migrating legacy CRM to modern React frontend with GraphQL API.",
      status: "Execution",
      priority: "Medium",
      startDate: "2024-10-15",
      endDate: "2025-04-30",
      budget: "280000",
      managerId: null,
      health: "Red",
      completionPercentage: 35
    });

    const apiGateway = await storage.createProject({
      portfolioId: webPlatformPortfolio.id,
      name: "API Gateway Implementation",
      description: "Centralized API gateway with rate limiting, authentication, and request routing.",
      status: "Initiation",
      priority: "High",
      startDate: "2025-03-01",
      endDate: "2025-07-31",
      budget: "180000",
      managerId: null,
      health: "Green",
      completionPercentage: 5
    });

    // Infrastructure Projects
    const k8sMigration = await storage.createProject({
      portfolioId: infraPortfolio.id,
      name: "Kubernetes Migration",
      description: "Migrating microservices from EC2 to EKS with Helm charts and ArgoCD.",
      status: "Execution",
      priority: "Critical",
      startDate: "2024-12-01",
      endDate: "2025-06-30",
      budget: "400000",
      managerId: null,
      health: "Yellow",
      completionPercentage: 40
    });

    const cicdPipeline = await storage.createProject({
      portfolioId: infraPortfolio.id,
      name: "CI/CD Pipeline Overhaul",
      description: "Implementing GitHub Actions workflows with automated testing, security scanning, and deployments.",
      status: "Closing",
      priority: "Medium",
      startDate: "2024-09-01",
      endDate: "2025-01-31",
      budget: "120000",
      managerId: null,
      health: "Green",
      completionPercentage: 90
    });

    // ==================== TASKS ====================
    
    // E-Commerce App Tasks
    await storage.createTask({
      projectId: ecommerceApp.id,
      name: "Implement product search with filters",
      description: "Add search functionality with category, price range, and brand filters using Algolia.",
      startDate: "2025-01-15",
      endDate: "2025-02-01",
      progress: 100,
      status: "Completed",
      assignee: "Alex Chen"
    });

    await storage.createTask({
      projectId: ecommerceApp.id,
      name: "Integrate Stripe payment gateway",
      description: "Setup Stripe SDK for iOS/Android with Apple Pay and Google Pay support.",
      startDate: "2025-02-01",
      endDate: "2025-02-28",
      progress: 75,
      status: "In Progress",
      assignee: "Maria Garcia"
    });

    await storage.createTask({
      projectId: ecommerceApp.id,
      name: "Build shopping cart with persistence",
      description: "Implement cart state management with Redux and AsyncStorage for offline support.",
      startDate: "2025-02-15",
      endDate: "2025-03-15",
      progress: 40,
      status: "In Progress",
      assignee: "James Wilson"
    });

    await storage.createTask({
      projectId: ecommerceApp.id,
      name: "Push notification system",
      description: "Integrate Firebase Cloud Messaging for order updates and promotional notifications.",
      startDate: "2025-03-01",
      endDate: "2025-03-31",
      progress: 0,
      status: "Not Started",
      assignee: "Sarah Kim"
    });

    // SaaS Dashboard Tasks
    await storage.createTask({
      projectId: saasApp.id,
      name: "Build chart component library",
      description: "Create reusable D3.js chart components for line, bar, pie, and scatter plots.",
      startDate: "2024-11-15",
      endDate: "2024-12-31",
      progress: 100,
      status: "Completed",
      assignee: "David Park"
    });

    await storage.createTask({
      projectId: saasApp.id,
      name: "Implement real-time data streaming",
      description: "Set up WebSocket connections for live dashboard updates using Socket.io.",
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      progress: 85,
      status: "In Progress",
      assignee: "Emma Thompson"
    });

    await storage.createTask({
      projectId: saasApp.id,
      name: "Create PDF export functionality",
      description: "Allow users to export dashboards and reports to PDF with custom branding.",
      startDate: "2025-02-01",
      endDate: "2025-02-28",
      progress: 20,
      status: "In Progress",
      assignee: "Michael Brown"
    });

    // Kubernetes Migration Tasks
    await storage.createTask({
      projectId: k8sMigration.id,
      name: "Create Helm charts for services",
      description: "Write Helm templates for all 12 microservices with configurable values.",
      startDate: "2024-12-15",
      endDate: "2025-01-31",
      progress: 100,
      status: "Completed",
      assignee: "Chris Lee"
    });

    await storage.createTask({
      projectId: k8sMigration.id,
      name: "Setup ArgoCD for GitOps",
      description: "Configure ArgoCD to sync deployments from GitHub repositories automatically.",
      startDate: "2025-01-15",
      endDate: "2025-02-15",
      progress: 60,
      status: "In Progress",
      assignee: "Jennifer Wu"
    });

    await storage.createTask({
      projectId: k8sMigration.id,
      name: "Configure horizontal pod autoscaling",
      description: "Set up HPA for all services based on CPU and memory metrics.",
      startDate: "2025-02-01",
      endDate: "2025-03-15",
      progress: 10,
      status: "In Progress",
      assignee: "Robert Taylor"
    });

    // ==================== MILESTONES ====================
    
    // E-Commerce App Milestones
    await storage.createMilestone({
      projectId: ecommerceApp.id,
      title: "MVP Release - Core Shopping Features",
      description: "Product browsing, cart, and basic checkout functionality",
      dueDate: "2025-02-28",
      startDate: "2025-01-01",
      completed: true,
      status: "Done",
      priority: "Critical",
      assignee: "Alex Chen"
    });

    await storage.createMilestone({
      projectId: ecommerceApp.id,
      title: "Payment Integration Complete",
      description: "Stripe, Apple Pay, and Google Pay fully tested and deployed",
      dueDate: "2025-03-31",
      startDate: "2025-02-01",
      completed: false,
      status: "In Progress",
      priority: "High",
      assignee: "Maria Garcia"
    });

    await storage.createMilestone({
      projectId: ecommerceApp.id,
      title: "Beta Launch - App Store Submission",
      description: "Submit to iOS App Store and Google Play for beta testing",
      dueDate: "2025-05-15",
      startDate: "2025-04-01",
      completed: false,
      status: "To Do",
      priority: "High",
      assignee: "Product Team"
    });

    await storage.createMilestone({
      projectId: ecommerceApp.id,
      title: "Production Launch",
      description: "Full public release with marketing campaign",
      dueDate: "2025-06-30",
      startDate: "2025-05-15",
      completed: false,
      status: "Backlog",
      priority: "Critical",
      assignee: null
    });

    // SaaS Dashboard Milestones
    await storage.createMilestone({
      projectId: saasApp.id,
      title: "Dashboard Builder v1.0",
      description: "Drag-and-drop dashboard creation with widget library",
      dueDate: "2025-01-31",
      startDate: "2024-11-01",
      completed: true,
      status: "Done",
      priority: "Critical",
      assignee: "David Park"
    });

    await storage.createMilestone({
      projectId: saasApp.id,
      title: "Real-time Analytics Engine",
      description: "Live data streaming with sub-second latency",
      dueDate: "2025-02-28",
      startDate: "2025-01-15",
      completed: false,
      status: "In Progress",
      priority: "High",
      assignee: "Emma Thompson"
    });

    await storage.createMilestone({
      projectId: saasApp.id,
      title: "Enterprise SSO Integration",
      description: "SAML and OAuth2 support for enterprise customers",
      dueDate: "2025-04-30",
      startDate: "2025-03-01",
      completed: false,
      status: "Backlog",
      priority: "Medium",
      assignee: null
    });

    // Kubernetes Migration Milestones
    await storage.createMilestone({
      projectId: k8sMigration.id,
      title: "Dev Environment on EKS",
      description: "All services running in development Kubernetes cluster",
      dueDate: "2025-01-31",
      startDate: "2024-12-01",
      completed: true,
      status: "Done",
      priority: "High",
      assignee: "Chris Lee"
    });

    await storage.createMilestone({
      projectId: k8sMigration.id,
      title: "Staging Environment Migration",
      description: "Full staging environment with production-like configuration",
      dueDate: "2025-03-31",
      startDate: "2025-02-01",
      completed: false,
      status: "In Progress",
      priority: "High",
      assignee: "Jennifer Wu"
    });

    await storage.createMilestone({
      projectId: k8sMigration.id,
      title: "Production Cutover",
      description: "Zero-downtime migration of production workloads to EKS",
      dueDate: "2025-06-30",
      startDate: "2025-04-01",
      completed: false,
      status: "Backlog",
      priority: "Critical",
      assignee: null
    });

    // ==================== RISKS ====================
    
    await storage.createRisk({
      projectId: ecommerceApp.id,
      title: "App Store Rejection",
      description: "Apple may reject the app due to payment guideline violations or privacy concerns.",
      probability: "Medium",
      impact: "High",
      status: "Open",
      mitigationPlan: "Early review of App Store guidelines, implement in-app purchase where required, thorough privacy policy review."
    });

    await storage.createRisk({
      projectId: ecommerceApp.id,
      title: "Payment Processing Downtime",
      description: "Stripe API outages could prevent customers from completing purchases.",
      probability: "Low",
      impact: "High",
      status: "Mitigated",
      mitigationPlan: "Implement fallback payment processor (PayPal), add offline cart persistence, display helpful error messages."
    });

    await storage.createRisk({
      projectId: saasApp.id,
      title: "Real-time Performance Degradation",
      description: "High user concurrency may cause WebSocket connection drops and delayed updates.",
      probability: "High",
      impact: "Medium",
      status: "Open",
      mitigationPlan: "Implement connection pooling, add Redis pub/sub for horizontal scaling, load testing at 10x expected traffic."
    });

    await storage.createRisk({
      projectId: crmApp.id,
      title: "Data Migration Errors",
      description: "Legacy CRM data may have inconsistencies causing migration failures.",
      probability: "High",
      impact: "High",
      status: "Open",
      mitigationPlan: "Extensive data validation scripts, parallel run of old and new systems, rollback plan within 24 hours."
    });

    await storage.createRisk({
      projectId: k8sMigration.id,
      title: "Service Mesh Complexity",
      description: "Istio configuration may cause networking issues between services.",
      probability: "Medium",
      impact: "High",
      status: "Open",
      mitigationPlan: "Start with basic Kubernetes networking, gradually introduce Istio features, extensive monitoring with Prometheus/Grafana."
    });

    await storage.createRisk({
      projectId: k8sMigration.id,
      title: "Cost Overrun",
      description: "EKS cluster costs may exceed budget due to resource over-provisioning.",
      probability: "Medium",
      impact: "Medium",
      status: "Open",
      mitigationPlan: "Implement Kubecost for cost monitoring, use spot instances for non-critical workloads, regular right-sizing reviews."
    });

    await storage.createRisk({
      projectId: bankingApp.id,
      title: "Security Audit Failure",
      description: "Third-party security audit may identify critical vulnerabilities delaying release.",
      probability: "Medium",
      impact: "Critical",
      status: "Open",
      mitigationPlan: "Continuous security scanning with Snyk, internal penetration testing before audit, dedicated security sprint buffer."
    });

    // ==================== ISSUES ====================
    
    // E-Commerce App Issues
    await storage.createIssue({
      projectId: ecommerceApp.id,
      title: "Image loading slow on 3G networks",
      description: "Product images take too long to load on slower mobile networks, causing poor UX.",
      priority: "High",
      status: "In Progress",
      type: "Bug",
      assignee: "James Wilson"
    });

    await storage.createIssue({
      projectId: ecommerceApp.id,
      title: "Add wishlist functionality",
      description: "Users want to save products for later without adding to cart.",
      priority: "Medium",
      status: "Open",
      type: "Enhancement",
      assignee: null
    });

    await storage.createIssue({
      projectId: ecommerceApp.id,
      title: "Checkout crashes on Android 12",
      description: "App crashes when completing checkout on certain Android 12 devices.",
      priority: "Critical",
      status: "Open",
      type: "Bug",
      assignee: "Maria Garcia"
    });

    // SaaS Dashboard Issues
    await storage.createIssue({
      projectId: saasApp.id,
      title: "Dashboard widgets not responsive on mobile",
      description: "Charts overlap and become unreadable on screens smaller than 768px.",
      priority: "Medium",
      status: "In Progress",
      type: "Bug",
      assignee: "David Park"
    });

    await storage.createIssue({
      projectId: saasApp.id,
      title: "Add data refresh interval setting",
      description: "Users want to customize how often the dashboard auto-refreshes (currently fixed at 30s).",
      priority: "Low",
      status: "Open",
      type: "Enhancement",
      assignee: null
    });

    await storage.createIssue({
      projectId: saasApp.id,
      title: "Memory leak in chart component",
      description: "Long-running dashboard sessions show increasing memory usage, eventually causing browser crash.",
      priority: "High",
      status: "Open",
      type: "Bug",
      assignee: "Emma Thompson"
    });

    // CRM Issues
    await storage.createIssue({
      projectId: crmApp.id,
      title: "GraphQL query N+1 problem",
      description: "Contact list query makes separate database call for each contact's organization.",
      priority: "High",
      status: "In Progress",
      type: "Bug",
      assignee: "Backend Team"
    });

    await storage.createIssue({
      projectId: crmApp.id,
      title: "Implement contact import from CSV",
      description: "Bulk import functionality for migrating from spreadsheets or other CRMs.",
      priority: "Medium",
      status: "Open",
      type: "Task",
      assignee: null
    });

    // Kubernetes Issues
    await storage.createIssue({
      projectId: k8sMigration.id,
      title: "Persistent volume claims failing in us-west-2",
      description: "EBS volumes not attaching correctly to pods in us-west-2c availability zone.",
      priority: "Critical",
      status: "In Progress",
      type: "Bug",
      assignee: "Chris Lee"
    });

    await storage.createIssue({
      projectId: k8sMigration.id,
      title: "Document disaster recovery procedures",
      description: "Create runbook for cluster recovery, database restores, and failover procedures.",
      priority: "Medium",
      status: "Open",
      type: "Task",
      assignee: "Jennifer Wu"
    });

    await storage.createIssue({
      projectId: k8sMigration.id,
      title: "Add Prometheus alerting rules",
      description: "Configure alerts for pod crashes, high latency, and resource exhaustion.",
      priority: "High",
      status: "Open",
      type: "Enhancement",
      assignee: "Robert Taylor"
    });

    // CI/CD Issues
    await storage.createIssue({
      projectId: cicdPipeline.id,
      title: "Flaky integration tests blocking deployments",
      description: "Some integration tests randomly fail causing unnecessary deployment blocks.",
      priority: "High",
      status: "Resolved",
      type: "Bug",
      assignee: "DevOps Team"
    });

    await storage.createIssue({
      projectId: cicdPipeline.id,
      title: "Add code coverage reporting",
      description: "Integrate code coverage reports into PR comments and fail builds below 80%.",
      priority: "Medium",
      status: "Closed",
      type: "Enhancement",
      assignee: "DevOps Team"
    });

    console.log("Database seeded with software development demo data successfully.");
  }
}

// Helper to get user ID from request (supports both Replit OAuth and Email/Password auth)
function getUserIdFromRequest(req: any): string | undefined {
  // First check Replit OAuth format
  const replitUserId = req.user?.claims?.sub;
  if (replitUserId) return replitUserId;
  
  // Fall back to session-based auth (email/password)
  return req.session?.userId;
}

// Helper to check if user has access to an organization
async function userHasOrgAccess(userId: string | undefined, orgId: number): Promise<boolean> {
  if (!userId) return false;
  
  // Check if user is super_admin (has access to all orgs)
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (user?.role === 'super_admin') return true;
  
  // Check if user is a member of this organization
  const membership = await storage.getUserOrganizations(userId);
  return membership.some(m => m.organizationId === orgId);
}

// Helper to get user's accessible organization IDs
async function getUserOrgIds(userId: string | undefined): Promise<number[]> {
  if (!userId) return [];
  
  // Check if user is super_admin
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (user?.role === 'super_admin') {
    const allOrgs = await storage.getOrganizations();
    return allOrgs.map(o => o.id);
  }
  
  const membership = await storage.getUserOrganizations(userId);
  return membership.map(m => m.organizationId);
}

// Helper to check if user has any organization membership
async function userHasAnyOrgAccess(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  
  // Super admins always have access
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (user?.role === 'super_admin') return true;
  
  // Check if user is a member of at least one organization
  const membership = await storage.getUserOrganizations(userId);
  return membership.length > 0;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Set up authentication first - Replit OAuth, Email/Password, and Microsoft 365
  await setupReplitAuth(app);
  await setupEmailAuth(app);
  await setupMicrosoftAuth(app);
  registerAuthRoutes(app);

  // Seed DB on startup
  seedDatabase().catch(err => console.error("Error seeding database:", err));

  // --- Users (Admin) ---
  app.get('/api/users', async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (err) {
      res.json([]);
    }
  });

  app.put('/api/users/:userId/role', async (req, res) => {
    try {
      const { role } = req.body;
      const [updated] = await db.update(users)
        .set({ role })
        .where(eq(users.id, req.params.userId))
        .returning();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: 'Failed to update user role' });
    }
  });

  // Update user profile
  app.patch('/api/users/:userId/profile', async (req, res) => {
    try {
      const { firstName, lastName, email } = req.body;
      const [updated] = await db.update(users)
        .set({ 
          firstName, 
          lastName, 
          email,
          updatedAt: new Date()
        })
        .where(eq(users.id, req.params.userId))
        .returning();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: 'Failed to update user profile' });
    }
  });

  // Update user avatar (image URL or emoji)
  app.patch('/api/users/:userId/avatar', async (req, res) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.id;
      if (!userId || userId !== req.params.userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { avatarUrl, avatarEmoji } = req.body;
      
      const updateData: any = { updatedAt: new Date() };
      
      if (avatarUrl !== undefined) {
        // For image uploads, set avatarUrl (primary) and profileImageUrl (legacy)
        updateData.avatarUrl = avatarUrl || null;
        updateData.profileImageUrl = avatarUrl || null;
      }
      
      if (avatarEmoji !== undefined) {
        // Store emoji in avatarUrl field with emoji: prefix
        updateData.avatarUrl = avatarEmoji ? `emoji:${avatarEmoji}` : null;
        // Clear image URL when using emoji
        updateData.profileImageUrl = null;
      }

      const [updated] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, req.params.userId))
        .returning();
      
      res.json(updated);
    } catch (err) {
      console.error("Error updating avatar:", err);
      res.status(500).json({ message: 'Failed to update avatar' });
    }
  });

  // Request avatar upload URL
  app.post('/api/users/:userId/avatar/upload-url', async (req, res) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.id;
      if (!userId || userId !== req.params.userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({ uploadURL, objectPath });
    } catch (err) {
      console.error("Error generating avatar upload URL:", err);
      res.status(500).json({ message: 'Failed to generate upload URL' });
    }
  });

  // --- Organizations ---
  app.get('/api/organizations', async (req, res) => {
    try {
      const orgs = await storage.getOrganizations();
      res.json(orgs);
    } catch (err) {
      res.json([]);
    }
  });

  app.get('/api/organizations/:id', async (req, res) => {
    const orgId = Number(req.params.id);
    const userId = getUserIdFromRequest(req);
    
    // Check access
    if (!await userHasOrgAccess(userId, orgId)) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }
    
    const org = await storage.getOrganization(orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    res.json(org);
  });

  app.post('/api/organizations', async (req, res) => {
    try {
      const { name, slug, description, ownerId } = req.body;
      const org = await storage.createOrganization({ name, slug, description, ownerId });
      // Add creator as org_admin
      if (ownerId) {
        await storage.addOrganizationMember({ 
          organizationId: org.id, 
          userId: ownerId, 
          role: 'org_admin' 
        });
      }
      res.status(201).json(org);
    } catch (err) {
      res.status(500).json({ message: 'Failed to create organization' });
    }
  });

  app.put('/api/organizations/:id', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { name, description, hiddenModules, moduleOrder, hiddenGroups, sidebarStructure, logoUrl } = req.body;
      const updated = await storage.updateOrganization(orgId, { name, description, hiddenModules, moduleOrder, hiddenGroups, sidebarStructure, logoUrl });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: 'Failed to update organization' });
    }
  });

  // Organization logo upload URL
  app.post('/api/organizations/:id/logo/upload-url', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({ uploadURL, objectPath });
    } catch (err) {
      console.error("Error generating logo upload URL:", err);
      res.status(500).json({ message: 'Failed to generate upload URL' });
    }
  });

  // Deactivate organization (soft delete)
  app.delete('/api/organizations/:id', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const deactivated = await storage.deactivateOrganization(orgId, userId);
      res.json({ message: 'Organization deactivated', organization: deactivated });
    } catch (err) {
      res.status(500).json({ message: 'Failed to deactivate organization' });
    }
  });

  // Get deactivated organizations (super_admin only)
  app.get('/api/admin/organizations/deactivated', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }
      
      const deactivatedOrgs = await storage.getDeactivatedOrganizations();
      res.json(deactivatedOrgs);
    } catch (err) {
      res.status(500).json({ message: 'Failed to get deactivated organizations' });
    }
  });

  // Reactivate (restore) organization (super_admin only)
  app.post('/api/admin/organizations/:id/reactivate', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }
      
      const reactivated = await storage.reactivateOrganization(orgId);
      res.json({ message: 'Organization reactivated', organization: reactivated });
    } catch (err) {
      res.status(500).json({ message: 'Failed to reactivate organization' });
    }
  });

  // --- Organization Members ---
  app.get('/api/organizations/:id/members', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const members = await storage.getOrganizationMembers(orgId);
      // Enrich with user data
      const allUsers = await storage.getAllUsers();
      const enrichedMembers = members.map(m => ({
        ...m,
        user: allUsers.find(u => u.id === m.userId)
      }));
      res.json(enrichedMembers);
    } catch (err) {
      res.json([]);
    }
  });

  app.get('/api/users/:userId/organizations', async (req, res) => {
    try {
      const memberships = await storage.getUserOrganizations(req.params.userId);
      res.json(memberships);
    } catch (err) {
      res.json([]);
    }
  });

  app.post('/api/organizations/:id/members', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const currentUserId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { userId, role } = req.body;
      const member = await storage.addOrganizationMember({
        organizationId: orgId,
        userId,
        role: role || 'member'
      });
      res.status(201).json(member);
    } catch (err) {
      res.status(500).json({ message: 'Failed to add member' });
    }
  });

  app.put('/api/organizations/:id/members/:userId', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const currentUserId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { role } = req.body;
      const updated = await storage.updateOrganizationMemberRole(
        orgId,
        req.params.userId,
        role
      );
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: 'Failed to update member role' });
    }
  });

  app.delete('/api/organizations/:id/members/:userId', async (req, res) => {
    const orgId = Number(req.params.id);
    const currentUserId = getUserIdFromRequest(req);
    
    if (!await userHasOrgAccess(currentUserId, orgId)) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }
    
    await storage.removeOrganizationMember(orgId, req.params.userId);
    res.status(204).send();
  });

  // --- Organization Invites ---
  app.get('/api/organizations/:id/invites', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const invites = await storage.getOrganizationInvites(orgId);
      res.json(invites);
    } catch (err) {
      res.json([]);
    }
  });

  app.post('/api/organizations/:id/invites', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const currentUserId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { emails, role } = req.body;
      
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ message: 'Emails array is required' });
      }
      
      const results: { success: string[]; skipped: string[]; errors: string[] } = {
        success: [],
        skipped: [],
        errors: []
      };
      
      const existingMembers = await storage.getOrganizationMembers(orgId);
      const existingInvites = await storage.getOrganizationInvites(orgId);
      const allUsers = await storage.getAllUsers();
      
      for (const email of emails) {
        const normalizedEmail = email.trim().toLowerCase();
        
        if (!normalizedEmail || !normalizedEmail.includes('@')) {
          results.errors.push(`Invalid email: ${email}`);
          continue;
        }
        
        const existingUser = allUsers.find(u => u.email?.toLowerCase() === normalizedEmail);
        if (existingUser && existingMembers.some(m => m.userId === existingUser.id)) {
          results.skipped.push(`${normalizedEmail} is already a member`);
          continue;
        }
        
        const pendingInvite = existingInvites.find(i => 
          i.email.toLowerCase() === normalizedEmail && i.status === 'pending'
        );
        if (pendingInvite) {
          results.skipped.push(`${normalizedEmail} already has a pending invite`);
          continue;
        }
        
        try {
          await storage.createOrganizationInvite({
            organizationId: orgId,
            email: normalizedEmail,
            role: role || 'member',
            invitedBy: currentUserId,
            status: 'pending'
          });
          results.success.push(normalizedEmail);
        } catch (err) {
          results.errors.push(`Failed to invite ${normalizedEmail}`);
        }
      }
      
      res.status(201).json(results);
    } catch (err) {
      console.error('Failed to create invites:', err);
      res.status(500).json({ message: 'Failed to create invites' });
    }
  });

  app.delete('/api/organizations/:id/invites/:inviteId', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const inviteId = Number(req.params.inviteId);
      const currentUserId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      await storage.cancelOrganizationInvite(inviteId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: 'Failed to cancel invite' });
    }
  });

  // --- Organization Access Requests ---
  
  // Create access request (for users without admin access)
  app.post('/api/organizations/:id/access-requests', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Check if org exists
      const org = await storage.getOrganization(orgId);
      if (!org) {
        return res.status(404).json({ message: 'Organization not found' });
      }
      
      // Check if user already has a pending request
      const existingRequest = await storage.getPendingAccessRequestByUser(orgId, userId);
      if (existingRequest) {
        return res.status(400).json({ message: 'You already have a pending access request for this organization' });
      }
      
      // Check if user is already a member with admin role
      const userOrgs = await storage.getUserOrganizations(userId);
      const existingMembership = userOrgs.find(m => m.organizationId === orgId);
      if (existingMembership && existingMembership.role === 'org_admin') {
        return res.status(400).json({ message: 'You already have admin access to this organization' });
      }
      
      const { message } = req.body;
      
      // Create the access request
      const request = await storage.createOrganizationAccessRequest({
        organizationId: orgId,
        userId,
        requestedRole: 'org_admin',
        message: message || null,
      });
      
      // Get the requester's name
      const requester = await storage.getUser(userId);
      const requesterName = [requester?.firstName, requester?.lastName].filter(Boolean).join(' ') || requester?.email || 'Unknown User';
      
      // Send email notifications to all org admins
      const members = await storage.getOrganizationMembers(orgId);
      const admins = members.filter(m => m.role === 'org_admin');
      
      for (const admin of admins) {
        const adminUser = await storage.getUser(admin.userId);
        if (adminUser?.email) {
          await sendAccessRequestNotification(
            adminUser.email,
            requesterName,
            org.name,
            message
          );
        }
      }
      
      res.status(201).json(request);
    } catch (err) {
      console.error('Failed to create access request:', err);
      res.status(500).json({ message: 'Failed to create access request' });
    }
  });
  
  // Get access requests for an organization (org admins only)
  app.get('/api/organizations/:id/access-requests', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      // Require org_admin role to view access requests
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && m.role === 'org_admin');
      if (!isOrgAdmin) {
        return res.status(403).json({ message: 'Only organization admins can view access requests' });
      }
      
      const requests = await storage.getOrganizationAccessRequests(orgId);
      
      // Enrich with user details
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const user = await storage.getUser(request.userId);
          return {
            ...request,
            user: user ? {
              id: user.id,
              name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
              email: user.email,
              avatarUrl: user.avatarUrl,
            } : null,
          };
        })
      );
      
      res.json(enrichedRequests);
    } catch (err) {
      console.error('Failed to get access requests:', err);
      res.status(500).json({ message: 'Failed to get access requests' });
    }
  });
  
  // Get user's pending request status for an organization
  app.get('/api/organizations/:id/access-requests/my-status', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const request = await storage.getPendingAccessRequestByUser(orgId, userId);
      res.json({ hasPendingRequest: !!request, request: request || null });
    } catch (err) {
      console.error('Failed to get access request status:', err);
      res.status(500).json({ message: 'Failed to get access request status' });
    }
  });
  
  // Approve access request
  app.post('/api/organizations/:id/access-requests/:requestId/approve', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const requestId = Number(req.params.requestId);
      const userId = getUserIdFromRequest(req);
      
      // Require org_admin role to approve access requests
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && m.role === 'org_admin');
      if (!isOrgAdmin) {
        return res.status(403).json({ message: 'Only organization admins can approve access requests' });
      }
      
      // Get the request
      const requests = await storage.getOrganizationAccessRequests(orgId);
      const request = requests.find(r => r.id === requestId);
      
      if (!request) {
        return res.status(404).json({ message: 'Access request not found' });
      }
      
      if (request.status !== 'pending') {
        return res.status(400).json({ message: 'This request has already been processed' });
      }
      
      // Update request status
      const updatedRequest = await storage.updateAccessRequestStatus(requestId, 'approved', userId);
      
      // Add the user as an org admin
      const existingMembership = (await storage.getUserOrganizations(request.userId))
        .find(m => m.organizationId === orgId);
      
      if (existingMembership) {
        // Update existing membership to org_admin
        await storage.updateOrganizationMemberRole(orgId, request.userId, 'org_admin');
      } else {
        // Add as new member with org_admin role
        await storage.addOrganizationMember({
          organizationId: orgId,
          userId: request.userId,
          role: 'org_admin',
        });
      }
      
      // Send notification email
      const requestingUser = await storage.getUser(request.userId);
      const reviewer = userId ? await storage.getUser(userId) : null;
      const org = await storage.getOrganization(orgId);
      const reviewerName = reviewer ? [reviewer.firstName, reviewer.lastName].filter(Boolean).join(' ') || reviewer.email : undefined;
      
      if (requestingUser?.email && org) {
        await sendAccessRequestDecisionNotification(
          requestingUser.email,
          org.name,
          true,
          reviewerName || undefined
        );
      }
      
      res.json(updatedRequest);
    } catch (err) {
      console.error('Failed to approve access request:', err);
      res.status(500).json({ message: 'Failed to approve access request' });
    }
  });
  
  // Reject access request
  app.post('/api/organizations/:id/access-requests/:requestId/reject', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const requestId = Number(req.params.requestId);
      const userId = getUserIdFromRequest(req);
      
      // Require org_admin role to reject access requests
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && m.role === 'org_admin');
      if (!isOrgAdmin) {
        return res.status(403).json({ message: 'Only organization admins can reject access requests' });
      }
      
      // Get the request
      const requests = await storage.getOrganizationAccessRequests(orgId);
      const request = requests.find(r => r.id === requestId);
      
      if (!request) {
        return res.status(404).json({ message: 'Access request not found' });
      }
      
      if (request.status !== 'pending') {
        return res.status(400).json({ message: 'This request has already been processed' });
      }
      
      // Update request status
      const updatedRequest = await storage.updateAccessRequestStatus(requestId, 'rejected', userId);
      
      // Send notification email
      const requestingUser = await storage.getUser(request.userId);
      const reviewer = userId ? await storage.getUser(userId) : null;
      const org = await storage.getOrganization(orgId);
      const reviewerName = reviewer ? [reviewer.firstName, reviewer.lastName].filter(Boolean).join(' ') || reviewer.email : undefined;
      
      if (requestingUser?.email && org) {
        await sendAccessRequestDecisionNotification(
          requestingUser.email,
          org.name,
          false,
          reviewerName || undefined
        );
      }
      
      res.json(updatedRequest);
    } catch (err) {
      console.error('Failed to reject access request:', err);
      res.status(500).json({ message: 'Failed to reject access request' });
    }
  });

  // --- Recycle Bin ---
  app.get('/api/organizations/:id/recycle-bin', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const items = await storage.getDeletedItems(orgId);
      res.json(items);
    } catch (err) {
      console.error('Failed to get recycle bin items:', err);
      res.status(500).json({ message: 'Failed to get deleted items' });
    }
  });

  app.post('/api/organizations/:id/recycle-bin/restore', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { type, itemId } = req.body;
      if (!type || !itemId) {
        return res.status(400).json({ message: 'Type and itemId are required' });
      }
      
      const success = await storage.restoreItem(type, itemId, orgId);
      if (!success) {
        return res.status(404).json({ message: 'Item not found in this organization' });
      }
      res.json({ message: 'Item restored successfully' });
    } catch (err) {
      console.error('Failed to restore item:', err);
      res.status(500).json({ message: 'Failed to restore item' });
    }
  });

  app.delete('/api/organizations/:id/recycle-bin/:type/:itemId', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { type, itemId } = req.params;
      const success = await storage.permanentlyDeleteItem(type as any, Number(itemId), orgId);
      if (!success) {
        return res.status(404).json({ message: 'Item not found in this organization' });
      }
      res.json({ message: 'Item permanently deleted' });
    } catch (err) {
      console.error('Failed to permanently delete item:', err);
      res.status(500).json({ message: 'Failed to permanently delete item' });
    }
  });

  // --- Global Search ---
  app.get('/api/search', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json({ portfolios: [], projects: [], tasks: [], issues: [], risks: [], milestones: [] });
      }
      
      // Get user's accessible organization IDs for security filtering
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (accessibleOrgIds.length === 0) {
        return res.json({ portfolios: [], projects: [], tasks: [], issues: [], risks: [], milestones: [] });
      }
      
      const results = await storage.search(query, accessibleOrgIds);
      res.json(results);
    } catch (err) {
      console.error('Search error:', err);
      res.status(500).json({ message: 'Search failed' });
    }
  });

  // --- Portfolios ---
  app.get(api.portfolios.list.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    
    // Deny access if user is not a member of any organization
    if (!await userHasAnyOrgAccess(userId)) {
      return res.json([]);
    }
    
    const requestedOrgId = req.query.organizationId ? Number(req.query.organizationId) : undefined;
    
    // Get user's accessible org IDs
    const accessibleOrgIds = await getUserOrgIds(userId);
    
    // If requesting a specific org, check access
    if (requestedOrgId && !accessibleOrgIds.includes(requestedOrgId)) {
      return res.json([]); // Return empty if no access
    }
    
    const portfolios = await storage.getPortfolios(requestedOrgId);
    
    // Filter portfolios to only those in accessible orgs
    const filteredPortfolios = portfolios.filter(p => 
      p.organizationId === null || accessibleOrgIds.includes(p.organizationId)
    );
    
    res.json(filteredPortfolios);
  });

  app.get(api.portfolios.get.path, async (req, res) => {
    const portfolio = await storage.getPortfolio(Number(req.params.id));
    if (!portfolio) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }
    res.json(portfolio);
  });

  app.post(api.portfolios.create.path, async (req, res) => {
    try {
      const input = api.portfolios.create.input.parse(req.body);
      const portfolio = await storage.createPortfolio(input);
      res.status(201).json(portfolio);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.portfolios.update.path, async (req, res) => {
    try {
      const input = api.portfolios.update.input.parse(req.body);
      const updated = await storage.updatePortfolio(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.portfolios.delete.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    await storage.softDeleteItem('portfolio', Number(req.params.id), userId);
    res.status(204).send();
  });

  // --- Portfolio Aggregations ---
  app.get('/api/portfolios/:id/projects', async (req, res) => {
    try {
      const projects = await storage.getPortfolioProjects(Number(req.params.id));
      res.json(projects);
    } catch (err) {
      res.status(500).json({ message: 'Failed to get portfolio projects' });
    }
  });

  app.get('/api/portfolios/:id/risks', async (req, res) => {
    try {
      const risks = await storage.getPortfolioRisks(Number(req.params.id));
      res.json(risks);
    } catch (err) {
      res.status(500).json({ message: 'Failed to get portfolio risks' });
    }
  });

  app.get('/api/portfolios/:id/issues', async (req, res) => {
    try {
      const issues = await storage.getPortfolioIssues(Number(req.params.id));
      res.json(issues);
    } catch (err) {
      res.status(500).json({ message: 'Failed to get portfolio issues' });
    }
  });

  app.get('/api/portfolios/:id/milestones', async (req, res) => {
    try {
      const milestones = await storage.getPortfolioMilestones(Number(req.params.id));
      res.json(milestones);
    } catch (err) {
      res.status(500).json({ message: 'Failed to get portfolio milestones' });
    }
  });

  app.get('/api/portfolios/:id/overview', async (req, res) => {
    try {
      const portfolio = await storage.getPortfolio(Number(req.params.id));
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      
      const projects = await storage.getPortfolioProjects(Number(req.params.id));
      const risks = await storage.getPortfolioRisks(Number(req.params.id));
      const issues = await storage.getPortfolioIssues(Number(req.params.id));
      const milestones = await storage.getPortfolioMilestones(Number(req.params.id));
      
      // Calculate metrics
      const totalBudget = projects.reduce((sum, p) => sum + Number(p.budget || 0), 0);
      const avgCompletion = projects.length > 0 
        ? Math.round(projects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / projects.length)
        : 0;
      const healthCounts = {
        green: projects.filter(p => p.health === 'Green').length,
        yellow: projects.filter(p => p.health === 'Yellow').length,
        red: projects.filter(p => p.health === 'Red').length,
      };
      const openRisks = risks.filter(r => r.status === 'Open').length;
      const highRisks = risks.filter(r => r.probability === 'High' || r.impact === 'High').length;
      const openIssues = issues.filter(i => i.status === 'Open' || i.status === 'In Progress').length;
      const upcomingMilestones = milestones.filter(m => !m.completed).length;
      
      res.json({
        portfolio,
        metrics: {
          projectCount: projects.length,
          totalBudget,
          avgCompletion,
          healthCounts,
          riskCount: risks.length,
          openRisks,
          highRisks,
          issueCount: issues.length,
          openIssues,
          milestoneCount: milestones.length,
          upcomingMilestones,
        }
      });
    } catch (err) {
      res.status(500).json({ message: 'Failed to get portfolio overview' });
    }
  });

  // --- Projects ---
  app.get(api.projects.list.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    
    // Deny access if user is not a member of any organization
    if (!await userHasAnyOrgAccess(userId)) {
      return res.json([]);
    }
    
    const requestedOrgId = req.query.organizationId ? Number(req.query.organizationId) : undefined;
    const portfolioId = req.query.portfolioId ? Number(req.query.portfolioId) : undefined;
    
    // Get user's accessible org IDs
    const accessibleOrgIds = await getUserOrgIds(userId);
    
    // If requesting a specific org, check access
    if (requestedOrgId && !accessibleOrgIds.includes(requestedOrgId)) {
      return res.json([]); // Return empty if no access
    }
    
    const projects = await storage.getProjects(requestedOrgId, portfolioId);
    
    // Filter projects to only those in accessible orgs
    const filteredProjects = projects.filter(p => 
      p.organizationId === null || accessibleOrgIds.includes(p.organizationId)
    );
    
    res.json(filteredProjects);
  });

  app.get(api.projects.get.path, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post(api.projects.create.path, async (req, res) => {
    try {
      const input = api.projects.create.input.parse(req.body);
      const sanitizedInput = {
        ...input,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
      };
      const project = await storage.createProject(sanitizedInput);
      
      // Log change
      const userId = getUserIdFromRequest(req);
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createProjectChangeLog({
        projectId: project.id,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'created',
        changeSummary: `Project "${project.name}" created`,
        previousValues: null,
        newValues: JSON.stringify(project),
      });
      
      res.status(201).json(project);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.projects.update.path, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const existing = await storage.getProject(projectId);
      if (!existing) return res.status(404).json({ message: "Project not found" });
      
      const input = api.projects.update.input.parse(req.body);
      const sanitizedInput = {
        ...input,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
      };
      const updated = await storage.updateProject(projectId, sanitizedInput);
      
      // Track changes
      const trackedFields = ['name', 'description', 'status', 'priority', 'health', 'budget', 'startDate', 'endDate', 'completionPercentage', 'portfolioId'];
      const changes: string[] = [];
      const prevValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};
      
      for (const field of trackedFields) {
        const prev = (existing as any)[field];
        const curr = (updated as any)[field];
        if (String(prev ?? '') !== String(curr ?? '')) {
          changes.push(`${field}: "${prev || '(empty)'}" → "${curr || '(empty)'}"`);
          prevValues[field] = prev;
          newValues[field] = curr;
        }
      }
      
      if (changes.length > 0) {
        const userId = getUserIdFromRequest(req);
        const user = userId ? await storage.getUser(userId) : null;
        await storage.createProjectChangeLog({
          projectId,
          changedBy: userId || null,
          changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
          changeType: 'updated',
          changeSummary: changes.join('; '),
          previousValues: JSON.stringify(prevValues),
          newValues: JSON.stringify(newValues),
        });
      }
      
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Error updating project" });
    }
  });

  app.delete(api.projects.delete.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    await storage.softDeleteItem('project', Number(req.params.id), userId);
    res.status(204).send();
  });

  // Project History
  app.get(api.projects.getHistory.path, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      const history = await storage.getProjectChangeLogs(projectId);
      res.json(history);
    } catch (err) {
      res.status(500).json({ message: "Error fetching project history" });
    }
  });

  // Project Export (CSV and MSPDI/XML)
  app.get('/api/projects/:id/export', async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const format = (req.query.format as string) || 'csv';
      
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      // Security check: verify user is authenticated and has access to project's organization
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied to this project" });
      }
      
      const tasks = await storage.getTasks(projectId);
      const milestones = await storage.getMilestones(projectId);
      
      const safeFileName = (project.name || 'project').replace(/[^a-z0-9]/gi, '_');
      
      // Helper to escape XML special characters
      const escapeXml = (str: string) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };
      
      if (format === 'csv') {
        // Generate CSV
        const headers = ['WBS', 'Name', 'Type', 'Start Date', 'End Date', 'Duration (days)', '% Complete', 'Status', 'Priority', 'Assigned To', 'Description'];
        const rows: string[][] = [];
        
        // Add project as first row
        rows.push([
          '0',
          project.name || '',
          'Project',
          project.startDate || '',
          project.endDate || '',
          project.startDate && project.endDate ? String(Math.ceil((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / (1000 * 60 * 60 * 24))) : '',
          String(project.completionPercentage || 0),
          project.status || '',
          project.priority || '',
          '',
          project.description || ''
        ]);
        
        // Add tasks
        tasks.forEach((task, index) => {
          rows.push([
            String(index + 1),
            task.name || '',
            task.isMilestone ? 'Milestone' : 'Task',
            task.startDate || '',
            task.endDate || '',
            task.durationDays ? String(task.durationDays) : '',
            String(task.progress || 0),
            task.status || '',
            '',
            task.assignee || '',
            task.description || ''
          ]);
        });
        
        // Add milestones
        milestones.forEach((ms, index) => {
          rows.push([
            `M${index + 1}`,
            ms.title || '',
            'Milestone',
            ms.dueDate || '',
            ms.dueDate || '',
            '0',
            ms.completed ? '100' : '0',
            ms.completed ? 'Completed' : 'Pending',
            ms.priority || '',
            ms.assignee || '',
            ms.description || ''
          ]);
        });
        
        // Escape CSV values
        const escapeCSV = (val: string) => {
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        };
        
        const csvContent = [
          headers.map(escapeCSV).join(','),
          ...rows.map(row => row.map(escapeCSV).join(','))
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}_export.csv"`);
        res.send(csvContent);
        
      } else if (format === 'mspdi' || format === 'xml') {
        // Generate MSPDI (Microsoft Project XML) format
        const now = new Date().toISOString();
        const projectStart = project.startDate ? new Date(project.startDate).toISOString() : now;
        const projectEnd = project.endDate ? new Date(project.endDate).toISOString() : now;
        
        // Build task XML
        let taskXml = '';
        let taskUid = 0;
        
        // Project summary task (UID 0)
        taskXml += `
    <Task>
      <UID>${taskUid}</UID>
      <ID>${taskUid}</ID>
      <Name>${escapeXml(project.name || 'Project')}</Name>
      <Type>1</Type>
      <IsNull>0</IsNull>
      <CreateDate>${now}</CreateDate>
      <WBS>0</WBS>
      <OutlineNumber>0</OutlineNumber>
      <OutlineLevel>0</OutlineLevel>
      <Priority>500</Priority>
      <Start>${projectStart}</Start>
      <Finish>${projectEnd}</Finish>
      <Duration>PT${Math.max(1, Math.ceil((new Date(projectEnd).getTime() - new Date(projectStart).getTime()) / (1000 * 60 * 60 * 24)) * 8)}H0M0S</Duration>
      <DurationFormat>7</DurationFormat>
      <Summary>1</Summary>
      <Milestone>0</Milestone>
      <PercentComplete>${project.completionPercentage || 0}</PercentComplete>
      <PercentWorkComplete>${project.completionPercentage || 0}</PercentWorkComplete>
    </Task>`;
        
        // Add tasks
        tasks.forEach((task, index) => {
          taskUid++;
          const taskStart = task.startDate ? new Date(task.startDate).toISOString() : projectStart;
          const taskEnd = task.endDate ? new Date(task.endDate).toISOString() : taskStart;
          const duration = task.durationDays || Math.max(1, Math.ceil((new Date(taskEnd).getTime() - new Date(taskStart).getTime()) / (1000 * 60 * 60 * 24)));
          
          taskXml += `
    <Task>
      <UID>${taskUid}</UID>
      <ID>${taskUid}</ID>
      <Name>${escapeXml(task.name || '')}</Name>
      <Type>0</Type>
      <IsNull>0</IsNull>
      <CreateDate>${task.createdAt ? new Date(task.createdAt).toISOString() : now}</CreateDate>
      <WBS>${String(index + 1)}</WBS>
      <OutlineNumber>${index + 1}</OutlineNumber>
      <OutlineLevel>1</OutlineLevel>
      <Priority>500</Priority>
      <Start>${taskStart}</Start>
      <Finish>${taskEnd}</Finish>
      <Duration>PT${duration * 8}H0M0S</Duration>
      <DurationFormat>7</DurationFormat>
      <Summary>0</Summary>
      <Milestone>${task.isMilestone ? 1 : 0}</Milestone>
      <PercentComplete>${task.progress || 0}</PercentComplete>
      <PercentWorkComplete>${task.progress || 0}</PercentWorkComplete>
      <Notes>${escapeXml(task.description || '')}</Notes>
    </Task>`;
        });
        
        // Add milestones as tasks
        milestones.forEach((ms, index) => {
          taskUid++;
          const msDate = ms.dueDate ? new Date(ms.dueDate).toISOString() : projectEnd;
          
          taskXml += `
    <Task>
      <UID>${taskUid}</UID>
      <ID>${taskUid}</ID>
      <Name>${escapeXml(ms.title || '')}</Name>
      <Type>0</Type>
      <IsNull>0</IsNull>
      <CreateDate>${now}</CreateDate>
      <WBS>M${index + 1}</WBS>
      <OutlineNumber>${tasks.length + index + 1}</OutlineNumber>
      <OutlineLevel>1</OutlineLevel>
      <Priority>500</Priority>
      <Start>${msDate}</Start>
      <Finish>${msDate}</Finish>
      <Duration>PT0H0M0S</Duration>
      <DurationFormat>7</DurationFormat>
      <Summary>0</Summary>
      <Milestone>1</Milestone>
      <PercentComplete>${ms.completed ? 100 : 0}</PercentComplete>
      <PercentWorkComplete>${ms.completed ? 100 : 0}</PercentWorkComplete>
      <Notes>${escapeXml(ms.description || '')}</Notes>
    </Task>`;
        });
        
        const mspdiXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>${escapeXml(project.name || 'Project')}</Name>
  <Title>${escapeXml(project.name || 'Project')}</Title>
  <CreationDate>${now}</CreationDate>
  <LastSaved>${now}</LastSaved>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${projectStart}</StartDate>
  <FinishDate>${projectEnd}</FinishDate>
  <FYStartDate>1</FYStartDate>
  <CriticalSlackLimit>0</CriticalSlackLimit>
  <CurrencyDigits>2</CurrencyDigits>
  <CurrencySymbol>$</CurrencySymbol>
  <CurrencySymbolPosition>0</CurrencySymbolPosition>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <DefaultFinishTime>17:00:00</DefaultFinishTime>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>2400</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <DefaultTaskType>0</DefaultTaskType>
  <DefaultFixedCostAccrual>2</DefaultFixedCostAccrual>
  <DefaultStandardRate>0</DefaultStandardRate>
  <DefaultOvertimeRate>0</DefaultOvertimeRate>
  <DurationFormat>7</DurationFormat>
  <WorkFormat>2</WorkFormat>
  <EditableActualCosts>0</EditableActualCosts>
  <HonorConstraints>1</HonorConstraints>
  <InsertedProjectsLikeSummary>1</InsertedProjectsLikeSummary>
  <MultipleCriticalPaths>0</MultipleCriticalPaths>
  <NewTasksEffortDriven>1</NewTasksEffortDriven>
  <NewTasksEstimated>1</NewTasksEstimated>
  <SplitsInProgressTasks>1</SplitsInProgressTasks>
  <SpreadActualCost>0</SpreadActualCost>
  <SpreadPercentComplete>0</SpreadPercentComplete>
  <TaskUpdatesResource>1</TaskUpdatesResource>
  <FiscalYearStart>0</FiscalYearStart>
  <WeekStartDay>0</WeekStartDay>
  <MoveCompletedEndsBack>0</MoveCompletedEndsBack>
  <MoveRemainingStartsBack>0</MoveRemainingStartsBack>
  <MoveRemainingStartsForward>0</MoveRemainingStartsForward>
  <MoveCompletedEndsForward>0</MoveCompletedEndsForward>
  <BaselineForEarnedValue>0</BaselineForEarnedValue>
  <AutoAddNewResourcesAndTasks>1</AutoAddNewResourcesAndTasks>
  <CurrentDate>${now}</CurrentDate>
  <MicrosoftProjectServerURL>1</MicrosoftProjectServerURL>
  <Autolink>1</Autolink>
  <NewTaskStartDate>0</NewTaskStartDate>
  <NewTasksAreManual>0</NewTasksAreManual>
  <DefaultTaskEVMethod>0</DefaultTaskEVMethod>
  <ProjectExternallyEdited>0</ProjectExternallyEdited>
  <ExtendedCreationDate>${now}</ExtendedCreationDate>
  <ActualsInSync>1</ActualsInSync>
  <RemoveFileProperties>0</RemoveFileProperties>
  <AdminProject>0</AdminProject>
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <BaseCalendarUID>-1</BaseCalendarUID>
      <WeekDays>
        <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
        <WeekDay><DayType>2</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>3</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>4</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>5</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>6</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
      </WeekDays>
    </Calendar>
  </Calendars>
  <Tasks>${taskXml}
  </Tasks>
</Project>`;
        
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}_export.xml"`);
        res.send(mspdiXml);
        
      } else {
        res.status(400).json({ message: "Invalid format. Use 'csv' or 'mspdi'" });
      }
    } catch (err) {
      console.error('Export error:', err);
      res.status(500).json({ message: "Error exporting project" });
    }
  });

  // Project Status Report Email
  app.post('/api/projects/:id/status-report/email', async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const { recipientEmail, executiveSummary, pdfBase64, pdfFileName } = req.body;
      
      if (!recipientEmail) {
        return res.status(400).json({ message: "Recipient email is required" });
      }
      
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied to this project" });
      }
      
      const user = await storage.getUser(userId);
      const tasks = await storage.getTasks(projectId);
      const risks = await storage.getRisks(projectId);
      const issues = await storage.getIssues(projectId);
      const milestones = await storage.getMilestones(projectId);
      const financials = await storage.getProjectFinancials(projectId);
      const changeRequests = await storage.getChangeRequests(projectId);
      const documents = await storage.getProjectDocuments(projectId);
      
      const completed = tasks.filter(t => t.status === "Completed" || t.progress === 100).length;
      const inProgress = tasks.filter(t => t.status === "In Progress").length;
      const notStarted = tasks.filter(t => t.status === "Not Started" || (!t.status && t.progress === 0)).length;
      const total = tasks.length || 1;
      
      const budget = financials.reduce((sum, f) => sum + parseFloat(f.budgetAmount || "0"), 0);
      const actual = financials.reduce((sum, f) => sum + parseFloat(f.actualAmount || "0"), 0);
      const planned = financials.reduce((sum, f) => sum + parseFloat(f.plannedAmount || "0"), 0);
      const projectBudget = parseFloat(project.budget?.toString() || "0");
      const totalBudget = budget > 0 ? budget : projectBudget;
      const forecast = planned > 0 ? planned : totalBudget;
      const variance = totalBudget - actual;
      
      const allOpenRisks = risks.filter(r => r.status === "Open" && !r.deletedAt);
      const allOpenIssues = issues.filter(i => (i.status === "Open" || i.status === "In Progress") && !i.deletedAt);
      const openRisks = allOpenRisks.slice(0, 5);
      const openIssues = allOpenIssues.slice(0, 5);
      const riskHigh = allOpenRisks.filter(r => r.impact === "High" || r.probability === "High").length;
      const issueCritical = allOpenIssues.filter(i => i.priority === "Critical" || i.priority === "High").length;
      
      const majorMilestones = milestones
        .filter(m => !m.deletedAt)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 6);
      
      const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(value);
      };
      
      const formatDate = (date: string | null | Date) => {
        if (!date) return 'Not set';
        return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      };
      
      const getHealthColor = (value: string | null) => {
        switch (value) {
          case "Green": return "#22c55e";
          case "Yellow": return "#eab308";
          case "Red": return "#ef4444";
          default: return "#22c55e";
        }
      };
      
      const getMilestoneStatus = (ms: typeof milestones[0]) => {
        if (ms.completed || ms.status === "Done") return { text: "Complete", color: "#16a34a" };
        const dueDate = new Date(ms.dueDate);
        const today = new Date();
        if (dueDate < today) return { text: "At Risk", color: "#dc2626" };
        return { text: "On Track", color: "#6b7280" };
      };
      
      const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Status Report - ${project.name}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 0; background: #f3f4f6;">
  <!--[if mso]>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="background-color: #1e3a5f; padding: 30px; text-align: center;">
  <![endif]-->
  <div style="background-color: #1e3a5f; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff !important; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px; mso-line-height-rule: exactly;">PROJECT STATUS REPORT</h1>
    <p style="color: #cbd5e1 !important; margin: 10px 0 0 0; font-size: 14px; mso-line-height-rule: exactly;">${reportDate}</p>
    <p style="color: #f97316 !important; margin: 6px 0 0 0; font-size: 18px; font-weight: 600; mso-line-height-rule: exactly;">${project.name}</p>
  </div>
  <!--[if mso]>
      </td>
    </tr>
  </table>
  <![endif]-->
  
  <div style="background: #ffffff; padding: 30px;">
    
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td width="50%" style="vertical-align: top; padding-right: 15px;">
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Executive Summary</h2>
          <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 13px;">${executiveSummary || project.description || 'No executive summary provided.'}</p>
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Project Schedule</h2>
          <div style="margin-bottom: 24px;">
            <div style="margin-bottom: 10px;">
              <span style="font-size: 12px; color: #374151;">Complete (${Math.round((completed / total) * 100)}%)</span>
              <div style="background: #e5e7eb; border-radius: 4px; height: 8px; margin-top: 4px;">
                <div style="background: #3b82f6; border-radius: 4px; height: 8px; width: ${(completed / total) * 100}%;"></div>
              </div>
            </div>
            <div style="margin-bottom: 10px;">
              <span style="font-size: 12px; color: #374151;">In Progress (${Math.round((inProgress / total) * 100)}%)</span>
              <div style="background: #e5e7eb; border-radius: 4px; height: 8px; margin-top: 4px;">
                <div style="background: #3b82f6; border-radius: 4px; height: 8px; width: ${(inProgress / total) * 100}%;"></div>
              </div>
            </div>
            <div>
              <span style="font-size: 12px; color: #374151;">Not Started (${Math.round((notStarted / total) * 100)}%)</span>
              <div style="background: #e5e7eb; border-radius: 4px; height: 8px; margin-top: 4px;">
                <div style="background: #3b82f6; border-radius: 4px; height: 8px; width: ${(notStarted / total) * 100}%;"></div>
              </div>
            </div>
          </div>
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Financials</h2>
          <table width="100%" style="margin-bottom: 24px; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0; color: #374151;">Budget</td>
              <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #1f2937;">${formatCurrency(totalBudget)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #374151;">Actual</td>
              <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #1f2937;">${formatCurrency(actual)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #374151;">Forecast</td>
              <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #1f2937;">${formatCurrency(forecast)}</td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0 4px 0; color: #374151; font-weight: 600;">Variance</td>
              <td style="padding: 8px 0 4px 0; text-align: right; font-weight: 600; color: ${variance < 0 ? '#dc2626' : '#16a34a'};">${formatCurrency(variance)}</td>
            </tr>
          </table>
          
        </td>
        <td width="50%" style="vertical-align: top; padding-left: 15px;">
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Project Health</h2>
          <table width="100%" style="margin-bottom: 24px; text-align: center;">
            <tr>
              <td style="padding: 8px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${getHealthColor(project.health)}; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 16px;">✓</span>
                </div>
                <span style="font-size: 11px; color: #6b7280;">Overall</span>
              </td>
              <td style="padding: 8px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${getHealthColor(project.health)}; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 16px;">✓</span>
                </div>
                <span style="font-size: 11px; color: #6b7280;">Schedule</span>
              </td>
              <td style="padding: 8px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${actual > totalBudget ? '#ef4444' : '#22c55e'}; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 16px;">✓</span>
                </div>
                <span style="font-size: 11px; color: #6b7280;">Budget</span>
              </td>
              <td style="padding: 8px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${riskHigh > 2 ? '#ef4444' : riskHigh > 0 ? '#eab308' : '#22c55e'}; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 16px;">!</span>
                </div>
                <span style="font-size: 11px; color: #6b7280;">Risk</span>
              </td>
            </tr>
          </table>
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Key Risks & Issues</h2>
          <div style="margin-bottom: 12px;">
            <table width="100%" style="margin-bottom: 12px;">
              <tr>
                <td width="50%" style="background: #fef3c7; border-radius: 4px; padding: 8px; text-align: center;">
                  <div style="font-size: 18px; font-weight: 700; color: #d97706;">${allOpenRisks.length}</div>
                  <div style="font-size: 10px; color: #92400e;">Open Risks</div>
                </td>
                <td width="50%" style="background: #fee2e2; border-radius: 4px; padding: 8px; text-align: center;">
                  <div style="font-size: 18px; font-weight: 700; color: #dc2626;">${allOpenIssues.length}</div>
                  <div style="font-size: 10px; color: #991b1b;">Open Issues</div>
                </td>
              </tr>
            </table>
            <p style="font-size: 11px; color: #6b7280; margin: 0 0 12px 0;">High/Critical: <span style="color: #dc2626; font-weight: 600;">${riskHigh + issueCritical}</span></p>
          </div>
          <div style="margin-bottom: 24px;">
            ${openRisks.length === 0 && openIssues.length === 0 
              ? '<p style="color: #6b7280; font-size: 13px; margin: 0;">No open risks or issues</p>'
              : [...openRisks.map(r => ({...r, itemType: 'RISK', itemPriority: r.impact})), ...openIssues.map(i => ({...i, itemType: 'ISSUE', itemPriority: i.priority}))].slice(0, 5).map(item => `
                <div style="display: flex; align-items: center; margin-bottom: 6px; padding: 4px 0; border-bottom: 1px solid #f3f4f6;">
                  <span style="background: ${item.itemType === 'RISK' ? '#fef3c7' : '#fee2e2'}; color: ${item.itemType === 'RISK' ? '#d97706' : '#dc2626'}; font-size: 8px; padding: 2px 6px; border-radius: 2px; margin-right: 8px; font-weight: 600;">${item.itemType}</span>
                  <span style="font-size: 12px; color: #374151; flex: 1;">${item.title || ''}</span>
                  <span style="background: ${item.itemPriority === 'High' || item.itemPriority === 'Critical' ? '#fee2e2' : item.itemPriority === 'Medium' ? '#fef3c7' : '#f3f4f6'}; color: ${item.itemPriority === 'High' || item.itemPriority === 'Critical' ? '#dc2626' : item.itemPriority === 'Medium' ? '#d97706' : '#6b7280'}; font-size: 9px; padding: 2px 6px; border-radius: 2px;">${item.itemPriority || 'Medium'}</span>
                </div>
              `).join('')
            }
          </div>
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Major Milestones</h2>
          ${majorMilestones.length === 0 
            ? '<p style="color: #6b7280; font-size: 13px; margin: 0 0 24px 0;">No milestones defined</p>'
            : `<table width="100%" style="margin-bottom: 24px; font-size: 12px;">
                ${majorMilestones.map(ms => {
                  const status = getMilestoneStatus(ms);
                  return `
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                      <td style="padding: 6px 0; color: #374151;">${ms.title}</td>
                      <td style="padding: 6px 0; color: #6b7280;">${formatDate(ms.dueDate)}</td>
                      <td style="padding: 6px 0; text-align: right; color: ${status.color};">${status.text}</td>
                    </tr>
                  `;
                }).join('')}
              </table>`
          }
          
        </td>
      </tr>
    </table>
    
    <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 8px 0; color: #1f2937; font-size: 14px;">Project Timeline</h3>
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #4b5563;">
        ${formatDate(project.startDate)} → ${formatDate(project.endDate)}
      </p>
      <div style="background: #e5e7eb; border-radius: 4px; height: 12px;">
        <div style="background: #3b82f6; border-radius: 4px; height: 12px; width: ${project.completionPercentage || 0}%;"></div>
      </div>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280;">${project.completionPercentage || 0}% Complete</p>
    </div>
    
    <div style="display: flex; gap: 8px; margin-bottom: 24px;">
      <span style="background: #e5e7eb; color: #374151; padding: 4px 12px; border-radius: 4px; font-size: 12px;">${project.status}</span>
      <span style="background: ${project.priority === 'Critical' ? '#fef2f2' : '#e5e7eb'}; color: ${project.priority === 'Critical' ? '#dc2626' : '#374151'}; padding: 4px 12px; border-radius: 4px; font-size: 12px;">${project.priority}</span>
    </div>
    
    ${changeRequests.length > 0 ? `
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 12px 0; color: #1f2937; font-size: 14px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Change Requests (${changeRequests.length})</h3>
      <table width="100%" style="font-size: 12px;">
        ${changeRequests.slice(0, 5).map(cr => {
          const statusColor = cr.status === 'approved' ? '#16a34a' : cr.status === 'rejected' ? '#dc2626' : '#6b7280';
          return `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px 0; color: #374151;">${cr.title || 'Untitled'}</td>
            <td style="padding: 6px 0; color: #6b7280; text-transform: capitalize;">${(cr.type || 'scope').replace('_', ' ')}</td>
            <td style="padding: 6px 0; text-align: right; color: ${statusColor}; text-transform: capitalize;">${(cr.status || 'pending').replace('_', ' ')}</td>
          </tr>
          `;
        }).join('')}
      </table>
      ${changeRequests.length > 5 ? `<p style="margin: 8px 0 0 0; font-size: 11px; color: #6b7280; font-style: italic;">+ ${changeRequests.length - 5} more change requests</p>` : ''}
    </div>
    ` : ''}
    
    ${documents.length > 0 ? `
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 12px 0; color: #1f2937; font-size: 14px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Project Documents (${documents.length})</h3>
      <table width="100%" style="font-size: 12px;">
        ${documents.slice(0, 5).map(doc => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px 0; color: #374151;">${doc.title || 'Untitled'}</td>
            <td style="padding: 6px 0; color: #6b7280; text-transform: capitalize;">${(doc.category || 'general').replace('_', ' ')}</td>
            <td style="padding: 6px 0; text-align: right; color: #6b7280;">v${doc.version || '1.0'}</td>
          </tr>
        `).join('')}
      </table>
      ${documents.length > 5 ? `<p style="margin: 8px 0 0 0; font-size: 11px; color: #6b7280; font-style: italic;">+ ${documents.length - 5} more documents</p>` : ''}
    </div>
    ` : ''}
    
    <table width="100%" cellpadding="0" cellspacing="8" style="margin-bottom: 16px;">
      <tr>
        <td width="25%" style="background: #f9fafb; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #3b82f6;">${tasks.length}</div>
          <div style="font-size: 11px; color: #6b7280;">Total Tasks</div>
        </td>
        <td width="25%" style="background: #f9fafb; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #22c55e;">${Math.round((completed / total) * 100)}%</div>
          <div style="font-size: 11px; color: #6b7280;">Complete</div>
        </td>
        <td width="25%" style="background: #f9fafb; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #3b82f6;">${milestones.filter(m => !m.deletedAt).length}</div>
          <div style="font-size: 11px; color: #6b7280;">Milestones</div>
        </td>
        <td width="25%" style="background: #f9fafb; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">${allOpenRisks.length + allOpenIssues.length}</div>
          <div style="font-size: 11px; color: #6b7280;">Open Items</div>
        </td>
      </tr>
    </table>
    
  </div>
  
  <div style="padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
    <p style="color: #9ca3af; font-size: 11px; margin: 0;">Generated by FridayReport.AI on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
  </div>
</body>
</html>
`;
      
      const textContent = `
PROJECT STATUS REPORT
${project.name}
${reportDate}

EXECUTIVE SUMMARY
${executiveSummary || project.description || 'No executive summary provided.'}

PROJECT SCHEDULE
- Complete: ${Math.round((completed / total) * 100)}%
- In Progress: ${Math.round((inProgress / total) * 100)}%
- Not Started: ${Math.round((notStarted / total) * 100)}%

FINANCIALS
- Budget: ${formatCurrency(totalBudget)}
- Actual: ${formatCurrency(actual)}
- Forecast: ${formatCurrency(forecast)}
- Variance: ${formatCurrency(variance)}

PROJECT HEALTH
- Overall: ${project.health || 'Green'}
- Budget Status: ${actual > totalBudget ? 'Over Budget' : 'On Budget'}

KEY RISKS & ISSUES
${openRisks.length === 0 && openIssues.length === 0 
  ? '- No open risks or issues'
  : [...openRisks, ...openIssues].map(item => `- ${'title' in item ? item.title : ''}`).join('\n')
}

MAJOR MILESTONES
${majorMilestones.length === 0 
  ? '- No milestones defined'
  : majorMilestones.map(ms => {
      const status = getMilestoneStatus(ms);
      return `- ${ms.title} (${formatDate(ms.dueDate)}) - ${status.text}`;
    }).join('\n')
}

PROJECT TIMELINE
${formatDate(project.startDate)} → ${formatDate(project.endDate)}
${project.completionPercentage || 0}% Complete

Status: ${project.status} | Priority: ${project.priority}

${changeRequests.length > 0 ? `CHANGE REQUESTS (${changeRequests.length})
${changeRequests.slice(0, 5).map(cr => `- ${cr.title || 'Untitled'} (${(cr.type || 'scope').replace('_', ' ')}) - ${(cr.status || 'pending').replace('_', ' ')}`).join('\n')}
${changeRequests.length > 5 ? `+ ${changeRequests.length - 5} more change requests` : ''}
` : ''}
${documents.length > 0 ? `PROJECT DOCUMENTS (${documents.length})
${documents.slice(0, 5).map(doc => `- ${doc.title || 'Untitled'} (${(doc.category || 'general').replace('_', ' ')}) - v${doc.version || '1.0'}`).join('\n')}
${documents.length > 5 ? `+ ${documents.length - 5} more documents` : ''}
` : ''}
SUMMARY STATISTICS
- Total Tasks: ${tasks.length}
- Completion: ${Math.round((completed / total) * 100)}%
- Milestones: ${milestones.filter(m => !m.deletedAt).length}
- Open Items: ${allOpenRisks.length + allOpenIssues.length}

---
Generated by FridayReport.AI
`;

      // Build email with optional PDF attachment
      const attachments = pdfBase64 ? [{
        filename: pdfFileName || `${project.name}_Comprehensive_Status_Report.pdf`,
        content: pdfBase64,
        contentType: 'application/pdf',
      }] : undefined;
      
      const success = await sendEmail({
        to: recipientEmail,
        subject: `Project Status Report: ${project.name} - ${reportDate}`,
        text: textContent,
        html: htmlContent,
        attachments,
      });
      
      if (success) {
        // Get ISO week number for weekly tracking
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
        
        // Save status report history
        const openRisksCount = risks.filter(r => r.status === "Open" && !r.deletedAt).length;
        const openIssuesCount = issues.filter(i => (i.status === "Open" || i.status === "In Progress") && !i.deletedAt).length;
        const completedMilestonesCount = milestones.filter(m => (m.completed || m.status === "Done") && !m.deletedAt).length;
        const totalMilestonesCount = milestones.filter(m => !m.deletedAt).length;
        
        await storage.createStatusReportHistory({
          projectId,
          organizationId: project.organizationId ?? null,
          reportDate: now.toISOString().split('T')[0],
          weekNumber,
          yearNumber: now.getFullYear(),
          executiveSummary: executiveSummary || project.description || null,
          reportType: 'weekly',
          recipientEmail,
          sentAt: now,
          pdfFileName: pdfFileName || `${project.name}_Comprehensive_Status_Report.pdf`,
          projectHealth: project.health || 'Green',
          projectStatus: project.status,
          completionPercentage: project.completionPercentage || 0,
          totalBudget: totalBudget.toString(),
          actualSpent: actual.toString(),
          forecastAmount: forecast.toString(),
          openRisksCount,
          openIssuesCount,
          completedMilestonesCount,
          totalMilestonesCount,
          createdBy: userId,
          createdByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        });
        
        res.json({ success: true, message: `Status report sent to ${recipientEmail}` });
      } else {
        res.status(500).json({ message: "Failed to send email. Please check email configuration." });
      }
    } catch (err) {
      console.error('Error sending status report email:', err);
      res.status(500).json({ message: "Error sending status report" });
    }
  });

  // Get Status Report History for a project
  app.get('/api/projects/:id/status-report/history', async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied to this project" });
      }
      
      const history = await storage.getStatusReportHistory(projectId);
      res.json(history);
    } catch (err) {
      console.error('Error fetching status report history:', err);
      res.status(500).json({ message: "Error fetching status report history" });
    }
  });

  // --- Risks ---
  app.get(api.risks.list.path, async (req, res) => {
    const risks = await storage.getRisks(Number(req.params.projectId));
    res.json(risks);
  });

  app.post(api.risks.create.path, async (req, res) => {
    try {
      const input = api.risks.create.input.parse(req.body);
      const risk = await storage.createRisk(input);
      
      // Log change
      const userId = getUserIdFromRequest(req);
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createRiskChangeLog({
        riskId: risk.id,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'created',
        changeSummary: `Risk "${risk.title}" created`,
        previousValues: null,
        newValues: JSON.stringify(risk),
      });
      
      res.status(201).json(risk);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.risks.update.path, async (req, res) => {
    try {
      const riskId = Number(req.params.id);
      const existing = await storage.getRisk(riskId);
      if (!existing) return res.status(404).json({ message: "Risk not found" });
      
      const input = api.risks.update.input.parse(req.body);
      const updated = await storage.updateRisk(riskId, input);
      
      // Track changes
      const trackedFields = ['title', 'description', 'probability', 'impact', 'status', 'mitigation', 'owner'];
      const changes: string[] = [];
      const prevValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};
      
      for (const field of trackedFields) {
        const prev = (existing as any)[field];
        const curr = (updated as any)[field];
        if (String(prev ?? '') !== String(curr ?? '')) {
          changes.push(`${field}: "${prev || '(empty)'}" → "${curr || '(empty)'}"`);
          prevValues[field] = prev;
          newValues[field] = curr;
        }
      }
      
      if (changes.length > 0) {
        const userId = getUserIdFromRequest(req);
        const user = userId ? await storage.getUser(userId) : null;
        await storage.createRiskChangeLog({
          riskId,
          changedBy: userId || null,
          changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
          changeType: 'updated',
          changeSummary: changes.join('; '),
          previousValues: JSON.stringify(prevValues),
          newValues: JSON.stringify(newValues),
        });
      }
      
      res.json(updated);
    } catch (err) {
       if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
       res.status(500).json({ message: "Error" });
    }
  });

  app.delete(api.risks.delete.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    await storage.softDeleteItem('risk', Number(req.params.id), userId);
    res.status(204).send();
  });

  // Risk History
  app.get(api.risks.getHistory.path, async (req, res) => {
    try {
      const riskId = Number(req.params.id);
      const risk = await storage.getRisk(riskId);
      if (!risk) return res.status(404).json({ message: "Risk not found" });
      
      const history = await storage.getRiskChangeLogs(riskId);
      res.json(history);
    } catch (err) {
      res.status(500).json({ message: "Error fetching risk history" });
    }
  });

  // --- Milestones ---
  app.get(api.milestones.list.path, async (req, res) => {
    const milestones = await storage.getMilestones(Number(req.params.projectId));
    res.json(milestones);
  });

  app.post(api.milestones.create.path, async (req, res) => {
    try {
      const input = api.milestones.create.input.parse(req.body);
      const milestone = await storage.createMilestone(input);
      res.status(201).json(milestone);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.milestones.update.path, async (req, res) => {
    try {
      const input = api.milestones.update.input.parse(req.body);
      const updated = await storage.updateMilestone(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Error" });
    }
  });

  app.delete(api.milestones.delete.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    await storage.softDeleteItem('milestone', Number(req.params.id), userId);
    res.status(204).send();
  });

  // --- Issues ---
  app.get(api.issues.list.path, async (req, res) => {
    const issues = await storage.getIssues(Number(req.params.projectId));
    res.json(issues);
  });

  app.get(api.issues.listAll.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    
    // Deny access if user is not a member of any organization
    if (!await userHasAnyOrgAccess(userId)) {
      return res.json([]);
    }
    
    // Get user's accessible org IDs and filter issues by project's organization
    const accessibleOrgIds = await getUserOrgIds(userId);
    const allIssues = await storage.getAllIssues();
    
    // Get all projects to determine which issues belong to accessible orgs
    const allProjects = await storage.getProjects();
    const accessibleProjectIds = new Set(
      allProjects
        .filter(p => p.organizationId === null || accessibleOrgIds.includes(p.organizationId))
        .map(p => p.id)
    );
    
    const filteredIssues = allIssues.filter(issue => accessibleProjectIds.has(issue.projectId));
    res.json(filteredIssues);
  });

  app.post(api.issues.create.path, async (req, res) => {
    try {
      const input = api.issues.create.input.parse(req.body);
      const issue = await storage.createIssue(input);
      
      // Log change
      const userId = getUserIdFromRequest(req);
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createIssueChangeLog({
        issueId: issue.id,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'created',
        changeSummary: `Issue "${issue.title}" created`,
        previousValues: null,
        newValues: JSON.stringify(issue),
      });
      
      res.status(201).json(issue);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.issues.update.path, async (req, res) => {
    try {
      const issueId = Number(req.params.id);
      const existing = await storage.getIssue(issueId);
      if (!existing) return res.status(404).json({ message: "Issue not found" });
      
      const input = api.issues.update.input.parse(req.body);
      const updated = await storage.updateIssue(issueId, input);
      
      // Track changes
      const trackedFields = ['title', 'description', 'priority', 'status', 'type', 'assignee'];
      const changes: string[] = [];
      const prevValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};
      
      for (const field of trackedFields) {
        const prev = (existing as any)[field];
        const curr = (updated as any)[field];
        if (String(prev ?? '') !== String(curr ?? '')) {
          changes.push(`${field}: "${prev || '(empty)'}" → "${curr || '(empty)'}"`);
          prevValues[field] = prev;
          newValues[field] = curr;
        }
      }
      
      if (changes.length > 0) {
        const userId = getUserIdFromRequest(req);
        const user = userId ? await storage.getUser(userId) : null;
        await storage.createIssueChangeLog({
          issueId,
          changedBy: userId || null,
          changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
          changeType: 'updated',
          changeSummary: changes.join('; '),
          previousValues: JSON.stringify(prevValues),
          newValues: JSON.stringify(newValues),
        });
      }
      
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Error updating issue" });
    }
  });

  app.delete(api.issues.delete.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    await storage.softDeleteItem('issue', Number(req.params.id), userId);
    res.status(204).send();
  });

  // Issue History
  app.get(api.issues.getHistory.path, async (req, res) => {
    try {
      const issueId = Number(req.params.id);
      const issue = await storage.getIssue(issueId);
      if (!issue) return res.status(404).json({ message: "Issue not found" });
      
      const history = await storage.getIssueChangeLogs(issueId);
      res.json(history);
    } catch (err) {
      res.status(500).json({ message: "Error fetching issue history" });
    }
  });

  // --- Tasks ---
  app.get(api.tasks.list.path, async (req, res) => {
    const tasks = await storage.getTasks(Number(req.params.projectId));
    res.json(tasks);
  });

  app.get(api.tasks.listAll.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    
    // Deny access if user is not a member of any organization
    if (!await userHasAnyOrgAccess(userId)) {
      return res.json([]);
    }
    
    // Get user's accessible org IDs and filter tasks by project's organization
    const accessibleOrgIds = await getUserOrgIds(userId);
    const allTasks = await storage.getAllTasks();
    
    // Get all projects to determine which tasks belong to accessible orgs
    const allProjects = await storage.getProjects();
    const accessibleProjectIds = new Set(
      allProjects
        .filter(p => p.organizationId === null || accessibleOrgIds.includes(p.organizationId))
        .map(p => p.id)
    );
    
    const filteredTasks = allTasks.filter(task => accessibleProjectIds.has(task.projectId));
    res.json(filteredTasks);
  });

  app.post(api.tasks.create.path, async (req, res) => {
    try {
      const input = api.tasks.create.input.parse(req.body);
      
      // Calculate endDate from duration if provided
      if (input.durationDays && input.startDate) {
        const startDate = new Date(input.startDate);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + input.durationDays - 1);
        input.endDate = endDate.toISOString().split('T')[0];
      }
      
      const task = await storage.createTask(input);
      
      // Log the creation
      const userId = getUserIdFromRequest(req);
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createTaskChangeLog({
        taskId: task.id,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'created',
        changeSummary: `Task "${task.name}" created`,
        previousValues: null,
        newValues: JSON.stringify(task),
      });
      
      res.status(201).json(task);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.tasks.update.path, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const previousTask = await storage.getTask(taskId);
      if (!previousTask) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const input = api.tasks.update.input.parse(req.body);
      
      // Calculate endDate from duration if provided and startDate is available
      if (input.durationDays !== undefined) {
        const startDate = input.startDate || previousTask.startDate;
        if (startDate) {
          const start = new Date(startDate);
          const endDate = new Date(start);
          endDate.setDate(endDate.getDate() + input.durationDays - 1);
          input.endDate = endDate.toISOString().split('T')[0];
        }
      }
      
      const updated = await storage.updateTask(taskId, input);
      
      // Build change summary
      const changes: string[] = [];
      const prevValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};
      
      const fieldsToTrack = ['name', 'description', 'startDate', 'endDate', 'durationDays', 'progress', 'status', 'assignee'];
      for (const field of fieldsToTrack) {
        const prev = (previousTask as any)[field];
        const curr = (updated as any)[field];
        if (prev !== curr) {
          changes.push(`${field}: "${prev || '(empty)'}" → "${curr || '(empty)'}"`);
          prevValues[field] = prev;
          newValues[field] = curr;
        }
      }
      
      if (changes.length > 0) {
        const userId = getUserIdFromRequest(req);
        const user = userId ? await storage.getUser(userId) : null;
        await storage.createTaskChangeLog({
          taskId,
          changedBy: userId || null,
          changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
          changeType: 'updated',
          changeSummary: changes.join('; '),
          previousValues: JSON.stringify(prevValues),
          newValues: JSON.stringify(newValues),
        });
      }
      
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Error updating task" });
    }
  });

  app.delete(api.tasks.delete.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    await storage.softDeleteItem('task', Number(req.params.id), userId);
    res.status(204).send();
  });

  // Task History
  app.get(api.tasks.getHistory.path, async (req, res) => {
    const taskId = Number(req.params.id);
    const history = await storage.getTaskChangeLogs(taskId);
    res.json(history);
  });

  // Task Dependencies
  app.get(api.tasks.getDependencies.path, async (req, res) => {
    const taskId = Number(req.params.id);
    const dependencies = await storage.getTaskDependencies(taskId);
    res.json(dependencies);
  });

  app.post(api.tasks.addDependency.path, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const { dependsOnTaskId } = api.tasks.addDependency.input.parse(req.body);
      
      // Prevent self-dependency
      if (taskId === dependsOnTaskId) {
        return res.status(400).json({ message: "A task cannot depend on itself" });
      }
      
      const dependency = await storage.createTaskDependency({
        taskId,
        dependsOnTaskId,
      });
      res.status(201).json(dependency);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Error adding dependency" });
    }
  });

  app.delete(api.tasks.removeDependency.path, async (req, res) => {
    const taskId = Number(req.params.id);
    const dependsOnTaskId = Number(req.params.dependsOnTaskId);
    await storage.deleteTaskDependency(taskId, dependsOnTaskId);
    res.status(204).send();
  });

  // Project Financials
  app.get(api.projectFinancials.list.path, async (req, res) => {
    const projectId = Number(req.params.projectId);
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const financials = await storage.getProjectFinancials(projectId);
    res.json(financials);
  });

  app.get(api.projectFinancials.get.path, async (req, res) => {
    const id = Number(req.params.id);
    const financial = await storage.getProjectFinancial(id);
    if (!financial) return res.status(404).json({ message: "Financial record not found" });
    res.json(financial);
  });

  app.post(api.projectFinancials.create.path, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      const input = api.projectFinancials.create.input.parse(req.body);
      const financial = await storage.createProjectFinancial({ ...input, projectId });
      res.status(201).json(financial);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Error creating financial record" });
    }
  });

  app.put(api.projectFinancials.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getProjectFinancial(id);
      if (!existing) return res.status(404).json({ message: "Financial record not found" });
      
      const updates = api.projectFinancials.update.input.parse(req.body);
      const updated = await storage.updateProjectFinancial(id, updates);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Error updating financial record" });
    }
  });

  app.delete(api.projectFinancials.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getProjectFinancial(id);
    if (!existing) return res.status(404).json({ message: "Financial record not found" });
    await storage.deleteProjectFinancial(id);
    res.status(204).send();
  });

  // ==================== COST ITEMS (Financial Grid) ====================

  // Get all cost items for a project (optionally filtered by fiscal year)
  app.get('/api/projects/:projectId/cost-items', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const items = await storage.getCostItems(projectId, fiscalYear);
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Error fetching cost items" });
    }
  });

  // Get a single cost item
  app.get('/api/cost-items/:id', async (req, res) => {
    const item = await storage.getCostItem(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Cost item not found" });
    res.json(item);
  });

  // Create a cost item
  app.post('/api/projects/:projectId/cost-items', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      const { name, parentId, wbs, comments, category, fiscalYear, aopTotal, fcstTotal, actTotal,
        fcstM1, fcstM2, fcstM3, fcstM4, fcstM5, fcstM6, fcstM7, fcstM8, fcstM9, fcstM10, fcstM11, fcstM12,
        actM1, actM2, actM3, actM4, actM5, actM6, actM7, actM8, actM9, actM10, actM11, actM12,
        sortOrder } = req.body;
      
      if (!name || !fiscalYear) {
        return res.status(400).json({ message: "name and fiscalYear are required" });
      }
      
      const item = await storage.createCostItem({
        projectId,
        parentId: parentId || null,
        name,
        wbs,
        comments,
        category,
        fiscalYear,
        aopTotal,
        fcstTotal,
        actTotal,
        fcstM1, fcstM2, fcstM3, fcstM4, fcstM5, fcstM6, fcstM7, fcstM8, fcstM9, fcstM10, fcstM11, fcstM12,
        actM1, actM2, actM3, actM4, actM5, actM6, actM7, actM8, actM9, actM10, actM11, actM12,
        sortOrder: sortOrder || 0,
      });
      res.status(201).json(item);
    } catch (err) {
      console.error("Error creating cost item:", err);
      res.status(500).json({ message: "Error creating cost item" });
    }
  });

  // Update a cost item
  app.put('/api/cost-items/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getCostItem(id);
      if (!existing) return res.status(404).json({ message: "Cost item not found" });
      
      const updated = await storage.updateCostItem(id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating cost item:", err);
      res.status(500).json({ message: "Error updating cost item" });
    }
  });

  // Delete a cost item
  app.delete('/api/cost-items/:id', async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getCostItem(id);
    if (!existing) return res.status(404).json({ message: "Cost item not found" });
    await storage.deleteCostItem(id);
    res.status(204).send();
  });

  // ==================== RESOURCES ====================
  
  // Get all resources for an organization
  app.get('/api/resources', async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const resourceList = await storage.getResources(organizationId);
      res.json(resourceList);
    } catch (err) {
      res.status(500).json({ message: "Error fetching resources" });
    }
  });

  // Get a single resource
  app.get('/api/resources/:id', async (req, res) => {
    const resource = await storage.getResource(Number(req.params.id));
    if (!resource) return res.status(404).json({ message: "Resource not found" });
    res.json(resource);
  });

  // Create a resource
  app.post('/api/resources', async (req, res) => {
    try {
      const { organizationId, displayName, email, title, department, skills, hourlyRate, isActive, notes } = req.body;
      if (!organizationId || !displayName) {
        return res.status(400).json({ message: "organizationId and displayName are required" });
      }
      const resource = await storage.createResource({
        organizationId,
        displayName,
        email,
        title,
        department,
        skills,
        hourlyRate,
        isActive,
        notes
      });
      res.status(201).json(resource);
    } catch (err) {
      res.status(500).json({ message: "Error creating resource" });
    }
  });

  // Update a resource
  app.put('/api/resources/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getResource(id);
      if (!existing) return res.status(404).json({ message: "Resource not found" });
      
      const updated = await storage.updateResource(id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Error updating resource" });
    }
  });

  // Delete a resource
  app.delete('/api/resources/:id', async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getResource(id);
    if (!existing) return res.status(404).json({ message: "Resource not found" });
    await storage.deleteResource(id);
    res.status(204).send();
  });

  // ==================== TASK RESOURCE ASSIGNMENTS ====================
  
  // Get assignments for a task
  app.get('/api/tasks/:taskId/resources', async (req, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const assignments = await storage.getTaskResourceAssignments(taskId);
      res.json(assignments);
    } catch (err) {
      res.status(500).json({ message: "Error fetching task assignments" });
    }
  });

  // Update assignments for a task (replace all)
  app.put('/api/tasks/:taskId/resources', async (req, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const { resourceIds } = req.body;
      if (!Array.isArray(resourceIds)) {
        return res.status(400).json({ message: "resourceIds must be an array" });
      }
      await storage.updateTaskResourceAssignments(taskId, resourceIds);
      const assignments = await storage.getTaskResourceAssignments(taskId);
      res.json(assignments);
    } catch (err) {
      res.status(500).json({ message: "Error updating task assignments" });
    }
  });

  // ==================== ISSUE RESOURCE ASSIGNMENTS ====================
  
  // Get assignments for an issue
  app.get('/api/issues/:issueId/resources', async (req, res) => {
    try {
      const issueId = Number(req.params.issueId);
      const assignments = await storage.getIssueResourceAssignments(issueId);
      res.json(assignments);
    } catch (err) {
      res.status(500).json({ message: "Error fetching issue assignments" });
    }
  });

  // Update assignments for an issue (replace all)
  app.put('/api/issues/:issueId/resources', async (req, res) => {
    try {
      const issueId = Number(req.params.issueId);
      const { resourceIds } = req.body;
      if (!Array.isArray(resourceIds)) {
        return res.status(400).json({ message: "resourceIds must be an array" });
      }
      await storage.updateIssueResourceAssignments(issueId, resourceIds);
      const assignments = await storage.getIssueResourceAssignments(issueId);
      res.json(assignments);
    } catch (err) {
      res.status(500).json({ message: "Error updating issue assignments" });
    }
  });

  // ==================== RISK RESOURCE ASSIGNMENTS ====================
  
  // Get assignments for a risk
  app.get('/api/risks/:riskId/resources', async (req, res) => {
    try {
      const riskId = Number(req.params.riskId);
      const assignments = await storage.getRiskResourceAssignments(riskId);
      res.json(assignments);
    } catch (err) {
      res.status(500).json({ message: "Error fetching risk assignments" });
    }
  });

  // Update assignments for a risk (replace all)
  app.put('/api/risks/:riskId/resources', async (req, res) => {
    try {
      const riskId = Number(req.params.riskId);
      const { resourceIds } = req.body;
      if (!Array.isArray(resourceIds)) {
        return res.status(400).json({ message: "resourceIds must be an array" });
      }
      await storage.updateRiskResourceAssignments(riskId, resourceIds);
      const assignments = await storage.getRiskResourceAssignments(riskId);
      res.json(assignments);
    } catch (err) {
      res.status(500).json({ message: "Error updating risk assignments" });
    }
  });

  // Demo Data Generation (Org Admin or Super Admin)
  app.get('/api/demo-data/industries', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    const user = userId ? await storage.getUser(userId) : null;
    
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const isSuperAdmin = user.role === 'super_admin';
    if (!isSuperAdmin) {
      const memberships = await storage.getUserOrganizations(user.id);
      const isAnyOrgAdmin = memberships.some(m => m.role === 'org_admin');
      if (!isAnyOrgAdmin) {
        return res.status(403).json({ message: 'Organization Admin access required' });
      }
    }
    
    const { industryTemplates } = await import('./demo-data-templates');
    const industries = Object.entries(industryTemplates).map(([key, template]) => ({
      id: key,
      label: template.label,
      description: template.description,
    }));
    
    res.json(industries);
  });

  app.post('/api/demo-data/generate', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    const user = userId ? await storage.getUser(userId) : null;
    
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const { organizationId, industry, customIndustry } = req.body;
    
    if (!organizationId) {
      return res.status(400).json({ message: 'organizationId is required' });
    }
    
    if (!industry && !customIndustry) {
      return res.status(400).json({ message: 'industry or customIndustry is required' });
    }
    
    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }
    
    const isSuperAdmin = user.role === 'super_admin';
    const memberships = await storage.getUserOrganizations(user.id);
    const isOrgAdmin = memberships.some(m => m.organizationId === organizationId && m.role === 'org_admin');
    
    if (!isSuperAdmin && !isOrgAdmin) {
      return res.status(403).json({ message: 'Organization Admin access required' });
    }
    
    try {
      const { industryTemplates } = await import('./demo-data-templates');
      type IndustryType = keyof typeof industryTemplates;
      let template = industry ? industryTemplates[industry as IndustryType] : null;
      
      if (customIndustry && !template) {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });
        
        const prompt = `Generate realistic project portfolio demo data for a company in the "${customIndustry}" industry. 
        
Create a JSON object with this exact structure:
{
  "portfolios": [
    {
      "name": "Portfolio Name",
      "description": "Portfolio description",
      "projects": [
        {
          "name": "Project Name",
          "description": "Project description",
          "status": "Planning|Initiation|Execution|Monitoring|Closing",
          "priority": "Low|Medium|High|Critical",
          "budget": "500000",
          "health": "Green|Yellow|Red",
          "completionPercentage": 45,
          "tasks": [
            { "name": "Task name", "description": "Task description", "progress": 80, "status": "Not Started|In Progress|Completed|On Hold", "assignee": "Person Name" }
          ],
          "risks": [
            { "title": "Risk title", "description": "Risk description", "probability": "Low|Medium|High", "impact": "Low|Medium|High|Critical", "status": "Open|Mitigated|Closed", "mitigationPlan": "Mitigation strategy" }
          ],
          "milestones": [
            { "title": "Milestone title", "description": "Description", "dueDaysFromNow": 30, "completed": false, "status": "Backlog|In Progress|Done", "priority": "Low|Medium|High|Critical", "assignee": "Person Name" }
          ],
          "issues": [
            { "title": "Issue title", "description": "Description", "priority": "Low|Medium|High|Critical", "status": "Open|In Progress|Resolved|Closed", "type": "Bug|Task|Enhancement", "assignee": "Person Name" }
          ],
          "financials": [
            { "category": "CapEx|OpEx", "lineItem": "Line item name", "description": "Description", "budgetAmount": "100000", "plannedAmount": "90000", "actualAmount": "45000", "notes": "Notes" }
          ]
        }
      ]
    }
  ]
}

Create 2 portfolios with 2-3 projects each. Make project names, tasks, risks, milestones, and issues realistic for the ${customIndustry} industry. Include realistic budget amounts and varied project statuses.`;

        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a project portfolio management expert. Generate realistic demo data for project management systems. Return only valid JSON." },
              { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            max_completion_tokens: 4000,
          });
          
          const content = response.choices[0]?.message?.content || '{}';
          template = JSON.parse(content);
        } catch (aiError) {
          console.error('AI demo data generation error:', aiError);
          template = industryTemplates['it_software'];
        }
      }
      
      if (!template) {
        return res.status(400).json({ message: 'Invalid industry' });
      }
      
      const stats = {
        portfolios: 0,
        projects: 0,
        tasks: 0,
        risks: 0,
        milestones: 0,
        issues: 0,
        financials: 0,
      };
      
      const sanitizeBudget = (value: any) => {
        if (typeof value === 'number') return String(value);
        if (typeof value === 'string') return value.replace(/,/g, '');
        return '0';
      };
      
      const today = new Date();
      
      for (const portfolioTemplate of template.portfolios) {
        const portfolio = await storage.createPortfolio({
          organizationId,
          name: portfolioTemplate.name,
          description: portfolioTemplate.description,
          isDemo: true,
        });
        stats.portfolios++;
        
        for (const projectTemplate of portfolioTemplate.projects) {
          const startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 60);
          const endDate = new Date(today);
          endDate.setDate(endDate.getDate() + 180);
          
          const project = await storage.createProject({
            organizationId,
            portfolioId: portfolio.id,
            name: projectTemplate.name,
            description: projectTemplate.description,
            status: projectTemplate.status,
            priority: projectTemplate.priority,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            budget: sanitizeBudget(projectTemplate.budget),
            health: projectTemplate.health,
            completionPercentage: projectTemplate.completionPercentage,
            isDemo: true,
          });
          stats.projects++;
          
          for (const taskTemplate of projectTemplate.tasks) {
            const taskStart = new Date(today);
            taskStart.setDate(taskStart.getDate() - 30);
            const taskEnd = new Date(today);
            taskEnd.setDate(taskEnd.getDate() + 60);
            
            await storage.createTask({
              projectId: project.id,
              name: taskTemplate.name,
              description: taskTemplate.description,
              startDate: taskStart.toISOString().split('T')[0],
              endDate: taskEnd.toISOString().split('T')[0],
              durationDays: 90,
              progress: taskTemplate.progress,
              status: taskTemplate.status,
              assignee: taskTemplate.assignee,
              isDemo: true,
            });
            stats.tasks++;
          }
          
          for (const riskTemplate of projectTemplate.risks) {
            await storage.createRisk({
              projectId: project.id,
              title: riskTemplate.title,
              description: riskTemplate.description,
              probability: riskTemplate.probability,
              impact: riskTemplate.impact,
              status: riskTemplate.status,
              mitigationPlan: riskTemplate.mitigationPlan,
              isDemo: true,
            });
            stats.risks++;
          }
          
          for (const milestoneTemplate of projectTemplate.milestones) {
            const dueDate = new Date(today);
            dueDate.setDate(dueDate.getDate() + milestoneTemplate.dueDaysFromNow);
            const startDateMs = new Date(dueDate);
            startDateMs.setDate(startDateMs.getDate() - 30);
            
            await storage.createMilestone({
              projectId: project.id,
              title: milestoneTemplate.title,
              description: milestoneTemplate.description,
              dueDate: dueDate.toISOString().split('T')[0],
              startDate: startDateMs.toISOString().split('T')[0],
              completed: milestoneTemplate.completed,
              status: milestoneTemplate.status,
              priority: milestoneTemplate.priority,
              assignee: milestoneTemplate.assignee,
              isDemo: true,
            });
            stats.milestones++;
          }
          
          for (const issueTemplate of projectTemplate.issues) {
            await storage.createIssue({
              projectId: project.id,
              title: issueTemplate.title,
              description: issueTemplate.description,
              priority: issueTemplate.priority,
              status: issueTemplate.status,
              type: issueTemplate.type,
              assignee: issueTemplate.assignee,
              isDemo: true,
            });
            stats.issues++;
          }
          
          for (const finTemplate of projectTemplate.financials) {
            await storage.createProjectFinancial({
              projectId: project.id,
              category: finTemplate.category,
              lineItem: finTemplate.lineItem,
              description: finTemplate.description,
              fiscalYear: today.getFullYear(),
              fiscalPeriod: 'Full Year',
              budgetAmount: sanitizeBudget(finTemplate.budgetAmount),
              plannedAmount: sanitizeBudget(finTemplate.plannedAmount),
              actualAmount: sanitizeBudget(finTemplate.actualAmount),
              notes: finTemplate.notes,
              isDemo: true,
            });
            stats.financials++;
          }
        }
      }
      
      res.json({
        success: true,
        message: `Demo data generated for ${org.name}`,
        stats,
      });
    } catch (err) {
      console.error('Error generating demo data:', err);
      res.status(500).json({ message: 'Failed to generate demo data' });
    }
  });

  app.delete('/api/demo-data/:organizationId', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    const user = userId ? await storage.getUser(userId) : null;
    
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const organizationId = Number(req.params.organizationId);
    if (!organizationId) {
      return res.status(400).json({ message: 'Organization ID is required' });
    }
    
    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }
    
    const isSuperAdmin = user.role === 'super_admin';
    const memberships = await storage.getUserOrganizations(user.id);
    const isOrgAdmin = memberships.some(m => m.organizationId === organizationId && m.role === 'org_admin');
    
    if (!isSuperAdmin && !isOrgAdmin) {
      return res.status(403).json({ message: 'Organization Admin access required' });
    }
    
    try {
      const stats = await storage.deleteAllDemoDataForOrganization(organizationId);
      res.json({
        success: true,
        message: `Demo data removed from ${org.name}`,
        stats,
      });
    } catch (err) {
      console.error('Error removing demo data:', err);
      res.status(500).json({ message: 'Failed to remove demo data' });
    }
  });

  // ==================== PROJECT INTAKES ====================

  // Get all project intakes for an organization
  app.get('/api/project-intakes', async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const intakes = await storage.getProjectIntakes(organizationId);
      res.json(intakes);
    } catch (err) {
      console.error("Error fetching project intakes:", err);
      res.status(500).json({ message: "Error fetching project intakes" });
    }
  });

  // Get a single project intake
  app.get('/api/project-intakes/:id', async (req, res) => {
    try {
      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
      const intake = await storage.getProjectIntake(Number(req.params.id));
      if (!intake) return res.status(404).json({ message: "Project intake not found" });
      
      // If organizationId is provided, validate the intake belongs to that organization
      if (organizationId && intake.organizationId !== organizationId) {
        return res.status(404).json({ message: "Project intake not found in this organization" });
      }
      
      res.json(intake);
    } catch (err) {
      console.error("Error fetching project intake:", err);
      res.status(500).json({ message: "Error fetching project intake" });
    }
  });

  // Create a new project intake
  app.post('/api/project-intakes', async (req, res) => {
    try {
      const { 
        organizationId, projectName, submitterId, description, fundingSource,
        portfolioId, businessUnit, programName
      } = req.body;
      
      if (!organizationId || !projectName) {
        return res.status(400).json({ message: "organizationId and projectName are required" });
      }

      const intake = await storage.createProjectIntake({
        organizationId,
        projectName,
        submitterId,
        description,
        fundingSource,
        portfolioId,
        businessUnit,
        programName,
        status: 'draft',
        currentStep: 'intake_capture',
      });
      res.status(201).json(intake);
    } catch (err) {
      console.error("Error creating project intake:", err);
      res.status(500).json({ message: "Error creating project intake" });
    }
  });

  // Update a project intake
  app.put('/api/project-intakes/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const id = Number(req.params.id);
      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });
      
      // Check user has access to the organization this intake belongs to
      if (existing.organizationId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(existing.organizationId)) {
          return res.status(403).json({ message: "You don't have access to this organization" });
        }
      }
      
      const updated = await storage.updateProjectIntake(id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating project intake:", err);
      res.status(500).json({ message: "Error updating project intake" });
    }
  });

  // Delete a project intake
  app.delete('/api/project-intakes/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const id = Number(req.params.id);
      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });
      
      // Check user has access to the organization this intake belongs to
      if (existing.organizationId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(existing.organizationId)) {
          return res.status(403).json({ message: "You don't have access to this organization" });
        }
      }
      
      await storage.deleteProjectIntake(id);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting project intake:", err);
      res.status(500).json({ message: "Error deleting project intake" });
    }
  });

  // Approve a project intake and create project
  app.post('/api/project-intakes/:id/approve', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });
      
      if (existing.status === 'approved') {
        return res.status(400).json({ message: "Project intake is already approved" });
      }

      const project = await storage.approveProjectIntake(id, userId);
      res.json({ 
        message: "Project intake approved and project created",
        project 
      });
    } catch (err) {
      console.error("Error approving project intake:", err);
      res.status(500).json({ message: "Error approving project intake" });
    }
  });

  // Reject a project intake
  app.post('/api/project-intakes/:id/reject', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { reason } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });
      
      const updated = await storage.updateProjectIntake(id, {
        status: 'rejected',
        rejectedAt: new Date(),
        rejectedBy: userId,
        rejectionReason: reason,
      });
      
      res.json(updated);
    } catch (err) {
      console.error("Error rejecting project intake:", err);
      res.status(500).json({ message: "Error rejecting project intake" });
    }
  });

  // ==================== MPP IMPORTS ====================
  
  // Get all MPP imports for an organization
  app.get('/api/mpp-imports', async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (isNaN(organizationId)) {
        return res.status(400).json({ message: "Organization ID required" });
      }
      const imports = await storage.getMppImports(organizationId);
      res.json(imports);
    } catch (err) {
      console.error("Error fetching MPP imports:", err);
      res.status(500).json({ message: "Error fetching MPP imports" });
    }
  });

  // Get tasks for a specific import
  app.get('/api/mpp-imports/:id/tasks', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const tasks = await storage.getMppImportTasks(id);
      res.json(tasks);
    } catch (err) {
      console.error("Error fetching MPP import tasks:", err);
      res.status(500).json({ message: "Error fetching tasks" });
    }
  });

  // Upload and parse MPP file (XML or CSV)
  app.post('/api/mpp-imports/upload', upload.single('file'), async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const organizationId = Number(req.body.organizationId);
      
      if (isNaN(organizationId)) {
        return res.status(400).json({ message: "Organization ID required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileName = req.file.originalname;
      const fileContent = req.file.buffer.toString('utf-8');
      const fileExt = fileName.split('.').pop()?.toLowerCase();
      
      let parsedTasks: Array<{
        taskId?: number;
        wbs?: string;
        taskName: string;
        startDate?: string;
        finishDate?: string;
        duration?: string;
        durationDays?: number;
        percentComplete?: number;
        outlineLevel?: number;
        parentTaskId?: number;
        isSummary?: boolean;
        isMilestone?: boolean;
        notes?: string;
      }> = [];

      if (fileExt === 'mpp') {
        parsedTasks = parseMppFile(req.file.buffer);
      } else if (fileExt === 'xml') {
        parsedTasks = await parseXmlMspdi(fileContent);
      } else if (fileExt === 'csv') {
        parsedTasks = parseCsv(fileContent);
      } else {
        return res.status(400).json({ message: "Unsupported file format. Use MPP, XML, or CSV." });
      }

      // Create the import record
      const mppImport = await storage.createMppImport({
        organizationId,
        fileName,
        fileType: fileExt || 'unknown',
        importedBy: userId,
        taskCount: parsedTasks.length,
        status: 'active',
      });

      // Create task records
      if (parsedTasks.length > 0) {
        const taskRecords = parsedTasks.map(task => ({
          importId: mppImport.id,
          taskId: task.taskId,
          wbs: task.wbs,
          taskName: task.taskName,
          startDate: task.startDate,
          finishDate: task.finishDate,
          duration: task.duration,
          durationDays: task.durationDays,
          percentComplete: task.percentComplete || 0,
          outlineLevel: task.outlineLevel || 1,
          parentTaskId: task.parentTaskId,
          isSummary: task.isSummary || false,
          isMilestone: task.isMilestone || false,
          notes: task.notes,
        }));
        await storage.createMppImportTasks(taskRecords);
      }

      res.json({
        ...mppImport,
        taskCount: parsedTasks.length,
      });
    } catch (err: any) {
      console.error("Error uploading MPP file:", err);
      const errorMessage = err.message || "Error processing file";
      res.status(500).json({ message: errorMessage });
    }
  });

  // Convert MPP import to a project with tasks
  app.post('/api/mpp-imports/:id/convert', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, portfolioId, description, status, priority } = req.body;
      
      // Get the import to verify it exists and get organizationId
      const mppImport = await storage.getMppImport(id);
      if (!mppImport) {
        return res.status(404).json({ message: "Import not found" });
      }
      
      if (mppImport.projectId) {
        return res.status(400).json({ message: "This import has already been converted to a project" });
      }
      
      if (!name) {
        return res.status(400).json({ message: "Project name is required" });
      }
      
      const result = await storage.convertMppImportToProject(id, {
        organizationId: mppImport.organizationId,
        portfolioId: portfolioId ? Number(portfolioId) : undefined,
        name,
        description,
        status,
        priority,
      });
      
      res.json({
        success: true,
        project: result.project,
        taskCount: result.taskCount,
        message: `Created project "${result.project.name}" with ${result.taskCount} tasks`,
      });
    } catch (err) {
      console.error("Error converting MPP import:", err);
      res.status(500).json({ message: "Error converting import to project" });
    }
  });

  // Sync MPP import to an existing project (update tasks)
  app.post('/api/mpp-imports/:id/sync', async (req, res) => {
    try {
      console.log("MPP Sync request:", { params: req.params, body: req.body });
      
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        console.log("MPP Sync: No userId");
        return res.status(401).json({ message: "Authentication required" });
      }

      const id = Number(req.params.id);
      const { projectId, syncMode } = req.body;
      
      console.log("MPP Sync: parsed values", { id, projectId, syncMode });
      
      if (!projectId) {
        console.log("MPP Sync: No projectId");
        return res.status(400).json({ message: "projectId is required" });
      }

      // Get the import to verify it exists
      const mppImport = await storage.getMppImport(id);
      if (!mppImport) {
        console.log("MPP Sync: Import not found");
        return res.status(404).json({ message: "Import not found" });
      }

      // Get the target project to verify it exists and user has access
      const project = await storage.getProject(Number(projectId));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Verify user has access to both the import's org and the project's org
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(mppImport.organizationId)) {
        return res.status(403).json({ message: "Access denied to import's organization" });
      }
      if (project.organizationId && !accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied to project's organization" });
      }

      // Ensure import and project belong to the same organization
      if (project.organizationId && mppImport.organizationId !== project.organizationId) {
        return res.status(400).json({ message: "Import and project must belong to the same organization" });
      }

      // Validate syncMode
      const validSyncModes = ['merge', 'replace'];
      if (syncMode && !validSyncModes.includes(syncMode)) {
        return res.status(400).json({ message: "syncMode must be 'merge' or 'replace'" });
      }

      console.log("MPP Sync: Starting sync operation");
      const result = await storage.syncMppImportToProject(id, Number(projectId), {
        syncMode: syncMode || 'merge',
      });

      console.log("MPP Sync: Completed", { 
        projectName: result.project?.name, 
        tasksAdded: result.tasksAdded, 
        tasksUpdated: result.tasksUpdated 
      });

      const response = {
        success: true,
        project: result.project,
        tasksAdded: result.tasksAdded,
        tasksUpdated: result.tasksUpdated,
        tasksRemoved: result.tasksRemoved,
        message: `Synced to "${result.project.name}": ${result.tasksAdded} added, ${result.tasksUpdated} updated, ${result.tasksRemoved} removed`,
      };
      
      return res.json(response);
    } catch (err: any) {
      console.error("Error syncing MPP import to project:", err?.message || err);
      return res.status(500).json({ message: err?.message || "Error syncing import to project" });
    }
  });

  // Delete an MPP import
  app.delete('/api/mpp-imports/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteMppImport(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting MPP import:", err);
      res.status(500).json({ message: "Error deleting import" });
    }
  });

  // =========== CHANGE REQUESTS ===========
  
  // Get all change requests for a project
  app.get('/api/projects/:projectId/change-requests', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const changeRequests = await storage.getChangeRequests(projectId);
      res.json(changeRequests);
    } catch (err) {
      console.error("Error fetching change requests:", err);
      res.status(500).json({ message: "Error fetching change requests" });
    }
  });

  // Create a change request
  app.post('/api/projects/:projectId/change-requests', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      const changeRequest = await storage.createChangeRequest({
        ...req.body,
        projectId,
        requestedBy: userId,
      });
      res.status(201).json(changeRequest);
    } catch (err) {
      console.error("Error creating change request:", err);
      res.status(500).json({ message: "Error creating change request" });
    }
  });

  // Update a change request
  app.patch('/api/change-requests/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const updates = { ...req.body };
      
      // Track who reviewed/approved if status is changing to those states
      if (updates.status === 'approved' || updates.status === 'rejected') {
        updates.reviewedBy = userId;
        updates.reviewedAt = new Date();
      }
      if (updates.status === 'implemented') {
        updates.implementedAt = new Date();
      }
      
      const changeRequest = await storage.updateChangeRequest(id, updates);
      res.json(changeRequest);
    } catch (err) {
      console.error("Error updating change request:", err);
      res.status(500).json({ message: "Error updating change request" });
    }
  });

  // Delete a change request
  app.delete('/api/change-requests/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteChangeRequest(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting change request:", err);
      res.status(500).json({ message: "Error deleting change request" });
    }
  });

  // =========== PROJECT DOCUMENTS ===========
  
  // Get all documents for a project
  app.get('/api/projects/:projectId/documents', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const documents = await storage.getProjectDocuments(projectId);
      res.json(documents);
    } catch (err) {
      console.error("Error fetching project documents:", err);
      res.status(500).json({ message: "Error fetching documents" });
    }
  });

  // Create a document record (metadata only - actual file upload handled separately)
  app.post('/api/projects/:projectId/documents', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      const document = await storage.createProjectDocument({
        ...req.body,
        projectId,
        uploadedBy: userId,
      });
      res.status(201).json(document);
    } catch (err) {
      console.error("Error creating project document:", err);
      res.status(500).json({ message: "Error creating document" });
    }
  });

  // Update a document
  app.patch('/api/documents/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const document = await storage.updateProjectDocument(id, req.body);
      res.json(document);
    } catch (err) {
      console.error("Error updating document:", err);
      res.status(500).json({ message: "Error updating document" });
    }
  });

  // Delete a document
  app.delete('/api/documents/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteProjectDocument(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting document:", err);
      res.status(500).json({ message: "Error deleting document" });
    }
  });

  // =========== PROJECT COMMENTS ===========
  
  // Get all comments for a project
  app.get('/api/projects/:projectId/comments', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const projectId = Number(req.params.projectId);
      
      // Verify project exists and user has access
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      if (userId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(project.organizationId)) {
          return res.status(404).json({ message: "Project not found" });
        }
      }
      
      const comments = await storage.getProjectComments(projectId);
      res.json(comments);
    } catch (err) {
      console.error("Error fetching project comments:", err);
      res.status(500).json({ message: "Error fetching comments" });
    }
  });

  // Create a comment for a project (supports replies via parentId and @mentions)
  app.post('/api/projects/:projectId/comments', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Verify project exists and user has access
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Validate content
      const content = req.body.content?.trim();
      if (!content || content.length === 0) {
        return res.status(400).json({ message: "Comment content is required" });
      }
      
      const parentId = req.body.parentId ? Number(req.body.parentId) : null;
      
      // Parse @mentions from content (match @username patterns)
      const mentionRegex = /@(\w+(?:\.\w+)*(?:@[\w.-]+)?)/g;
      const mentionMatches = content.match(mentionRegex) || [];
      const mentionedUsernames = mentionMatches.map((m: string) => m.substring(1)); // Remove @ prefix
      
      // Find mentioned users by username or email
      const allUsers = await storage.getAllUsers();
      const mentionedUsers = allUsers.filter(u => 
        mentionedUsernames.some((mention: string) => 
          u.username?.toLowerCase() === mention.toLowerCase() ||
          u.email?.toLowerCase() === mention.toLowerCase()
        )
      );
      const mentionedUserIds = mentionedUsers.map(u => u.id);
      
      const user = await storage.getUser(userId);
      const authorName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.username || user?.email || 'Unknown';
      
      const comment = await storage.createProjectComment({
        projectId,
        parentId,
        authorId: userId,
        authorName,
        content,
        mentions: mentionedUserIds.length > 0 ? mentionedUserIds : null,
      });
      
      // Create notifications for mentioned users
      for (const mentionedUser of mentionedUsers) {
        if (mentionedUser.id !== userId) { // Don't notify self
          await storage.createNotification({
            userId: mentionedUser.id,
            type: 'mention',
            title: 'You were mentioned in a comment',
            message: `${authorName} mentioned you in a comment on "${project.name}"`,
            projectId,
            commentId: comment.id,
            fromUserId: userId,
            fromUserName: authorName,
          });
        }
      }
      
      // If this is a reply, also notify the parent comment author
      if (parentId) {
        const parentComment = await storage.getProjectComment(parentId);
        if (parentComment && parentComment.authorId && parentComment.authorId !== userId) {
          // Check if we already notified this user via mention
          if (!mentionedUserIds.includes(parentComment.authorId)) {
            await storage.createNotification({
              userId: parentComment.authorId,
              type: 'comment_reply',
              title: 'Someone replied to your comment',
              message: `${authorName} replied to your comment on "${project.name}"`,
              projectId,
              commentId: comment.id,
              fromUserId: userId,
              fromUserName: authorName,
            });
          }
        }
      }
      
      res.status(201).json(comment);
    } catch (err) {
      console.error("Error creating project comment:", err);
      res.status(500).json({ message: "Error creating comment" });
    }
  });

  // Delete a comment
  app.delete('/api/comments/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = Number(req.params.id);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get the comment and verify org access through the project
      const comment = await storage.getProjectComment(id);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      const project = await storage.getProject(comment.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.deleteProjectComment(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting comment:", err);
      res.status(500).json({ message: "Error deleting comment" });
    }
  });

  // =========== NOTIFICATIONS ===========
  
  // Get all notifications for the current user
  app.get('/api/notifications', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const notifications = await storage.getNotifications(userId);
      res.json(notifications);
    } catch (err) {
      console.error("Error fetching notifications:", err);
      res.status(500).json({ message: "Error fetching notifications" });
    }
  });

  // Get unread notification count
  app.get('/api/notifications/unread-count', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (err) {
      console.error("Error fetching notification count:", err);
      res.status(500).json({ message: "Error fetching notification count" });
    }
  });

  // Mark a notification as read
  app.patch('/api/notifications/:id/read', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const id = Number(req.params.id);
      await storage.markNotificationRead(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error marking notification as read:", err);
      res.status(500).json({ message: "Error marking notification as read" });
    }
  });

  // Mark all notifications as read
  app.patch('/api/notifications/read-all', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error marking all notifications as read:", err);
      res.status(500).json({ message: "Error marking all notifications as read" });
    }
  });

  // =========== INTAKE WORKFLOW CONFIGURATION ===========

  // Get intake workflow steps for an organization
  app.get('/api/organizations/:orgId/intake-workflow', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const orgId = Number(req.params.orgId);
      
      // Check user has access to the organization
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      
      let steps = await storage.getIntakeWorkflowSteps(orgId);
      
      // If no steps exist, initialize with defaults
      if (steps.length === 0) {
        steps = await storage.resetIntakeWorkflowToDefaults(orgId);
      }
      
      res.json(steps);
    } catch (err) {
      console.error("Error fetching intake workflow:", err);
      res.status(500).json({ message: "Error fetching intake workflow configuration" });
    }
  });

  // Update intake workflow steps for an organization
  app.put('/api/organizations/:orgId/intake-workflow', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const orgId = Number(req.params.orgId);
      
      // Check user has access to the organization
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      
      // Validate the steps array
      const { steps } = req.body;
      if (!Array.isArray(steps)) {
        return res.status(400).json({ message: "Steps must be an array" });
      }
      
      // Validate each step has required fields
      for (const step of steps) {
        if (!step.stepKey || !step.label || step.position === undefined) {
          return res.status(400).json({ message: "Each step must have stepKey, label, and position" });
        }
      }
      
      const updatedSteps = await storage.upsertIntakeWorkflowSteps(orgId, steps);
      res.json(updatedSteps);
    } catch (err) {
      console.error("Error updating intake workflow:", err);
      res.status(500).json({ message: "Error updating intake workflow configuration" });
    }
  });

  // Reset intake workflow to defaults
  app.post('/api/organizations/:orgId/intake-workflow/reset', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const orgId = Number(req.params.orgId);
      
      // Check user has access to the organization
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      
      const steps = await storage.resetIntakeWorkflowToDefaults(orgId);
      res.json(steps);
    } catch (err) {
      console.error("Error resetting intake workflow:", err);
      res.status(500).json({ message: "Error resetting intake workflow configuration" });
    }
  });

  // =========== AI PROJECT GENERATION ===========
  
  // Generate a project with tasks, issues, and risks using AI
  app.post('/api/ai/generate-project', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require authentication
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const { prompt, organizationId, portfolioId } = req.body;
      
      if (!prompt || !organizationId) {
        return res.status(400).json({ message: "Prompt and organizationId are required" });
      }
      
      // Check user has access to the specified organization
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      
      const systemPrompt = `You are a project management expert. Based on the user's project description, generate a comprehensive project plan in JSON format.

The response must be valid JSON with this exact structure:
{
  "project": {
    "name": "Project name (max 100 chars)",
    "description": "Detailed project description",
    "status": "Initiation",
    "priority": "Medium",
    "health": "Green",
    "budget": 0
  },
  "tasks": [
    {
      "name": "Task name",
      "description": "Task description",
      "durationDays": 5,
      "status": "Not Started"
    }
  ],
  "issues": [
    {
      "title": "Issue title",
      "description": "Issue description",
      "priority": "Medium",
      "status": "Open",
      "type": "Task"
    }
  ],
  "risks": [
    {
      "title": "Risk title",
      "description": "Risk description",
      "probability": "Medium",
      "impact": "Medium",
      "status": "Open",
      "mitigationPlan": "How to mitigate this risk"
    }
  ]
}

Guidelines:
- Generate 5-10 logical tasks that form a project timeline
- Generate 2-5 potential issues or action items
- Generate 2-4 project risks with mitigation plans
- Use realistic estimates based on the project scope
- Priority can be: Low, Medium, High, Critical
- Task status: Not Started, In Progress, Completed
- Issue type: Bug, Enhancement, Task, Question
- Risk probability/impact: Low, Medium, High

Return ONLY valid JSON, no markdown or explanations.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Create a project plan for: ${prompt}` }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "AI did not return a response" });
      }
      
      let aiResult;
      try {
        aiResult = JSON.parse(content);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content);
        return res.status(500).json({ message: "Failed to parse AI response" });
      }
      
      // Calculate dates for tasks
      const today = new Date();
      let currentDate = new Date(today);
      
      // Create project
      const projectData = {
        organizationId,
        portfolioId: portfolioId || null,
        name: aiResult.project.name,
        description: aiResult.project.description,
        status: aiResult.project.status || "Initiation",
        priority: aiResult.project.priority || "Medium",
        health: aiResult.project.health || "Green",
        budget: String(aiResult.project.budget || 0),
        startDate: today.toISOString().split('T')[0],
        source: "ai_generated",
      };
      
      const project = await storage.createProject(projectData);
      
      // Create tasks with sequential dates
      const createdTasks = [];
      for (const taskData of aiResult.tasks || []) {
        const startDate = new Date(currentDate);
        const durationDays = taskData.durationDays || 5;
        const endDate = new Date(currentDate);
        endDate.setDate(endDate.getDate() + durationDays);
        
        const task = await storage.createTask({
          projectId: project.id,
          name: taskData.name,
          description: taskData.description,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          durationDays,
          status: taskData.status || "Not Started",
          progress: 0,
        });
        createdTasks.push(task);
        
        // Move current date forward for next task
        currentDate = new Date(endDate);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Update project end date based on last task
      if (createdTasks.length > 0) {
        const lastTask = createdTasks[createdTasks.length - 1];
        await storage.updateProject(project.id, {
          endDate: lastTask.endDate,
        });
      }
      
      // Create issues
      const createdIssues = [];
      for (const issueData of aiResult.issues || []) {
        const issue = await storage.createIssue({
          projectId: project.id,
          title: issueData.title,
          description: issueData.description,
          priority: issueData.priority || "Medium",
          status: issueData.status || "Open",
          type: issueData.type || "Task",
        });
        createdIssues.push(issue);
      }
      
      // Create risks
      const createdRisks = [];
      for (const riskData of aiResult.risks || []) {
        const risk = await storage.createRisk({
          projectId: project.id,
          title: riskData.title,
          description: riskData.description,
          probability: riskData.probability || "Medium",
          impact: riskData.impact || "Medium",
          status: riskData.status || "Open",
          mitigationPlan: riskData.mitigationPlan,
        });
        createdRisks.push(risk);
      }
      
      res.json({
        success: true,
        project,
        tasks: createdTasks,
        issues: createdIssues,
        risks: createdRisks,
        summary: {
          tasksCreated: createdTasks.length,
          issuesCreated: createdIssues.length,
          risksCreated: createdRisks.length,
        }
      });
    } catch (err) {
      console.error("Error generating AI project:", err);
      res.status(500).json({ message: "Failed to generate project with AI" });
    }
  });

  // Delete all demo data for an organization (SuperAdmin only)
  app.delete('/api/demo-data/:organizationId', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    const user = userId ? await storage.getUser(userId) : null;
    
    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Super Admin access required' });
    }
    
    const organizationId = parseInt(req.params.organizationId);
    
    if (isNaN(organizationId)) {
      return res.status(400).json({ message: 'Invalid organization ID' });
    }
    
    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }
    
    try {
      const stats = await storage.deleteAllDemoDataForOrganization(organizationId);
      
      res.json({
        success: true,
        message: `All demo data removed from ${org.name}`,
        stats,
      });
    } catch (err) {
      console.error('Error deleting demo data:', err);
      res.status(500).json({ message: 'Failed to delete demo data' });
    }
  });

  // ==================== ANALYTICS API (Power BI Integration) ====================

  // Analytics: Projects flat data for Power BI
  app.get('/api/analytics/projects', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
      
      // Get user's accessible organizations
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (accessibleOrgIds.length === 0) {
        return res.json([]);
      }

      // If specific org requested, validate access
      if (organizationId && !accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const targetOrgIds = organizationId ? [organizationId] : accessibleOrgIds;
      
      // Fetch projects for all accessible organizations
      const allProjects: any[] = [];
      for (const orgId of targetOrgIds) {
        const projects = await storage.getProjects(orgId);
        const portfolios = await storage.getPortfolios(orgId);
        const org = await storage.getOrganization(orgId);
        
        for (const project of projects) {
          const portfolio = portfolios.find(p => p.id === project.portfolioId);
          const tasks = await storage.getTasks(project.id);
          const risks = await storage.getRisks(project.id);
          const issues = await storage.getIssues(project.id);
          const milestones = await storage.getMilestones(project.id);
          
          allProjects.push({
            projectId: project.id,
            projectName: project.name,
            description: project.description,
            status: project.status,
            health: project.health,
            completionPercentage: project.completionPercentage || 0,
            budget: Number(project.budget) || 0,
            startDate: project.startDate,
            endDate: project.endDate,
            projectManager: project.projectManager,
            portfolioId: project.portfolioId,
            portfolioName: portfolio?.name || null,
            organizationId: orgId,
            organizationName: org?.name || null,
            taskCount: tasks.length,
            completedTaskCount: tasks.filter(t => t.status === 'Done').length,
            riskCount: risks.length,
            openRiskCount: risks.filter(r => r.status === 'Open').length,
            highRiskCount: risks.filter(r => r.probability === 'High' || r.impact === 'High').length,
            issueCount: issues.length,
            openIssueCount: issues.filter(i => i.status === 'Open').length,
            milestoneCount: milestones.length,
            completedMilestoneCount: milestones.filter(m => m.completed).length,
            source: project.source || 'manual',
            createdAt: project.createdAt,
          });
        }
      }

      res.json(allProjects);
    } catch (err) {
      console.error("Error fetching analytics projects:", err);
      res.status(500).json({ message: "Error fetching analytics data" });
    }
  });

  // Analytics: Portfolios summary for Power BI
  app.get('/api/analytics/portfolios', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
      const accessibleOrgIds = await getUserOrgIds(userId);
      
      if (accessibleOrgIds.length === 0) {
        return res.json([]);
      }

      if (organizationId && !accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const targetOrgIds = organizationId ? [organizationId] : accessibleOrgIds;
      
      const allPortfolios: any[] = [];
      for (const orgId of targetOrgIds) {
        const portfolios = await storage.getPortfolios(orgId);
        const projects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);
        
        for (const portfolio of portfolios) {
          const portfolioProjects = projects.filter(p => p.portfolioId === portfolio.id);
          const totalBudget = portfolioProjects.reduce((sum, p) => sum + (Number(p.budget) || 0), 0);
          const avgCompletion = portfolioProjects.length > 0 
            ? Math.round(portfolioProjects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / portfolioProjects.length)
            : 0;
          
          allPortfolios.push({
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            description: portfolio.description,
            strategy: portfolio.strategy,
            organizationId: orgId,
            organizationName: org?.name || null,
            projectCount: portfolioProjects.length,
            healthyProjectCount: portfolioProjects.filter(p => p.health === 'Green').length,
            atRiskProjectCount: portfolioProjects.filter(p => p.health === 'Yellow').length,
            criticalProjectCount: portfolioProjects.filter(p => p.health === 'Red').length,
            totalBudget,
            avgCompletion,
            createdAt: portfolio.createdAt,
          });
        }
      }

      res.json(allPortfolios);
    } catch (err) {
      console.error("Error fetching analytics portfolios:", err);
      res.status(500).json({ message: "Error fetching analytics data" });
    }
  });

  // Analytics: Risks flat data for Power BI
  app.get('/api/analytics/risks', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
      const accessibleOrgIds = await getUserOrgIds(userId);
      
      if (accessibleOrgIds.length === 0) {
        return res.json([]);
      }

      if (organizationId && !accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const targetOrgIds = organizationId ? [organizationId] : accessibleOrgIds;
      
      const allRisks: any[] = [];
      for (const orgId of targetOrgIds) {
        const projects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);
        
        for (const project of projects) {
          const risks = await storage.getRisks(project.id);
          
          for (const risk of risks) {
            allRisks.push({
              riskId: risk.id,
              title: risk.title,
              description: risk.description,
              probability: risk.probability,
              impact: risk.impact,
              status: risk.status,
              mitigationPlan: risk.mitigationPlan,
              owner: risk.owner,
              projectId: project.id,
              projectName: project.name,
              organizationId: orgId,
              organizationName: org?.name || null,
              createdAt: risk.createdAt,
            });
          }
        }
      }

      res.json(allRisks);
    } catch (err) {
      console.error("Error fetching analytics risks:", err);
      res.status(500).json({ message: "Error fetching analytics data" });
    }
  });

  // Analytics: Issues flat data for Power BI
  app.get('/api/analytics/issues', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
      const accessibleOrgIds = await getUserOrgIds(userId);
      
      if (accessibleOrgIds.length === 0) {
        return res.json([]);
      }

      if (organizationId && !accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const targetOrgIds = organizationId ? [organizationId] : accessibleOrgIds;
      
      const allIssues: any[] = [];
      for (const orgId of targetOrgIds) {
        const projects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);
        
        for (const project of projects) {
          const issues = await storage.getIssues(project.id);
          
          for (const issue of issues) {
            allIssues.push({
              issueId: issue.id,
              title: issue.title,
              description: issue.description,
              type: issue.type,
              priority: issue.priority,
              status: issue.status,
              assignee: issue.assignee,
              projectId: project.id,
              projectName: project.name,
              organizationId: orgId,
              organizationName: org?.name || null,
              createdAt: issue.createdAt,
            });
          }
        }
      }

      res.json(allIssues);
    } catch (err) {
      console.error("Error fetching analytics issues:", err);
      res.status(500).json({ message: "Error fetching analytics data" });
    }
  });

  // Analytics: Milestones flat data for Power BI
  app.get('/api/analytics/milestones', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
      const accessibleOrgIds = await getUserOrgIds(userId);
      
      if (accessibleOrgIds.length === 0) {
        return res.json([]);
      }

      if (organizationId && !accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const targetOrgIds = organizationId ? [organizationId] : accessibleOrgIds;
      
      const allMilestones: any[] = [];
      for (const orgId of targetOrgIds) {
        const projects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);
        
        for (const project of projects) {
          const milestones = await storage.getMilestones(project.id);
          
          for (const milestone of milestones) {
            allMilestones.push({
              milestoneId: milestone.id,
              title: milestone.title,
              description: milestone.description,
              dueDate: milestone.dueDate,
              completed: milestone.completed,
              projectId: project.id,
              projectName: project.name,
              organizationId: orgId,
              organizationName: org?.name || null,
            });
          }
        }
      }

      res.json(allMilestones);
    } catch (err) {
      console.error("Error fetching analytics milestones:", err);
      res.status(500).json({ message: "Error fetching analytics data" });
    }
  });

  // Analytics: Intakes flat data for Power BI
  app.get('/api/analytics/intakes', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
      const accessibleOrgIds = await getUserOrgIds(userId);
      
      if (accessibleOrgIds.length === 0) {
        return res.json([]);
      }

      if (organizationId && !accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const targetOrgIds = organizationId ? [organizationId] : accessibleOrgIds;
      
      const allIntakes: any[] = [];
      for (const orgId of targetOrgIds) {
        const intakes = await storage.getProjectIntakes(orgId);
        const org = await storage.getOrganization(orgId);
        
        for (const intake of intakes) {
          allIntakes.push({
            intakeId: intake.id,
            projectName: intake.projectName,
            description: intake.description,
            status: intake.status,
            currentStep: intake.currentStep,
            businessUnit: intake.businessUnit,
            programName: intake.programName,
            fundingSource: intake.fundingSource,
            estimatedBudget: intake.estimatedBudget,
            strategicAlignment: intake.strategicAlignment,
            organizationId: orgId,
            organizationName: org?.name || null,
            submitterId: intake.submitterId,
            createdAt: intake.createdAt,
          });
        }
      }

      res.json(allIntakes);
    } catch (err) {
      console.error("Error fetching analytics intakes:", err);
      res.status(500).json({ message: "Error fetching analytics data" });
    }
  });

  // Analytics: Summary metrics for Power BI dashboards
  app.get('/api/analytics/summary', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
      const accessibleOrgIds = await getUserOrgIds(userId);
      
      if (accessibleOrgIds.length === 0) {
        return res.json({ organizations: [] });
      }

      if (organizationId && !accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const targetOrgIds = organizationId ? [organizationId] : accessibleOrgIds;
      
      const summaries: any[] = [];
      for (const orgId of targetOrgIds) {
        const org = await storage.getOrganization(orgId);
        const projects = await storage.getProjects(orgId);
        const portfolios = await storage.getPortfolios(orgId);
        const intakes = await storage.getProjectIntakes(orgId);
        
        let totalRisks = 0, openRisks = 0, highRisks = 0;
        let totalIssues = 0, openIssues = 0;
        let totalMilestones = 0, completedMilestones = 0;
        let totalTasks = 0, completedTasks = 0;
        
        for (const project of projects) {
          const risks = await storage.getRisks(project.id);
          const issues = await storage.getIssues(project.id);
          const milestones = await storage.getMilestones(project.id);
          const tasks = await storage.getTasks(project.id);
          
          totalRisks += risks.length;
          openRisks += risks.filter(r => r.status === 'Open').length;
          highRisks += risks.filter(r => r.probability === 'High' || r.impact === 'High').length;
          totalIssues += issues.length;
          openIssues += issues.filter(i => i.status === 'Open').length;
          totalMilestones += milestones.length;
          completedMilestones += milestones.filter(m => m.completed).length;
          totalTasks += tasks.length;
          completedTasks += tasks.filter(t => t.status === 'Done').length;
        }
        
        const totalBudget = projects.reduce((sum, p) => sum + (Number(p.budget) || 0), 0);
        const avgCompletion = projects.length > 0 
          ? Math.round(projects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / projects.length)
          : 0;
        
        summaries.push({
          organizationId: orgId,
          organizationName: org?.name || null,
          portfolioCount: portfolios.length,
          projectCount: projects.length,
          healthyProjectCount: projects.filter(p => p.health === 'Green').length,
          atRiskProjectCount: projects.filter(p => p.health === 'Yellow').length,
          criticalProjectCount: projects.filter(p => p.health === 'Red').length,
          totalBudget,
          avgCompletion,
          totalRisks,
          openRisks,
          highRisks,
          totalIssues,
          openIssues,
          totalMilestones,
          completedMilestones,
          totalTasks,
          completedTasks,
          intakeCount: intakes.length,
          pendingIntakes: intakes.filter(i => i.status === 'draft' || i.status === 'in_progress').length,
          approvedIntakes: intakes.filter(i => i.status === 'approved').length,
          rejectedIntakes: intakes.filter(i => i.status === 'rejected').length,
          timestamp: new Date().toISOString(),
        });
      }

      res.json({ organizations: summaries });
    } catch (err) {
      console.error("Error fetching analytics summary:", err);
      res.status(500).json({ message: "Error fetching analytics data" });
    }
  });

  // ============= BILLING ROUTES =============
  
  // Get all plans with meter rules
  app.get('/api/billing/plans', async (req, res) => {
    try {
      const { plans, meters, planMeterRules } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const allPlans = await db.select().from(plans).where(eq(plans.isActive, true));
      const allRules = await db
        .select()
        .from(planMeterRules)
        .innerJoin(meters, eq(planMeterRules.meterId, meters.id));
      
      const plansWithRules = allPlans.map(plan => ({
        ...plan,
        meterRules: allRules
          .filter(r => r.plan_meter_rules.planId === plan.id)
          .map(r => ({
            meterCode: r.meters.code,
            meterName: r.meters.name,
            ruleType: r.plan_meter_rules.ruleType,
            includedUnitsMonthly: r.plan_meter_rules.includedUnitsMonthly,
            hardCapUnits: r.plan_meter_rules.hardCapUnits,
            overageUnitPriceMicrocents: r.plan_meter_rules.overageUnitPriceMicrocents,
          })),
      }));
      
      res.json(plansWithRules);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  // Get current user's subscription
  app.get('/api/billing/subscription', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { billingProvider } = await import("./services/billing");
      const { plans } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      let subscription = await billingProvider.getSubscriptionForUser(userId);
      
      if (!subscription) {
        // Auto-create a free subscription for new users
        subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
      }
      
      // Get the plan details
      const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId));
      
      res.json({ ...subscription, plan });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  // Get usage summary
  app.get('/api/billing/usage', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { billingProvider } = await import("./services/billing");
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;
      
      let subscription;
      
      // Try org subscription first if orgId is provided
      if (orgId) {
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
      }
      
      // Fall back to user subscription
      if (!subscription) {
        subscription = await billingProvider.getSubscriptionForUser(userId);
      }
      
      if (!subscription) {
        return res.json({});
      }
      
      const usage = await billingProvider.getUsageSummary(subscription.id);
      res.json(usage);
    } catch (error) {
      console.error("Error fetching usage:", error);
      res.status(500).json({ message: "Failed to fetch usage" });
    }
  });

  // Create subscription
  app.post('/api/billing/subscription', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { planCode } = req.body;
      if (!planCode) {
        return res.status(400).json({ message: "Plan code is required" });
      }
      
      const { billingProvider } = await import("./services/billing");
      
      // Check if user already has a subscription
      const existing = await billingProvider.getSubscriptionForUser(userId);
      if (existing) {
        return res.status(400).json({ message: "User already has a subscription. Use PATCH to change plan." });
      }
      
      const subscription = await billingProvider.createSubscription({ planCode, userId });
      res.json(subscription);
    } catch (error) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  // Change plan
  app.patch('/api/billing/subscription/:id/plan', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const subscriptionId = parseInt(req.params.id);
      const { planCode } = req.body;
      
      if (!planCode) {
        return res.status(400).json({ message: "Plan code is required" });
      }
      
      const { billingProvider } = await import("./services/billing");
      
      const subscription = await billingProvider.changePlan(subscriptionId, planCode, userId);
      res.json(subscription);
    } catch (error) {
      console.error("Error changing plan:", error);
      res.status(500).json({ message: "Failed to change plan" });
    }
  });

  // ============= ADMIN PLAN ROUTES =============

  // Create a new plan (super admin only)
  app.post('/api/admin/plans', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans, meters, planMeterRules, features, planFeatures } = await import("@shared/schema");
      const { code, name, description, monthlyPriceCents, maxSeats } = req.body;

      if (!code || !name) {
        return res.status(400).json({ message: "Code and name are required" });
      }

      const existingPlan = await db.select().from(plans).where(eq(plans.code, code.toUpperCase())).limit(1);
      if (existingPlan.length > 0) {
        return res.status(400).json({ message: "Plan code already exists" });
      }

      const [newPlan] = await db.insert(plans).values({
        code: code.toUpperCase(),
        name,
        description: description || null,
        monthlyPriceCents: monthlyPriceCents || 0,
        maxSeats: maxSeats || null,
        isActive: true,
      }).returning();

      const allMeters = await db.select().from(meters);
      const meterRulesValues: any[] = [];
      
      for (const meter of allMeters) {
        meterRulesValues.push({
          planId: newPlan.id,
          meterId: meter.id,
          ruleType: "INCLUDED_QUOTA",
          includedUnitsMonthly: 10,
          isSharedPool: false,
        });
        meterRulesValues.push({
          planId: newPlan.id,
          meterId: meter.id,
          ruleType: "HARD_CAP",
          hardCapUnits: 10,
          isSharedPool: false,
        });
      }
      
      if (meterRulesValues.length > 0) {
        await db.insert(planMeterRules).values(meterRulesValues);
      }

      const allFeatures = await db.select().from(features);
      if (allFeatures.length > 0) {
        const featureValues = allFeatures.map(f => ({
          planId: newPlan.id,
          featureId: f.id,
          isEnabled: false,
        }));
        await db.insert(planFeatures).values(featureValues);
      }

      res.json(newPlan);
    } catch (error) {
      console.error("Error creating plan:", error);
      res.status(500).json({ message: "Failed to create plan" });
    }
  });

  // Update a plan (super admin only)
  app.put('/api/admin/plans/:id', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans } = await import("@shared/schema");
      const planId = parseInt(req.params.id);
      const { name, description, monthlyPriceCents, maxSeats, isActive } = req.body;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (monthlyPriceCents !== undefined) updates.monthlyPriceCents = monthlyPriceCents;
      if (maxSeats !== undefined) updates.maxSeats = maxSeats;
      if (isActive !== undefined) updates.isActive = isActive;

      const [updated] = await db.update(plans)
        .set(updates)
        .where(eq(plans.id, planId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating plan:", error);
      res.status(500).json({ message: "Failed to update plan" });
    }
  });

  // Delete a plan (super admin only)
  app.delete('/api/admin/plans/:id', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans, planMeterRules, planFeatures, subscriptions } = await import("@shared/schema");
      const planId = parseInt(req.params.id);

      const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.planId, planId)).limit(1);
      if (existingSub) {
        return res.status(400).json({ message: "Cannot delete plan with active subscriptions. Deactivate it instead." });
      }

      await db.delete(planMeterRules).where(eq(planMeterRules.planId, planId));
      await db.delete(planFeatures).where(eq(planFeatures.planId, planId));
      await db.delete(plans).where(eq(plans.id, planId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting plan:", error);
      res.status(500).json({ message: "Failed to delete plan" });
    }
  });

  // Get plan meter rules
  app.get('/api/admin/plans/:id/rules', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { planMeterRules, meters } = await import("@shared/schema");
      const planId = parseInt(req.params.id);

      const rules = await db.select({
        id: planMeterRules.id,
        planId: planMeterRules.planId,
        meterId: planMeterRules.meterId,
        ruleType: planMeterRules.ruleType,
        includedUnitsMonthly: planMeterRules.includedUnitsMonthly,
        hardCapUnits: planMeterRules.hardCapUnits,
        overageUnitPriceMicrocents: planMeterRules.overageUnitPriceMicrocents,
        isSharedPool: planMeterRules.isSharedPool,
        meter: {
          id: meters.id,
          code: meters.code,
          name: meters.name,
          unitLabel: meters.unitLabel,
        }
      })
      .from(planMeterRules)
      .innerJoin(meters, eq(planMeterRules.meterId, meters.id))
      .where(eq(planMeterRules.planId, planId));

      res.json(rules);
    } catch (error) {
      console.error("Error fetching plan rules:", error);
      res.status(500).json({ message: "Failed to fetch plan rules" });
    }
  });

  // Update plan meter rule
  app.put('/api/admin/plans/:planId/rules/:ruleId', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { planMeterRules } = await import("@shared/schema");
      const ruleId = parseInt(req.params.ruleId);
      const { includedUnitsMonthly, hardCapUnits, overageUnitPriceMicrocents } = req.body;

      const updates: any = {};
      if (includedUnitsMonthly !== undefined) updates.includedUnitsMonthly = includedUnitsMonthly;
      if (hardCapUnits !== undefined) updates.hardCapUnits = hardCapUnits;
      if (overageUnitPriceMicrocents !== undefined) updates.overageUnitPriceMicrocents = overageUnitPriceMicrocents;

      const [updated] = await db.update(planMeterRules)
        .set(updates)
        .where(eq(planMeterRules.id, ruleId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating rule:", error);
      res.status(500).json({ message: "Failed to update rule" });
    }
  });

  return httpServer;
}
