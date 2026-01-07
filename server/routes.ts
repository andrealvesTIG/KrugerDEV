import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
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
      'commons-collections4.jar', 'commons-compress.jar', 'log4j-api.jar', 'xmlbeans.jar'
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
    throw new Error('Failed to parse MPP file. Please ensure it is a valid Microsoft Project file.');
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
  
  // Set up authentication first
  await setupAuth(app);
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
    const userId = (req.user as any)?.claims?.sub;
    
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
      const userId = (req.user as any)?.claims?.sub;
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { name, description, hiddenModules } = req.body;
      const updated = await storage.updateOrganization(orgId, { name, description, hiddenModules });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: 'Failed to update organization' });
    }
  });

  app.delete('/api/organizations/:id', async (req, res) => {
    const orgId = Number(req.params.id);
    const userId = (req.user as any)?.claims?.sub;
    
    if (!await userHasOrgAccess(userId, orgId)) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }
    
    await storage.deleteOrganization(orgId);
    res.status(204).send();
  });

  // --- Organization Members ---
  app.get('/api/organizations/:id/members', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub;
      
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
      const currentUserId = (req.user as any)?.claims?.sub;
      
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
      const currentUserId = (req.user as any)?.claims?.sub;
      
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
    const currentUserId = (req.user as any)?.claims?.sub;
    
    if (!await userHasOrgAccess(currentUserId, orgId)) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }
    
    await storage.removeOrganizationMember(orgId, req.params.userId);
    res.status(204).send();
  });

  // --- Recycle Bin ---
  app.get('/api/organizations/:id/recycle-bin', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub;
      
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
      const userId = (req.user as any)?.claims?.sub;
      
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
      const userId = (req.user as any)?.claims?.sub;
      
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
      const userId = (req.user as any)?.claims?.sub;
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
    const userId = (req.user as any)?.claims?.sub;
    
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
    const userId = (req.user as any)?.claims?.sub;
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
    const userId = (req.user as any)?.claims?.sub;
    
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
      const userId = (req.user as any)?.claims?.sub;
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
        const userId = (req.user as any)?.claims?.sub;
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
    const userId = (req.user as any)?.claims?.sub;
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
      const userId = (req.user as any)?.claims?.sub;
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
        const userId = (req.user as any)?.claims?.sub;
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
    const userId = (req.user as any)?.claims?.sub;
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
    const userId = (req.user as any)?.claims?.sub;
    await storage.softDeleteItem('milestone', Number(req.params.id), userId);
    res.status(204).send();
  });

  // --- Issues ---
  app.get(api.issues.list.path, async (req, res) => {
    const issues = await storage.getIssues(Number(req.params.projectId));
    res.json(issues);
  });

  app.get(api.issues.listAll.path, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    
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
      const userId = (req.user as any)?.claims?.sub;
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
        const userId = (req.user as any)?.claims?.sub;
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
    const userId = (req.user as any)?.claims?.sub;
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
    const userId = (req.user as any)?.claims?.sub;
    
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
      const userId = (req.user as any)?.claims?.sub;
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
        const userId = (req.user as any)?.claims?.sub;
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
    const userId = (req.user as any)?.claims?.sub;
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

  // Demo Data Generation (Super Admin Only)
  app.get('/api/demo-data/industries', async (req, res) => {
    const userId = (req.user as any)?.claims?.sub;
    const user = userId ? await storage.getUser(userId) : null;
    
    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Super Admin access required' });
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
    const userId = (req.user as any)?.claims?.sub;
    const user = userId ? await storage.getUser(userId) : null;
    
    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Super Admin access required' });
    }
    
    const { organizationId, industry } = req.body;
    
    if (!organizationId || !industry) {
      return res.status(400).json({ message: 'organizationId and industry are required' });
    }
    
    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }
    
    try {
      const { industryTemplates } = await import('./demo-data-templates');
      type IndustryType = keyof typeof industryTemplates;
      const template = industryTemplates[industry as IndustryType];
      
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
            budget: projectTemplate.budget,
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
              budgetAmount: finTemplate.budgetAmount,
              plannedAmount: finTemplate.plannedAmount,
              actualAmount: finTemplate.actualAmount,
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
      const id = Number(req.params.id);
      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });
      
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
      const id = Number(req.params.id);
      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });
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
      const userId = (req.user as any)?.claims?.sub;
      
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
      const userId = (req.user as any)?.claims?.sub;
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
      const userId = (req.user as any)?.claims?.sub;
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
    } catch (err) {
      console.error("Error uploading MPP file:", err);
      res.status(500).json({ message: "Error processing file" });
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
      const userId = (req.user as any)?.claims?.sub;
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
      const userId = (req.user as any)?.claims?.sub;
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
      const userId = (req.user as any)?.claims?.sub;
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

  // =========== AI PROJECT GENERATION ===========
  
  // Generate a project with tasks, issues, and risks using AI
  app.post('/api/ai/generate-project', async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      
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
    const userId = (req.user as any)?.claims?.sub;
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

  return httpServer;
}
