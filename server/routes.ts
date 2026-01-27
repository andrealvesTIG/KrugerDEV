import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth as setupReplitAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { setupAuth as setupEmailAuth } from "./auth/emailAuth";
import { setupMicrosoftAuth } from "./auth/microsoftAuth";
import { setupGoogleAuth } from "./auth/googleAuth";
import { setupProjectOnlineRoutes } from "./services/projectOnline";
import { setupPlannerRoutes, mapPlannerPriorityToProjectPriority, mapPlannerPercentToStatus, getOrgIntegration } from "./services/microsoftPlanner";
import { setupDataverseRoutes, mapDataversePriorityToProjectPriority, mapDataverseProgressToStatus } from "./services/microsoftDataverse";
import { sendEmail, sendAccessRequestNotification, sendAccessRequestDecisionNotification, sendOrganizationInviteEmail } from "./services/email";
import { createTaskAssignmentNotification, createRiskAssignmentNotification, createProjectAssignmentNotification } from "./services/notificationEngine";
import { db } from "./db";
import { users, usageEvents, meters, taskResourceAssignments, issueResourceAssignments, issues, resources, tasks, projects, customDashboards, organizationMembers, plans, subscriptions, billingAuditLogs, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, insertUserConsentSchema, helpTickets, insertHelpTicketSchema } from "@shared/schema";
import { magicLinkTokens } from "@shared/models/auth";
import { eq, and, desc, sql } from "drizzle-orm";
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

// Configure multer for image uploads (avatars, logos)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for images
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
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

// Helper to check if user's email is verified (required for creating records)
async function requireEmailVerified(userId: string | undefined): Promise<{ verified: boolean; error?: string }> {
  if (!userId) return { verified: false, error: 'Authentication required' };
  
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { verified: false, error: 'User not found' };
  
  if (!user.emailVerified) {
    return { 
      verified: false, 
      error: 'Email verification required. Please verify your email before creating new items.' 
    };
  }
  
  return { verified: true };
}

// Helper to get user's membership role in an organization
async function getUserOrgRole(userId: string | undefined, orgId: number): Promise<string | null> {
  if (!userId) return null;
  const membership = await storage.getUserOrganizations(userId);
  const orgMembership = membership.find(m => m.organizationId === orgId);
  return orgMembership?.role || null;
}

// Helper to check if user is a team_member in any of their orgs
async function isTeamMemberInOrg(userId: string | undefined, orgId: number): Promise<boolean> {
  const role = await getUserOrgRole(userId, orgId);
  return role === 'team_member';
}

// Helper to get user's resource IDs in an organization
async function getUserResourceIds(userId: string, orgId: number): Promise<number[]> {
  const orgResources = await storage.getResources(orgId);
  return orgResources.filter(r => r.userId === userId).map(r => r.id);
}

// Cached result type for team member access data
interface TeamMemberAccessData {
  resourceIds: number[];
  projectIds: Set<number>;
  invitedProjectIds: Set<number>;  // Projects explicitly invited to (see all items)
  taskIds: Set<number>;
}

// Helper to get all access data for a team_member in one pass (more efficient)
async function getTeamMemberAccessData(userId: string, orgId: number): Promise<TeamMemberAccessData> {
  const orgResources = await storage.getResources(orgId);
  const userResources = orgResources.filter(r => r.userId === userId);
  const resourceIds = userResources.map(r => r.id);
  
  if (resourceIds.length === 0) {
    return { resourceIds: [], projectIds: new Set(), invitedProjectIds: new Set(), taskIds: new Set() };
  }
  
  // Get all projects in org to filter tasks
  const allProjects = await storage.getProjects();
  const orgProjectIds = new Set(allProjects.filter(p => p.organizationId === orgId).map(p => p.id));
  
  // Get all tasks (without org filter - the function doesn't support it)
  const allTasks = await storage.getAllTasks();
  const orgTasks = allTasks.filter(t => orgProjectIds.has(t.projectId));
  
  // Batch get all task resource assignments
  const projectIdSet = new Set<number>();
  const taskIdSet = new Set<number>();
  
  // Include projects the resource was explicitly invited to
  const invitedProjectIdSet = new Set<number>();
  for (const resource of userResources) {
    if (resource.invitedProjectIds && Array.isArray(resource.invitedProjectIds)) {
      for (const projectId of resource.invitedProjectIds) {
        if (orgProjectIds.has(projectId)) {
          projectIdSet.add(projectId);
          invitedProjectIdSet.add(projectId);
        }
      }
    }
  }
  
  // Check assignments for each task, and include ALL tasks from invited projects
  for (const task of orgTasks) {
    // If task is in an invited project, include it
    if (invitedProjectIdSet.has(task.projectId)) {
      taskIdSet.add(task.id);
    } else {
      // Otherwise, check if user is assigned to this task
      const assignments = await storage.getTaskResourceAssignments(task.id);
      if (assignments.some(a => resourceIds.includes(a.resourceId))) {
        projectIdSet.add(task.projectId);
        taskIdSet.add(task.id);
      }
    }
  }
  
  return { resourceIds, projectIds: projectIdSet, invitedProjectIds: invitedProjectIdSet, taskIds: taskIdSet };
}

// Helper to get project IDs that a team_member has access to (assigned via resources)
async function getTeamMemberProjectIds(userId: string, orgId: number): Promise<number[]> {
  const accessData = await getTeamMemberAccessData(userId, orgId);
  return Array.from(accessData.projectIds);
}

// Helper to get task IDs that a team_member has access to (directly assigned)
async function getTeamMemberTaskIds(userId: string, orgId: number): Promise<number[]> {
  const accessData = await getTeamMemberAccessData(userId, orgId);
  return Array.from(accessData.taskIds);
}

// Helper to get risk IDs that a team_member has access to (assigned or in invited projects)
async function getTeamMemberRiskIds(userId: string, orgId: number): Promise<number[]> {
  const accessData = await getTeamMemberAccessData(userId, orgId);
  if (accessData.resourceIds.length === 0) return [];
  
  const riskIdSet = new Set<number>();
  
  for (const projectId of accessData.projectIds) {
    const risks = await storage.getRisks(projectId);
    for (const risk of risks) {
      // If project is in invited projects, include all risks
      if (accessData.invitedProjectIds.has(projectId)) {
        riskIdSet.add(risk.id);
      } else {
        // Otherwise, check if user is assigned to this risk
        const assignments = await storage.getRiskResourceAssignments(risk.id);
        if (assignments.some(a => accessData.resourceIds.includes(a.resourceId))) {
          riskIdSet.add(risk.id);
        }
      }
    }
  }
  
  return Array.from(riskIdSet);
}

// Helper to get issue IDs that a team_member has access to (assigned or in invited projects)
async function getTeamMemberIssueIds(userId: string, orgId: number): Promise<number[]> {
  const accessData = await getTeamMemberAccessData(userId, orgId);
  if (accessData.resourceIds.length === 0) return [];
  
  const issueIdSet = new Set<number>();
  
  for (const projectId of accessData.projectIds) {
    const issues = await storage.getIssues(projectId);
    for (const issue of issues) {
      // If project is in invited projects, include all issues
      if (accessData.invitedProjectIds.has(projectId)) {
        issueIdSet.add(issue.id);
      } else {
        // Otherwise, check if user is assigned to this issue
        const assignments = await storage.getIssueResourceAssignments(issue.id);
        if (assignments.some(a => accessData.resourceIds.includes(a.resourceId))) {
          issueIdSet.add(issue.id);
        }
      }
    }
  }
  
  return Array.from(issueIdSet);
}

// Helper to get portfolio IDs that a team_member has access to
// Team members can see portfolios if:
// 1. They created the portfolio (createdBy matches their userId)
// 2. Their resource ID is in the portfolio's teamMemberResourceIds array
async function getTeamMemberPortfolioIds(userId: string, orgId: number): Promise<number[]> {
  const portfolios = await storage.getPortfolios(orgId);
  const userResourceIds = await getUserResourceIds(userId, orgId);
  
  const accessiblePortfolioIds: number[] = [];
  
  for (const portfolio of portfolios) {
    // Check if user created this portfolio
    if (portfolio.createdBy === userId) {
      accessiblePortfolioIds.push(portfolio.id);
      continue;
    }
    
    // Check if user's resource ID is in teamMemberResourceIds
    if (portfolio.teamMemberResourceIds && Array.isArray(portfolio.teamMemberResourceIds)) {
      const hasAccess = userResourceIds.some(resourceId => 
        portfolio.teamMemberResourceIds!.includes(resourceId)
      );
      if (hasAccess) {
        accessiblePortfolioIds.push(portfolio.id);
      }
    }
  }
  
  return accessiblePortfolioIds;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Set up authentication first - Replit OAuth, Email/Password, Microsoft 365, and Google
  await setupReplitAuth(app);
  await setupEmailAuth(app);
  await setupMicrosoftAuth(app);
  setupGoogleAuth(app);
  await setupProjectOnlineRoutes(app);
  await setupPlannerRoutes(app);
  await setupDataverseRoutes(app);
  registerAuthRoutes(app);

  // Seed DB on startup
  seedDatabase().catch(err => console.error("Error seeding database:", err));

  // --- Users (Admin) ---
  app.get('/api/users', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }
      
      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : undefined;
      
      // Super admins can see all users
      if (user.role === 'super_admin') {
        if (organizationId) {
          const orgMembers = await storage.getOrganizationMembers(organizationId);
          const memberUserIds = orgMembers.map(m => m.userId);
          const allUsers = await storage.getAllUsers();
          const orgUsers = allUsers.filter(u => memberUserIds.includes(u.id));
          return res.json(orgUsers);
        }
        const allUsers = await storage.getAllUsers();
        return res.json(allUsers);
      }
      
      // Non-super-admins must specify an organization
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }
      
      // Verify user has admin access to the requested organization
      const memberships = await storage.getUserOrganizations(userId);
      const membership = memberships.find(m => m.organizationId === organizationId);
      
      if (!membership) {
        return res.json([]);
      }
      
      // Only org admins and owners can list all users in the org
      if (!['org_admin', 'owner'].includes(membership.role)) {
        return res.status(403).json({ message: 'Admin access required to list users' });
      }
      
      // Get users who are members of this organization
      const orgMembers = await storage.getOrganizationMembers(organizationId);
      const memberUserIds = orgMembers.map(m => m.userId);
      const allUsers = await storage.getAllUsers();
      const orgUsers = allUsers.filter(u => memberUserIds.includes(u.id));
      return res.json(orgUsers);
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

  // Deactivate user (super admin only)
  app.put('/api/users/:userId/deactivate', async (req, res) => {
    try {
      const currentUser = req.user as User | undefined;
      if (!currentUser || currentUser.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }
      
      // Prevent self-deactivation
      if (currentUser.id === req.params.userId) {
        return res.status(400).json({ message: 'Cannot deactivate yourself' });
      }
      
      const [updated] = await db.update(users)
        .set({ 
          deactivatedAt: new Date(),
          deactivatedBy: currentUser.id
        })
        .where(eq(users.id, req.params.userId))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error('Failed to deactivate user:', err);
      res.status(500).json({ message: 'Failed to deactivate user' });
    }
  });

  // Reactivate user (super admin only)
  app.put('/api/users/:userId/reactivate', async (req, res) => {
    try {
      const currentUser = req.user as User | undefined;
      if (!currentUser || currentUser.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }
      
      const [updated] = await db.update(users)
        .set({ 
          deactivatedAt: null,
          deactivatedBy: null
        })
        .where(eq(users.id, req.params.userId))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error('Failed to reactivate user:', err);
      res.status(500).json({ message: 'Failed to reactivate user' });
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

  // Request avatar upload URL (legacy - may fail due to sidecar issues)
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

  // Direct avatar upload (uses local storage as fallback when object storage is unavailable)
  app.post('/api/users/:userId/avatar/upload', imageUpload.single('avatar'), async (req, res) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.id;
      if (!userId || userId !== req.params.userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Generate unique filename
      const ext = req.file.mimetype.split('/')[1] || 'jpg';
      const filename = `avatar-${userId}-${Date.now()}.${ext}`;
      
      // Try object storage first, fall back to local storage
      let servePath: string;
      
      try {
        const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
        const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
        
        if (privateObjectDir) {
          const objectPath = `${privateObjectDir}/uploads/${filename}`;
          const pathParts = objectPath.split('/');
          const bucketName = pathParts[1];
          const objectName = pathParts.slice(2).join('/');

          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          
          await file.save(req.file.buffer, {
            contentType: req.file.mimetype,
            metadata: {
              originalName: req.file.originalname,
              uploadedBy: userId,
            },
          });

          servePath = `/objects/uploads/${filename}`;
        } else {
          throw new Error('Object storage not configured');
        }
      } catch (objectStorageError) {
        // Fall back to local file storage
        console.log("Object storage unavailable, using local storage:", (objectStorageError as Error).message);
        
        const avatarDir = path.join(process.cwd(), 'public', 'avatars');
        if (!fs.existsSync(avatarDir)) {
          fs.mkdirSync(avatarDir, { recursive: true });
        }
        
        const filePath = path.join(avatarDir, filename);
        fs.writeFileSync(filePath, req.file.buffer);
        
        servePath = `/avatars/${filename}`;
      }
      
      // Update user avatar in database
      await db.update(users)
        .set({ 
          avatarUrl: servePath, 
          profileImageUrl: servePath,
          updatedAt: new Date() 
        })
        .where(eq(users.id, req.params.userId));

      res.json({ objectPath: servePath, success: true });
    } catch (err) {
      console.error("Error uploading avatar:", err);
      res.status(500).json({ message: 'Failed to upload avatar' });
    }
  });

  // Delete user (Super Admin only)
  app.delete('/api/users/:userId', async (req, res) => {
    try {
      const currentUserId = getUserIdFromRequest(req);
      if (!currentUserId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Check if current user is super admin
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser || currentUser.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super Admin access required' });
      }

      const targetUserId = req.params.userId;

      // Prevent deleting yourself
      if (targetUserId === currentUserId) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }

      // Delete the user (this also removes organization memberships)
      await storage.deleteUser(targetUserId);
      
      res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
      console.error('Error deleting user:', err);
      res.status(500).json({ message: 'Failed to delete user' });
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
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating (except during onboarding where org is created by system)
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
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

  // Dashboard tab order - admin only
  app.put('/api/organizations/:id/dashboard-tab-order', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Check if user is org admin
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && m.role === 'org_admin');
      
      // Also allow super_admin
      const user = await storage.getUser(userId);
      const isSuperAdmin = user?.role === 'super_admin';
      
      if (!isOrgAdmin && !isSuperAdmin) {
        return res.status(403).json({ message: 'Only organization admins can reorder dashboard tabs' });
      }
      
      const { tabOrder, hiddenTabs } = req.body;
      
      const updateData: { dashboardTabOrder?: string[]; dashboardHiddenTabs?: string[] } = {};
      
      if (tabOrder !== undefined) {
        if (!Array.isArray(tabOrder)) {
          return res.status(400).json({ message: 'tabOrder must be an array of tab IDs' });
        }
        updateData.dashboardTabOrder = tabOrder;
      }
      
      if (hiddenTabs !== undefined) {
        if (!Array.isArray(hiddenTabs)) {
          return res.status(400).json({ message: 'hiddenTabs must be an array of tab IDs' });
        }
        updateData.dashboardHiddenTabs = hiddenTabs;
      }
      
      const updated = await storage.updateOrganization(orgId, updateData);
      res.json({ tabOrder: updated.dashboardTabOrder, hiddenTabs: updated.dashboardHiddenTabs });
    } catch (err) {
      console.error('Error updating dashboard tab order:', err);
      res.status(500).json({ message: 'Failed to update dashboard tab order' });
    }
  });

  // Get dashboard tab order
  app.get('/api/organizations/:id/dashboard-tab-order', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const org = await storage.getOrganization(orgId);
      res.json({ tabOrder: org?.dashboardTabOrder || [], hiddenTabs: org?.dashboardHiddenTabs || [] });
    } catch (err) {
      res.status(500).json({ message: 'Failed to get dashboard tab order' });
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

  // Get all organization members (super_admin only)
  app.get('/api/admin/organization-members', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }
      
      const allMembers = await db.select({
        organizationId: organizationMembers.organizationId,
        userId: organizationMembers.userId,
      }).from(organizationMembers);
      
      res.json(allMembers);
    } catch (err) {
      res.status(500).json({ message: 'Failed to get organization members' });
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

  // Get organization billing info (super_admin only)
  app.get('/api/admin/organizations/:id/billing', async (req, res) => {
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
      
      const { billingProvider } = await import("./services/billing");
      const { plans } = await import("@shared/schema");
      const subscription = await billingProvider.getSubscriptionForOrg(orgId);
      
      // Get all available plans
      const allPlans = await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.displayOrder);
      
      let currentPlan = null;
      if (subscription) {
        const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1);
        currentPlan = plan;
      }
      
      res.json({
        subscription: subscription ? {
          id: subscription.id,
          planId: subscription.planId,
          status: subscription.status,
          bonusSeats: subscription.bonusSeats || 0,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd
        } : null,
        currentPlan,
        availablePlans: allPlans
      });
    } catch (err) {
      console.error("Error fetching org billing:", err);
      res.status(500).json({ message: 'Failed to fetch organization billing' });
    }
  });

  // Update organization billing (super_admin only) - change plan and/or bonus seats
  app.put('/api/admin/organizations/:id/billing', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { planCode, bonusSeats } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }
      
      const { billingProvider } = await import("./services/billing");
      const { plans, subscriptions, billingAuditLogs } = await import("@shared/schema");
      let subscription = await billingProvider.getSubscriptionForOrg(orgId);
      
      // If no subscription exists, create one
      if (!subscription && planCode) {
        subscription = await billingProvider.createSubscription({
          planCode,
          orgId
        });
      }
      
      if (!subscription) {
        return res.status(400).json({ message: 'No subscription found and no plan specified' });
      }
      
      // Update plan if specified
      if (planCode) {
        const [plan] = await db.select().from(plans).where(eq(plans.code, planCode)).limit(1);
        if (!plan) {
          return res.status(400).json({ message: `Plan not found: ${planCode}` });
        }
        
        await db
          .update(subscriptions)
          .set({ planId: plan.id })
          .where(eq(subscriptions.id, subscription.id));
        
        // Log the plan change
        await db.insert(billingAuditLogs).values({
          actorUserId: userId,
          orgId,
          action: "ADMIN_PLAN_CHANGE",
          entityType: "subscription",
          entityId: String(subscription.id),
          metadataJson: { newPlanCode: planCode, previousPlanId: subscription.planId }
        });
      }
      
      // Update bonus seats if specified
      if (bonusSeats !== undefined) {
        const parsedBonusSeats = Math.max(0, parseInt(bonusSeats) || 0);
        
        await db
          .update(subscriptions)
          .set({ bonusSeats: parsedBonusSeats })
          .where(eq(subscriptions.id, subscription.id));
        
        // Log the bonus seats change
        await db.insert(billingAuditLogs).values({
          actorUserId: userId,
          orgId,
          action: "ADMIN_BONUS_SEATS_CHANGE",
          entityType: "subscription",
          entityId: String(subscription.id),
          metadataJson: { bonusSeats: parsedBonusSeats, previousBonusSeats: subscription.bonusSeats || 0 }
        });
      }
      
      // Fetch updated subscription
      const [updatedSubscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscription.id))
        .limit(1);
      
      let updatedPlan = null;
      if (updatedSubscription) {
        const [plan] = await db.select().from(plans).where(eq(plans.id, updatedSubscription.planId)).limit(1);
        updatedPlan = plan;
      }
      
      res.json({
        message: 'Organization billing updated',
        subscription: updatedSubscription ? {
          id: updatedSubscription.id,
          planId: updatedSubscription.planId,
          status: updatedSubscription.status,
          bonusSeats: updatedSubscription.bonusSeats || 0
        } : null,
        currentPlan: updatedPlan
      });
    } catch (err) {
      console.error("Error updating org billing:", err);
      res.status(500).json({ message: 'Failed to update organization billing' });
    }
  });

  // --- Get all task resource assignments for organization (for grouping) ---
  app.get('/api/organizations/:id/task-assignments', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Get all task assignments for projects in this organization
      const assignments = await db
        .select({
          taskId: taskResourceAssignments.taskId,
          resourceId: taskResourceAssignments.resourceId,
          resourceName: resources.displayName,
        })
        .from(taskResourceAssignments)
        .innerJoin(resources, eq(taskResourceAssignments.resourceId, resources.id))
        .innerJoin(tasks, eq(taskResourceAssignments.taskId, tasks.id))
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(projects.organizationId, orgId));
      
      res.json(assignments);
    } catch (err) {
      console.error('Error fetching task assignments:', err);
      res.json([]);
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
      
      // Check seat limit before adding member
      const { checkSeatLimit } = await import("./services/billing");
      const seatCheck = await checkSeatLimit(orgId, 1);
      if (!seatCheck.allowed) {
        return res.status(403).json({ 
          message: seatCheck.reason || 'Seat limit reached. Please upgrade your plan.',
          limitExceeded: true,
          resourceType: 'seats',
          currentSeats: seatCheck.currentSeats,
          maxSeats: seatCheck.maxSeats
        });
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

  // --- Organization Seat Info ---
  app.get('/api/organizations/:id/seats', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { checkSeatLimit } = await import("./services/billing");
      const seatInfo = await checkSeatLimit(orgId, 0);
      
      // Also get the organization's subscription and plan info
      const { billingProvider } = await import("./services/billing");
      const subscription = await billingProvider.getSubscriptionForOrg(orgId);
      
      let planName = "Free";
      let planCode = "FREE";
      let extraSeatPriceCents: number | null = null;
      
      if (subscription) {
        const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1);
        if (plan) {
          planName = plan.name;
          planCode = plan.code;
          extraSeatPriceCents = plan.extraSeatPriceCents;
        }
      }
      
      // Count pending invites
      const invites = await storage.getOrganizationInvites(orgId);
      const pendingInvites = invites.filter(i => i.status === 'pending').length;
      
      // Check if current user is admin
      const members = await storage.getOrganizationMembers(orgId);
      const currentMember = members.find(m => m.userId === userId);
      
      // Also check if user is super_admin
      const user = await storage.getUser(userId);
      const isSuperAdmin = user?.role === 'super_admin';
      
      const isAdmin = currentMember?.role === 'org_admin' || currentMember?.role === 'owner' || isSuperAdmin;
      
      res.json({
        ...seatInfo,
        pendingInvites,
        planName,
        planCode,
        subscriptionId: subscription?.id || null,
        bonusSeats: subscription?.bonusSeats || 0,
        extraSeatPriceCents,
        isAdmin
      });
    } catch (err) {
      console.error("Error fetching seat info:", err);
      res.status(500).json({ message: 'Failed to fetch seat information' });
    }
  });

  // Remove extra seats from the organization
  // Remove extra seats from the organization
  app.post('/api/organizations/:id/seats/remove', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { quantity = 1 } = req.body;

      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      // Check if user is org admin or super admin
      const members = await storage.getOrganizationMembers(orgId);
      const currentMember = members.find(m => m.userId === userId);
      const user = await storage.getUser(userId);
      const isSuperAdmin = user?.role === 'super_admin';
      
      if (!isSuperAdmin && (!currentMember || !['org_admin', 'owner'].includes(currentMember.role))) {
        return res.status(403).json({ message: 'Only organization admins can remove seats' });
      }

      // Get organization subscription
      const { billingProvider } = await import("./services/billing");
      const subscription = await billingProvider.getSubscriptionForOrg(orgId);

      if (!subscription) {
        return res.status(400).json({ message: 'No active subscription found' });
      }

      const currentBonusSeats = subscription.bonusSeats || 0;
      if (currentBonusSeats < quantity) {
        return res.status(400).json({ message: "Cannot remove more seats than purchased extra seats" });
      }

      const newBonusSeats = currentBonusSeats - quantity;

      // Update bonus seats on subscription
      await db.update(subscriptions)
        .set({ bonusSeats: newBonusSeats })
        .where(eq(subscriptions.id, subscription.id));

      // Record in billing audit log
      await db.insert(billingAuditLogs).values({
        actorUserId: userId,
        orgId: orgId,
        action: "EXTRA_SEAT_REMOVED",
        entityType: "subscription",
        entityId: String(subscription.id),
        metadataJson: {
          quantity,
          previousBonusSeats: currentBonusSeats,
          newBonusSeats
        }
      });

      res.json({ message: "Extra seats removed successfully", bonusSeats: newBonusSeats });
    } catch (error: any) {
      console.error('Error removing extra seats:', error);
      res.status(500).json({ message: error.message || "Failed to remove extra seats" });
    }
  });

  app.post('/api/organizations/:id/seats/purchase', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { quantity = 1 } = req.body;
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Check if user is org admin or super admin
      const members = await storage.getOrganizationMembers(orgId);
      const currentMember = members.find(m => m.userId === userId);
      const user = await storage.getUser(userId);
      const isSuperAdmin = user?.role === 'super_admin';
      
      if (!isSuperAdmin && (!currentMember || !['org_admin', 'owner'].includes(currentMember.role))) {
        return res.status(403).json({ message: 'Only organization admins can purchase extra seats' });
      }
      
      // Get organization subscription and plan
      const { billingProvider } = await import("./services/billing");
      const subscription = await billingProvider.getSubscriptionForOrg(orgId);
      
      if (!subscription) {
        return res.status(400).json({ message: 'No active subscription found. Please upgrade to a paid plan first.' });
      }
      
      const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1);
      
      if (!plan) {
        return res.status(400).json({ message: 'Plan not found' });
      }
      
      if (plan.extraSeatPriceCents === null) {
        return res.status(400).json({ message: 'Extra seats are not available for the Free plan. Please upgrade first.' });
      }
      
      // For Enterprise plan with $0 extra seats, just add them
      // For paid plans, we record the purchase
      const newBonusSeats = (subscription.bonusSeats || 0) + quantity;
      
      // Update bonus seats on subscription
      await db.update(subscriptions)
        .set({ bonusSeats: newBonusSeats })
        .where(eq(subscriptions.id, subscription.id));
      
      // Record in billing audit log
      await db.insert(billingAuditLogs).values({
        actorUserId: userId,
        orgId: orgId,
        action: "EXTRA_SEAT_PURCHASE",
        entityType: "subscription",
        entityId: String(subscription.id),
        metadataJson: { 
          quantity,
          pricePerSeatCents: plan.extraSeatPriceCents,
          totalCents: plan.extraSeatPriceCents * quantity,
          previousBonusSeats: subscription.bonusSeats || 0,
          newBonusSeats
        }
      });
      
      // Get updated seat info
      const { checkSeatLimit } = await import("./services/billing");
      const seatInfo = await checkSeatLimit(orgId, 0);
      
      res.json({
        success: true,
        message: `Successfully added ${quantity} extra seat${quantity > 1 ? 's' : ''} to your subscription`,
        bonusSeats: newBonusSeats,
        ...seatInfo
      });
    } catch (err) {
      console.error("Error purchasing extra seat:", err);
      res.status(500).json({ message: 'Failed to purchase extra seat' });
    }
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
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(currentUserId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { emails, role } = req.body;
      
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ message: 'Emails array is required' });
      }
      
      // Check seat limit before sending invites
      // Count pending invites as they will become members
      const { checkSeatLimit } = await import("./services/billing");
      const existingMembers = await storage.getOrganizationMembers(orgId);
      const existingInvites = await storage.getOrganizationInvites(orgId);
      const pendingInviteCount = existingInvites.filter(i => i.status === 'pending').length;
      
      // Check if adding new invites would exceed limit
      // We need to consider: current members + pending invites + new invites
      const seatCheck = await checkSeatLimit(orgId, 0);
      const currentTotal = existingMembers.length + pendingInviteCount;
      const maxSeats = seatCheck.maxSeats;
      
      if (maxSeats !== null && currentTotal >= maxSeats) {
        return res.status(403).json({ 
          message: `Your plan allows ${maxSeats} seat${maxSeats === 1 ? '' : 's'}. You have ${existingMembers.length} member${existingMembers.length === 1 ? '' : 's'} and ${pendingInviteCount} pending invite${pendingInviteCount === 1 ? '' : 's'}. Please upgrade your plan to invite more team members.`,
          limitExceeded: true,
          resourceType: 'seats',
          currentSeats: existingMembers.length,
          pendingInvites: pendingInviteCount,
          maxSeats: maxSeats
        });
      }
      
      // Calculate how many more invites we can send
      const availableSlots = maxSeats !== null ? maxSeats - currentTotal : Infinity;
      
      const results: { success: string[]; skipped: string[]; errors: string[] } = {
        success: [],
        skipped: [],
        errors: []
      };
      
      const allUsers = await storage.getAllUsers();
      let invitesSent = 0;
      
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
        
        // Check if we've reached the seat limit
        if (invitesSent >= availableSlots) {
          results.errors.push(`${normalizedEmail}: Seat limit reached. Upgrade to invite more.`);
          continue;
        }
        
        try {
          // Generate a secure token for the magic link
          const crypto = await import('crypto');
          const inviteToken = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
          
          await storage.createOrganizationInvite({
            organizationId: orgId,
            email: normalizedEmail,
            role: role || 'member',
            invitedBy: currentUserId,
            status: 'pending',
            token: inviteToken,
            expiresAt: expiresAt
          });
          results.success.push(normalizedEmail);
          invitesSent++;
          
          // Send invitation email
          const org = await storage.getOrganization(orgId);
          const inviter = currentUserId ? await storage.getUser(currentUserId) : null;
          const inviterName = inviter 
            ? [inviter.firstName, inviter.lastName].filter(Boolean).join(' ') || inviter.email || 'An administrator'
            : 'An administrator';
          const appUrl = process.env.APP_URL 
            || (process.env.REPLIT_DOMAINS?.split(',')[0] 
              ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
              : 'https://fridayreport.ai');
          
          if (org) {
            await sendOrganizationInviteEmail(
              normalizedEmail,
              org.name,
              inviterName,
              role || 'member',
              appUrl,
              inviteToken
            );
          }
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

  // Resend invite email
  app.post('/api/organizations/:id/invites/:inviteId/resend', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const inviteId = Number(req.params.inviteId);
      const currentUserId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Get the invite
      const invites = await storage.getOrganizationInvites(orgId);
      const invite = invites.find(i => i.id === inviteId);
      
      if (!invite) {
        return res.status(404).json({ message: 'Invite not found' });
      }
      
      if (invite.status !== 'pending') {
        return res.status(400).json({ message: 'Can only resend pending invites' });
      }
      
      // Generate new token and update expiration
      const crypto = await import('crypto');
      const newToken = crypto.randomBytes(32).toString('hex');
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      await storage.resendOrganizationInvite(inviteId, newToken, newExpiresAt);
      
      // Get org and inviter info for email
      const org = await storage.getOrganization(orgId);
      const inviter = currentUserId ? await storage.getUser(currentUserId) : null;
      const inviterName = inviter 
        ? [inviter.firstName, inviter.lastName].filter(Boolean).join(' ') || inviter.email || 'An administrator'
        : 'An administrator';
      const appUrl = process.env.APP_URL 
        || (process.env.REPLIT_DOMAINS?.split(',')[0] 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'https://fridayreport.ai');
      
      if (org) {
        await sendOrganizationInviteEmail(
          invite.email,
          org.name,
          inviterName,
          invite.role,
          appUrl,
          newToken
        );
      }
      
      res.json({ message: 'Invitation email resent successfully' });
    } catch (err) {
      console.error('Failed to resend invite:', err);
      res.status(500).json({ message: 'Failed to resend invite' });
    }
  });

  // Magic link invite acceptance - validates token and accepts invite for logged in user
  app.post('/api/invites/accept', async (req, res) => {
    try {
      const currentUserId = getUserIdFromRequest(req);
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ message: 'Invite token is required' });
      }
      
      if (!currentUserId) {
        return res.status(401).json({ message: 'Authentication required. Please log in first.' });
      }
      
      // Look up the invite by token
      const invite = await storage.getOrganizationInviteByToken(token);
      
      if (!invite) {
        return res.status(404).json({ message: 'Invalid or expired invitation link' });
      }
      
      if (invite.status !== 'pending') {
        return res.status(400).json({ 
          message: invite.status === 'accepted' 
            ? 'This invitation has already been accepted' 
            : 'This invitation is no longer valid' 
        });
      }
      
      // Check if invite has expired
      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ message: 'This invitation has expired. Please ask for a new invite.' });
      }
      
      // Verify the user's email matches the invite
      const user = await storage.getUser(currentUserId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Check if email matches (case insensitive)
      if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
        return res.status(403).json({ 
          message: `This invitation was sent to ${invite.email}. Please log in with that email address or ask for a new invitation.` 
        });
      }
      
      // Accept the invite
      const member = await storage.acceptOrganizationInvite(invite.id, currentUserId);
      
      if (!member) {
        return res.status(500).json({ message: 'Failed to accept invitation' });
      }
      
      // Get organization details for response
      const org = await storage.getOrganization(invite.organizationId);
      
      res.json({ 
        message: 'Successfully joined organization',
        organization: org,
        role: invite.role
      });
    } catch (err) {
      console.error('Failed to accept invite:', err);
      res.status(500).json({ message: 'Failed to accept invitation' });
    }
  });

  // Get invite details by token (for displaying invite info before login)
  app.get('/api/invites/:token', async (req, res) => {
    try {
      const { token } = req.params;
      
      const invite = await storage.getOrganizationInviteByToken(token);
      
      if (!invite) {
        return res.status(404).json({ message: 'Invalid or expired invitation link' });
      }
      
      if (invite.status !== 'pending') {
        return res.status(400).json({ 
          message: invite.status === 'accepted' 
            ? 'This invitation has already been accepted' 
            : 'This invitation is no longer valid',
          status: invite.status
        });
      }
      
      // Check if invite has expired
      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ message: 'This invitation has expired', expired: true });
      }
      
      // Get organization details
      const org = await storage.getOrganization(invite.organizationId);
      
      // Return safe details (no sensitive info)
      res.json({
        email: invite.email,
        organizationName: org?.name || 'Unknown Organization',
        role: invite.role,
        expiresAt: invite.expiresAt
      });
    } catch (err) {
      console.error('Failed to get invite details:', err);
      res.status(500).json({ message: 'Failed to get invitation details' });
    }
  });

  // Microsoft Entra ID directory user search
  app.get('/api/organizations/:id/directory/search', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const currentUserId = getUserIdFromRequest(req);
      const { q } = req.query;
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      if (!q || typeof q !== 'string' || q.length < 2) {
        return res.status(400).json({ message: 'Search query must be at least 2 characters' });
      }
      
      // Get organization to check for Entra ID configuration
      const org = await storage.getOrganization(orgId);
      if (!org) {
        return res.status(404).json({ message: 'Organization not found' });
      }
      
      // Get existing members to exclude from results
      const members = await storage.getOrganizationMembers(orgId);
      const memberEmails = new Set(
        members.map(m => m.user?.email?.toLowerCase()).filter(Boolean) as string[]
      );
      
      // Get pending invites to exclude from results
      const invites = await storage.getOrganizationInvites(orgId);
      const pendingInviteEmails = new Set(
        invites.filter(i => i.status === 'pending').map(i => i.email.toLowerCase())
      );
      
      // Check if Microsoft Entra ID integration is connected for this organization
      const { getOrgIntegration } = await import('./services/microsoftPlanner');
      const integration = await getOrgIntegration(orgId, 'entra');
      
      if (integration?.connectionStatus === 'connected' && integration.accessToken) {
        // Search Microsoft Graph API for users
        try {
          const searchQuery = encodeURIComponent(q);
          // Use $filter to search by displayName or mail containing the search term
          const graphUrl = `https://graph.microsoft.com/v1.0/users?$filter=startswith(displayName,'${searchQuery}') or startswith(mail,'${searchQuery}') or startswith(givenName,'${searchQuery}') or startswith(surname,'${searchQuery}')&$top=15&$select=id,displayName,mail,givenName,surname,userPrincipalName,jobTitle,department`;
          
          const graphResponse = await fetch(graphUrl, {
            headers: {
              'Authorization': `Bearer ${integration.accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (graphResponse.ok) {
            const graphData = await graphResponse.json();
            const graphUsers = (graphData.value || [])
              .filter((user: any) => {
                const email = (user.mail || user.userPrincipalName || '').toLowerCase();
                // Skip if already a member or has pending invite
                if (memberEmails.has(email)) return false;
                if (pendingInviteEmails.has(email)) return false;
                return true;
              })
              .slice(0, 10)
              .map((user: any) => ({
                id: user.id,
                email: user.mail || user.userPrincipalName,
                firstName: user.givenName,
                lastName: user.surname,
                displayName: user.displayName || [user.givenName, user.surname].filter(Boolean).join(' ') || user.mail || 'Unknown User',
                jobTitle: user.jobTitle,
                department: user.department,
                source: 'entra' as const
              }));
            
            return res.json({ users: graphUsers, source: 'microsoft_entra' });
          } else {
            // Log error but fall back to internal search
            const errorText = await graphResponse.text();
            console.error('Microsoft Graph API error:', graphResponse.status, errorText);
            // Token might be expired or insufficient permissions - fall back to internal
          }
        } catch (graphErr) {
          console.error('Failed to search Microsoft Graph:', graphErr);
          // Fall back to internal search
        }
      }
      
      // Fall back to internal users if no external directory is configured or Graph API failed
      const allUsers = await storage.getAllUsers();
      const searchLower = q.toLowerCase();
      
      const matchingUsers = allUsers
        .filter(user => {
          // Skip if already a member
          if (user.email && memberEmails.has(user.email.toLowerCase())) return false;
          
          // Skip if already has a pending invite
          if (user.email && pendingInviteEmails.has(user.email.toLowerCase())) return false;
          
          // Match on name or email
          const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').toLowerCase();
          const email = user.email?.toLowerCase() || '';
          
          return fullName.includes(searchLower) || email.includes(searchLower);
        })
        .slice(0, 10) // Limit results
        .map(user => ({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown User',
          source: 'internal' as const
        }));
      
      res.json({ users: matchingUsers, source: 'internal' });
    } catch (err) {
      console.error('Failed to search directory:', err);
      res.status(500).json({ message: 'Failed to search directory' });
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

  // Resend access request notification (for the requesting user)
  app.post('/api/organizations/:id/access-requests/:requestId/resend', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const requestId = Number(req.params.requestId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Get all access requests to find this one
      const allRequests = await storage.getOrganizationAccessRequests(orgId);
      const request = allRequests.find(r => r.id === requestId);
      
      if (!request) {
        return res.status(404).json({ message: 'Access request not found' });
      }
      
      // Only the requester can resend their own request
      if (request.userId !== userId) {
        return res.status(403).json({ message: 'You can only resend your own access requests' });
      }
      
      if (request.status !== 'pending') {
        return res.status(400).json({ message: 'Can only resend pending requests' });
      }
      
      // Get organization and requester info
      const org = await storage.getOrganization(orgId);
      const requester = await storage.getUser(userId);
      const requesterName = [requester?.firstName, requester?.lastName].filter(Boolean).join(' ') || requester?.email || 'Unknown User';
      
      // Send email notifications to all org admins
      const members = await storage.getOrganizationMembers(orgId);
      const admins = members.filter(m => m.role === 'org_admin');
      
      for (const admin of admins) {
        const adminUser = await storage.getUser(admin.userId);
        if (adminUser?.email && org) {
          await sendAccessRequestNotification(
            adminUser.email,
            requesterName,
            org.name,
            request.message
          );
        }
      }
      
      res.json({ message: 'Access request notification resent successfully' });
    } catch (err) {
      console.error('Failed to resend access request:', err);
      res.status(500).json({ message: 'Failed to resend access request' });
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

  // --- External Shares (Cross-organization sharing) ---
  
  // Get all external shares for the current user
  app.get('/api/external-shares', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const shares = await storage.getExternalSharesForUser(userId);
      res.json(shares);
    } catch (err) {
      console.error('Failed to get external shares:', err);
      res.status(500).json({ message: 'Failed to get external shares' });
    }
  });
  
  // Get external projects for the current user (with full project details)
  app.get('/api/external-projects', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const shares = await storage.getExternalSharesForUser(userId);
      const projectShares = shares.filter(s => s.objectType === 'project');
      
      // Fetch full project details for each share
      const projects = await Promise.all(
        projectShares.map(async (share) => {
          const project = await storage.getProject(share.objectId);
          if (project) {
            const org = await storage.getOrganization(share.sourceOrganizationId);
            return {
              ...project,
              isExternal: true,
              sourceOrganizationId: share.sourceOrganizationId,
              sourceOrganizationName: org?.name || 'External Organization',
              externalShareId: share.id,
              accessRole: share.accessRole
            };
          }
          return null;
        })
      );
      
      res.json(projects.filter(Boolean));
    } catch (err) {
      console.error('Failed to get external projects:', err);
      res.status(500).json({ message: 'Failed to get external projects' });
    }
  });
  
  // Get external tasks for the current user (with full task details)
  app.get('/api/external-tasks', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const shares = await storage.getExternalSharesForUser(userId);
      const taskShares = shares.filter(s => s.objectType === 'task');
      
      // Fetch full task details for each share
      const tasks = await Promise.all(
        taskShares.map(async (share) => {
          const task = await storage.getTask(share.objectId);
          if (task) {
            const org = await storage.getOrganization(share.sourceOrganizationId);
            // Get project info for context
            let projectName = null;
            if (task.projectId) {
              const project = await storage.getProject(task.projectId);
              projectName = project?.name || null;
            }
            return {
              ...task,
              isExternal: true,
              sourceOrganizationId: share.sourceOrganizationId,
              sourceOrganizationName: org?.name || 'External Organization',
              projectName,
              externalShareId: share.id,
              accessRole: share.accessRole
            };
          }
          return null;
        })
      );
      
      res.json(tasks.filter(Boolean));
    } catch (err) {
      console.error('Failed to get external tasks:', err);
      res.status(500).json({ message: 'Failed to get external tasks' });
    }
  });
  
  // Get external risks for the current user (with full risk details)
  app.get('/api/external-risks', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const shares = await storage.getExternalSharesForUser(userId);
      const riskShares = shares.filter(s => s.objectType === 'risk');
      
      // Fetch full risk details for each share
      const risks = await Promise.all(
        riskShares.map(async (share) => {
          const risk = await storage.getRisk(share.objectId);
          if (risk) {
            const org = await storage.getOrganization(share.sourceOrganizationId);
            // Get project info for context
            let projectName = null;
            if (risk.projectId) {
              const project = await storage.getProject(risk.projectId);
              projectName = project?.name || null;
            }
            return {
              ...risk,
              isExternal: true,
              sourceOrganizationId: share.sourceOrganizationId,
              sourceOrganizationName: org?.name || 'External Organization',
              projectName,
              externalShareId: share.id,
              accessRole: share.accessRole
            };
          }
          return null;
        })
      );
      
      res.json(risks.filter(Boolean));
    } catch (err) {
      console.error('Failed to get external risks:', err);
      res.status(500).json({ message: 'Failed to get external risks' });
    }
  });
  
  // Get external issues for the current user (with full issue details)
  app.get('/api/external-issues', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const shares = await storage.getExternalSharesForUser(userId);
      const issueShares = shares.filter(s => s.objectType === 'issue');
      
      // Fetch full issue details for each share
      const issues = await Promise.all(
        issueShares.map(async (share) => {
          const issue = await storage.getIssue(share.objectId);
          if (issue) {
            const org = await storage.getOrganization(share.sourceOrganizationId);
            // Get project info for context
            let projectName = null;
            if (issue.projectId) {
              const project = await storage.getProject(issue.projectId);
              projectName = project?.name || null;
            }
            return {
              ...issue,
              isExternal: true,
              sourceOrganizationId: share.sourceOrganizationId,
              sourceOrganizationName: org?.name || 'External Organization',
              projectName,
              externalShareId: share.id,
              accessRole: share.accessRole
            };
          }
          return null;
        })
      );
      
      res.json(issues.filter(Boolean));
    } catch (err) {
      console.error('Failed to get external issues:', err);
      res.status(500).json({ message: 'Failed to get external issues' });
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
      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : undefined;
      
      if (!query || query.length < 2) {
        return res.json({ portfolios: [], projects: [], tasks: [], issues: [], risks: [], milestones: [] });
      }
      
      // Get user's accessible organization IDs for security filtering
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (accessibleOrgIds.length === 0) {
        return res.json({ portfolios: [], projects: [], tasks: [], issues: [], risks: [], milestones: [] });
      }
      
      // If organizationId specified, verify user has access and filter to just that org
      let searchOrgIds = accessibleOrgIds;
      if (organizationId) {
        if (!accessibleOrgIds.includes(organizationId)) {
          return res.json({ portfolios: [], projects: [], tasks: [], issues: [], risks: [], milestones: [] });
        }
        searchOrgIds = [organizationId];
      }
      
      const results = await storage.search(query, searchOrgIds);
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
    let filteredPortfolios = portfolios.filter(p => 
      p.organizationId === null || accessibleOrgIds.includes(p.organizationId)
    );
    
    // For team_member role, further filter to only portfolios they created or are assigned to
    if (userId) {
      const userMemberships = await storage.getUserOrganizations(userId);
      
      for (const membership of userMemberships) {
        if (membership.role === 'team_member') {
          const teamMemberPortfolioIds = await getTeamMemberPortfolioIds(userId, membership.organizationId);
          filteredPortfolios = filteredPortfolios.filter(p => 
            // Keep portfolios not in this org, or portfolios team member has access to
            p.organizationId !== membership.organizationId || 
            teamMemberPortfolioIds.includes(p.id)
          );
        }
      }
    }
    
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
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check portfolio limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES, recordResourceUsage } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.PORTFOLIOS);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Portfolio limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "portfolios"
          });
        }
      }
      
      const input = api.portfolios.create.input.parse(req.body);
      
      // Set createdBy to current user for team member access control
      const portfolioData = {
        ...input,
        createdBy: userId || undefined,
      };
      
      const portfolio = await storage.createPortfolio(portfolioData);
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        await recordResourceUsage(userId, METER_CODES.PORTFOLIOS, portfolio.id, 1, portfolio.organizationId);
      }
      
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
    let filteredProjects = projects.filter(p => 
      p.organizationId === null || accessibleOrgIds.includes(p.organizationId)
    );
    
    // For team_member role, further filter to only assigned projects
    // Apply filtering across all orgs where user has team_member role
    if (userId) {
      const userOrgs = await storage.getUserOrganizations(userId);
      for (const membership of userOrgs) {
        if (membership.role === 'team_member') {
          const assignedProjectIds = await getTeamMemberProjectIds(userId, membership.organizationId);
          filteredProjects = filteredProjects.filter(p => 
            p.organizationId !== membership.organizationId || assignedProjectIds.includes(p.id)
          );
        }
      }
    }
    
    res.json(filteredProjects);
  });

  app.get(api.projects.get.path, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: "Project not found" });
    
    // Fetch user names for createdBy and updatedBy
    let createdByName = null;
    let updatedByName = null;
    
    if ((project as any).createdBy) {
      const [createdByUser] = await db.select().from(users).where(eq(users.id, (project as any).createdBy));
      createdByName = createdByUser ? (createdByUser.firstName && createdByUser.lastName 
        ? `${createdByUser.firstName} ${createdByUser.lastName}` 
        : createdByUser.username || createdByUser.email) : null;
    }
    
    if ((project as any).updatedBy) {
      const [updatedByUser] = await db.select().from(users).where(eq(users.id, (project as any).updatedBy));
      updatedByName = updatedByUser ? (updatedByUser.firstName && updatedByUser.lastName 
        ? `${updatedByUser.firstName} ${updatedByUser.lastName}` 
        : updatedByUser.username || updatedByUser.email) : null;
    }
    
    res.json({
      ...project,
      createdByName,
      updatedByName
    });
  });

  app.post(api.projects.create.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check project limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.PROJECTS);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Project limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "projects"
          });
        }
      }
      
      const input = api.projects.create.input.parse(req.body);
      const sanitizedInput = {
        ...input,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        createdBy: userId || null,
        updatedAt: new Date(),
        updatedBy: userId || null,
      };
      const project = await storage.createProject(sanitizedInput);
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        await recordResourceUsage(userId, METER_CODES.PROJECTS, project.id, 1, project.organizationId);
      }
      
      // Log change
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
      
      // If the creator is a team_member, auto-add this project to their invitedProjectIds
      // so they can see the project they just created
      if (userId && project.organizationId) {
        const userOrgs = await storage.getUserOrganizations(userId);
        const membership = userOrgs.find(m => m.organizationId === project.organizationId);
        if (membership?.role === 'team_member') {
          // Find the user's resource in this org
          const resources = await storage.getResources(project.organizationId);
          const userResource = resources.find(r => r.userId === userId);
          if (userResource) {
            const currentInvites = userResource.invitedProjectIds || [];
            if (!currentInvites.includes(project.id)) {
              await storage.updateResource(userResource.id, {
                invitedProjectIds: [...currentInvites, project.id]
              });
            }
          }
        }
      }
      
      res.status(201).json(project);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Import project from Microsoft Planner (organization-scoped)
  app.post('/api/planner/import', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      const { planId, organizationId, portfolioId } = req.body;
      if (!planId || !organizationId) {
        return res.status(400).json({ message: "Plan ID and Organization ID are required" });
      }
      
      // Try org-scoped token first, fallback to session
      let token = req.session.plannerAccessToken;
      const integration = await getOrgIntegration(organizationId, "planner");
      if (integration?.accessToken) {
        const isExpired = integration.tokenExpiry ? Date.now() > new Date(integration.tokenExpiry).getTime() : false;
        if (!isExpired) {
          token = integration.accessToken;
        }
      }
      
      if (!token) {
        return res.status(401).json({ message: "Not connected to Planner. Please connect first." });
      }

      // Check project limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.PROJECTS);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Project limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "projects"
          });
        }
      }

      // Fetch plan details
      const planResponse = await fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!planResponse.ok) {
        if (planResponse.status === 401) {
          delete req.session.plannerAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect to Planner." });
        }
        throw new Error(`Failed to fetch plan: ${planResponse.status}`);
      }

      const plan = await planResponse.json();

      // Fetch tasks and buckets
      const [tasksResponse, bucketsResponse] = await Promise.all([
        fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}/tasks`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
        fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}/buckets`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
      ]);

      if (!tasksResponse.ok) {
        throw new Error(`Failed to fetch tasks: ${tasksResponse.status}`);
      }

      const tasksData = await tasksResponse.json();
      const plannerTasks = tasksData.value || [];

      let buckets: { id: string; name: string; orderHint: string }[] = [];
      if (bucketsResponse.ok) {
        const bucketsData = await bucketsResponse.json();
        buckets = bucketsData.value || [];
      }

      const bucketMap = new Map(buckets.map((b: any) => [b.id, b.name]));

      // Calculate project dates from tasks
      let projectStartDate: string | null = null;
      let projectEndDate: string | null = null;

      for (const task of plannerTasks) {
        if (task.startDateTime) {
          const startDate = task.startDateTime.split('T')[0];
          if (!projectStartDate || startDate < projectStartDate) {
            projectStartDate = startDate;
          }
        }
        if (task.dueDateTime) {
          const endDate = task.dueDateTime.split('T')[0];
          if (!projectEndDate || endDate > projectEndDate) {
            projectEndDate = endDate;
          }
        }
      }

      // Create the project
      const project = await storage.createProject({
        organizationId: Number(organizationId),
        portfolioId: portfolioId ? Number(portfolioId) : null,
        name: plan.title,
        description: `Imported from Microsoft Planner on ${new Date().toLocaleDateString()}`,
        status: "Initiation",
        priority: "Medium",
        budget: "0",
        health: "Green",
        startDate: projectStartDate,
        endDate: projectEndDate,
        source: "planner",
        plannerPlanId: planId, // Store for future syncing
      });

      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        await recordResourceUsage(userId, METER_CODES.PROJECTS, project.id, 1, project.organizationId);
      }

      // Log change
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createProjectChangeLog({
        projectId: project.id,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'created',
        changeSummary: `Project "${project.name}" imported from Microsoft Planner`,
        previousValues: null,
        newValues: JSON.stringify(project),
      });

      // Sort buckets by orderHint for consistent ordering
      const sortedBuckets = [...buckets].sort((a, b) => (a.orderHint || '').localeCompare(b.orderHint || ''));
      const bucketIndexMap = new Map(sortedBuckets.map((b, i) => [b.id, i + 1]));

      // Sort tasks by orderHint to preserve Planner's display order
      // orderHint is a string that determines the order of tasks in Planner
      const sortedPlannerTasks = [...plannerTasks].sort((a: any, b: any) => {
        // First sort by bucket order, then by task orderHint within each bucket
        const bucketOrderA = a.bucketId ? bucketIndexMap.get(a.bucketId) || 999 : 999;
        const bucketOrderB = b.bucketId ? bucketIndexMap.get(b.bucketId) || 999 : 999;
        if (bucketOrderA !== bucketOrderB) {
          return bucketOrderA - bucketOrderB;
        }
        // Within same bucket, sort by orderHint
        return (a.orderHint || '').localeCompare(b.orderHint || '');
      });

      // Create tasks from Planner tasks
      let taskIndex = 0;
      const createdTasks: any[] = [];

      // Default dates for tasks without dates (use project dates or today)
      const defaultStartDate = projectStartDate || new Date().toISOString().split('T')[0];
      const defaultEndDate = projectEndDate || defaultStartDate;

      for (const plannerTask of sortedPlannerTasks) {
        taskIndex++;
        const bucketName = plannerTask.bucketId ? bucketMap.get(plannerTask.bucketId) || null : null;
        const bucketOrder = plannerTask.bucketId ? bucketIndexMap.get(plannerTask.bucketId) || 1 : 1;

        // Use Planner dates if available, otherwise use project dates or today
        const taskStartDate = plannerTask.startDateTime 
          ? plannerTask.startDateTime.split('T')[0] 
          : defaultStartDate;
        const taskEndDate = plannerTask.dueDateTime 
          ? plannerTask.dueDateTime.split('T')[0] 
          : (plannerTask.startDateTime ? plannerTask.startDateTime.split('T')[0] : defaultEndDate);

        const task = await storage.createTask({
          projectId: project.id,
          taskIndex,
          name: plannerTask.title,
          description: null,
          priority: mapPlannerPriorityToProjectPriority(plannerTask.priority || 5),
          startDate: taskStartDate,
          endDate: taskEndDate,
          progress: plannerTask.percentComplete || 0,
          status: mapPlannerPercentToStatus(plannerTask.percentComplete || 0),
          phase: bucketName,
          outlineLevel: 1,
          isMilestone: false,
          isSummary: false,
          isCritical: false,
        });

        createdTasks.push({ task, plannerTaskId: plannerTask.id, assignments: plannerTask.assignments });
      }

      // Import resources and assignments from Planner
      let resourcesImported = 0;
      try {
        // Collect all unique user IDs from task assignments
        const userIdSet = new Set<string>();
        for (const { assignments } of createdTasks) {
          if (assignments) {
            for (const userId of Object.keys(assignments)) {
              userIdSet.add(userId);
            }
          }
        }

        if (userIdSet.size > 0) {
          console.log(`Planner import: Found ${userIdSet.size} assigned users`);
          
          // Fetch existing resources for matching
          const existingResources = await storage.getResources(Number(organizationId));
          const resourcesByEmail = new Map(existingResources.filter(r => r.email).map(r => [r.email!.toLowerCase(), r]));
          const resourcesByName = new Map(existingResources.map(r => [r.displayName.toLowerCase(), r]));
          const userResourceMap = new Map<string, number>(); // Maps Graph userId to our resourceId
          const assignedPairs = new Set<string>(); // Track assigned pairs

          // Fetch user details from Microsoft Graph (batch request for efficiency)
          const userIds = Array.from(userIdSet);
          for (const msUserId of userIds) {
            try {
              const userResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${msUserId}?$select=id,displayName,mail,userPrincipalName`, {
                headers: {
                  "Authorization": `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              });

              if (userResponse.ok) {
                const userData = await userResponse.json();
                const userName = userData.displayName || 'Unknown User';
                const userEmail = userData.mail || userData.userPrincipalName || null;
                
                console.log(`Planner import: User ${msUserId} - Name: ${userName}, Email: ${userEmail}`);

                // Try to match existing resource by email first, then by name
                let matchedResource = userEmail ? resourcesByEmail.get(userEmail.toLowerCase()) : null;
                if (!matchedResource) {
                  matchedResource = resourcesByName.get(userName.toLowerCase());
                }

                if (matchedResource) {
                  userResourceMap.set(msUserId, matchedResource.id);
                  console.log(`Planner import: Matched resource: ${userName} (ID: ${matchedResource.id})`);
                } else {
                  // Create new resource
                  const newResource = await storage.createResource({
                    organizationId: Number(organizationId),
                    displayName: userName,
                    email: userEmail,
                    title: 'Team Member',
                    resourceType: 'Employee',
                    availability: 100,
                  });

                  userResourceMap.set(msUserId, newResource.id);
                  if (userEmail) {
                    resourcesByEmail.set(userEmail.toLowerCase(), newResource);
                  }
                  resourcesByName.set(userName.toLowerCase(), newResource);

                  resourcesImported++;
                  console.log(`Planner import: Created resource: ${userName} (ID: ${newResource.id}, Email: ${userEmail})`);
                }
              } else {
                console.log(`Planner import: Failed to fetch user ${msUserId}: ${userResponse.status}`);
              }
            } catch (userErr) {
              console.log(`Planner import: Error fetching user ${msUserId}:`, userErr);
            }
          }

          // Create task resource assignments
          for (const { task, assignments } of createdTasks) {
            if (assignments) {
              for (const userId of Object.keys(assignments)) {
                const resourceId = userResourceMap.get(userId);
                if (resourceId) {
                  const pairKey = `${task.id}-${resourceId}`;
                  if (assignedPairs.has(pairKey)) continue;

                  try {
                    await storage.addTaskResourceAssignment({
                      taskId: task.id,
                      resourceId: resourceId,
                    });
                    assignedPairs.add(pairKey);
                    console.log(`Planner import: Assigned resource ${resourceId} to task ${task.id}`);
                  } catch (assignErr) {
                    console.log(`Planner import: Failed to assign resource:`, assignErr);
                  }
                }
              }
            }
          }
        }
      } catch (resourceErr) {
        console.log("Planner import: Error importing resources:", resourceErr);
        // Continue without failing - resources are optional
      }

      res.status(201).json({ 
        project,
        tasksCreated: createdTasks.length,
        resourcesImported,
        message: `Successfully imported "${plan.title}" with ${createdTasks.length} tasks${resourcesImported > 0 ? ` and ${resourcesImported} new resources` : ''}`
      });
    } catch (err: any) {
      console.error("Planner import error:", err);
      console.error("Planner import error stack:", err?.stack);
      res.status(500).json({ 
        message: "Failed to import from Planner", 
        error: err?.message || String(err) 
      });
    }
  });

  // Import project from Dataverse (Planner Premium)
  app.post('/api/dataverse/import', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const token = req.session.dataverseAccessToken;
      const environmentUrl = req.session.dataverseEnvironmentUrl;
      
      if (!token) {
        return res.status(401).json({ message: "Not connected to Dataverse. Please connect first." });
      }
      
      if (!environmentUrl) {
        return res.status(400).json({ message: "Dataverse environment not configured." });
      }

      const { planId, organizationId, portfolioId } = req.body;
      if (!planId || !organizationId) {
        return res.status(400).json({ message: "Plan ID and Organization ID are required" });
      }

      // Fetch WhoAmI to get the Dataverse organization ID for URL construction
      let dataverseOrgId: string | null = null;
      try {
        const whoAmIResponse = await fetch(`${environmentUrl}/api/data/v9.2/WhoAmI`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
          },
        });
        if (whoAmIResponse.ok) {
          const whoAmI = await whoAmIResponse.json();
          dataverseOrgId = whoAmI.OrganizationId || null;
        }
      } catch (err) {
        console.log("Failed to fetch WhoAmI for org ID:", err);
      }

      // Get tenant ID from user profile
      let dataverseTenantId: string | null = null;
      if (userId) {
        const user = await storage.getUser(userId);
        dataverseTenantId = user?.microsoftTenantId || null;
      }

      // Check project limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.PROJECTS);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Project limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "projects"
          });
        }
      }

      // Fetch plan details from Dataverse - use only core columns that exist in all environments
      const planApiUrl = `${environmentUrl}/api/data/v9.2/msdyn_projects(${planId})?$select=msdyn_projectid,msdyn_subject,createdon,modifiedon,statecode,statuscode`;
      const planResponse = await fetch(planApiUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
      });

      if (!planResponse.ok) {
        if (planResponse.status === 401) {
          delete req.session.dataverseAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect to Dataverse." });
        }
        throw new Error(`Failed to fetch plan: ${planResponse.status}`);
      }

      const plan = await planResponse.json();

      // Fetch tasks from Dataverse - try with extended fields first, fall back to minimal
      let dataverseTasks: any[] = [];
      
      // Field sets for import (includes msdyn_displaysequence for proper task ordering)
      const importFieldSets = [
        // Extended fields with displaysequence
        "msdyn_projecttaskid,msdyn_subject,msdyn_progress,msdyn_percentcomplete,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,msdyn_outlinelevel,msdyn_priority,msdyn_description,_msdyn_parenttask_value,statecode",
        // Simpler set with displaysequence
        "msdyn_projecttaskid,msdyn_subject,msdyn_progress,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,_msdyn_parenttask_value,statecode",
        // Minimal with displaysequence
        "msdyn_projecttaskid,msdyn_subject,msdyn_displaysequence,_msdyn_parenttask_value",
        // Absolute minimal without displaysequence
        "msdyn_projecttaskid,msdyn_subject,_msdyn_parenttask_value",
        "msdyn_projecttaskid,msdyn_subject"
      ];
      
      // Try with orderby first, then without
      const importOrderByClauses = ["&$orderby=msdyn_displaysequence asc", ""];
      
      let tasksResponse: Response | null = null;
      let successfulFetch = false;
      
      // Try each field set with ordering first, then without ordering
      for (let oi = 0; oi < importOrderByClauses.length && !successfulFetch; oi++) {
        for (let fi = 0; fi < importFieldSets.length && !successfulFetch; fi++) {
          const orderBy = importOrderByClauses[oi];
          const fields = importFieldSets[fi];
          const tasksApiUrl = `${environmentUrl}/api/data/v9.2/msdyn_projecttasks?$select=${fields}&$filter=_msdyn_project_value eq ${planId}${orderBy}`;
          
          tasksResponse = await fetch(tasksApiUrl, {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "OData-MaxVersion": "4.0",
              "OData-Version": "4.0",
            },
          });
          
          if (tasksResponse.ok) {
            console.log(`Import: Successfully fetched tasks using field set ${fi}${oi === 0 ? ' with displaysequence ordering' : ' without ordering'}`);
            successfulFetch = true;
            break;
          } else {
            console.log(`Import: Field set ${fi} with orderBy[${oi}] failed (status ${tasksResponse.status}), trying next...`);
          }
        }
      }
      
      if (!tasksResponse || !tasksResponse.ok) {
        throw new Error(`Failed to fetch tasks after trying all field sets: ${tasksResponse?.status || 'unknown'}`);
      }

      const tasksData = await tasksResponse.json();
      dataverseTasks = tasksData.value || [];
      
      // Sort tasks by displaysequence to preserve the row order from Planner
      dataverseTasks = dataverseTasks.sort((a: any, b: any) => {
        const seqA = a.msdyn_displaysequence ?? Infinity;
        const seqB = b.msdyn_displaysequence ?? Infinity;
        return seqA - seqB;
      });
      
      console.log(`Import: Sorted ${dataverseTasks.length} tasks by displaysequence for proper row ordering`);

      // Calculate project dates from tasks using available schedule data
      const today = new Date().toISOString().split('T')[0];
      let projectStartDate: string | null = null;
      let projectEndDate: string | null = null;
      
      // Try to extract project dates from tasks if schedule fields are available
      for (const task of dataverseTasks) {
        if (task.msdyn_scheduledstart) {
          const startDate = task.msdyn_scheduledstart.split('T')[0];
          if (!projectStartDate || startDate < projectStartDate) {
            projectStartDate = startDate;
          }
        }
        if (task.msdyn_scheduledend) {
          const endDate = task.msdyn_scheduledend.split('T')[0];
          if (!projectEndDate || endDate > projectEndDate) {
            projectEndDate = endDate;
          }
        }
      }
      
      // Default to today if no dates found
      projectStartDate = projectStartDate || today;
      projectEndDate = projectEndDate || today;

      // Create the project - use msdyn_subject for project name (msdyn_name doesn't exist)
      const project = await storage.createProject({
        organizationId: Number(organizationId),
        portfolioId: portfolioId ? Number(portfolioId) : null,
        name: plan.msdyn_subject || "Imported Project",
        description: `Imported from Planner Premium on ${new Date().toLocaleDateString()}`,
        status: "Initiation",
        priority: "Medium",
        budget: "0",
        health: "Green",
        startDate: projectStartDate,
        endDate: projectEndDate,
        source: "planner_premium",
        plannerPlanId: planId,
        dataverseOrgId: dataverseOrgId,
        dataverseTenantId: dataverseTenantId,
      });

      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        await recordResourceUsage(userId, METER_CODES.PROJECTS, project.id, 1, project.organizationId);
      }

      // Log change
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createProjectChangeLog({
        projectId: project.id,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'created',
        changeSummary: `Project "${project.name}" imported from Planner Premium (Dataverse)`,
        previousValues: null,
        newValues: JSON.stringify(project),
      });

      // Create tasks from Dataverse tasks
      let taskIndex = 0;
      const createdTasks: any[] = [];
      const taskIdMap = new Map<string, number>();

      // Default dates for tasks (schedule fields may not be available in all environments)
      const defaultStartDate = projectStartDate || new Date().toISOString().split('T')[0];
      const defaultEndDate = projectEndDate || defaultStartDate;

      // Helper function to map Dataverse priority to project priority
      const mapDataversePriority = (dvPriority: number | null | undefined): string => {
        if (dvPriority === null || dvPriority === undefined) return "Medium";
        // Dataverse priority: lower number = higher priority (1-10 scale typically)
        if (dvPriority <= 3) return "High";
        if (dvPriority <= 6) return "Medium";
        return "Low";
      };
      
      // Helper to map progress to status
      const mapProgressToStatus = (progress: number): string => {
        if (progress >= 100) return "Completed";
        if (progress > 0) return "In Progress";
        return "Not Started";
      };
      
      // Helper to calculate duration in days
      const calculateDuration = (start: string | null, end: string | null): number => {
        if (!start || !end) return 1; // Default to 1 day for Gantt chart visibility
        const startDate = new Date(start);
        const endDate = new Date(end);
        const diffTime = endDate.getTime() - startDate.getTime();
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(1, days); // Minimum 1 day for Gantt chart bars
      };

      for (const dvTask of dataverseTasks) {
        taskIndex++;
        
        // Use schedule fields if available, otherwise defaults
        const taskStartDate = dvTask.msdyn_scheduledstart 
          ? dvTask.msdyn_scheduledstart.split('T')[0] 
          : defaultStartDate;
        const taskEndDate = dvTask.msdyn_scheduledend 
          ? dvTask.msdyn_scheduledend.split('T')[0] 
          : (dvTask.msdyn_scheduledstart ? dvTask.msdyn_scheduledstart.split('T')[0] : defaultEndDate);

        // Map progress (% complete) - check both msdyn_progress (decimal 0-1) and msdyn_percentcomplete (0-100)
        let progress = 0;
        if (dvTask.msdyn_progress !== null && dvTask.msdyn_progress !== undefined) {
          // msdyn_progress is stored as decimal (0.5 = 50%)
          progress = dvTask.msdyn_progress <= 1 
            ? Math.round(dvTask.msdyn_progress * 100) 
            : Math.round(dvTask.msdyn_progress);
        } else if (dvTask.msdyn_percentcomplete !== null && dvTask.msdyn_percentcomplete !== undefined) {
          // msdyn_percentcomplete is stored as percentage (0-100)
          progress = Math.round(dvTask.msdyn_percentcomplete);
        }
        
        const priority = mapDataversePriority(dvTask.msdyn_priority);
        const status = mapProgressToStatus(progress);

        // Parse WBS ID to determine outline level
        const wbsId = dvTask.msdyn_wbsid || '';
        // Use msdyn_outlinelevel if available, otherwise calculate from WBS
        const outlineLevel = dvTask.msdyn_outlinelevel || (wbsId ? wbsId.split('.').length : 1);
        
        // Calculate duration
        const durationDays = dvTask.msdyn_duration 
          ? Math.round(dvTask.msdyn_duration / (60 * 24)) // Duration is in minutes
          : calculateDuration(taskStartDate, taskEndDate);

        const task = await storage.createTask({
          projectId: project.id,
          taskIndex,
          name: dvTask.msdyn_subject,
          description: dvTask.msdyn_description || (wbsId ? `WBS: ${wbsId}` : null),
          priority,
          startDate: taskStartDate,
          endDate: taskEndDate,
          durationDays,
          progress,
          status,
          outlineLevel,
          isMilestone: false,  // Don't auto-detect milestones - let users set this
          isSummary: false,
          isCritical: false,
          wbs: wbsId || null,
        });

        taskIdMap.set(dvTask.msdyn_projecttaskid, task.id);
        createdTasks.push(task);
      }

      // Update parent task references and collect parent task IDs
      const parentTaskIds = new Set<number>();
      for (const dvTask of dataverseTasks) {
        if (dvTask._msdyn_parenttask_value) {
          const childTaskId = taskIdMap.get(dvTask.msdyn_projecttaskid);
          const parentTaskId = taskIdMap.get(dvTask._msdyn_parenttask_value);
          if (childTaskId && parentTaskId) {
            await storage.updateTask(childTaskId, { parentId: parentTaskId });
            parentTaskIds.add(parentTaskId);
          }
        }
      }

      // Mark all parent tasks as summary tasks
      for (const parentId of parentTaskIds) {
        await storage.updateTask(parentId, { isSummary: true });
      }

      // Recalculate outline levels based on hierarchy
      const taskParentMapImport = new Map<number, number | null>();
      for (const dvTask of dataverseTasks) {
        const taskId = taskIdMap.get(dvTask.msdyn_projecttaskid);
        const parentId = dvTask._msdyn_parenttask_value ? taskIdMap.get(dvTask._msdyn_parenttask_value) : null;
        if (taskId) {
          taskParentMapImport.set(taskId, parentId || null);
        }
      }

      const calculateLevelImport = (taskId: number, visited = new Set<number>()): number => {
        if (visited.has(taskId)) return 1;
        visited.add(taskId);
        const parentId = taskParentMapImport.get(taskId);
        if (!parentId) return 1;
        return 1 + calculateLevelImport(parentId, visited);
      };

      for (const [taskId] of taskParentMapImport) {
        const level = calculateLevelImport(taskId);
        await storage.updateTask(taskId, { outlineLevel: level });
      }

      // Import resources and assignments from Planner Premium
      let resourcesImported = 0;
      try {
        // Fetch existing resources for matching
        const existingResources = await storage.getResources(project.organizationId!);
        const resourcesByName = new Map(existingResources.map(r => [r.displayName.toLowerCase(), r]));
        const resourcesByEmail = new Map(existingResources.filter(r => r.email).map(r => [r.email!.toLowerCase(), r]));
        const bookableResourceMap = new Map<string, number>(); // Maps Dataverse bookableResourceId to our resourceId
        const assignedPairs = new Set<string>(); // Track assigned resource-task pairs to prevent duplicates

        // Try multiple API approaches to fetch team members
        const teamApiUrls = [
          `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$expand=msdyn_bookableresourceid($select=name,msdyn_primaryemail,emailaddress1)&$filter=_msdyn_project_value eq ${planId}`,
          `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$expand=msdyn_bookableresourceid($select=name)&$filter=_msdyn_project_value eq ${planId}`,
          `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$filter=_msdyn_project_value eq ${planId}`,
        ];

        let teamResponse: Response | null = null;
        let teamFetched = false;
        let teamApiUrlIndex = -1;

        for (let i = 0; i < teamApiUrls.length; i++) {
          teamResponse = await fetch(teamApiUrls[i], {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "OData-MaxVersion": "4.0",
              "OData-Version": "4.0",
            },
          });
          if (teamResponse.ok) {
            teamFetched = true;
            teamApiUrlIndex = i;
            break;
          }
          console.log(`Import: Team API attempt ${i + 1} failed (status ${teamResponse.status}), trying next...`);
        }

        if (teamResponse && teamFetched) {
          const teamData = await teamResponse.json();
          const teamMembers = teamData.value || [];
          console.log(`Import: Found ${teamMembers.length} team members (using API variant ${teamApiUrlIndex + 1})`);

          // Process each team member
          for (const member of teamMembers) {
            const memberName = member.msdyn_bookableresourceid?.name || member.msdyn_name;
            let memberEmail = member.msdyn_bookableresourceid?.msdyn_primaryemail || member.msdyn_bookableresourceid?.emailaddress1;
            const bookableResourceId = member._msdyn_bookableresourceid_value;

            if (!memberName) continue;

            // If email not in expanded data, try to fetch from bookableresources entity directly
            if (!memberEmail && bookableResourceId) {
              try {
                // First try with just name and userid - these are the most reliable fields
                const brResponse = await fetch(
                  `${environmentUrl}/api/data/v9.2/bookableresources(${bookableResourceId})?$select=name,_userid_value`,
                  {
                    headers: {
                      "Authorization": `Bearer ${token}`,
                      "Content-Type": "application/json",
                      "OData-MaxVersion": "4.0",
                      "OData-Version": "4.0",
                    },
                  }
                );
                if (brResponse.ok) {
                  const brData = await brResponse.json();
                  console.log(`Import: Bookable resource data for ${memberName}:`, JSON.stringify(brData));
                  
                  // The userId field links to the Dataverse systemuser - use it to fetch email
                  if (brData._userid_value) {
                    console.log(`Import: Trying Dataverse systemusers with userId ${brData._userid_value}`);
                    try {
                      // Fetch email from Dataverse systemusers entity (same token works)
                      const systemUserResponse = await fetch(
                        `${environmentUrl}/api/data/v9.2/systemusers(${brData._userid_value})?$select=internalemailaddress,domainname,fullname`,
                        {
                          headers: {
                            "Authorization": `Bearer ${token}`,
                            "Content-Type": "application/json",
                            "OData-MaxVersion": "4.0",
                            "OData-Version": "4.0",
                          },
                        }
                      );
                      if (systemUserResponse.ok) {
                        const systemUserData = await systemUserResponse.json();
                        console.log(`Import: Systemuser data for ${memberName}:`, JSON.stringify(systemUserData));
                        memberEmail = systemUserData.internalemailaddress || systemUserData.domainname;
                        if (memberEmail) {
                          console.log(`Import: Fetched email from Dataverse systemusers for ${memberName}: ${memberEmail}`);
                        }
                      } else {
                        const errorText = await systemUserResponse.text();
                        console.log(`Import: Dataverse systemusers API failed for ${memberName}: ${systemUserResponse.status} - ${errorText}`);
                      }
                    } catch (systemUserErr) {
                      console.log(`Import: Could not fetch systemuser details for ${memberName}:`, systemUserErr);
                    }
                  } else {
                    console.log(`Import: No userId in Dataverse for ${memberName} - cannot lookup email`);
                  }
                  
                  if (memberEmail) {
                    console.log(`Import: Fetched email for ${memberName}: ${memberEmail}`);
                  }
                } else {
                  const errorText = await brResponse.text();
                  console.log(`Import: Bookable resource fetch failed for ${memberName}: ${brResponse.status} - ${errorText}`);
                }
              } catch (brErr) {
                console.log(`Import: Could not fetch bookable resource details for ${memberName}`);
              }
            }

            // Try to match existing resource by name or email
            // First try matching by email (most reliable - primary identifier)
            let matchedResource: typeof existingResources[0] | undefined;
            if (memberEmail) {
              matchedResource = resourcesByEmail.get(memberEmail.toLowerCase());
            }
            // Then try matching by display name
            if (!matchedResource && memberName) {
              matchedResource = resourcesByName.get(memberName.toLowerCase());
            }

            if (matchedResource) {
              if (bookableResourceId) {
                bookableResourceMap.set(bookableResourceId, matchedResource.id);
              }
              // Update existing resource with email if it was missing or different (email is primary identifier)
              if (memberEmail && (!matchedResource.email || matchedResource.email.toLowerCase() !== memberEmail.toLowerCase())) {
                try {
                  await storage.updateResource(matchedResource.id, { email: memberEmail });
                  console.log(`Import: Updated resource ${memberName} with email: ${memberEmail} (was: ${matchedResource.email || 'none'})`);
                  // Update local cache
                  matchedResource.email = memberEmail;
                  resourcesByEmail.set(memberEmail.toLowerCase(), matchedResource);
                } catch (updateErr) {
                  console.log(`Import: Could not update email for ${memberName}`);
                }
              }
              console.log(`Import: Matched resource: ${memberName} (ID: ${matchedResource.id})`);
            } else {
              // Create new resource in resource pool
              try {
                const newResource = await storage.createResource({
                  organizationId: project.organizationId!,
                  displayName: memberName,
                  email: memberEmail || null,
                  title: 'Team Member',
                  resourceType: 'Employee',
                  availability: 100,
                });

                if (bookableResourceId) {
                  bookableResourceMap.set(bookableResourceId, newResource.id);
                }
                resourcesByName.set(memberName.toLowerCase(), newResource);
                if (memberEmail) {
                  resourcesByEmail.set(memberEmail.toLowerCase(), newResource);
                }

                resourcesImported++;
                console.log(`Import: Created resource: ${memberName} (ID: ${newResource.id}, Email: ${memberEmail || 'none'})`);
              } catch (createErr) {
                console.log(`Import: Failed to create resource ${memberName}:`, createErr);
              }
            }
          }

          // Fetch and apply resource assignments
          const assignmentApiUrls = [
            `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments?$filter=_msdyn_projectid_value eq ${planId}`,
            `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments`,
          ];

          let assignmentsResponse: Response | null = null;
          let assignmentsFetched = false;

          for (let i = 0; i < assignmentApiUrls.length; i++) {
            assignmentsResponse = await fetch(assignmentApiUrls[i], {
              headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
              },
            });
            if (assignmentsResponse.ok) {
              console.log(`Import: Successfully fetched resource assignments using API variant ${i + 1}`);
              assignmentsFetched = true;
              break;
            }
            console.log(`Import: Assignments API attempt ${i + 1} failed (status ${assignmentsResponse.status}), trying next...`);
          }

          if (assignmentsResponse && assignmentsFetched) {
            const assignmentsData = await assignmentsResponse.json();
            let assignments = assignmentsData.value || [];

            // Filter to only include tasks in our project
            const projectTaskIds = new Set(Array.from(taskIdMap.keys()));
            assignments = assignments.filter((a: any) => {
              const taskId = a._msdyn_projecttaskid_value || a._msdyn_projecttask_value || a._msdyn_taskid_value;
              return taskId && projectTaskIds.has(taskId);
            });

            console.log(`Import: Found ${assignments.length} relevant resource assignments`);

            // Apply assignments to tasks
            for (const assignment of assignments) {
              const dvTaskId = assignment._msdyn_projecttaskid_value || assignment._msdyn_projecttask_value || assignment._msdyn_taskid_value;
              const dvResourceId = assignment._msdyn_bookableresourceid_value || assignment._bookableresource_value;

              if (!dvTaskId || !dvResourceId) continue;

              const ourTaskId = taskIdMap.get(dvTaskId);
              const ourResourceId = bookableResourceMap.get(dvResourceId);

              if (ourTaskId && ourResourceId) {
                const pairKey = `${ourTaskId}-${ourResourceId}`;
                if (assignedPairs.has(pairKey)) continue;

                try {
                  await storage.addTaskResourceAssignment({
                    taskId: ourTaskId,
                    resourceId: ourResourceId,
                  });
                  assignedPairs.add(pairKey);
                  console.log(`Import: Assigned resource ${ourResourceId} to task ${ourTaskId}`);
                } catch (assignErr) {
                  console.log(`Import: Failed to assign resource ${ourResourceId} to task ${ourTaskId}:`, assignErr);
                }
              }
            }
          }
        }
      } catch (resourceErr) {
        console.log("Import: Error importing resources from Planner Premium:", resourceErr);
        // Continue without failing the import - resources are optional
      }

      res.status(201).json({ 
        project,
        tasksCreated: createdTasks.length,
        resourcesImported,
        message: `Successfully imported "${plan.msdyn_subject || project.name}" with ${createdTasks.length} tasks${resourcesImported > 0 ? ` and ${resourcesImported} new resources` : ''} from Planner Premium`
      });
    } catch (err: any) {
      console.error("Dataverse import error:", err);
      console.error("Dataverse import error stack:", err?.stack);
      res.status(500).json({ 
        message: "Failed to import from Planner Premium", 
        error: err?.message || String(err) 
      });
    }
  });

  // Sync tasks from Planner for a project
  app.post('/api/projects/:id/sync-planner', async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      if ((project.source !== "planner" && project.source !== "planner_premium") || !project.plannerPlanId) {
        return res.status(400).json({ message: "Project is not linked to Microsoft Planner" });
      }

      const planId = project.plannerPlanId;
      // Detect Premium plans by source OR by GUID-style plannerPlanId (Dataverse uses GUIDs)
      const isGuidPlanId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId);
      const isPremium = project.source === "planner_premium" || (project.source === "planner" && isGuidPlanId);

      // For Premium plans, use Dataverse sync instead of regular Planner
      if (isPremium) {
        const dataverseToken = req.session.dataverseAccessToken;
        const environmentUrl = req.session.dataverseEnvironmentUrl;
        
        if (!dataverseToken || !environmentUrl) {
          return res.status(401).json({ message: "Not connected to Dataverse. Please reconnect." });
        }

        // Fetch WhoAmI to get org ID if project doesn't have it
        if (!project.dataverseOrgId || !project.dataverseTenantId) {
          try {
            const whoAmIResponse = await fetch(`${environmentUrl}/api/data/v9.2/WhoAmI`, {
              headers: {
                "Authorization": `Bearer ${dataverseToken}`,
                "Content-Type": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
              },
            });
            if (whoAmIResponse.ok) {
              const whoAmI = await whoAmIResponse.json();
              const userId = getUserIdFromRequest(req);
              const user = userId ? await storage.getUser(userId) : null;
              
              // Update project with org and tenant IDs
              await storage.updateProject(projectId, {
                dataverseOrgId: whoAmI.OrganizationId || null,
                dataverseTenantId: user?.microsoftTenantId || null,
              });
            }
          } catch (err) {
            console.log("Failed to fetch WhoAmI for org ID during sync:", err);
          }
        }

        // Fetch tasks from Dataverse with extended fields
        // Try different field combinations as Dataverse environments may have different schemas
        // Note: msdyn_progress stores decimal (0-1), msdyn_percentcomplete stores percentage (0-100)
        const fieldSets = [
          // Full Project for the Web schema with msdyn_progress and msdyn_displaysequence for ordering
          "msdyn_projecttaskid,msdyn_subject,msdyn_progress,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,msdyn_outlinelevel,msdyn_priority,msdyn_description,_msdyn_parenttask_value,statecode",
          // Try with msdyn_percentcomplete instead (some environments use this)
          "msdyn_projecttaskid,msdyn_subject,msdyn_percentcomplete,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,msdyn_outlinelevel,msdyn_priority,msdyn_description,_msdyn_parenttask_value,statecode",
          // Simpler set with msdyn_progress AND msdyn_displaysequence for proper sequencing
          "msdyn_projecttaskid,msdyn_subject,msdyn_progress,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,_msdyn_parenttask_value,statecode",
          // Simpler set with msdyn_percentcomplete AND msdyn_displaysequence for proper sequencing
          "msdyn_projecttaskid,msdyn_subject,msdyn_percentcomplete,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,_msdyn_parenttask_value,statecode",
          // Basic fields with msdyn_displaysequence for sequencing
          "msdyn_projecttaskid,msdyn_subject,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,_msdyn_parenttask_value,statecode",
          // Basic fields without msdyn_displaysequence (fallback without sequencing)
          "msdyn_projecttaskid,msdyn_subject,msdyn_progress,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,_msdyn_parenttask_value,statecode",
          // Minimal fallback with parent task for hierarchy
          "msdyn_projecttaskid,msdyn_subject,_msdyn_parenttask_value",
          // Absolute minimal
          "msdyn_projecttaskid,msdyn_subject"
        ];
        
        // Try with $orderby first, then without (some environments don't support ordering by msdyn_displaysequence)
        const orderByClauses = ["&$orderby=msdyn_displaysequence asc", ""];
        
        let tasksResponse: Response | null = null;
        let fieldSetIndex = 0;
        let orderByIndex = 0;
        let successfulFetch = false;
        
        // Try each field set with ordering first, then without ordering
        for (let oi = 0; oi < orderByClauses.length && !successfulFetch; oi++) {
          for (let fi = 0; fi < fieldSets.length && !successfulFetch; fi++) {
            const orderBy = orderByClauses[oi];
            const fields = fieldSets[fi];
            const tasksApiUrl = `${environmentUrl}/api/data/v9.2/msdyn_projecttasks?$select=${fields}&$filter=_msdyn_project_value eq ${planId}${orderBy}`;
            
            tasksResponse = await fetch(tasksApiUrl, {
              headers: {
                "Authorization": `Bearer ${dataverseToken}`,
                "Content-Type": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
              },
            });
            
            if (tasksResponse.ok) {
              fieldSetIndex = fi;
              orderByIndex = oi;
              successfulFetch = true;
              break;
            } else {
              console.log(`Field set ${fi} with orderBy[${oi}] failed (status ${tasksResponse.status}), trying next...`);
            }
          }
        }
        
        if (!tasksResponse || !tasksResponse.ok) {
          if (tasksResponse?.status === 401) {
            delete req.session.dataverseAccessToken;
            return res.status(401).json({ message: "Session expired. Please reconnect to Dataverse." });
          }
          throw new Error(`Failed to fetch tasks after trying all field sets: ${tasksResponse?.status || 'unknown'}`);
        }
        
        console.log(`Successfully fetched tasks using field set ${fieldSetIndex}${orderByIndex === 0 ? ' with WBS ordering' : ' without ordering'}: ${fieldSets[fieldSetIndex]}`);

        const tasksData = await tasksResponse.json();
        let dataverseTasks = tasksData.value || [];
        
        // Log first task to debug field availability
        if (dataverseTasks.length > 0) {
          console.log("Dataverse sync - First task fields available:", Object.keys(dataverseTasks[0]));
          console.log("Dataverse sync - First task sample:", JSON.stringify(dataverseTasks[0], null, 2));
        }

        // Sort tasks by displaysequence to preserve the row order from Planner
        // msdyn_displaysequence is a decimal number (e.g., 1.0, 2.0, 3.5)
        dataverseTasks = dataverseTasks.sort((a: any, b: any) => {
          const seqA = a.msdyn_displaysequence ?? Infinity;
          const seqB = b.msdyn_displaysequence ?? Infinity;
          return seqA - seqB;
        });
        
        console.log(`Sorted ${dataverseTasks.length} tasks by displaysequence for proper row ordering`);

        // Get existing tasks for this project
        const existingTasks = await storage.getTasksByProject(projectId);
        
        // Delete all existing tasks for this project (full sync)
        // First delete task resource assignments to avoid FK constraint violations
        for (const task of existingTasks) {
          await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, task.id));
        }
        for (const task of existingTasks) {
          await storage.deleteTask(task.id);
        }

        // Calculate project dates from tasks
        const today = new Date().toISOString().split('T')[0];
        let projectStartDate: string | null = null;
        let projectEndDate: string | null = null;
        
        for (const task of dataverseTasks) {
          if (task.msdyn_scheduledstart) {
            const startDate = task.msdyn_scheduledstart.split('T')[0];
            if (!projectStartDate || startDate < projectStartDate) {
              projectStartDate = startDate;
            }
          }
          if (task.msdyn_scheduledend) {
            const endDate = task.msdyn_scheduledend.split('T')[0];
            if (!projectEndDate || endDate > projectEndDate) {
              projectEndDate = endDate;
            }
          }
        }
        
        const defaultStartDate = projectStartDate || today;
        const defaultEndDate = projectEndDate || today;

        // Helper functions
        const mapDataversePriority = (dvPriority: number | null | undefined): string => {
          if (dvPriority === null || dvPriority === undefined) return "Medium";
          if (dvPriority <= 3) return "High";
          if (dvPriority <= 6) return "Medium";
          return "Low";
        };
        
        const mapProgressToStatus = (progress: number): string => {
          if (progress >= 100) return "Completed";
          if (progress > 0) return "In Progress";
          return "Not Started";
        };
        
        const calculateDuration = (start: string | null, end: string | null): number => {
          if (!start || !end) return 1; // Default to 1 day for Gantt chart visibility
          const startDate = new Date(start);
          const endDate = new Date(end);
          const diffTime = endDate.getTime() - startDate.getTime();
          const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return Math.max(1, days); // Minimum 1 day for Gantt chart bars
        };

        // Create tasks from Dataverse
        let taskIndex = 0;
        const createdTasks: any[] = [];
        const taskIdMap = new Map<string, number>();

        for (const dvTask of dataverseTasks) {
          taskIndex++;
          
          const taskStartDate = dvTask.msdyn_scheduledstart 
            ? dvTask.msdyn_scheduledstart.split('T')[0] 
            : defaultStartDate;
          const taskEndDate = dvTask.msdyn_scheduledend 
            ? dvTask.msdyn_scheduledend.split('T')[0] 
            : (dvTask.msdyn_scheduledstart ? dvTask.msdyn_scheduledstart.split('T')[0] : defaultEndDate);

          // Handle progress - check both msdyn_progress (decimal 0-1) and msdyn_percentcomplete (0-100)
          let progress = 0;
          if (dvTask.msdyn_progress !== null && dvTask.msdyn_progress !== undefined) {
            // msdyn_progress is stored as decimal (0.5 = 50%)
            progress = dvTask.msdyn_progress <= 1 
              ? Math.round(dvTask.msdyn_progress * 100) 
              : Math.round(dvTask.msdyn_progress);
          } else if (dvTask.msdyn_percentcomplete !== null && dvTask.msdyn_percentcomplete !== undefined) {
            // msdyn_percentcomplete is stored as percentage (0-100)
            progress = Math.round(dvTask.msdyn_percentcomplete);
          }
          
          const priority = mapDataversePriority(dvTask.msdyn_priority);
          const status = mapProgressToStatus(progress);
          const wbsId = dvTask.msdyn_wbsid || '';
          // Initially set outlineLevel to 1, will recalculate from hierarchy later
          const outlineLevel = dvTask.msdyn_outlinelevel || (wbsId ? wbsId.split('.').length : 1);
          const durationDays = dvTask.msdyn_duration 
            ? Math.round(dvTask.msdyn_duration / (60 * 24))
            : calculateDuration(taskStartDate, taskEndDate);

          const task = await storage.createTask({
            projectId: project.id,
            taskIndex,
            name: dvTask.msdyn_subject,
            description: dvTask.msdyn_description || (wbsId ? `WBS: ${wbsId}` : null),
            priority,
            startDate: taskStartDate,
            endDate: taskEndDate,
            durationDays,
            progress,
            status,
            outlineLevel,
            isMilestone: false,  // Don't auto-detect milestones - let users set this
            isSummary: false,
            isCritical: false,
            wbs: wbsId || null,
          });

          taskIdMap.set(dvTask.msdyn_projecttaskid, task.id);
          createdTasks.push(task);
        }

        // Update parent task references and collect parent task IDs
        const parentTaskIds = new Set<number>();
        for (const dvTask of dataverseTasks) {
          if (dvTask._msdyn_parenttask_value) {
            const childTaskId = taskIdMap.get(dvTask.msdyn_projecttaskid);
            const parentTaskId = taskIdMap.get(dvTask._msdyn_parenttask_value);
            if (childTaskId && parentTaskId) {
              await storage.updateTask(childTaskId, { parentId: parentTaskId });
              parentTaskIds.add(parentTaskId);
            }
          }
        }

        // Mark all parent tasks as summary tasks
        for (const parentId of parentTaskIds) {
          await storage.updateTask(parentId, { isSummary: true });
        }

        // Recalculate outline levels based on hierarchy
        // Build a map of task ID to parent ID for level calculation
        const taskParentMap = new Map<number, number | null>();
        for (const dvTask of dataverseTasks) {
          const taskId = taskIdMap.get(dvTask.msdyn_projecttaskid);
          const parentId = dvTask._msdyn_parenttask_value ? taskIdMap.get(dvTask._msdyn_parenttask_value) : null;
          if (taskId) {
            taskParentMap.set(taskId, parentId || null);
          }
        }

        // Calculate level for each task by walking up the parent chain
        const calculateLevel = (taskId: number, visited = new Set<number>()): number => {
          if (visited.has(taskId)) return 1; // Prevent infinite loops
          visited.add(taskId);
          const parentId = taskParentMap.get(taskId);
          if (!parentId) return 1; // Root level
          return 1 + calculateLevel(parentId, visited);
        };

        // Update outline levels for all tasks
        for (const [taskId] of taskParentMap) {
          const level = calculateLevel(taskId);
          await storage.updateTask(taskId, { outlineLevel: level });
        }

        // =====================================================
        // Import Resources from Planner Premium (Project Team)
        // =====================================================
        let resourcesSynced = 0;
        const bookableResourceMap = new Map<string, number>(); // Dataverse bookableresourceid -> our resource ID
        const assignedPairs = new Set<string>(); // Track assigned task-resource pairs to avoid duplicates
        
        try {
          // Try multiple API approaches to fetch team members (different Dataverse schemas)
          const teamApiUrls = [
            // Full expand with msdyn_primaryemail (Project Operations)
            `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$expand=msdyn_bookableresourceid($select=name,msdyn_primaryemail,emailaddress1)&$filter=_msdyn_project_value eq ${planId}`,
            // Simpler expand with just name (some environments)
            `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$expand=msdyn_bookableresourceid($select=name)&$filter=_msdyn_project_value eq ${planId}`,
            // No expand - just get team member names
            `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$filter=_msdyn_project_value eq ${planId}`,
          ];
          
          let teamResponse: Response | null = null;
          let teamApiUrlIndex = 0;
          
          for (let i = 0; i < teamApiUrls.length; i++) {
            teamResponse = await fetch(teamApiUrls[i], {
              headers: {
                "Authorization": `Bearer ${dataverseToken}`,
                "Content-Type": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
              },
            });
            if (teamResponse.ok) {
              teamApiUrlIndex = i;
              break;
            }
            console.log(`Team API attempt ${i + 1} failed (status ${teamResponse.status}), trying next...`);
          }

          if (teamResponse && teamResponse.ok) {
            const teamData = await teamResponse.json();
            const teamMembers = teamData.value || [];
            
            console.log(`Planner Premium sync - Found ${teamMembers.length} team members (using API variant ${teamApiUrlIndex + 1})`);
            if (teamMembers.length > 0) {
              console.log("Sample team member:", JSON.stringify(teamMembers[0], null, 2));
            }

            // Get existing resources for this organization to match
            const existingResources = project.organizationId 
              ? await storage.getResources(project.organizationId)
              : [];
            
            // Create a map of existing resources by email and displayName for matching
            const resourcesByEmail = new Map<string, typeof existingResources[0]>();
            const resourcesByName = new Map<string, typeof existingResources[0]>();
            for (const res of existingResources) {
              if (res.email) {
                resourcesByEmail.set(res.email.toLowerCase(), res);
              }
              if (res.displayName) {
                resourcesByName.set(res.displayName.toLowerCase(), res);
              }
            }

            // Process each team member
            for (const teamMember of teamMembers) {
              const bookableResourceId = teamMember._msdyn_bookableresourceid_value;
              const bookableResource = teamMember.msdyn_bookableresourceid;
              
              // Get name from bookable resource or fallback to team member name
              const memberName = bookableResource?.name || teamMember.msdyn_name;
              
              // Skip if we can't determine a valid name
              if (!memberName || memberName === 'Unknown Resource' || memberName.trim() === '') {
                console.log(`Skipping team member with no valid name`);
                continue;
              }
              
              // Get email from multiple possible fields (different Dataverse schemas)
              let memberEmail = bookableResource?.msdyn_primaryemail || 
                                  bookableResource?.emailaddress1 || 
                                  null;
              
              // If email not in expanded data, try to fetch from bookableresources entity directly
              if (!memberEmail && bookableResourceId) {
                try {
                  // Only request name and userid - email fields may not exist in all Dataverse schemas
                  const brResponse = await fetch(
                    `${environmentUrl}/api/data/v9.2/bookableresources(${bookableResourceId})?$select=name,_userid_value`,
                    {
                      headers: {
                        "Authorization": `Bearer ${dataverseToken}`,
                        "Content-Type": "application/json",
                        "OData-MaxVersion": "4.0",
                        "OData-Version": "4.0",
                      },
                    }
                  );
                  if (brResponse.ok) {
                    const brData = await brResponse.json();
                    console.log(`Planner sync: Bookable resource data for ${memberName}:`, JSON.stringify(brData));
                    
                    // The userId field links to the Dataverse systemuser - use it to fetch email
                    if (brData._userid_value) {
                      console.log(`Planner sync: Trying Dataverse systemusers with userId ${brData._userid_value}`);
                      try {
                        // Fetch email from Dataverse systemusers entity (same token works)
                        const systemUserResponse = await fetch(
                          `${environmentUrl}/api/data/v9.2/systemusers(${brData._userid_value})?$select=internalemailaddress,domainname,fullname`,
                          {
                            headers: {
                              "Authorization": `Bearer ${dataverseToken}`,
                              "Content-Type": "application/json",
                              "OData-MaxVersion": "4.0",
                              "OData-Version": "4.0",
                            },
                          }
                        );
                        if (systemUserResponse.ok) {
                          const systemUserData = await systemUserResponse.json();
                          console.log(`Planner sync: Systemuser data for ${memberName}:`, JSON.stringify(systemUserData));
                          memberEmail = systemUserData.internalemailaddress || systemUserData.domainname;
                          if (memberEmail) {
                            console.log(`Planner sync: Fetched email from Dataverse systemusers for ${memberName}: ${memberEmail}`);
                          }
                        } else {
                          const errorText = await systemUserResponse.text();
                          console.log(`Planner sync: Dataverse systemusers API failed for ${memberName}: ${systemUserResponse.status} - ${errorText}`);
                        }
                      } catch (systemUserErr) {
                        console.log(`Planner sync: Could not fetch systemuser details for ${memberName}:`, systemUserErr);
                      }
                    } else {
                      console.log(`Planner sync: No userId in Dataverse for ${memberName} - cannot lookup email`);
                    }
                    
                    if (memberEmail) {
                      console.log(`Planner sync: Fetched email for ${memberName}: ${memberEmail}`);
                    }
                  } else {
                    const errorText = await brResponse.text();
                    console.log(`Planner sync: Bookable resource fetch failed for ${memberName}: ${brResponse.status} - ${errorText}`);
                  }
                } catch (brErr) {
                  console.log(`Planner sync: Could not fetch bookable resource details for ${memberName}:`, brErr);
                }
              }
              
              // Try to match with existing resource first
              let matchedResource: typeof existingResources[0] | undefined;
              
              // First try matching by email (most reliable)
              if (memberEmail) {
                matchedResource = resourcesByEmail.get(memberEmail.toLowerCase());
              }
              
              // Then try matching by exact displayName
              if (!matchedResource && memberName) {
                matchedResource = resourcesByName.get(memberName.toLowerCase());
              }
              
              if (matchedResource) {
                // Use existing resource
                if (bookableResourceId) {
                  bookableResourceMap.set(bookableResourceId, matchedResource.id);
                }
                // Update existing resource with email if it was missing or different (email is primary identifier)
                if (memberEmail && (!matchedResource.email || matchedResource.email.toLowerCase() !== memberEmail.toLowerCase())) {
                  try {
                    await storage.updateResource(matchedResource.id, { email: memberEmail });
                    console.log(`Planner sync: Updated resource ${memberName} with email: ${memberEmail} (was: ${matchedResource.email || 'none'})`);
                    // Update local cache
                    matchedResource.email = memberEmail;
                    resourcesByEmail.set(memberEmail.toLowerCase(), matchedResource);
                  } catch (updateErr) {
                    console.log(`Planner sync: Could not update email for ${memberName}`);
                  }
                }
                console.log(`Matched resource: ${memberName} (ID: ${matchedResource.id})`);
              } else if (project.organizationId) {
                // Create new resource in resource pool
                try {
                  const newResource = await storage.createResource({
                    organizationId: project.organizationId,
                    displayName: memberName,
                    email: memberEmail || null,
                    title: 'Team Member',
                    resourceType: 'Employee',
                    availability: 100,
                  });
                  
                  if (bookableResourceId) {
                    bookableResourceMap.set(bookableResourceId, newResource.id);
                  }
                  // Also add to name map for future matching
                  resourcesByName.set(memberName.toLowerCase(), newResource);
                  if (memberEmail) {
                    resourcesByEmail.set(memberEmail.toLowerCase(), newResource);
                  }
                  
                  resourcesSynced++;
                  console.log(`Created resource: ${memberName} (ID: ${newResource.id})`);
                } catch (createErr) {
                  console.log(`Failed to create resource ${memberName}:`, createErr);
                }
              }
            }

            // Try multiple API approaches to fetch resource assignments
            // Different Dataverse schemas may use different field names or entities
            const assignmentApiUrls = [
              // Standard approach with project filter
              `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments?$select=msdyn_resourceassignmentid,_msdyn_projecttaskid_value,_msdyn_bookableresourceid_value&$filter=_msdyn_projectid_value eq ${planId}`,
              // Without project filter (will filter locally)
              `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments?$select=msdyn_resourceassignmentid,_msdyn_projecttaskid_value,_msdyn_bookableresourceid_value`,
              // Try with minimal fields (some schemas might not have all fields)
              `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments?$filter=_msdyn_projectid_value eq ${planId}`,
              // Without any select (get all fields)
              `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments`,
              // Try bookableresourcebookings entity (alternative for some schemas)
              `${environmentUrl}/api/data/v9.2/bookableresourcebookings?$select=bookableresourcebookingid,_bookableresource_value&$filter=_msdyn_projecttask_value ne null`,
            ];
            
            let assignmentsResponse: Response | null = null;
            let assignmentsFetched = false;
            
            for (let i = 0; i < assignmentApiUrls.length; i++) {
              assignmentsResponse = await fetch(assignmentApiUrls[i], {
                headers: {
                  "Authorization": `Bearer ${dataverseToken}`,
                  "Content-Type": "application/json",
                  "OData-MaxVersion": "4.0",
                  "OData-Version": "4.0",
                },
              });
              if (assignmentsResponse.ok) {
                console.log(`Successfully fetched resource assignments using API variant ${i + 1}`);
                assignmentsFetched = true;
                break;
              }
              console.log(`Assignments API attempt ${i + 1} failed (status ${assignmentsResponse.status}), trying next...`);
            }

            if (assignmentsResponse && assignmentsFetched) {
              const assignmentsData = await assignmentsResponse.json();
              let assignments = assignmentsData.value || [];
              
              // Log sample assignment for debugging
              if (assignments.length > 0) {
                console.log("Sample assignment record:", JSON.stringify(assignments[0], null, 2));
              }
              
              // If we used the unfiltered query, filter manually to only include tasks in our project
              const projectTaskIds = new Set(Array.from(taskIdMap.keys()));
              assignments = assignments.filter((a: any) => {
                // Support different field names for task ID across different Dataverse schemas
                const taskId = a._msdyn_projecttaskid_value || a._msdyn_projecttask_value || a._msdyn_taskid_value;
                return taskId && projectTaskIds.has(taskId);
              });
              
              console.log(`Planner Premium sync - Found ${assignments.length} relevant resource assignments`);

              // Apply assignments to tasks (with duplicate prevention)
              for (const assignment of assignments) {
                // Support different field names from different Dataverse schemas
                const dvTaskId = assignment._msdyn_projecttaskid_value || assignment._msdyn_projecttask_value || assignment._msdyn_taskid_value;
                const dvResourceId = assignment._msdyn_bookableresourceid_value || assignment._bookableresource_value;
                
                if (!dvTaskId || !dvResourceId) continue;
                
                const ourTaskId = taskIdMap.get(dvTaskId);
                const ourResourceId = bookableResourceMap.get(dvResourceId);
                
                if (ourTaskId && ourResourceId) {
                  const pairKey = `${ourTaskId}-${ourResourceId}`;
                  if (assignedPairs.has(pairKey)) {
                    console.log(`Skipping duplicate assignment: resource ${ourResourceId} to task ${ourTaskId}`);
                    continue;
                  }
                  
                  try {
                    await storage.addTaskResourceAssignment({
                      taskId: ourTaskId,
                      resourceId: ourResourceId,
                    });
                    assignedPairs.add(pairKey);
                    console.log(`Assigned resource ${ourResourceId} to task ${ourTaskId}`);
                  } catch (assignErr) {
                    // Assignment might already exist or other error
                    console.log(`Failed to assign resource ${ourResourceId} to task ${ourTaskId}:`, assignErr);
                  }
                }
              }
            } else {
              console.log(`Failed to fetch resource assignments from any API variant`);
            }
          } else {
            console.log(`Failed to fetch project team from any API variant`);
            // Log more details for debugging
            if (teamResponse) {
              try {
                const errText = await teamResponse.text();
                console.log(`Team fetch error details: ${errText}`);
              } catch (e) {
                // Ignore
              }
            }
          }
        } catch (resourceErr) {
          console.log("Error importing resources from Planner Premium:", resourceErr);
          // Continue without failing the sync - resources are optional
        }

        // Update project dates
        if (projectStartDate || projectEndDate) {
          await storage.updateProject(projectId, {
            startDate: projectStartDate || project.startDate,
            endDate: projectEndDate || project.endDate,
          });
        }

        return res.json({ 
          synced: createdTasks.length,
          resourcesSynced,
          message: `Successfully synced ${createdTasks.length} tasks${resourcesSynced > 0 ? ` and ${resourcesSynced} new resources` : ''} from Planner Premium`
        });
      }

      // Regular Planner sync (non-Premium)
      const token = req.session.plannerAccessToken;
      if (!token) {
        return res.status(401).json({ message: "Not connected to Planner. Please reconnect." });
      }

      // Fetch tasks and buckets from Planner
      const [tasksResponse, bucketsResponse] = await Promise.all([
        fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}/tasks`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
        fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}/buckets`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
      ]);

      if (!tasksResponse.ok) {
        if (tasksResponse.status === 401) {
          delete req.session.plannerAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect to Planner." });
        }
        throw new Error(`Failed to fetch tasks: ${tasksResponse.status}`);
      }

      const tasksData = await tasksResponse.json();
      const plannerTasks = tasksData.value || [];

      let buckets: { id: string; name: string }[] = [];
      if (bucketsResponse.ok) {
        const bucketsData = await bucketsResponse.json();
        buckets = bucketsData.value || [];
      }
      const bucketMap = new Map(buckets.map((b: any) => [b.id, b.name]));

      // Get existing tasks for this project
      const existingTasks = await storage.getTasksByProject(projectId);
      
      // Delete all existing tasks for this project (full sync)
      // First delete task resource assignments to avoid FK constraint violations
      for (const task of existingTasks) {
        await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, task.id));
      }
      for (const task of existingTasks) {
        await storage.deleteTask(task.id);
      }

      // Calculate default dates
      let projectStartDate: string | null = null;
      let projectEndDate: string | null = null;
      for (const task of plannerTasks) {
        if (task.startDateTime) {
          const startDate = task.startDateTime.split('T')[0];
          if (!projectStartDate || startDate < projectStartDate) {
            projectStartDate = startDate;
          }
        }
        if (task.dueDateTime) {
          const endDate = task.dueDateTime.split('T')[0];
          if (!projectEndDate || endDate > projectEndDate) {
            projectEndDate = endDate;
          }
        }
      }

      const defaultStartDate = projectStartDate || new Date().toISOString().split('T')[0];
      const defaultEndDate = projectEndDate || defaultStartDate;

      // Create new tasks from Planner
      let taskIndex = 0;
      const createdTasks: any[] = [];

      for (const plannerTask of plannerTasks) {
        taskIndex++;
        const bucketName = plannerTask.bucketId ? bucketMap.get(plannerTask.bucketId) || null : null;

        const taskStartDate = plannerTask.startDateTime 
          ? plannerTask.startDateTime.split('T')[0] 
          : defaultStartDate;
        const taskEndDate = plannerTask.dueDateTime 
          ? plannerTask.dueDateTime.split('T')[0] 
          : (plannerTask.startDateTime ? plannerTask.startDateTime.split('T')[0] : defaultEndDate);

        const task = await storage.createTask({
          projectId: project.id,
          taskIndex,
          name: plannerTask.title,
          description: null,
          priority: mapPlannerPriorityToProjectPriority(plannerTask.priority || 5),
          startDate: taskStartDate,
          endDate: taskEndDate,
          progress: plannerTask.percentComplete || 0,
          status: mapPlannerPercentToStatus(plannerTask.percentComplete || 0),
          phase: bucketName,
          outlineLevel: 1,
          isMilestone: false,
          isSummary: false,
          isCritical: false,
        });

        createdTasks.push(task);
      }

      // Update project dates if changed
      if (projectStartDate || projectEndDate) {
        await storage.updateProject(projectId, {
          startDate: projectStartDate || project.startDate,
          endDate: projectEndDate || project.endDate,
        });
      }

      res.json({ 
        success: true,
        tasksCount: createdTasks.length,
        message: `Synced ${createdTasks.length} tasks from Planner`
      });
    } catch (err: any) {
      console.error("Planner sync error:", err);
      res.status(500).json({ 
        message: "Failed to sync from Planner", 
        error: err?.message || String(err) 
      });
    }
  });

  app.put(api.projects.update.path, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const existing = await storage.getProject(projectId);
      if (!existing) return res.status(404).json({ message: "Project not found" });
      
      const input = api.projects.update.input.parse(req.body);
      const sanitizedInput: Record<string, any> = {
        ...input,
        updatedAt: new Date(),
        updatedBy: userId || null,
      };
      // Only update dates if explicitly provided in the request
      if ('startDate' in input) {
        sanitizedInput.startDate = input.startDate || null;
      }
      if ('endDate' in input) {
        sanitizedInput.endDate = input.endDate || null;
      }
      
      // If healthReason is provided or health changed, update the timestamp and record history
      const healthChanged = input.health && input.health !== existing.health;
      const healthReasonProvided = input.healthReason !== undefined && input.healthReason !== null && input.healthReason.trim() !== '';
      
      if (healthReasonProvided || healthChanged) {
        sanitizedInput.healthReasonUpdatedAt = new Date();
        
        // Get user name for history record
        const user = userId ? await storage.getUser(userId) : null;
        const changedByName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System';
        
        // Record to health status history
        await storage.createHealthStatusHistory({
          projectId,
          previousHealth: existing.health || null,
          newHealth: input.health || existing.health || 'Green',
          comment: input.healthReason || null,
          changedBy: userId || null,
          changedByName,
        });
      }
      
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
      console.error("Error updating project:", err);
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

  // Complete project - terminal state that locks the workflow
  app.post('/api/projects/:id/complete', async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      const existing = await storage.getProject(projectId);
      if (!existing) return res.status(404).json({ message: "Project not found" });
      
      // Check if project is already completed
      if (existing.completedAt) {
        return res.status(400).json({ message: "Project is already completed" });
      }
      
      // Update project to completed state
      const updated = await storage.updateProject(projectId, {
        status: 'Completed',
        completedAt: new Date(),
        completedBy: userId || null,
        updatedAt: new Date(),
        updatedBy: userId || null,
      });
      
      // Log the completion
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createProjectChangeLog({
        projectId,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'updated',
        changeSummary: `Project completed (status: "${existing.status}" → "Completed")`,
        previousValues: JSON.stringify({ status: existing.status, completedAt: null }),
        newValues: JSON.stringify({ status: 'Completed', completedAt: updated?.completedAt }),
      });
      
      res.json(updated);
    } catch (err) {
      console.error("Error completing project:", err);
      res.status(500).json({ message: "Error completing project" });
    }
  });

  // Reactivate project - re-enable a completed project while preserving history
  app.post('/api/projects/:id/reactivate', async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { status } = req.body; // Optional status to set (defaults to Billing)
      
      const existing = await storage.getProject(projectId);
      if (!existing) return res.status(404).json({ message: "Project not found" });
      
      // Check if project is actually completed
      if (!existing.completedAt) {
        return res.status(400).json({ message: "Project is not completed" });
      }
      
      const newStatus = status || 'Billing'; // Default to Billing stage
      
      // Reactivate the project
      const updated = await storage.updateProject(projectId, {
        status: newStatus,
        completedAt: null,
        completedBy: null,
        updatedAt: new Date(),
        updatedBy: userId || null,
      });
      
      // Log the reactivation
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createProjectChangeLog({
        projectId,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'updated',
        changeSummary: `Project reactivated (status: "Completed" → "${newStatus}")`,
        previousValues: JSON.stringify({ status: 'Completed', completedAt: existing.completedAt }),
        newValues: JSON.stringify({ status: newStatus, completedAt: null }),
      });
      
      res.json(updated);
    } catch (err) {
      console.error("Error reactivating project:", err);
      res.status(500).json({ message: "Error reactivating project" });
    }
  });

  // Convert imported project to editable (native) mode
  app.post('/api/projects/:id/make-editable', async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check user has access to this project's organization
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied to this project" });
      }
      
      // Only allow conversion for imported or planner projects
      if (project.source !== "imported" && project.source !== "planner" && project.source !== "planner_premium") {
        return res.status(400).json({ message: "Project is already editable" });
      }
      
      // Convert to manual (editable) mode - clear integration links to fully detach
      const updated = await storage.updateProject(projectId, {
        source: "manual",
        plannerPlanId: null,
        dataverseOrgId: null,
        dataverseTenantId: null,
        // Keep sourceFileName and sourceFileUrl for historical reference only
      });
      
      // Log the conversion
      const user = await storage.getUser(userId);
      await storage.createProjectChangeLog({
        projectId,
        changedBy: userId,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'updated',
        changeSummary: `Converted from "${project.source}" to editable mode`,
        previousValues: JSON.stringify({ source: project.source }),
        newValues: JSON.stringify({ source: "manual" }),
      });
      
      res.json({ 
        message: "Project converted to editable mode successfully",
        project: updated 
      });
    } catch (err) {
      console.error("Error converting project to editable:", err);
      res.status(500).json({ message: "Error converting project to editable mode" });
    }
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
      
      // Check report limit before export
      const { checkAndEnforceLimit, METER_CODES, recordResourceUsage } = await import("./services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.REPORTS);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.error || "Report export limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "reports"
        });
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
        
        // Record report usage
        await recordResourceUsage(userId, METER_CODES.REPORTS, `export_${projectId}_${Date.now()}`, 1, project.organizationId);
        
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
        
        // Record report usage
        await recordResourceUsage(userId, METER_CODES.REPORTS, `export_${projectId}_${Date.now()}`, 1, project.organizationId);
        
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
      
      // Check report and email limits before sending
      const { checkAndEnforceLimit, METER_CODES, recordResourceUsage } = await import("./services/billing");
      
      // Check report limit (for generating the report)
      const reportCheck = await checkAndEnforceLimit(userId, METER_CODES.REPORTS);
      if (!reportCheck.allowed) {
        return res.status(403).json({ 
          message: reportCheck.error || "Report limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "reports"
        });
      }
      
      // Check email limit (for sending the email)
      const emailCheck = await checkAndEnforceLimit(userId, METER_CODES.EMAILS);
      if (!emailCheck.allowed) {
        return res.status(403).json({ 
          message: emailCheck.error || "Email limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "emails"
        });
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
        
        // Record usage for report and email after successful send
        await recordResourceUsage(userId, METER_CODES.REPORTS, `report_${projectId}_${Date.now()}`, 1, project.organizationId);
        await recordResourceUsage(userId, METER_CODES.EMAILS, `email_${projectId}_${Date.now()}`, 1, project.organizationId);
        
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
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check credit limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.RISKS);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Credits limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "risks"
          });
        }
      }
      
      const input = api.risks.create.input.parse(req.body);
      const risk = await storage.createRisk(input);
      
      // Log change
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createRiskChangeLog({
        issueId: risk.id,
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
          issueId: riskId,
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

  // Convert Risk to Issue
  app.post('/api/risks/:id/convert-to-issue', async (req, res) => {
    try {
      const riskId = Number(req.params.id);
      const risk = await storage.getRisk(riskId);
      if (!risk) return res.status(404).json({ message: "Risk not found" });
      
      const converted = await storage.convertRiskToIssue(riskId);
      if (!converted) {
        return res.status(500).json({ message: "Failed to convert risk to issue" });
      }
      
      // Log the conversion in change logs
      const userId = getUserIdFromRequest(req);
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createIssueChangeLog({
        issueId: riskId,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'converted',
        changeSummary: `Converted from Risk to Issue`,
        previousValues: JSON.stringify({ itemType: 'risk' }),
        newValues: JSON.stringify({ itemType: 'issue' }),
      });
      
      res.json(converted);
    } catch (err) {
      console.error('Error converting risk to issue:', err);
      res.status(500).json({ message: "Error converting risk to issue" });
    }
  });

  // AI-powered Risk Mitigation Suggestions
  app.post('/api/risks/ai-mitigation', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { title, description, probability, impact, projectContext } = req.body;
      
      if (!title) {
        return res.status(400).json({ message: "Risk title is required" });
      }

      const prompt = `You are a project risk management expert. Analyze the following risk and provide practical mitigation strategies.

Risk Title: ${title}
${description ? `Description: ${description}` : ''}
Probability: ${probability || 'Medium'}
Impact: ${impact || 'Medium'}
${projectContext ? `Project Context: ${projectContext}` : ''}

Provide 3-5 specific, actionable mitigation strategies for this risk. Each strategy should be:
- Practical and implementable
- Specific to the risk described
- Include who might be responsible and rough timeline if applicable

Format your response as a numbered list with clear, concise strategies. Do not include any preamble or conclusion - just provide the numbered list of mitigation strategies.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a project risk management expert providing concise, actionable mitigation strategies."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      });

      const suggestion = completion.choices[0]?.message?.content || "Unable to generate suggestions at this time.";
      
      res.json({ suggestion });
    } catch (err: any) {
      console.error('Error generating AI mitigation suggestions:', err);
      res.status(500).json({ message: err.message || "Error generating mitigation suggestions" });
    }
  });

  // --- Milestones ---
  app.get(api.milestones.list.path, async (req, res) => {
    const milestones = await storage.getMilestones(Number(req.params.projectId));
    res.json(milestones);
  });

  app.get(api.milestones.listAll.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    
    if (!await userHasAnyOrgAccess(userId)) {
      return res.json([]);
    }
    
    const accessibleOrgIds = await getUserOrgIds(userId);
    const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
    const allMilestones = await storage.getAllMilestones();
    
    const allProjects = await storage.getProjects();
    let accessibleProjectIds: Set<number>;
    
    if (organizationId !== null) {
      // Verify user has access to this organization
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.json([]);
      }
      accessibleProjectIds = new Set(
        allProjects
          .filter(p => p.organizationId === organizationId)
          .map(p => p.id)
      );
    } else {
      accessibleProjectIds = new Set(
        allProjects
          .filter(p => p.organizationId === null || accessibleOrgIds.includes(p.organizationId))
          .map(p => p.id)
      );
    }
    
    const filteredMilestones = allMilestones.filter(m => accessibleProjectIds.has(m.projectId));
    res.json(filteredMilestones);
  });

  app.post(api.milestones.create.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
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
    const itemType = req.query.itemType as 'issue' | 'risk' | 'all' | undefined;
    const allIssues = await storage.getAllIssues(itemType || 'all');
    const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
    
    // Get all projects to determine which issues belong to accessible orgs
    const allProjects = await storage.getProjects();
    let accessibleProjectIds: Set<number>;
    
    if (organizationId !== null) {
      // Verify user has access to this organization
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.json([]);
      }
      accessibleProjectIds = new Set(
        allProjects
          .filter(p => p.organizationId === organizationId)
          .map(p => p.id)
      );
    } else {
      accessibleProjectIds = new Set(
        allProjects
          .filter(p => p.organizationId === null || accessibleOrgIds.includes(p.organizationId))
          .map(p => p.id)
      );
    }
    
    let filteredIssues = allIssues.filter(issue => accessibleProjectIds.has(issue.projectId));
    
    // For team_member role, further filter to only assigned issues
    // Apply filtering across all orgs where user has team_member role
    if (userId) {
      const userOrgs = await storage.getUserOrganizations(userId);
      for (const membership of userOrgs) {
        if (membership.role === 'team_member') {
          const assignedIssueIds = await getTeamMemberIssueIds(userId, membership.organizationId);
          // Get projects in this org to filter issues
          const orgProjects = allProjects.filter(p => p.organizationId === membership.organizationId);
          const orgProjectIds = new Set(orgProjects.map(p => p.id));
          filteredIssues = filteredIssues.filter(i => 
            !orgProjectIds.has(i.projectId) || assignedIssueIds.includes(i.id)
          );
        }
      }
    }
    
    res.json(filteredIssues);
  });

  app.post(api.issues.create.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check credit limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.ISSUES);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Credits limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "issues"
          });
        }
      }
      
      const input = api.issues.create.input.parse(req.body);
      const issue = await storage.createIssue(input);
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        // Get org ID from project for billing
        const project = input.projectId ? await storage.getProject(input.projectId) : null;
        await recordResourceUsage(userId, METER_CODES.ISSUES, issue.id, 1, project?.organizationId);
      }
      
      // Log change
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
  
  // Helper function to recalculate WBS numbers for all tasks in a project (MS Project style)
  async function recalculateProjectWBS(projectId: number) {
    const allTasks = await storage.getTasksByProject(projectId);
    if (allTasks.length === 0) return;
    
    // Sort tasks by taskIndex (sequential order)
    const sortedTasks = [...allTasks].sort((a, b) => (a.taskIndex || 0) - (b.taskIndex || 0));
    
    // Track WBS counters at each outline level (index 0 unused, levels 1-6)
    const wbsCounters: number[] = [0, 0, 0, 0, 0, 0, 0]; 
    let lastLevel = 0;
    
    const updates: Array<{ id: number; wbs: string }> = [];
    
    for (const task of sortedTasks) {
      const level = task.outlineLevel || 1;
      
      // Reset all deeper level counters when going to same or shallower level
      if (level <= lastLevel) {
        for (let i = level + 1; i < wbsCounters.length; i++) {
          wbsCounters[i] = 0;
        }
      }
      
      // Increment counter at current level
      wbsCounters[level]++;
      
      // Build WBS string from level 1 to current level
      const wbsParts: number[] = [];
      for (let i = 1; i <= level; i++) {
        wbsParts.push(wbsCounters[i]);
      }
      const wbs = wbsParts.join('.');
      
      // Collect updates
      if (task.wbs !== wbs) {
        updates.push({ id: task.id, wbs });
      }
      
      lastLevel = level;
    }
    
    // Apply all updates
    for (const update of updates) {
      await storage.updateTask(update.id, { wbs: update.wbs });
    }
  }
  
  // Helper function to recalculate parentId for all tasks based on outline levels (MS Project style)
  async function recalculateParentIds(projectId: number) {
    const allTasks = await storage.getTasksByProject(projectId);
    if (allTasks.length === 0) return;
    
    // Sort tasks by taskIndex (sequential display order)
    const sortedTasks = [...allTasks].sort((a, b) => (a.taskIndex || 0) - (b.taskIndex || 0));
    
    // Track the most recent task at each outline level (for finding parent)
    const taskAtLevel: (number | null)[] = [null, null, null, null, null, null, null]; // index 0 unused, levels 1-6
    
    const updates: Array<{ id: number; parentId: number | null }> = [];
    
    for (const task of sortedTasks) {
      const level = task.outlineLevel || 1;
      
      // Find parent: the most recent task at level-1
      let newParentId: number | null = null;
      if (level > 1) {
        newParentId = taskAtLevel[level - 1] || null;
      }
      
      // Queue update if parentId changed
      if (task.parentId !== newParentId) {
        updates.push({ id: task.id, parentId: newParentId });
      }
      
      // Update task at current level
      taskAtLevel[level] = task.id;
      
      // Clear deeper levels (they can't be parents anymore once we move to this level)
      for (let i = level + 1; i < taskAtLevel.length; i++) {
        taskAtLevel[i] = null;
      }
    }
    
    // Apply all updates
    for (const update of updates) {
      await storage.updateTask(update.id, { parentId: update.parentId });
    }
  }
  
  // Helper function to roll up dates and values from children to parent tasks
  async function rollUpParentTasks(projectId: number) {
    // First, ensure parentId is correctly set based on outline levels
    await recalculateParentIds(projectId);
    
    const allTasks = await storage.getTasks(projectId);
    if (allTasks.length === 0) return;
    
    // Build parent-child relationships using parentId field
    const childrenByParent = new Map<number, typeof allTasks>();
    const taskById = new Map<number, typeof allTasks[0]>();
    
    for (const task of allTasks) {
      taskById.set(task.id, task);
      if (task.parentId) {
        const children = childrenByParent.get(task.parentId) || [];
        children.push(task);
        childrenByParent.set(task.parentId, children);
      }
    }
    
    // Recursive function to get all leaf descendants
    function getLeafDescendants(taskId: number): typeof allTasks {
      const children = childrenByParent.get(taskId) || [];
      if (children.length === 0) {
        // This task is a leaf - return it
        const task = taskById.get(taskId);
        return task ? [task] : [];
      }
      // Get leaf descendants from all children
      const leaves: typeof allTasks = [];
      for (const child of children) {
        leaves.push(...getLeafDescendants(child.id));
      }
      return leaves;
    }
    
    const updates: Array<{ taskId: number; updates: any }> = [];
    
    // Process all tasks that have children (are parents)
    for (const [parentId, children] of childrenByParent.entries()) {
      const parentTask = taskById.get(parentId);
      if (!parentTask) continue;
      
      // Get all leaf descendants for this parent
      const leafTasks = getLeafDescendants(parentId);
      
      // Calculate roll-up values from leaf tasks with valid dates
      const validLeaves = leafTasks.filter(t => t.startDate && t.endDate);
      if (validLeaves.length > 0) {
        const startDates = validLeaves.map(t => new Date(t.startDate!).getTime());
        const endDates = validLeaves.map(t => new Date(t.endDate!).getTime());
        const minStart = new Date(Math.min(...startDates)).toISOString().split('T')[0];
        const maxEnd = new Date(Math.max(...endDates)).toISOString().split('T')[0];
        
        // Calculate weighted average progress based on duration
        let totalDuration = 0;
        let weightedProgress = 0;
        for (const leaf of validLeaves) {
          const duration = Math.max(1, Math.ceil((new Date(leaf.endDate!).getTime() - new Date(leaf.startDate!).getTime()) / (1000 * 60 * 60 * 24)) + 1);
          totalDuration += duration;
          weightedProgress += (leaf.progress || 0) * duration;
        }
        const avgProgress = totalDuration > 0 ? Math.round(weightedProgress / totalDuration) : 0;
        
        // Calculate total hours and costs from leaf tasks
        const totalEstimatedHours = leafTasks.reduce((sum, t) => sum + Number(t.estimatedHours || 0), 0);
        const totalActualHours = leafTasks.reduce((sum, t) => sum + Number(t.actualHours || 0), 0);
        const totalCost = leafTasks.reduce((sum, t) => sum + Number(t.cost || 0), 0);
        const totalActualCost = leafTasks.reduce((sum, t) => sum + Number(t.actualCost || 0), 0);
        
        // Check if any values changed
        const estHoursStr = totalEstimatedHours > 0 ? String(totalEstimatedHours) : null;
        const actHoursStr = totalActualHours > 0 ? String(totalActualHours) : null;
        const costStr = totalCost > 0 ? String(totalCost) : null;
        const actCostStr = totalActualCost > 0 ? String(totalActualCost) : null;
        
        const needsUpdate = 
          parentTask.startDate !== minStart || 
          parentTask.endDate !== maxEnd || 
          parentTask.progress !== avgProgress ||
          parentTask.estimatedHours !== estHoursStr ||
          parentTask.actualHours !== actHoursStr ||
          parentTask.cost !== costStr ||
          parentTask.actualCost !== actCostStr ||
          !parentTask.isSummary;
        
        if (needsUpdate) {
          updates.push({
            taskId: parentId,
            updates: {
              startDate: minStart,
              endDate: maxEnd,
              progress: avgProgress,
              estimatedHours: estHoursStr,
              actualHours: actHoursStr,
              cost: costStr,
              actualCost: actCostStr,
              isSummary: true, // Mark as summary task
            }
          });
        }
      }
    }
    
    // Apply updates (without triggering more roll-ups to avoid loops)
    for (const { taskId, updates: taskUpdates } of updates) {
      await storage.updateTask(taskId, taskUpdates);
    }
  }
  
  app.get(api.tasks.list.path, async (req, res) => {
    const tasks = await storage.getTasks(Number(req.params.projectId));
    res.json(tasks);
  });

  app.get(api.tasks.listAll.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    
    // Deny access if user is not a member of any organization
    if (!await userHasAnyOrgAccess(userId)) {
      return res.json({ tasks: [], total: 0, hasMore: false });
    }
    
    // Get user's accessible org IDs and filter tasks by project's organization
    const accessibleOrgIds = await getUserOrgIds(userId);
    
    // Support filtering by organization
    const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
    
    // Get all projects to determine which tasks belong to accessible orgs
    const allProjects = await storage.getProjects();
    
    // Filter projects by organization if specified, otherwise use all accessible
    let accessibleProjectIds: Set<number>;
    if (organizationId !== null) {
      // Verify user has access to this organization
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.json({ tasks: [], total: 0, hasMore: false });
      }
      accessibleProjectIds = new Set(
        allProjects
          .filter(p => p.organizationId === organizationId)
          .map(p => p.id)
      );
    } else {
      accessibleProjectIds = new Set(
        allProjects
          .filter(p => p.organizationId === null || accessibleOrgIds.includes(p.organizationId))
          .map(p => p.id)
      );
    }
    
    const allTasks = await storage.getAllTasks();
    let filteredTasks = allTasks.filter(task => accessibleProjectIds.has(task.projectId));
    
    // For team_member role, further filter to only assigned tasks
    // Apply filtering across all orgs where user has team_member role
    if (userId) {
      const userOrgs = await storage.getUserOrganizations(userId);
      for (const membership of userOrgs) {
        if (membership.role === 'team_member') {
          const assignedTaskIds = await getTeamMemberTaskIds(userId, membership.organizationId);
          // Get projects in this org to filter tasks
          const orgProjects = allProjects.filter(p => p.organizationId === membership.organizationId);
          const orgProjectIds = new Set(orgProjects.map(p => p.id));
          filteredTasks = filteredTasks.filter(t => 
            !orgProjectIds.has(t.projectId) || assignedTaskIds.includes(t.id)
          );
        }
      }
    }
    
    // Support pagination via query params
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const total = filteredTasks.length;
    const paginatedTasks = filteredTasks.slice(offset, offset + limit);
    const hasMore = offset + limit < total;
    
    res.json({ tasks: paginatedTasks, total, hasMore });
  });

  app.post(api.tasks.create.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check task limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.TASKS);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Task limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "tasks"
          });
        }
      }
      
      const input = api.tasks.create.input.parse(req.body);
      
      // Calculate endDate from duration if provided
      if (input.durationDays && input.startDate) {
        const startDate = new Date(input.startDate);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + input.durationDays - 1);
        input.endDate = endDate.toISOString().split('T')[0];
      }
      
      // Auto-assign taskIndex if not provided
      if (input.taskIndex === undefined || input.taskIndex === null) {
        const existingTasks = await storage.getTasksByProject(input.projectId);
        // Use max of: highest existing taskIndex OR count of tasks (for legacy tasks with null taskIndex)
        const maxExistingIndex = existingTasks.reduce((max, t) => Math.max(max, t.taskIndex || 0), 0);
        const taskCount = existingTasks.length;
        input.taskIndex = Math.max(maxExistingIndex, taskCount) + 1;
      }
      
      const task = await storage.createTask(input);
      
      // Recalculate WBS for all tasks in the project
      await recalculateProjectWBS(input.projectId);
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        // Get org ID from project for billing
        const project = await storage.getProject(input.projectId);
        await recordResourceUsage(userId, METER_CODES.TASKS, task.id, 1, project?.organizationId);
      }
      
      // Log the creation
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
      
      // Roll up values from children to parent tasks
      if (task.projectId) {
        await rollUpParentTasks(task.projectId);
      }
      
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
      
      // Validate outline level is within bounds (1-6)
      if (input.outlineLevel !== undefined && input.outlineLevel !== null) {
        if (input.outlineLevel < 1) {
          input.outlineLevel = 1;
        } else if (input.outlineLevel > 6) {
          input.outlineLevel = 6;
        }
      }
      
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
      
      // Roll up values from children to parent tasks
      if (updated.projectId) {
        await rollUpParentTasks(updated.projectId);
      }
      
      // Recalculate WBS if outline level or taskIndex changed
      if ((input.outlineLevel !== undefined && input.outlineLevel !== previousTask.outlineLevel) ||
          (input.taskIndex !== undefined && input.taskIndex !== previousTask.taskIndex)) {
        await recalculateProjectWBS(updated.projectId);
      }
      
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Error updating task" });
    }
  });

  app.delete(api.tasks.delete.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    const taskId = Number(req.params.id);
    const task = await storage.getTask(taskId);
    const projectId = task?.projectId;
    
    await storage.softDeleteItem('task', taskId, userId);
    
    // Recalculate WBS after deletion
    if (projectId) {
      await recalculateProjectWBS(projectId);
    }
    
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
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const taskId = Number(req.params.id);
      const { dependsOnTaskId } = api.tasks.addDependency.input.parse(req.body);
      
      // Prevent self-dependency
      if (taskId === dependsOnTaskId) {
        return res.status(400).json({ message: "A task cannot depend on itself" });
      }
      
      // Check if the dependent task (taskId) has children - only leaf tasks can have dependencies
      const dependentTask = await storage.getTask(taskId);
      if (dependentTask) {
        const allTasks = await storage.getTasksByProject(dependentTask.projectId);
        const sortedTasks = [...allTasks].sort((a, b) => (a.taskIndex || 0) - (b.taskIndex || 0));
        const taskIdx = sortedTasks.findIndex(t => t.id === taskId);
        if (taskIdx >= 0 && taskIdx < sortedTasks.length - 1) {
          const taskLevel = dependentTask.outlineLevel || 1;
          const nextTaskLevel = sortedTasks[taskIdx + 1].outlineLevel || 1;
          if (nextTaskLevel > taskLevel) {
            return res.status(400).json({ message: "Dependencies are only allowed for leaf tasks (tasks without children)" });
          }
        }
      }
      
      // Check if the predecessor task (dependsOnTaskId) has children
      const predecessorTask = await storage.getTask(dependsOnTaskId);
      if (predecessorTask) {
        const allTasks = await storage.getTasksByProject(predecessorTask.projectId);
        const sortedTasks = [...allTasks].sort((a, b) => (a.taskIndex || 0) - (b.taskIndex || 0));
        const taskIdx = sortedTasks.findIndex(t => t.id === dependsOnTaskId);
        if (taskIdx >= 0 && taskIdx < sortedTasks.length - 1) {
          const taskLevel = predecessorTask.outlineLevel || 1;
          const nextTaskLevel = sortedTasks[taskIdx + 1].outlineLevel || 1;
          if (nextTaskLevel > taskLevel) {
            return res.status(400).json({ message: "Cannot add dependency on a parent task (tasks with children)" });
          }
        }
      }
      
      const dependency = await storage.createTaskDependency({
        taskId,
        dependsOnTaskId,
      });
      
      // Auto-adjust dependent task's start date based on predecessor's end date (Finish-to-Start)
      let dateAdjusted = false;
      let newStartDate: string | null = null;
      let newEndDate: string | null = null;
      
      // Re-fetch tasks for date adjustment (fresh data after dependency creation)
      const predecessorTaskForDates = await storage.getTask(dependsOnTaskId);
      const dependentTaskForDates = await storage.getTask(taskId);
      
      if (predecessorTaskForDates?.endDate && dependentTaskForDates) {
        // Calculate new start date: predecessor end date + 1 day
        const predecessorEnd = new Date(predecessorTaskForDates.endDate);
        const nextDay = new Date(predecessorEnd);
        nextDay.setDate(nextDay.getDate() + 1);
        newStartDate = nextDay.toISOString().split('T')[0];
        
        // If current start is before the new start, adjust it
        const currentStart = dependentTaskForDates.startDate ? new Date(dependentTaskForDates.startDate) : null;
        if (!currentStart || currentStart < nextDay) {
          // Calculate duration to maintain task length
          const currentEnd = dependentTaskForDates.endDate ? new Date(dependentTaskForDates.endDate) : null;
          const duration = currentStart && currentEnd ? 
            Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) : 0;
          
          // Set new end date based on duration
          const newEnd = new Date(nextDay);
          newEnd.setDate(newEnd.getDate() + duration);
          newEndDate = newEnd.toISOString().split('T')[0];
          
          await storage.updateTask(taskId, { 
            startDate: newStartDate,
            endDate: newEndDate,
          });
          dateAdjusted = true;
        }
      }
      
      res.status(201).json({ 
        ...dependency, 
        dateAdjusted,
        adjustedTaskId: dateAdjusted ? taskId : null,
        newStartDate: dateAdjusted ? newStartDate : null,
        newEndDate: dateAdjusted ? newEndDate : null,
      });
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

  // Get all dependencies for a project (for CPM calculation)
  app.get('/api/projects/:projectId/dependencies', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const dependencies = await storage.getProjectDependencies(projectId);
      res.json(dependencies);
    } catch (err) {
      res.status(500).json({ message: "Error fetching project dependencies" });
    }
  });

  // Recalculate schedule - enforce all dependency date constraints
  app.post('/api/projects/:projectId/recalculate-schedule', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const tasks = await storage.getTasksByProject(projectId);
      const dependencies = await storage.getProjectDependencies(projectId);
      
      // Build a map of task ID to task for quick lookup
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      
      // Track which tasks were adjusted
      const adjustedTasks: { taskId: number; newStartDate: string; newEndDate: string }[] = [];
      
      // Process dependencies in order (topological sort would be ideal, but simple iteration works for most cases)
      // We may need multiple passes to handle chains of dependencies
      let changesInPass = true;
      let passCount = 0;
      const maxPasses = 10; // Prevent infinite loops
      
      while (changesInPass && passCount < maxPasses) {
        changesInPass = false;
        passCount++;
        
        for (const dep of dependencies) {
          const predecessorTask = taskMap.get(dep.dependsOnTaskId);
          const dependentTask = taskMap.get(dep.taskId);
          
          if (!predecessorTask?.endDate || !dependentTask) continue;
          
          // Calculate the required start date (predecessor end + 1 day + lag)
          const predecessorEnd = new Date(predecessorTask.endDate);
          const requiredStart = new Date(predecessorEnd);
          requiredStart.setDate(requiredStart.getDate() + 1 + (dep.lagDays || 0));
          
          const currentStart = dependentTask.startDate ? new Date(dependentTask.startDate) : null;
          
          // If current start is before required start, adjust it
          if (!currentStart || currentStart < requiredStart) {
            const currentEnd = dependentTask.endDate ? new Date(dependentTask.endDate) : null;
            const duration = currentStart && currentEnd ? 
              Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) : 0;
            
            const newStartDate = requiredStart.toISOString().split('T')[0];
            const newEnd = new Date(requiredStart);
            newEnd.setDate(newEnd.getDate() + duration);
            const newEndDate = newEnd.toISOString().split('T')[0];
            
            // Update in database
            await storage.updateTask(dep.taskId, { startDate: newStartDate, endDate: newEndDate });
            
            // Update in our local map for chain propagation
            const updatedTask = { ...dependentTask, startDate: newStartDate, endDate: newEndDate };
            taskMap.set(dep.taskId, updatedTask);
            
            adjustedTasks.push({ taskId: dep.taskId, newStartDate, newEndDate });
            changesInPass = true;
          }
        }
      }
      
      res.json({ 
        success: true, 
        adjustedCount: adjustedTasks.length,
        adjustedTasks,
        passCount 
      });
    } catch (err) {
      console.error("Error recalculating schedule:", err);
      res.status(500).json({ message: "Error recalculating schedule" });
    }
  });

  // Reorder tasks (drag and drop) - updates taskIndex for all affected tasks
  app.post('/api/projects/:projectId/tasks/reorder', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const { taskId, newIndex } = req.body as { taskId: number; newIndex: number };
      
      if (!taskId || newIndex === undefined) {
        return res.status(400).json({ message: "taskId and newIndex are required" });
      }
      
      // Get all tasks for the project sorted by current taskIndex
      const allTasks = await storage.getTasksByProject(projectId);
      const sortedTasks = [...allTasks].sort((a, b) => (a.taskIndex || 0) - (b.taskIndex || 0));
      
      // Find the task being moved
      const taskToMove = sortedTasks.find(t => t.id === taskId);
      if (!taskToMove) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      // Remove the task from its current position
      const tasksWithoutMoved = sortedTasks.filter(t => t.id !== taskId);
      
      // Insert at new position (newIndex is 0-based)
      const clampedIndex = Math.max(0, Math.min(newIndex, tasksWithoutMoved.length));
      tasksWithoutMoved.splice(clampedIndex, 0, taskToMove);
      
      // Update taskIndex for all tasks
      for (let i = 0; i < tasksWithoutMoved.length; i++) {
        const task = tasksWithoutMoved[i];
        if (task.taskIndex !== i + 1) {
          await storage.updateTask(task.id, { taskIndex: i + 1 });
        }
      }
      
      // Recalculate WBS
      await recalculateProjectWBS(projectId);
      
      res.json({ message: "Tasks reordered successfully" });
    } catch (err) {
      res.status(500).json({ message: "Error reordering tasks" });
    }
  });

  // Reindex tasks and recalculate WBS for a project
  app.post('/api/projects/:projectId/tasks/reindex', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      
      // Get all tasks for the project
      const allTasks = await storage.getTasks(projectId);
      
      // Sort by id (creation order) or existing taskIndex
      const sortedTasks = [...allTasks].sort((a, b) => {
        if (a.taskIndex && b.taskIndex) return a.taskIndex - b.taskIndex;
        return a.id - b.id;
      });
      
      // Assign sequential taskIndex
      for (let i = 0; i < sortedTasks.length; i++) {
        const task = sortedTasks[i];
        if (task.taskIndex !== i + 1) {
          await storage.updateTask(task.id, { taskIndex: i + 1 });
        }
      }
      
      // Recalculate WBS
      await recalculateProjectWBS(projectId);
      
      res.json({ message: "Tasks reindexed and WBS recalculated", count: sortedTasks.length });
    } catch (err) {
      res.status(500).json({ message: "Error reindexing tasks" });
    }
  });

  // Batch baseline update for tasks
  app.post('/api/projects/:projectId/tasks/baseline', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const projectId = Number(req.params.projectId);
      
      // Validate project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const { taskIds, clearBaseline } = req.body as { taskIds?: number[]; clearBaseline?: boolean };
      
      // Get all tasks for the project
      const allTasks = await storage.getTasks(projectId);
      
      // Determine which tasks to update
      let tasksToUpdate = allTasks;
      if (taskIds && taskIds.length > 0) {
        tasksToUpdate = allTasks.filter(t => taskIds.includes(t.id));
      }
      
      // Update baseline dates for each task
      const updates = await Promise.all(
        tasksToUpdate.map(async (task) => {
          if (clearBaseline) {
            return storage.updateTask(task.id, {
              baselineStartDate: null,
              baselineEndDate: null,
            });
          } else {
            // Only set baseline if task has valid dates
            if (task.startDate && task.endDate) {
              return storage.updateTask(task.id, {
                baselineStartDate: task.startDate,
                baselineEndDate: task.endDate,
              });
            }
            return task;
          }
        })
      );
      
      res.json({ 
        message: clearBaseline ? "Baseline cleared" : "Baseline set",
        updatedCount: updates.length 
      });
    } catch (err) {
      console.error('Error updating baselines:', err);
      res.status(500).json({ message: "Error updating baselines" });
    }
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
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
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
      console.error("Error fetching resources:", err);
      res.status(500).json({ message: "Error fetching resources" });
    }
  });

  // Find potential duplicate resources for matching and merging
  app.get('/api/resources/duplicates', async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }
      
      const allResources = await storage.getResources(organizationId);
      
      // Normalize string for comparison (remove accents, lowercase)
      const normalize = (str: string): string => {
        return str
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .replace(/[^a-z0-9\s]/g, ' ')    // Replace special chars with space
          .trim();
      };
      
      // Extract name parts from email (e.g., "john.doe@email.com" -> ["john", "doe"])
      const extractNameFromEmail = (email: string): string[] => {
        const localPart = email.split('@')[0];
        return localPart.split(/[._-]/).filter(p => p.length > 1);
      };
      
      // Find potential duplicates by name similarity or email match
      const duplicateGroups: { resources: typeof allResources; matchType: string }[] = [];
      const processedIds = new Set<number>();
      
      for (let i = 0; i < allResources.length; i++) {
        if (processedIds.has(allResources[i].id)) continue;
        
        const resource = allResources[i];
        const matches: typeof allResources = [resource];
        const normalizedName1 = normalize(resource.displayName);
        const nameParts1 = normalizedName1.split(/\s+/).filter(p => p.length > 1);
        
        // Also check if displayName looks like an email
        const emailNameParts1 = resource.displayName.includes('@') 
          ? extractNameFromEmail(resource.displayName) 
          : [];
        
        for (let j = i + 1; j < allResources.length; j++) {
          if (processedIds.has(allResources[j].id)) continue;
          
          const other = allResources[j];
          const normalizedName2 = normalize(other.displayName);
          const nameParts2 = normalizedName2.split(/\s+/).filter(p => p.length > 1);
          const emailNameParts2 = other.displayName.includes('@') 
            ? extractNameFromEmail(other.displayName) 
            : [];
          
          let matchType = '';
          
          // Check exact email match
          if (resource.email && other.email && 
              resource.email.toLowerCase() === other.email.toLowerCase()) {
            matchType = 'email';
          }
          // Check exact normalized name match
          else if (normalizedName1 === normalizedName2) {
            matchType = 'exact_name';
          }
          // Check if one's email matches other's name parts
          else if (resource.email && nameParts2.length >= 2) {
            const emailParts = extractNameFromEmail(resource.email);
            if (emailParts.length >= 2 && 
                emailParts[0] === nameParts2[0] && 
                emailParts[1].startsWith(nameParts2[1].charAt(0))) {
              matchType = 'email_to_name';
            }
          }
          else if (other.email && nameParts1.length >= 2) {
            const emailParts = extractNameFromEmail(other.email);
            if (emailParts.length >= 2 && 
                emailParts[0] === nameParts1[0] && 
                emailParts[1].startsWith(nameParts1[1].charAt(0))) {
              matchType = 'email_to_name';
            }
          }
          // Check if displayName is an email that matches the other's name
          else if (emailNameParts1.length >= 2 && nameParts2.length >= 2) {
            if (emailNameParts1[0] === nameParts2[0] && 
                emailNameParts1[1].startsWith(nameParts2[1].charAt(0))) {
              matchType = 'email_name_match';
            }
          }
          else if (emailNameParts2.length >= 2 && nameParts1.length >= 2) {
            if (emailNameParts2[0] === nameParts1[0] && 
                emailNameParts2[1].startsWith(nameParts1[1].charAt(0))) {
              matchType = 'email_name_match';
            }
          }
          // Check similar names (first name matches + last name starts same)
          else if (nameParts1.length >= 2 && nameParts2.length >= 2) {
            if (nameParts1[0] === nameParts2[0] && nameParts1[0].length > 2) {
              const lastName1 = nameParts1[nameParts1.length - 1];
              const lastName2 = nameParts2[nameParts2.length - 1];
              if (lastName1.charAt(0) === lastName2.charAt(0)) {
                matchType = 'similar_name';
              }
            }
          }
          
          if (matchType) {
            matches.push(other);
            processedIds.add(other.id);
          }
        }
        
        if (matches.length > 1) {
          processedIds.add(resource.id);
          duplicateGroups.push({
            resources: matches,
            matchType: matches.some(m => m.email && resource.email && 
              m.email.toLowerCase() === resource.email.toLowerCase()) ? 'email' : 'name'
          });
        }
      }
      
      res.json({ duplicateGroups });
    } catch (err: any) {
      console.error("Error finding duplicates:", err);
      res.status(500).json({ message: "Failed to find duplicates", error: err?.message });
    }
  });

  // Merge two resources - keep primary, transfer assignments from secondary, delete secondary
  app.post('/api/resources/merge', async (req, res) => {
    try {
      const { primaryId, secondaryId, organizationId } = req.body;
      
      if (!primaryId || !secondaryId || !organizationId) {
        return res.status(400).json({ message: "Primary ID, Secondary ID, and Organization ID are required" });
      }
      
      const primary = await storage.getResource(primaryId);
      const secondary = await storage.getResource(secondaryId);
      
      // If secondary already deleted (by another merge), treat as no-op success
      if (!secondary) {
        if (!primary) {
          return res.status(404).json({ message: "Primary resource not found" });
        }
        return res.json({ 
          message: `Resource already merged or deleted`,
          resource: primary,
          skipped: true
        });
      }
      
      if (!primary) {
        return res.status(404).json({ message: "Primary resource not found" });
      }
      
      if (primary.organizationId !== organizationId || secondary.organizationId !== organizationId) {
        return res.status(403).json({ message: "Resources must belong to the specified organization" });
      }
      
      // Merge by re-pointing assignments and optionally merging data
      const merged = await storage.mergeResources(primaryId, secondaryId);
      
      res.json({ 
        message: `Merged "${secondary.displayName}" into "${primary.displayName}"`,
        resource: merged
      });
    } catch (err: any) {
      console.error("Error merging resources:", err);
      res.status(500).json({ message: "Failed to merge resources", error: err?.message });
    }
  });

  // Get a single resource
  app.get('/api/resources/:id', async (req, res) => {
    const resource = await storage.getResource(Number(req.params.id));
    if (!resource) return res.status(404).json({ message: "Resource not found" });
    res.json(resource);
  });

  // Get task assignments for a resource
  app.get('/api/resources/:id/task-assignments', async (req, res) => {
    try {
      const resourceId = Number(req.params.id);
      const assignments = await db.select({
        taskId: taskResourceAssignments.taskId,
        taskName: tasks.name,
        projectId: tasks.projectId,
        projectName: projects.name,
        status: tasks.status,
        progress: tasks.progress,
        startDate: tasks.startDate,
        endDate: tasks.endDate,
        allocationPercentage: taskResourceAssignments.allocationPercentage,
      })
        .from(taskResourceAssignments)
        .innerJoin(tasks, eq(taskResourceAssignments.taskId, tasks.id))
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(taskResourceAssignments.resourceId, resourceId));
      res.json(assignments);
    } catch (err) {
      console.error("Error fetching task assignments:", err);
      res.status(500).json({ message: "Failed to fetch task assignments" });
    }
  });

  // Get issue assignments for a resource
  app.get('/api/resources/:id/issue-assignments', async (req, res) => {
    try {
      const resourceId = Number(req.params.id);
      const assignments = await db.select({
        issueId: issueResourceAssignments.issueId,
        issueTitle: issues.title,
        projectId: issues.projectId,
        projectName: projects.name,
        status: issues.status,
        priority: issues.priority,
        dueDate: issues.targetResolutionDate,
      })
        .from(issueResourceAssignments)
        .innerJoin(issues, eq(issueResourceAssignments.issueId, issues.id))
        .innerJoin(projects, eq(issues.projectId, projects.id))
        .where(eq(issueResourceAssignments.resourceId, resourceId));
      res.json(assignments);
    } catch (err) {
      console.error("Error fetching issue assignments:", err);
      res.status(500).json({ message: "Failed to fetch issue assignments" });
    }
  });

  // Create a resource
  app.post('/api/resources', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check credit limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.RESOURCES);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Credits limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "resources"
          });
        }
      }
      
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
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        await recordResourceUsage(userId, METER_CODES.RESOURCES, resource.id, 1, organizationId);
      }
      
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

  // Create a resource with invitation - creates resource, org invite, and sends magic link email
  app.post('/api/resources/invite', async (req, res) => {
    try {
      const currentUserId = getUserIdFromRequest(req);
      if (!currentUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(currentUserId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const { organizationId, email, projectId, taskId, taskName, projectName, riskId, issueId } = req.body;
      
      if (!organizationId || !email) {
        return res.status(400).json({ message: "organizationId and email are required" });
      }
      
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail.includes('@')) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      
      // Check if user has access to this organization
      if (!await userHasOrgAccess(currentUserId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Check credit limit for resources
      const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
      const limitCheck = await checkAndEnforceLimit(currentUserId, METER_CODES.RESOURCES);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.error || "Credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "resources"
        });
      }
      
      // Check if resource already exists with this email
      const existingResources = await storage.getResources(organizationId);
      const existingResource = existingResources.find(r => r.email?.toLowerCase() === normalizedEmail);
      if (existingResource) {
        return res.status(409).json({ 
          message: "A resource with this email already exists in this organization",
          existingResourceId: existingResource.id
        });
      }
      
      // Get organization info
      const org = await storage.getOrganization(organizationId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Create the resource with email as display name
      const displayName = normalizedEmail.split('@')[0];
      const resource = await storage.createResource({
        organizationId,
        displayName: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        email: normalizedEmail,
        isActive: true,
        invitedProjectIds: projectId ? [projectId] : null,
      });
      
      // Record usage after successful creation
      if (currentUserId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        await recordResourceUsage(currentUserId, METER_CODES.RESOURCES, resource.id);
      }
      
      // Check if there's already an organization invite for this email
      const existingInvites = await storage.getOrganizationInvites(organizationId);
      const pendingInvite = existingInvites.find(i => 
        i.email.toLowerCase() === normalizedEmail && i.status === 'pending'
      );
      
      // Create organization invite if not already pending
      if (!pendingInvite) {
        await storage.createOrganizationInvite({
          organizationId,
          email: normalizedEmail,
          role: 'member',
          invitedBy: currentUserId,
          status: 'pending'
        });
      }
      
      // Generate a magic link token for resource invitation (7 day expiry)
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      // Store the token
      await db.insert(magicLinkTokens).values({
        email: normalizedEmail,
        token,
        type: "resource_invite",
        expiresAt,
        metadata: JSON.stringify({
          organizationId,
          resourceId: resource.id,
          projectId: projectId || null,
          taskId: taskId || null,
          riskId: riskId || null,
          issueId: issueId || null
        })
      });
      
      // Get inviter info
      const inviter = await storage.getUser(currentUserId);
      const inviterName = inviter 
        ? [inviter.firstName, inviter.lastName].filter(Boolean).join(' ') || inviter.email || 'An administrator'
        : 'An administrator';
      
      // Build magic link URL
      const appUrl = process.env.APP_URL 
        || (process.env.REPLIT_DOMAINS?.split(',')[0] 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'https://fridayreport.ai');
      const magicLinkUrl = `${appUrl}/resource-invite?token=${token}`;
      
      // Send the resource invitation email
      const { sendResourceInviteEmail } = await import("./services/email");
      const emailSent = await sendResourceInviteEmail(
        normalizedEmail,
        org.name,
        inviterName,
        projectName || null,
        taskName || null,
        magicLinkUrl
      );
      
      if (!emailSent) {
        console.log(`\n===== RESOURCE INVITATION LINK =====`);
        console.log(`Email: ${normalizedEmail}`);
        console.log(`Organization: ${org.name}`);
        console.log(`Invite URL: ${magicLinkUrl}`);
        console.log(`Expires: ${expiresAt.toISOString()}`);
        console.log(`====================================\n`);
      }
      
      // Assign the new resource to the task if taskId was provided
      if (taskId) {
        try {
          // Get current assignments and add the new resource
          const currentAssignments = await storage.getTaskResourceAssignments(taskId);
          const currentResourceIds = currentAssignments.map(a => a.resourceId);
          if (!currentResourceIds.includes(resource.id)) {
            await storage.updateTaskResourceAssignments(taskId, [...currentResourceIds, resource.id]);
            console.log(`Assigned resource ${resource.id} to task ${taskId}`);
          }
        } catch (assignErr) {
          console.error("Failed to auto-assign resource to task:", assignErr);
          // Don't fail the whole request if assignment fails
        }
      }
      
      res.status(201).json({
        resource,
        inviteSent: true,
        taskAssigned: !!taskId,
        message: `Resource created and invitation sent to ${normalizedEmail}`
      });
    } catch (err) {
      console.error("Error creating resource with invitation:", err);
      res.status(500).json({ message: "Error creating resource with invitation" });
    }
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
      
      // Get existing assignments before update to find new ones
      const existingAssignments = await storage.getTaskResourceAssignments(taskId);
      const existingResourceIds = new Set(existingAssignments.map(a => a.resourceId));
      
      await storage.updateTaskResourceAssignments(taskId, resourceIds);
      const assignments = await storage.getTaskResourceAssignments(taskId);
      
      // Create notifications for newly assigned resources
      const user = req.user as any;
      if (user) {
        const newResourceIds = resourceIds.filter((id: number) => !existingResourceIds.has(id));
        for (const resourceId of newResourceIds) {
          try {
            await createTaskAssignmentNotification(
              taskId,
              resourceId,
              user.id,
              user.name || user.email || 'A team member'
            );
          } catch (notifErr) {
            console.error('Error creating task assignment notification:', notifErr);
          }
        }
      }
      
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
      
      // Get existing assignments before update to find new ones
      const existingAssignments = await storage.getIssueResourceAssignments(issueId);
      const existingResourceIds = new Set(existingAssignments.map(a => a.resourceId));
      
      await storage.updateIssueResourceAssignments(issueId, resourceIds);
      const assignments = await storage.getIssueResourceAssignments(issueId);
      
      // Create notifications for newly assigned resources
      const user = req.user as any;
      if (user) {
        const newResourceIds = resourceIds.filter((id: number) => !existingResourceIds.has(id));
        for (const resourceId of newResourceIds) {
          try {
            // Get the resource to find their userId
            const resource = await db.select().from(resources).where(eq(resources.id, resourceId)).limit(1);
            if (resource[0]?.userId) {
              await createRiskAssignmentNotification(
                issueId,
                resource[0].userId,
                user.id,
                user.name || user.email || 'A team member'
              );
            }
          } catch (notifErr) {
            console.error('Error creating issue assignment notification:', notifErr);
          }
        }
      }
      
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
      
      // Get existing assignments before update to find new ones
      const existingAssignments = await storage.getRiskResourceAssignments(riskId);
      const existingResourceIds = new Set(existingAssignments.map(a => a.resourceId));
      
      await storage.updateRiskResourceAssignments(riskId, resourceIds);
      const assignments = await storage.getRiskResourceAssignments(riskId);
      
      // Create notifications for newly assigned resources
      const user = req.user as any;
      if (user) {
        const newResourceIds = resourceIds.filter((id: number) => !existingResourceIds.has(id));
        for (const resourceId of newResourceIds) {
          try {
            // Get the resource to find their userId
            const resource = await db.select().from(resources).where(eq(resources.id, resourceId)).limit(1);
            if (resource[0]?.userId) {
              await createRiskAssignmentNotification(
                riskId,
                resource[0].userId,
                user.id,
                user.name || user.email || 'A team member'
              );
            }
          } catch (notifErr) {
            console.error('Error creating risk assignment notification:', notifErr);
          }
        }
      }
      
      res.json(assignments);
    } catch (err) {
      res.status(500).json({ message: "Error updating risk assignments" });
    }
  });

  // ==================== DASHBOARD AGGREGATION ENDPOINTS ====================

  // Get all risks for an organization (dashboard)
  app.get('/api/risks', async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const projects = await storage.getProjects(organizationId);
      const allRisks = [];
      for (const project of projects) {
        const risks = await storage.getRisks(project.id);
        allRisks.push(...risks);
      }
      res.json(allRisks);
    } catch (err) {
      console.error("Error fetching all risks:", err);
      res.status(500).json({ message: "Error fetching risks" });
    }
  });

  // Get all resource assignments (dashboard)
  app.get('/api/resource-assignments', async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const allAssignments = await storage.getAllTaskResourceAssignments(organizationId);
      res.json(allAssignments);
    } catch (err) {
      console.error("Error fetching resource assignments:", err);
      res.status(500).json({ message: "Error fetching resource assignments" });
    }
  });

  // Get dashboard utilization data
  app.get('/api/dashboard/utilization', async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      // Return empty utilization data - can be extended with timesheet aggregation
      res.json([]);
    } catch (err) {
      console.error("Error fetching utilization:", err);
      res.status(500).json({ message: "Error fetching utilization" });
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
        // Check AI credits limit before making the API call
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "ai_runs"
          });
        }
        
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
          "status": "Planning|Initiation|Execution|Monitoring|Closing|Billing",
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
          
          // Track AI usage and deduct credits after successful API call
          const { recordCreditUsage, RESOURCE_TYPES } = await import("./services/billing");
          await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_demo_${Date.now()}`);
          
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
        changeRequests: 0,
        lessonsLearned: 0,
        documents: 0,
        benefits: 0,
        decisions: 0,
        resources: 0,
        intakes: 0,
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
          
          let taskIndex = 1;
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
              taskIndex: taskIndex++,
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
          
          // Generate demo change requests for each project (use template data if available)
          if (projectTemplate.changeRequests && projectTemplate.changeRequests.length > 0) {
            for (let crIdx = 0; crIdx < projectTemplate.changeRequests.length; crIdx++) {
              const crTemplate = projectTemplate.changeRequests[crIdx];
              const requestedDate = new Date(today);
              requestedDate.setDate(requestedDate.getDate() - (10 - crIdx * 5));
              
              await storage.createChangeRequest({
                projectId: project.id,
                requestNumber: `CR-${String(project.id).padStart(3, '0')}-${String(crIdx + 1).padStart(2, '0')}`,
                title: crTemplate.title,
                description: crTemplate.description,
                justification: crTemplate.justification,
                type: crTemplate.type,
                priority: crTemplate.priority,
                status: crTemplate.status,
                requestedBy: 'Demo User',
                requestedDate: requestedDate.toISOString().split('T')[0],
                impact: crTemplate.impact,
                estimatedCost: String(crTemplate.estimatedCost || 0),
                estimatedEffort: crTemplate.estimatedEffort,
                isDemo: true,
              });
              stats.changeRequests++;
            }
          } else {
            // Fall back to generic change requests
            const changeRequestTypes = ['Scope', 'Schedule', 'Budget', 'Resource'];
            const crStatuses = ['Draft', 'Submitted', 'Under Review', 'Approved'];
            for (let crIdx = 0; crIdx < 2; crIdx++) {
              const crType = changeRequestTypes[crIdx % changeRequestTypes.length];
              const crStatus = crStatuses[crIdx % crStatuses.length];
              const requestedDate = new Date(today);
              requestedDate.setDate(requestedDate.getDate() - (10 - crIdx * 5));
              
              await storage.createChangeRequest({
                projectId: project.id,
                requestNumber: `CR-${String(project.id).padStart(3, '0')}-${String(crIdx + 1).padStart(2, '0')}`,
                title: crIdx === 0 ? 'Scope Enhancement Request' : 'Timeline Adjustment Request',
                description: crIdx === 0 ? 'Additional features requested by stakeholders' : 'Schedule change due to resource constraints',
                justification: crIdx === 0 ? 'Business requirement change based on market feedback' : 'Resource availability requires timeline shift',
                type: crType,
                priority: crIdx === 0 ? 'High' : 'Medium',
                status: crStatus,
                requestedBy: 'Demo User',
                requestedDate: requestedDate.toISOString().split('T')[0],
                isDemo: true,
              });
              stats.changeRequests++;
            }
          }
          
          // Generate lessons learned from template if available
          if (projectTemplate.lessonsLearned && projectTemplate.lessonsLearned.length > 0) {
            for (const lessonTemplate of projectTemplate.lessonsLearned) {
              const capturedDate = new Date(today);
              capturedDate.setDate(capturedDate.getDate() - Math.floor(Math.random() * 60));
              
              await storage.createLessonLearned({
                projectId: project.id,
                title: lessonTemplate.title,
                description: lessonTemplate.description,
                category: lessonTemplate.category,
                type: lessonTemplate.type,
                impact: lessonTemplate.impact,
                phase: lessonTemplate.phase,
                recommendation: lessonTemplate.recommendation,
                status: lessonTemplate.status,
                capturedBy: 'Demo User',
                capturedDate: capturedDate.toISOString().split('T')[0],
                isDemo: true,
              });
              stats.lessonsLearned++;
            }
          }
          
          // Generate documents from template if available
          if (projectTemplate.documents && projectTemplate.documents.length > 0) {
            for (const docTemplate of projectTemplate.documents) {
              const uploadedAt = new Date(today);
              uploadedAt.setDate(uploadedAt.getDate() - Math.floor(Math.random() * 30));
              
              await storage.createProjectDocument({
                projectId: project.id,
                title: docTemplate.title,
                description: docTemplate.description,
                type: docTemplate.type,
                category: docTemplate.category,
                version: docTemplate.version,
                status: docTemplate.status,
                fileName: docTemplate.fileName,
                content: docTemplate.content || '',
                uploadedBy: 'Demo User',
                isDemo: true,
              });
              stats.documents++;
            }
          }
          
          // Generate benefits from template if available
          if (projectTemplate.benefits && projectTemplate.benefits.length > 0) {
            for (const benefitTemplate of projectTemplate.benefits) {
              const targetDate = new Date(today);
              targetDate.setDate(targetDate.getDate() + Math.floor(Math.random() * 180) + 30);
              
              await storage.createProjectBenefit({
                projectId: project.id,
                name: benefitTemplate.name,
                description: benefitTemplate.description,
                category: benefitTemplate.category,
                benefitType: benefitTemplate.benefitType,
                status: benefitTemplate.status,
                targetValue: benefitTemplate.targetValue,
                actualValue: benefitTemplate.actualValue || null,
                measurementMethod: benefitTemplate.measurementMethod,
                targetDate: targetDate.toISOString().split('T')[0],
                isDemo: true,
              });
              stats.benefits++;
            }
          }
          
          // Generate decisions from template if available
          if (projectTemplate.decisions && projectTemplate.decisions.length > 0) {
            for (const decisionTemplate of projectTemplate.decisions) {
              const decisionDate = new Date(today);
              decisionDate.setDate(decisionDate.getDate() - Math.floor(Math.random() * 30));
              
              await storage.createProjectDecision({
                projectId: project.id,
                title: decisionTemplate.title,
                description: decisionTemplate.description,
                status: decisionTemplate.status,
                priority: decisionTemplate.priority,
                decisionType: decisionTemplate.decisionType,
                outcome: decisionTemplate.outcome || null,
                rationale: decisionTemplate.rationale || null,
                alternatives: decisionTemplate.alternatives || null,
                decisionDate: decisionTemplate.status === 'Made' ? decisionDate.toISOString().split('T')[0] : null,
                isDemo: true,
              });
              stats.decisions++;
            }
          }
        }
      }
      
      // Generate demo resources (organization-level)
      const resourceTemplates = [
        { name: 'John Smith', email: 'john.smith@demo.com', title: 'Senior Project Manager', department: 'Project Management', skills: 'Agile,Scrum,PMP,Risk Management' },
        { name: 'Sarah Johnson', email: 'sarah.johnson@demo.com', title: 'Business Analyst', department: 'Business Analysis', skills: 'Requirements,BPMN,SQL,Data Analysis' },
        { name: 'Michael Chen', email: 'michael.chen@demo.com', title: 'Technical Lead', department: 'Engineering', skills: 'Architecture,Cloud,DevOps,Python' },
        { name: 'Emily Rodriguez', email: 'emily.rodriguez@demo.com', title: 'UX Designer', department: 'Design', skills: 'Figma,User Research,Prototyping,CSS' },
        { name: 'David Kim', email: 'david.kim@demo.com', title: 'Developer', department: 'Engineering', skills: 'React,TypeScript,Node.js,PostgreSQL' },
      ];
      
      for (const resourceTemplate of resourceTemplates) {
        await storage.createResource({
          organizationId,
          displayName: resourceTemplate.name,
          email: resourceTemplate.email,
          title: resourceTemplate.title,
          department: resourceTemplate.department,
          skills: resourceTemplate.skills,
          hourlyRate: String(Math.floor(Math.random() * 100) + 80),
          isActive: true,
          isDemo: true,
        });
        stats.resources++;
      }
      
      // Generate demo project intakes (pipeline items)
      const intakeTemplates = [
        { name: 'Customer Portal Enhancement', status: 'submitted', businessUnit: 'Customer Success', funding: 'Business Funded', budget: '450000', description: 'Enhance self-service capabilities in customer portal' },
        { name: 'Data Analytics Platform', status: 'approved', businessUnit: 'Data & Analytics', funding: 'IT Funded', budget: '800000', description: 'Enterprise data analytics and reporting platform' },
        { name: 'Mobile App v3.0', status: 'draft', businessUnit: 'Digital', funding: 'Shared', budget: '350000', description: 'Major mobile application redesign and feature update' },
        { name: 'Security Compliance Upgrade', status: 'submitted', businessUnit: 'IT Security', funding: 'IT Funded', budget: '275000', description: 'SOC2 and ISO compliance infrastructure updates' },
      ];
      
      const year = today.getFullYear();
      for (let intakeIdx = 0; intakeIdx < intakeTemplates.length; intakeIdx++) {
        const intakeTemplate = intakeTemplates[intakeIdx];
        await storage.createProjectIntake({
          organizationId,
          intakeNumber: `INT-${year}-${String(intakeIdx + 1).padStart(3, '0')}`,
          projectName: intakeTemplate.name,
          description: intakeTemplate.description,
          status: intakeTemplate.status,
          businessUnit: intakeTemplate.businessUnit,
          fundingSource: intakeTemplate.funding,
          estimatedBudget: intakeTemplate.budget,
          currentStep: intakeTemplate.status === 'approved' ? 'pmo_approved' : 'basic_info',
          basicInfoComplete: true,
          isDemo: true,
        });
        stats.intakes++;
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
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const { 
        organizationId, projectName, submitterId, description, fundingSource,
        portfolioId, businessUnit, programName
      } = req.body;
      
      if (!organizationId || !projectName) {
        return res.status(400).json({ message: "organizationId and projectName are required" });
      }

      // Check intake limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.INTAKES);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Intake limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "intakes"
          });
        }
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
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        await recordResourceUsage(userId, METER_CODES.INTAKES, intake.id, 1, organizationId);
      }
      
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

      // Check PMO approval requirement
      if (!existing.pmoApproved) {
        return res.status(403).json({ message: "PM approval is required before converting to a project. Please ensure the PM has approved this intake." });
      }

      // Check user role - must be org_admin or super_admin
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const isSuperAdmin = user.role === 'super_admin';
      if (!isSuperAdmin) {
        // Check if user is org_admin for this organization
        const memberships = await storage.getOrganizationMemberships(userId);
        const isOrgAdmin = memberships.some(m => m.organizationId === existing.organizationId && m.role === 'org_admin');
        
        if (!isOrgAdmin) {
          return res.status(403).json({ message: "Only PMO/Admin users can convert intakes to projects" });
        }
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
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
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
      
      // Save the original file to object storage for future download
      let fileUrl: string | undefined;
      const uniqueFilename = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      
      try {
        const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
        const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
        
        if (privateObjectDir) {
          const objectPath = `${privateObjectDir}/mpp-imports/${uniqueFilename}`;
          const pathParts = objectPath.split('/');
          const bucketName = pathParts[1];
          const objectName = pathParts.slice(2).join('/');

          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          
          await file.save(req.file.buffer, {
            contentType: 'application/octet-stream',
            metadata: {
              originalName: fileName,
              uploadedBy: userId,
            },
          });

          fileUrl = `/objects/mpp-imports/${uniqueFilename}`;
        } else {
          throw new Error('Object storage not configured');
        }
      } catch (objectStorageError) {
        console.log("Object storage unavailable, using local storage:", (objectStorageError as Error).message);
        // Fallback to local file storage
        const mppDir = path.join(process.cwd(), 'public', 'mpp-imports');
        if (!fs.existsSync(mppDir)) {
          fs.mkdirSync(mppDir, { recursive: true });
        }
        
        const filePath = path.join(mppDir, uniqueFilename);
        fs.writeFileSync(filePath, req.file.buffer);
        
        fileUrl = `/mpp-imports/${uniqueFilename}`;
      }
      
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
        fileUrl, // Store the object storage URL for download
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
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check change request limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.CHANGE_REQUESTS);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Change request limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "change_requests"
          });
        }
      }
      
      const changeRequest = await storage.createChangeRequest({
        ...req.body,
        projectId,
        requestedBy: userId,
      });
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        // Get org ID from project for billing
        const project = await storage.getProject(projectId);
        await recordResourceUsage(userId, METER_CODES.CHANGE_REQUESTS, changeRequest.id, 1, project?.organizationId);
      }
      
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
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check document limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.DOCUMENTS);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Document limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "documents"
          });
        }
      }
      
      const document = await storage.createProjectDocument({
        ...req.body,
        projectId,
        uploadedBy: userId,
      });
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        // Get org ID from project for billing
        const project = await storage.getProject(projectId);
        await recordResourceUsage(userId, METER_CODES.DOCUMENTS, document.id, 1, project?.organizationId);
      }
      
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
      
      // Note: Email verification not required for comments since they are low-risk,
      // append-only, and essential for team collaboration
      
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

  // =========== BILLABLE STATUS COMMENTS ===========
  
  // Get all billable status comments for a project
  app.get('/api/projects/:projectId/billable-status-comments', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const projectId = Number(req.params.projectId);
      
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
      
      const comments = await storage.getBillableStatusComments(projectId);
      res.json(comments);
    } catch (err) {
      console.error("Error fetching billable status comments:", err);
      res.status(500).json({ message: "Error fetching billable status comments" });
    }
  });

  // Create a billable status comment for a project
  app.post('/api/projects/:projectId/billable-status-comments', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const content = req.body.content?.trim();
      if (!content || content.length === 0) {
        return res.status(400).json({ message: "Comment content is required" });
      }
      
      // Get user's display name
      const user = await storage.getUser(userId);
      const userName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.email || 'Unknown';
      
      // Get current project's billable status
      const currentBillableStatus = project.billableStatus || 'N/A';
      
      const comment = await storage.createBillableStatusComment({
        projectId,
        billableStatus: currentBillableStatus,
        comment: content,
        userId,
        userName,
      });
      
      res.status(201).json(comment);
    } catch (err) {
      console.error("Error creating billable status comment:", err);
      res.status(500).json({ message: "Error creating billable status comment" });
    }
  });

  // =========== HEALTH STATUS HISTORY ===========
  
  // Get health status history for a project
  app.get('/api/projects/:projectId/health-status-history', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const projectId = Number(req.params.projectId);
      
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
      
      const history = await storage.getHealthStatusHistory(projectId);
      res.json(history);
    } catch (err) {
      console.error("Error fetching health status history:", err);
      res.status(500).json({ message: "Error fetching health status history" });
    }
  });

  // =========== PROJECT INVOICES ===========
  
  // Get all invoices for a project
  app.get('/api/projects/:projectId/invoices', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const projectId = Number(req.params.projectId);
      
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
      
      const invoices = await storage.getProjectInvoices(projectId);
      res.json(invoices);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      res.status(500).json({ message: "Error fetching invoices" });
    }
  });

  // Create a new invoice
  app.post('/api/projects/:projectId/invoices', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const user = await storage.getUser(userId);
      const userName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.email || 'Unknown';
      
      const invoice = await storage.createProjectInvoice({
        ...req.body,
        projectId,
        organizationId: project.organizationId,
        createdBy: userId,
        createdByName: userName,
      });
      
      res.status(201).json(invoice);
    } catch (err) {
      console.error("Error creating invoice:", err);
      res.status(500).json({ message: "Error creating invoice" });
    }
  });

  // Update an invoice
  app.patch('/api/invoices/:invoiceId', async (req, res) => {
    try {
      const invoiceId = Number(req.params.invoiceId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const invoice = await storage.getProjectInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const project = await storage.getProject(invoice.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const updated = await storage.updateProjectInvoice(invoiceId, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating invoice:", err);
      res.status(500).json({ message: "Error updating invoice" });
    }
  });

  // Delete an invoice
  app.delete('/api/invoices/:invoiceId', async (req, res) => {
    try {
      const invoiceId = Number(req.params.invoiceId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const invoice = await storage.getProjectInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const project = await storage.getProject(invoice.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.deleteProjectInvoice(invoiceId);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting invoice:", err);
      res.status(500).json({ message: "Error deleting invoice" });
    }
  });

  // =========== INVOICE NOTES ===========
  
  // Get all notes for an invoice
  app.get('/api/invoices/:invoiceId/notes', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const invoiceId = Number(req.params.invoiceId);
      
      const invoice = await storage.getProjectInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const project = await storage.getProject(invoice.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      if (userId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(project.organizationId)) {
          return res.status(404).json({ message: "Invoice not found" });
        }
      }
      
      const notes = await storage.getInvoiceNotes(invoiceId);
      res.json(notes);
    } catch (err) {
      console.error("Error fetching invoice notes:", err);
      res.status(500).json({ message: "Error fetching invoice notes" });
    }
  });

  // Create a note for an invoice
  app.post('/api/invoices/:invoiceId/notes', async (req, res) => {
    try {
      const invoiceId = Number(req.params.invoiceId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const invoice = await storage.getProjectInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const project = await storage.getProject(invoice.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const content = req.body.note?.trim();
      if (!content || content.length === 0) {
        return res.status(400).json({ message: "Note content is required" });
      }
      
      const user = await storage.getUser(userId);
      const userName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.email || 'Unknown';
      
      const note = await storage.createInvoiceNote({
        invoiceId,
        status: invoice.status,
        note: content,
        userId,
        userName,
      });
      
      res.status(201).json(note);
    } catch (err) {
      console.error("Error creating invoice note:", err);
      res.status(500).json({ message: "Error creating invoice note" });
    }
  });

  // =========== PROJECT VIEWS ===========
  
  // Get all views for a user in a specific mode (grid or gantt)
  app.get('/api/organizations/:orgId/project-views', async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      const mode = req.query.mode as string;
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (!mode || !['grid', 'gantt'].includes(mode)) {
        return res.status(400).json({ message: "Mode must be 'grid' or 'gantt'" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const views = await storage.getProjectViews(orgId, userId, mode);
      res.json(views);
    } catch (err) {
      console.error("Error fetching project views:", err);
      res.status(500).json({ message: "Error fetching project views" });
    }
  });

  // Create a new project view
  app.post('/api/organizations/:orgId/project-views', async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { mode, name, visibleColumns, columnOrder, columnWidths, frozenColumns, isDefault } = req.body;
      
      if (!mode || !['grid', 'gantt'].includes(mode)) {
        return res.status(400).json({ message: "Mode must be 'grid' or 'gantt'" });
      }
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: "View name is required" });
      }
      
      if (!visibleColumns || !Array.isArray(visibleColumns)) {
        return res.status(400).json({ message: "Visible columns are required" });
      }
      
      // Check for duplicate name
      const existingViews = await storage.getProjectViews(orgId, userId, mode);
      const duplicateName = existingViews.find(v => v.name.toLowerCase() === name.trim().toLowerCase());
      if (duplicateName) {
        return res.status(400).json({ message: "A view with this name already exists" });
      }
      
      const view = await storage.createProjectView({
        organizationId: orgId,
        userId,
        mode,
        name: name.trim(),
        visibleColumns,
        columnOrder: columnOrder || null,
        columnWidths: columnWidths || null,
        frozenColumns: frozenColumns || null,
        isDefault: isDefault || false,
        isSystem: false,
      });
      
      // If this is marked as default, update the default status
      if (isDefault) {
        await storage.setDefaultProjectView(orgId, userId, mode, view.id);
      }
      
      res.status(201).json(view);
    } catch (err) {
      console.error("Error creating project view:", err);
      res.status(500).json({ message: "Error creating project view" });
    }
  });

  // Update a project view
  app.patch('/api/project-views/:id', async (req, res) => {
    try {
      const viewId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const existingView = await storage.getProjectView(viewId);
      if (!existingView) {
        return res.status(404).json({ message: "View not found" });
      }
      
      // Check ownership
      if (existingView.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Prevent updating system views' name or deleting them
      if (existingView.isSystem && req.body.name) {
        return res.status(400).json({ message: "Cannot rename system views" });
      }
      
      const { name, visibleColumns, columnOrder, columnWidths, frozenColumns, isDefault } = req.body;
      
      // Check for duplicate name if renaming
      if (name && name.trim().toLowerCase() !== existingView.name.toLowerCase()) {
        const existingViews = await storage.getProjectViews(existingView.organizationId, userId, existingView.mode);
        const duplicateName = existingViews.find(v => v.name.toLowerCase() === name.trim().toLowerCase() && v.id !== viewId);
        if (duplicateName) {
          return res.status(400).json({ message: "A view with this name already exists" });
        }
      }
      
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (visibleColumns !== undefined) updates.visibleColumns = visibleColumns;
      if (columnOrder !== undefined) updates.columnOrder = columnOrder;
      if (columnWidths !== undefined) updates.columnWidths = columnWidths;
      if (frozenColumns !== undefined) updates.frozenColumns = frozenColumns;
      
      const updatedView = await storage.updateProjectView(viewId, updates);
      
      // If this is marked as default, update the default status
      if (isDefault) {
        await storage.setDefaultProjectView(existingView.organizationId, userId, existingView.mode, viewId);
      }
      
      res.json(updatedView);
    } catch (err) {
      console.error("Error updating project view:", err);
      res.status(500).json({ message: "Error updating project view" });
    }
  });

  // Delete a project view
  app.delete('/api/project-views/:id', async (req, res) => {
    try {
      const viewId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const existingView = await storage.getProjectView(viewId);
      if (!existingView) {
        return res.status(404).json({ message: "View not found" });
      }
      
      // Check ownership
      if (existingView.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Prevent deleting system views
      if (existingView.isSystem) {
        return res.status(400).json({ message: "Cannot delete system views" });
      }
      
      await storage.deleteProjectView(viewId);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting project view:", err);
      res.status(500).json({ message: "Error deleting project view" });
    }
  });

  // Set a view as default
  app.post('/api/project-views/:id/set-default', async (req, res) => {
    try {
      const viewId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const existingView = await storage.getProjectView(viewId);
      if (!existingView) {
        return res.status(404).json({ message: "View not found" });
      }
      
      // Check ownership
      if (existingView.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.setDefaultProjectView(existingView.organizationId, userId, existingView.mode, viewId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error setting default view:", err);
      res.status(500).json({ message: "Error setting default view" });
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

  // Run notification checks for an organization (generates notifications for overdue tasks, deadlines, health alerts, etc.)
  app.post('/api/organizations/:orgId/notifications/check', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const orgId = Number(req.params.orgId);
      
      // Check user has access to the organization (admin or owner only)
      const membership = await storage.getOrganizationMember(orgId, userId);
      const user = await storage.getUser(userId);
      const isSuperAdmin = user?.role === 'super_admin';
      const isOrgAdmin = membership?.role === 'owner' || membership?.role === 'org_admin' || membership?.role === 'admin';
      
      if (!isSuperAdmin && !isOrgAdmin) {
        return res.status(403).json({ message: "Admin access required to run notification checks" });
      }
      
      const { runAllNotificationChecks } = await import('./services/notificationEngine');
      const results = await runAllNotificationChecks(orgId);
      
      res.json({
        message: "Notification check completed",
        results,
      });
    } catch (err) {
      console.error("Error running notification checks:", err);
      res.status(500).json({ message: "Error running notification checks" });
    }
  });

  // Run notification checks for all organizations (super admin only - for scheduled jobs)
  app.post('/api/admin/notifications/check-all', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const user = await storage.getUser(userId);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }
      
      const orgs = await storage.getOrganizations();
      const activeOrgs = orgs.filter(o => !o.deactivatedAt);
      
      const { runAllNotificationChecks } = await import('./services/notificationEngine');
      const allResults = [];
      
      for (const org of activeOrgs) {
        try {
          const result = await runAllNotificationChecks(org.id);
          allResults.push({ organizationId: org.id, organizationName: org.name, ...result });
        } catch (err) {
          allResults.push({ organizationId: org.id, organizationName: org.name, error: String(err) });
        }
      }
      
      const totals = allResults.reduce((acc, r) => ({
        totalCreated: acc.totalCreated + (r.totalCreated || 0),
        totalSkipped: acc.totalSkipped + (r.totalSkipped || 0),
        totalErrors: acc.totalErrors + (r.totalErrors || 0),
      }), { totalCreated: 0, totalSkipped: 0, totalErrors: 0 });
      
      res.json({
        message: "Notification check completed for all organizations",
        organizationsProcessed: activeOrgs.length,
        ...totals,
        details: allResults,
      });
    } catch (err) {
      console.error("Error running notification checks for all orgs:", err);
      res.status(500).json({ message: "Error running notification checks" });
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
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check AI runs limit before making the API call
      const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
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
      
      // Track AI usage and deduct credits after successful API call
      const { recordCreditUsage, RESOURCE_TYPES } = await import("./services/billing");
      await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_project_${Date.now()}`);
      
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

  // Smart AI Create - can create projects, tasks, risks, issues, milestones, or resources
  app.post('/api/ai/smart-create', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }
      
      const { prompt, organizationId, projectId, portfolioId } = req.body;
      
      if (!prompt || !organizationId) {
        return res.status(400).json({ message: "Prompt and organizationId are required" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      const systemPrompt = `You are an AI assistant for a project portfolio management system. Based on the user's request, determine what they want to create and generate the appropriate data.

Analyze the request and decide which type(s) of items to create:
- "project" - For creating new projects with tasks, risks, and issues
- "task" - For creating one or more tasks (requires projectId context)
- "risk" - For creating one or more project risks (requires projectId context)
- "issue" - For creating one or more project issues (requires projectId context)
- "milestone" - For creating one or more milestones (requires projectId context)
- "resource" - For creating team members/resources

Return a JSON response with this structure:
{
  "intent": "project" | "task" | "risk" | "issue" | "milestone" | "resource" | "multiple",
  "requiresProject": boolean,
  "items": {
    "project": { ... } | null,
    "tasks": [...] | [],
    "risks": [...] | [],
    "issues": [...] | [],
    "milestones": [...] | [],
    "resources": [...] | []
  }
}

For a PROJECT:
{
  "name": "Project name",
  "description": "Description",
  "status": "Initiation",
  "priority": "Medium",
  "health": "Green",
  "budget": 0
}

For TASKS (array):
{
  "name": "Task name",
  "description": "Description",
  "durationDays": 5,
  "status": "Not Started",
  "priority": "Medium"
}

For RISKS (array):
{
  "title": "Risk title",
  "description": "Description",
  "probability": "Medium",
  "impact": "Medium",
  "status": "Open",
  "mitigationPlan": "How to mitigate"
}

For ISSUES (array):
{
  "title": "Issue title",
  "description": "Description",
  "priority": "Medium",
  "status": "Open",
  "type": "Task"
}

For MILESTONES (array):
{
  "name": "Milestone name",
  "description": "Description",
  "daysFromStart": 30
}

For RESOURCES (array):
{
  "displayName": "Full Name",
  "email": "email@example.com",
  "title": "Job Title",
  "department": "Department",
  "skills": "Skill1, Skill2"
}

Guidelines:
- If user mentions "project", "initiative", "program" → create a project with related tasks/risks
- If user mentions "task", "todo", "work item", "action item" → create tasks only
- If user mentions "risk", "concern", "threat" → create risks only
- If user mentions "issue", "problem", "bug", "blocker" → create issues only
- If user mentions "milestone", "deadline", "deliverable", "phase" → create milestones only
- If user mentions "resource", "team member", "person", "staff" → create resources only
- Be specific and realistic based on the domain context
- Generate 3-8 items when creating multiple of the same type

Return ONLY valid JSON.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Request: ${prompt}\n\nContext: organizationId=${organizationId}${projectId ? `, projectId=${projectId}` : ''}` }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      });
      
      const { recordCreditUsage, RESOURCE_TYPES } = await import("./services/billing");
      await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_smart_create_${Date.now()}`);
      
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
      
      // Validate that there's something to create
      const hasItems = aiResult.items?.project || 
        (aiResult.items?.tasks?.length > 0) || 
        (aiResult.items?.risks?.length > 0) || 
        (aiResult.items?.issues?.length > 0) || 
        (aiResult.items?.milestones?.length > 0) || 
        (aiResult.items?.resources?.length > 0);
      
      if (!hasItems) {
        return res.status(400).json({ 
          message: "Could not understand what to create. Please be more specific in your request.",
          intent: aiResult.intent
        });
      }
      
      // Check if project context is required but missing
      const needsProjectContext = (aiResult.items?.tasks?.length > 0) || 
        (aiResult.items?.risks?.length > 0) || 
        (aiResult.items?.issues?.length > 0) || 
        (aiResult.items?.milestones?.length > 0);
      
      const hasProjectContext = projectId || aiResult.items?.project;
      
      if (needsProjectContext && !hasProjectContext) {
        return res.status(400).json({ 
          message: "Creating tasks, risks, issues, or milestones requires a project. Please specify a project or ask to create a new project.",
          requiresProject: true,
          intent: aiResult.intent
        });
      }
      
      const results: any = {
        intent: aiResult.intent,
        created: {},
        summary: []
      };
      
      const today = new Date();
      let currentProjectId = projectId ? Number(projectId) : null;
      
      // Create project if needed
      if (aiResult.items?.project) {
        const projectData = {
          organizationId: Number(organizationId),
          portfolioId: portfolioId ? Number(portfolioId) : null,
          name: aiResult.items.project.name,
          description: aiResult.items.project.description,
          status: aiResult.items.project.status || "Initiation",
          priority: aiResult.items.project.priority || "Medium",
          health: aiResult.items.project.health || "Green",
          budget: String(aiResult.items.project.budget || 0),
          startDate: today.toISOString().split('T')[0],
          source: "ai_generated",
        };
        
        const project = await storage.createProject(projectData);
        currentProjectId = project.id;
        results.created.project = project;
        results.summary.push(`Created project "${project.name}"`);
      }
      
      // Create tasks
      if (aiResult.items?.tasks?.length > 0 && currentProjectId) {
        let currentDate = new Date(today);
        const createdTasks = [];
        
        for (const taskData of aiResult.items.tasks) {
          const startDate = new Date(currentDate);
          const durationDays = taskData.durationDays || 5;
          const endDate = new Date(currentDate);
          endDate.setDate(endDate.getDate() + durationDays);
          
          const task = await storage.createTask({
            projectId: currentProjectId,
            name: taskData.name,
            description: taskData.description,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            durationDays,
            status: taskData.status || "Not Started",
            priority: taskData.priority || "Medium",
            progress: 0,
          });
          createdTasks.push(task);
          currentDate.setDate(currentDate.getDate() + durationDays);
        }
        results.created.tasks = createdTasks;
        results.summary.push(`Created ${createdTasks.length} task(s)`);
      }
      
      // Create risks
      if (aiResult.items?.risks?.length > 0 && currentProjectId) {
        const createdRisks = [];
        for (const riskData of aiResult.items.risks) {
          const risk = await storage.createRisk({
            projectId: currentProjectId,
            title: riskData.title,
            description: riskData.description,
            probability: riskData.probability || "Medium",
            impact: riskData.impact || "Medium",
            status: riskData.status || "Open",
            mitigationPlan: riskData.mitigationPlan,
          });
          createdRisks.push(risk);
        }
        results.created.risks = createdRisks;
        results.summary.push(`Created ${createdRisks.length} risk(s)`);
      }
      
      // Create issues
      if (aiResult.items?.issues?.length > 0 && currentProjectId) {
        const createdIssues = [];
        for (const issueData of aiResult.items.issues) {
          const issue = await storage.createIssue({
            projectId: currentProjectId,
            title: issueData.title,
            description: issueData.description,
            priority: issueData.priority || "Medium",
            status: issueData.status || "Open",
            type: issueData.type || "Task",
          });
          createdIssues.push(issue);
        }
        results.created.issues = createdIssues;
        results.summary.push(`Created ${createdIssues.length} issue(s)`);
      }
      
      // Create milestones
      if (aiResult.items?.milestones?.length > 0 && currentProjectId) {
        const createdMilestones = [];
        for (const milestoneData of aiResult.items.milestones) {
          const milestoneDate = new Date(today);
          milestoneDate.setDate(milestoneDate.getDate() + (milestoneData.daysFromStart || 30));
          
          const milestone = await storage.createMilestone({
            projectId: currentProjectId,
            name: milestoneData.name,
            description: milestoneData.description,
            dueDate: milestoneDate.toISOString().split('T')[0],
            status: "Not Started",
          });
          createdMilestones.push(milestone);
        }
        results.created.milestones = createdMilestones;
        results.summary.push(`Created ${createdMilestones.length} milestone(s)`);
      }
      
      // Create resources
      if (aiResult.items?.resources?.length > 0) {
        const createdResources = [];
        for (const resourceData of aiResult.items.resources) {
          const resource = await storage.createResource({
            organizationId: Number(organizationId),
            displayName: resourceData.displayName,
            email: resourceData.email,
            title: resourceData.title,
            department: resourceData.department,
            skills: resourceData.skills,
          });
          createdResources.push(resource);
        }
        results.created.resources = createdResources;
        results.summary.push(`Created ${createdResources.length} resource(s)`);
      }
      
      // Determine redirect path
      if (results.created.project) {
        results.redirectTo = `/projects/${results.created.project.id}`;
      } else if (currentProjectId) {
        results.redirectTo = `/projects/${currentProjectId}`;
      }
      
      res.json({
        success: true,
        ...results,
        message: results.summary.join(", ")
      });
    } catch (err) {
      console.error("Error with AI smart create:", err);
      res.status(500).json({ message: "Failed to create with AI" });
    }
  });

  // ==================== ANALYTICS API (Power BI Integration) ====================

  // Helper: Get user ID from either session or API key (Basic auth)
  // Power BI uses Basic auth where username=email and password=apiKey
  async function getAnalyticsUserId(req: Request): Promise<string | null> {
    // First try session-based auth
    const sessionUserId = getUserIdFromRequest(req);
    if (sessionUserId) return sessionUserId;
    
    // Then try API key via Basic auth header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const base64Credentials = authHeader.slice(6);
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [email, apiKey] = credentials.split(':');
        
        if (email && apiKey) {
          // Look up user by API key
          const user = await storage.getUserByApiKey(apiKey);
          if (user && user.email === email) {
            return user.id;
          }
        }
      } catch (err) {
        console.error('Error parsing Basic auth:', err);
      }
    }
    
    return null;
  }

  // API Key Management
  app.get('/api/user/api-key', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json({ 
      hasApiKey: !!user.apiKey,
      apiKey: user.apiKey ? `${user.apiKey.slice(0, 8)}...` : null // Show partial for security
    });
  });

  app.post('/api/user/api-key/generate', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    // Generate a secure random API key
    const crypto = await import('crypto');
    const apiKey = crypto.randomBytes(32).toString('hex');
    
    await storage.updateUser(userId, { apiKey });
    
    const user = await storage.getUser(userId);
    
    res.json({ 
      success: true,
      apiKey,
      message: "API key generated. Use your email as username and this API key as password in Power BI Basic auth.",
      instructions: {
        username: user?.email,
        password: apiKey,
        authType: "Basic"
      }
    });
  });

  app.delete('/api/user/api-key', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    await storage.updateUser(userId, { apiKey: null });
    
    res.json({ success: true, message: "API key revoked" });
  });

  // Delete own account
  app.delete('/api/user/account', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Delete the user and all associated data
      await storage.deleteUser(userId);

      // Clear the session
      if (req.session) {
        req.session.destroy((err: Error | null) => {
          if (err) {
            console.error('Error destroying session:', err);
          }
        });
      }

      res.json({ success: true, message: "Account deleted successfully" });
    } catch (err) {
      console.error('Error deleting account:', err);
      res.status(500).json({ message: 'Failed to delete account' });
    }
  });

  // Analytics: Projects flat data for Power BI
  app.get('/api/analytics/projects', async (req, res) => {
    try {
      const userId = await getAnalyticsUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required. Use Basic auth with your email and API key." });
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
      const userId = await getAnalyticsUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required. Use Basic auth with your email and API key." });
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
      const userId = await getAnalyticsUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required. Use Basic auth with your email and API key." });
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
      const userId = await getAnalyticsUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required. Use Basic auth with your email and API key." });
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
      const userId = await getAnalyticsUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required. Use Basic auth with your email and API key." });
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
      const userId = await getAnalyticsUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required. Use Basic auth with your email and API key." });
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
      const userId = await getAnalyticsUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required. Use Basic auth with your email and API key." });
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

  // Get subscription - supports both user and org-based subscriptions
  app.get('/api/billing/subscription', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { billingProvider } = await import("./services/billing");
      const { plans } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const orgIdParam = req.query.orgId;
      const orgId = orgIdParam ? parseInt(orgIdParam as string) : null;
      
      let subscription = null;
      
      // If orgId is explicitly provided, only show that org's subscription (no fallback)
      if (orgId) {
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
        if (!subscription) {
          // Auto-create a free subscription for organizations without one
          subscription = await billingProvider.createSubscription({ planCode: "FREE", orgId });
        }
      } else {
        // No orgId provided - show user's personal subscription
        subscription = await billingProvider.getSubscriptionForUser(userId);
        if (!subscription) {
          // Auto-create a free subscription for new users
          subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
        }
      }
      
      // Get the plan details
      const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId));
      
      res.json({ ...subscription, plan });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  // Get usage summary (credits-based)
  app.get('/api/billing/usage', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { billingProvider, getAllCreditCosts } = await import("./services/billing");
      const { meters, planMeterRules, usageRollups } = await import("@shared/schema");
      const { sql, eq, and } = await import("drizzle-orm");
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;
      
      let subscription;
      
      // If orgId is explicitly provided, only show that org's data (no fallback)
      if (orgId) {
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
        if (!subscription) {
          // Auto-create a free subscription for organizations without one
          subscription = await billingProvider.createSubscription({ planCode: "FREE", orgId });
        }
      } else {
        // No orgId provided - show user's personal subscription
        subscription = await billingProvider.getSubscriptionForUser(userId);
        if (!subscription) {
          // Auto-create a free subscription for new users
          subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
        }
      }
      
      // Get credits meter
      const [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);
      
      // Get credits limit from plan rules
      let creditsIncluded = 0;
      let creditsHardCap: number | null = null;
      
      if (creditsMeter) {
        const rules = await db
          .select()
          .from(planMeterRules)
          .where(
            and(
              eq(planMeterRules.planId, subscription.planId),
              eq(planMeterRules.meterId, creditsMeter.id)
            )
          );
        
        const quotaRule = rules.find((r) => r.ruleType === "INCLUDED_QUOTA");
        const hardCapRule = rules.find((r) => r.ruleType === "HARD_CAP");
        
        creditsIncluded = quotaRule?.includedUnitsMonthly || 0;
        creditsHardCap = hardCapRule?.hardCapUnits || null;
      }
      
      // Get credits used from rollups
      const cycle = await billingProvider.getOrCreateBillingCycle(subscription.id);
      let creditsUsedHundredths = 0;
      
      if (creditsMeter) {
        const [rollup] = await db
          .select()
          .from(usageRollups)
          .where(
            and(
              eq(usageRollups.billingCycleId, cycle.id),
              eq(usageRollups.meterId, creditsMeter.id)
            )
          )
          .limit(1);
        
        creditsUsedHundredths = rollup?.usedUnits || 0;
      }
      
      // Convert usage from hundredths to actual credits for display
      // Plan meter rules store credits as actual credits (200, 500, etc.)
      // Usage rollups store in hundredths (500 = 5 credits)
      const creditsUsed = creditsUsedHundredths / 100;
      const limit = creditsHardCap !== null ? creditsHardCap : creditsIncluded;
      const remaining = Math.max(0, limit - creditsUsed);
      
      // Get credit costs for display
      const creditCosts = await getAllCreditCosts();
      
      // Return credits-based usage - plan limits are in actual credits, not hundredths
      res.json({
        credits: {
          used: creditsUsed,
          included: creditsIncluded,
          hardCap: creditsHardCap,
          remaining: remaining,
          limit: limit
        },
        creditCosts: creditCosts.map(c => ({
          ...c,
          creditCost: c.creditCost / 100 // Credit costs table uses hundredths, convert for display
        }))
      });
    } catch (error) {
      console.error("Error fetching usage:", error);
      res.status(500).json({ message: "Failed to fetch usage" });
    }
  });

  // Get AI operation credit costs for frontend warnings
  app.get('/api/billing/ai-costs', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { billingProvider, getAllCreditCosts } = await import("./services/billing");
      const { meters, planMeterRules, usageRollups } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      // Get user's subscription
      let subscription = await billingProvider.getSubscriptionForUser(userId);
      if (!subscription) {
        subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
      }
      
      // Get credits meter info
      const [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);
      
      // Get credits limits from plan
      let creditsIncluded = 0;
      let creditsHardCap: number | null = null;
      let hasQuotaRule = false; // Track whether a quota rule exists at all
      
      if (creditsMeter) {
        const rules = await db
          .select()
          .from(planMeterRules)
          .where(
            and(
              eq(planMeterRules.planId, subscription.planId),
              eq(planMeterRules.meterId, creditsMeter.id)
            )
          );
        
        const quotaRule = rules.find((r) => r.ruleType === "INCLUDED_QUOTA");
        const hardCapRule = rules.find((r) => r.ruleType === "HARD_CAP");
        
        hasQuotaRule = quotaRule !== undefined;
        creditsIncluded = quotaRule?.includedUnitsMonthly || 0;
        creditsHardCap = hardCapRule?.hardCapUnits ?? null;
      }
      
      // Get current usage
      const cycle = await billingProvider.getOrCreateBillingCycle(subscription.id);
      let creditsUsedHundredths = 0;
      
      if (creditsMeter) {
        const [rollup] = await db
          .select()
          .from(usageRollups)
          .where(
            and(
              eq(usageRollups.billingCycleId, cycle.id),
              eq(usageRollups.meterId, creditsMeter.id)
            )
          )
          .limit(1);
        
        creditsUsedHundredths = rollup?.usedUnits || 0;
      }
      
      const creditsUsed = creditsUsedHundredths / 100;
      
      // Determine if there's an explicit limit set
      // If hardCap exists, use it; if quota rule exists (even with 0 units), use quota; if neither, limit is null (unlimited)
      const hasExplicitLimit = creditsHardCap !== null || hasQuotaRule;
      const limit = hasExplicitLimit ? (creditsHardCap !== null ? creditsHardCap : creditsIncluded) : null;
      const remaining = limit !== null ? Math.max(0, limit - creditsUsed) : null;
      
      // Get all credit costs
      const creditCosts = await getAllCreditCosts();
      
      // Find AI-related credit costs - check for specific resource types
      const aiRunCost = creditCosts.find(c => c.resourceType === 'ai_run');
      const aiProjectCost = creditCosts.find(c => c.resourceType === 'ai_project_generation');
      const aiDemoCost = creditCosts.find(c => c.resourceType === 'ai_demo_generation');
      
      // Use specific costs if available, fallback to ai_run, then default 3 credits
      const projectCreditCost = aiProjectCost ? aiProjectCost.creditCost / 100 : 
                                 aiRunCost ? aiRunCost.creditCost / 100 : 3;
      const demoCreditCost = aiDemoCost ? aiDemoCost.creditCost / 100 : 
                              aiRunCost ? aiRunCost.creditCost / 100 : 3;
      
      // If remaining is null (unlimited), user can afford; otherwise check balance
      const canAffordProject = remaining === null || remaining >= projectCreditCost;
      const canAffordDemo = remaining === null || remaining >= demoCreditCost;
      
      res.json({
        aiProjectGeneration: {
          creditCost: projectCreditCost,
          description: "Generate a project with AI",
          canAfford: canAffordProject,
        },
        aiDemoDataGeneration: {
          creditCost: demoCreditCost,
          description: "Generate demo data with custom industry using AI",
          canAfford: canAffordDemo,
        },
        credits: {
          used: creditsUsed,
          remaining: remaining,
          limit: limit,
        },
        // Overall flag for backward compat - true if can afford at least one operation
        canAfford: canAffordProject || canAffordDemo,
      });
    } catch (error) {
      console.error("Error fetching AI costs:", error);
      res.status(500).json({ message: "Failed to fetch AI costs" });
    }
  });

  // Get billing/payment history
  app.get('/api/billing/history', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;
      
      const transactions = await storage.getBillingTransactions(userId, orgId, limit, offset);
      
      // Prevent caching of billing history
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching billing history:", error);
      res.status(500).json({ message: "Failed to fetch billing history" });
    }
  });

  // Get credit usage ledger - detailed history of all credit transactions
  app.get('/api/billing/credit-ledger', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;
      
      // Get subscription - if orgId is explicitly provided, only show that org's data (no fallback)
      const { billingProvider } = await import("./services/billing");
      let subscription = null;
      
      if (orgId) {
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
        if (!subscription) {
          // Auto-create a free subscription for organizations without one
          subscription = await billingProvider.createSubscription({ planCode: "FREE", orgId });
        }
      } else {
        // No orgId provided - show user's personal subscription
        subscription = await billingProvider.getSubscriptionForUser(userId);
        if (!subscription) {
          // Auto-create a free subscription for new users
          subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
        }
      }

      // Query usage events for credits meter with user details
      const result = await db.select({
        id: usageEvents.id,
        units: usageEvents.units,
        requestId: usageEvents.requestId,
        occurredAt: usageEvents.occurredAt,
        createdAt: usageEvents.createdAt,
        actorUserId: usageEvents.actorUserId,
        meterCode: meters.code,
        meterName: meters.name,
      })
      .from(usageEvents)
      .innerJoin(meters, eq(usageEvents.meterId, meters.id))
      .where(
        and(
          eq(usageEvents.subscriptionId, subscription.id),
          eq(meters.code, 'credits')
        )
      )
      .orderBy(desc(usageEvents.occurredAt))
      .limit(limit)
      .offset(offset);

      // Get total count
      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(usageEvents)
        .innerJoin(meters, eq(usageEvents.meterId, meters.id))
        .where(
          and(
            eq(usageEvents.subscriptionId, subscription.id),
            eq(meters.code, 'credits')
          )
        );
      
      const total = countResult[0]?.count || 0;

      // Get user details for each entry
      const userIds = Array.from(new Set(result.map(e => e.actorUserId).filter((id): id is string => id !== null)));
      const users = await Promise.all(
        userIds.map(uid => storage.getUser(uid as string))
      );
      const userMap = new Map(
        users.filter(Boolean).map(u => [u!.id, u])
      );

      // Parse resource type from request_id (format: "project_123_timestamp")
      const parseResourceType = (requestId: string): { type: string; resourceId: string } => {
        const parts = requestId.split('_');
        if (parts.length >= 2) {
          return { type: parts[0], resourceId: parts[1] };
        }
        return { type: 'unknown', resourceId: requestId };
      };

      const entries = result.map(e => {
        const user = e.actorUserId ? userMap.get(e.actorUserId) : null;
        const { type, resourceId } = parseResourceType(e.requestId);
        return {
          id: e.id,
          creditsUsed: e.units / 100, // Convert from hundredths
          resourceType: type,
          resourceId,
          occurredAt: e.occurredAt,
          createdAt: e.createdAt,
          userId: e.actorUserId,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'System',
          userEmail: user?.email || null,
        };
      });

      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json({ entries, total: Number(total) });
    } catch (error) {
      console.error("Error fetching credit ledger:", error);
      res.status(500).json({ message: "Failed to fetch credit ledger" });
    }
  });

  // Enterprise plan inquiry - sends email to both user and sales
  app.post('/api/billing/enterprise-inquiry', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { planName, organizationName } = req.body;
      
      if (!planName) {
        return res.status(400).json({ message: "Plan name is required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
      
      const { sendEnterpriseInquiryEmail } = await import("./services/email");
      const result = await sendEnterpriseInquiryEmail(
        user.email,
        userName,
        planName,
        organizationName
      );
      
      res.json({ 
        success: result.userSent || result.salesSent,
        userEmailSent: result.userSent,
        salesEmailSent: result.salesSent
      });
    } catch (error) {
      console.error("Error sending enterprise inquiry:", error);
      res.status(500).json({ message: "Failed to send inquiry" });
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

  // Reorder plans (super admin only) - MUST be before :id route
  app.put('/api/admin/plans/reorder', async (req, res) => {
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
      const { orderedIds } = req.body;
      
      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ message: "orderedIds must be an array" });
      }

      for (let i = 0; i < orderedIds.length; i++) {
        await db.update(plans)
          .set({ displayOrder: i })
          .where(eq(plans.id, orderedIds[i]));
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering plans:", error);
      res.status(500).json({ message: "Failed to reorder plans" });
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
      const { name, description, monthlyPriceCents, maxSeats, extraSeatPriceCents, isActive } = req.body;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (monthlyPriceCents !== undefined) updates.monthlyPriceCents = monthlyPriceCents;
      if (maxSeats !== undefined) updates.maxSeats = maxSeats;
      if (extraSeatPriceCents !== undefined) updates.extraSeatPriceCents = extraSeatPriceCents;
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

  // Initialize extra seat prices for plans (super admin only)
  app.post('/api/admin/plans/init-extra-seat-prices', async (req, res) => {
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
      
      // Update Professional plan (code: BASIC) with $5/seat extra
      await db.update(plans)
        .set({ extraSeatPriceCents: 500 })
        .where(eq(plans.code, 'BASIC'));
      
      // Update Business plan (code: BUSINESS) with $8/seat extra
      await db.update(plans)
        .set({ extraSeatPriceCents: 800 })
        .where(eq(plans.code, 'BUSINESS'));
      
      // Get updated plans
      const updatedPlans = await db.select().from(plans).orderBy(plans.displayOrder);
      
      res.json({ 
        message: "Extra seat prices initialized successfully",
        plans: updatedPlans.map(p => ({ 
          code: p.code, 
          name: p.name, 
          extraSeatPriceCents: p.extraSeatPriceCents 
        }))
      });
    } catch (error) {
      console.error("Error initializing extra seat prices:", error);
      res.status(500).json({ message: "Failed to initialize extra seat prices" });
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

  // === CREDIT COST MANAGEMENT (Super Admin) ===
  
  // Get all credit costs
  app.get('/api/admin/credit-costs', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { getAllCreditCosts } = await import("./services/billing");
      const costs = await getAllCreditCosts();
      
      // Return raw values for editing (in hundredths)
      res.json(costs);
    } catch (error) {
      console.error("Error fetching credit costs:", error);
      res.status(500).json({ message: "Failed to fetch credit costs" });
    }
  });

  // Update a credit cost
  app.put('/api/admin/credit-costs/:resourceType', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { resourceType } = req.params;
      const { creditCost, displayName, description } = req.body;
      const { resourceCreditCosts } = await import("@shared/schema");
      
      if (creditCost === undefined || creditCost < 0) {
        return res.status(400).json({ message: "Invalid credit cost" });
      }

      const [updated] = await db.update(resourceCreditCosts)
        .set({ 
          creditCost: Math.round(creditCost),
          displayName: displayName || undefined,
          description: description || undefined,
          updatedAt: new Date(),
          updatedBy: userId
        })
        .where(eq(resourceCreditCosts.resourceType, resourceType))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Resource type not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating credit cost:", error);
      res.status(500).json({ message: "Failed to update credit cost" });
    }
  });

  // Get plan credits summary (for plan management UI)
  app.get('/api/admin/plans/:id/credits', async (req, res) => {
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

      // Get credits meter
      const [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);
      
      if (!creditsMeter) {
        return res.json({ included: 0, hardCap: null });
      }

      const rules = await db.select()
        .from(planMeterRules)
        .where(and(
          eq(planMeterRules.planId, planId),
          eq(planMeterRules.meterId, creditsMeter.id)
        ));

      const quotaRule = rules.find((r) => r.ruleType === "INCLUDED_QUOTA");
      const hardCapRule = rules.find((r) => r.ruleType === "HARD_CAP");

      res.json({
        meterId: creditsMeter.id,
        included: quotaRule?.includedUnitsMonthly || 0,
        hardCap: hardCapRule?.hardCapUnits || null,
        quotaRuleId: quotaRule?.id,
        hardCapRuleId: hardCapRule?.id
      });
    } catch (error) {
      console.error("Error fetching plan credits:", error);
      res.status(500).json({ message: "Failed to fetch plan credits" });
    }
  });

  // === PAYPAL ROUTES ===
  // Only register PayPal routes if credentials are configured
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    try {
      const { createPaypalOrder, capturePaypalOrder, loadPaypalDefault } = await import("./paypal");

      app.get("/paypal/setup", async (req, res) => {
        await loadPaypalDefault(req, res);
      });

      app.post("/paypal/order", async (req, res) => {
        await createPaypalOrder(req, res);
      });

      app.post("/paypal/order/:orderID/capture", async (req, res) => {
        await capturePaypalOrder(req, res);
      });
      
      console.log("[routes] PayPal routes registered successfully");
      
      // PayPal Subscription routes
      const { 
        createProduct, 
        createPlan, 
        createSubscription, 
        getSubscription, 
        cancelSubscription, 
        activateSubscription,
        listPlans: listPayPalPlans,
        getPayPalClientId 
      } = await import("./paypalSubscriptions");

      app.get("/api/paypal/subscription/client-id", getPayPalClientId);
      app.post("/api/paypal/subscription/product", createProduct);
      app.post("/api/paypal/subscription/plan", createPlan);
      app.get("/api/paypal/subscription/plans", listPayPalPlans);
      app.post("/api/paypal/subscription/create", createSubscription);
      app.get("/api/paypal/subscription/:subscriptionId", getSubscription);
      app.post("/api/paypal/subscription/:subscriptionId/cancel", cancelSubscription);
      app.post("/api/paypal/subscription/:subscriptionId/activate", activateSubscription);
      
      // Get payment method from user's active PayPal subscription
      app.get("/api/billing/payment-method", async (req, res) => {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        
        try {
          const { billingProvider } = await import("./services/billing");
          const subscription = await billingProvider.getSubscriptionForUser(userId);
          
          if (!subscription?.paypalSubscriptionId) {
            return res.json({ hasPaymentMethod: false });
          }
          
          // Fetch PayPal subscription details
          const PAYPAL_API_BASE = process.env.NODE_ENV === "production"
            ? "https://api-m.paypal.com"
            : "https://api-m.sandbox.paypal.com";
          
          const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
          const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
          });
          
          if (!tokenRes.ok) {
            return res.json({ hasPaymentMethod: true, type: "paypal" });
          }
          
          const { access_token } = await tokenRes.json();
          
          const subRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscription.paypalSubscriptionId}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
          });
          
          if (!subRes.ok) {
            return res.json({ hasPaymentMethod: true, type: "paypal" });
          }
          
          const subData = await subRes.json();
          
          // Extract subscriber info
          const subscriber = subData.subscriber || {};
          const payerEmail = subscriber.email_address || null;
          const payerId = subscriber.payer_id || null;
          const payerName = subscriber.name ? `${subscriber.name.given_name || ""} ${subscriber.name.surname || ""}`.trim() : null;
          
          res.json({
            hasPaymentMethod: true,
            type: "paypal",
            email: payerEmail,
            payerId: payerId,
            name: payerName,
            status: subData.status,
          });
        } catch (error) {
          console.error("Error fetching payment method:", error);
          res.status(500).json({ message: "Failed to fetch payment method" });
        }
      });

      // Admin: Sync all billing plans to PayPal
      app.post("/api/admin/paypal/sync-plans", async (req, res) => {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const user = await storage.getUser(userId);
        if (user?.role !== "super_admin") {
          return res.status(403).json({ message: "Super admin access required" });
        }

        try {
          const { plans } = await import("@shared/schema");
          const allPlans = await db.select().from(plans);
          
          const PAYPAL_API_BASE = process.env.NODE_ENV === "production"
            ? "https://api-m.paypal.com"
            : "https://api-m.sandbox.paypal.com";

          const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
          const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
          });
          
          if (!tokenRes.ok) {
            const errorData = await tokenRes.json();
            console.error("PayPal auth failed:", errorData);
            return res.status(500).json({ message: "PayPal authentication failed", error: errorData });
          }
          const { access_token } = await tokenRes.json();

          // Create product if not exists
          let productId = allPlans.find(p => p.paypalProductId)?.paypalProductId;
          if (!productId) {
            const productRes = await fetch(`${PAYPAL_API_BASE}/v1/catalogs/products`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${access_token}`,
                "Content-Type": "application/json",
                "PayPal-Request-Id": `product-fridayreport-${Date.now()}`,
              },
              body: JSON.stringify({
                name: "FridayReport.AI Subscription",
                description: "Project Portfolio Management subscription",
                type: "SERVICE",
                category: "SOFTWARE",
              }),
            });
            
            if (!productRes.ok) {
              const errorData = await productRes.json();
              console.error("PayPal product creation failed:", errorData);
              return res.status(500).json({ message: "Failed to create PayPal product", error: errorData });
            }
            const product = await productRes.json();
            productId = product.id;
          }

          const results = [];
          for (const plan of allPlans) {
            if (plan.monthlyPriceCents && plan.monthlyPriceCents > 0 && !plan.paypalPlanId) {
              const priceValue = (plan.monthlyPriceCents / 100).toFixed(2);
              
              const planRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${access_token}`,
                  "Content-Type": "application/json",
                  "PayPal-Request-Id": `plan-${plan.code}-${Date.now()}`,
                },
                body: JSON.stringify({
                  product_id: productId,
                  name: `${plan.name} Plan`,
                  description: plan.description || `${plan.name} monthly subscription`,
                  status: "ACTIVE",
                  billing_cycles: [{
                    frequency: { interval_unit: "MONTH", interval_count: 1 },
                    tenure_type: "REGULAR",
                    sequence: 1,
                    total_cycles: 0,
                    pricing_scheme: {
                      fixed_price: { value: priceValue, currency_code: "USD" },
                    },
                  }],
                  payment_preferences: {
                    auto_bill_outstanding: true,
                    setup_fee: { value: "0", currency_code: "USD" },
                    setup_fee_failure_action: "CONTINUE",
                    payment_failure_threshold: 3,
                  },
                }),
              });
              
              if (!planRes.ok) {
                const errorData = await planRes.json();
                console.error(`PayPal plan creation failed for ${plan.code}:`, errorData);
                results.push({ planCode: plan.code, error: errorData.message || "Failed to create plan" });
                continue;
              }
              
              const paypalPlan = await planRes.json();
              
              // Update plan in database
              await db.update(plans)
                .set({ paypalPlanId: paypalPlan.id, paypalProductId: productId })
                .where(eq(plans.id, plan.id));
              
              results.push({ planCode: plan.code, paypalPlanId: paypalPlan.id });
            } else if (plan.paypalPlanId) {
              results.push({ planCode: plan.code, paypalPlanId: plan.paypalPlanId, status: "already_synced" });
            }
          }

          res.json({ success: true, productId, plans: results });
        } catch (error) {
          console.error("Failed to sync PayPal plans:", error);
          res.status(500).json({ message: "Failed to sync PayPal plans" });
        }
      });

      // Update subscription with PayPal subscription ID
      app.post("/api/billing/subscription/paypal", async (req, res) => {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        try {
          const { planCode, paypalSubscriptionId } = req.body;
          const { plans, subscriptions, billingCycles, usageRollups, meters, planMeterRules } = await import("@shared/schema");
          
          const [plan] = await db.select().from(plans).where(eq(plans.code, planCode));
          if (!plan) {
            return res.status(404).json({ message: "Plan not found" });
          }

          // Check if user has existing subscription
          const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
          
          const now = new Date();
          const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

          const { billingTransactions } = await import("@shared/schema");

          if (existingSub) {
            // Update existing subscription
            await db.update(subscriptions)
              .set({ 
                planId: plan.id, 
                paypalSubscriptionId,
                status: "ACTIVE",
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
              })
              .where(eq(subscriptions.id, existingSub.id));
            
            // Record the initial subscription transaction
            if (plan.monthlyPriceCents && plan.monthlyPriceCents > 0) {
              await db.insert(billingTransactions).values({
                subscriptionId: existingSub.id,
                userId,
                provider: "paypal",
                externalTransactionId: paypalSubscriptionId,
                amountCents: plan.monthlyPriceCents,
                currency: "USD",
                status: "COMPLETED",
                description: `${plan.name} subscription activated`,
                planName: plan.name,
                periodStart,
                periodEnd,
                paymentMethodType: "paypal",
                createdAt: now,
              });
            }
            
            res.json({ success: true, subscriptionId: existingSub.id });
          } else {
            // Create new subscription
            const [newSub] = await db.insert(subscriptions).values({
              planId: plan.id,
              userId,
              subjectType: "USER",
              status: "ACTIVE",
              paypalSubscriptionId,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            }).returning();

            // Create billing cycle and usage rollups
            const [cycle] = await db.insert(billingCycles).values({
              subscriptionId: newSub.id,
              periodStart,
              periodEnd,
              status: "OPEN",
            }).returning();

            const allMeters = await db.select().from(meters);
            const allRules = await db.select().from(planMeterRules).where(eq(planMeterRules.planId, plan.id));

            for (const meter of allMeters) {
              const rules = allRules.filter(r => r.meterId === meter.id);
              const includedQuota = rules.find(r => r.ruleType === "INCLUDED_QUOTA");
              
              await db.insert(usageRollups).values({
                billingCycleId: cycle.id,
                meterId: meter.id,
                includedUnits: includedQuota?.includedUnitsMonthly || 0,
                usedUnits: 0,
                remainingUnits: includedQuota?.includedUnitsMonthly || 0,
                overageUnits: 0,
                overageCostMicrocents: 0,
                hardCapHit: false,
              });
            }

            // Record the initial subscription transaction
            if (plan.monthlyPriceCents && plan.monthlyPriceCents > 0) {
              await db.insert(billingTransactions).values({
                subscriptionId: newSub.id,
                userId,
                provider: "paypal",
                externalTransactionId: paypalSubscriptionId,
                amountCents: plan.monthlyPriceCents,
                currency: "USD",
                status: "COMPLETED",
                description: `${plan.name} subscription activated`,
                planName: plan.name,
                periodStart,
                periodEnd,
                paymentMethodType: "paypal",
                createdAt: now,
              });
            }

            res.json({ success: true, subscriptionId: newSub.id });
          }
        } catch (error) {
          console.error("Failed to update subscription:", error);
          res.status(500).json({ message: "Failed to update subscription" });
        }
      });

      // PayPal Webhook handler for recording payment transactions
      app.post("/api/webhooks/paypal", async (req, res) => {
        try {
          const { event_type, resource, create_time } = req.body;
          console.log("[PayPal Webhook] Received event:", event_type);

          // Handle subscription payment events
          if (event_type === "PAYMENT.SALE.COMPLETED" || event_type === "BILLING.SUBSCRIPTION.PAYMENT.COMPLETED") {
            const paypalSubscriptionId = resource?.billing_agreement_id || resource?.id;
            const transactionId = resource?.id;
            const amount = resource?.amount?.total || resource?.gross_amount?.value;
            const currency = resource?.amount?.currency || resource?.gross_amount?.currency_code || "USD";
            
            if (paypalSubscriptionId && transactionId && amount) {
              const { subscriptions, plans, billingTransactions } = await import("@shared/schema");
              
              // Find the subscription by PayPal subscription ID
              const [subscription] = await db.select({
                sub: subscriptions,
                plan: plans,
              }).from(subscriptions)
                .leftJoin(plans, eq(subscriptions.planId, plans.id))
                .where(eq(subscriptions.paypalSubscriptionId, paypalSubscriptionId));
              
              if (subscription) {
                const amountCents = Math.round(parseFloat(amount) * 100);
                
                // Check if we already recorded this transaction (idempotency)
                const [existingTx] = await db.select().from(billingTransactions)
                  .where(eq(billingTransactions.externalTransactionId, transactionId));
                
                if (!existingTx) {
                  // Record the payment transaction
                  await db.insert(billingTransactions).values({
                    subscriptionId: subscription.sub.id,
                    userId: subscription.sub.userId,
                    orgId: subscription.sub.orgId,
                    provider: "paypal",
                    externalTransactionId: transactionId,
                    amountCents,
                    currency: currency.toUpperCase(),
                    status: "COMPLETED",
                    description: `${subscription.plan?.name || 'Subscription'} payment`,
                    planName: subscription.plan?.name,
                    periodStart: subscription.sub.currentPeriodStart,
                    periodEnd: subscription.sub.currentPeriodEnd,
                    paymentMethodType: "paypal",
                    metadata: { event_type, resource_id: resource?.id },
                    createdAt: new Date(create_time || Date.now()),
                  });
                  console.log(`[PayPal Webhook] Recorded payment of $${(amountCents / 100).toFixed(2)} for subscription ${subscription.sub.id}`);
                }
              }
            }
          }
          
          // Handle failed payment events
          if (event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED" || event_type === "PAYMENT.SALE.DENIED") {
            const paypalSubscriptionId = resource?.billing_agreement_id || resource?.id;
            const transactionId = resource?.id;
            const amount = resource?.amount?.total || resource?.gross_amount?.value;
            const currency = resource?.amount?.currency || resource?.gross_amount?.currency_code || "USD";
            const failureReason = resource?.status_details?.reason || "Payment failed";
            
            if (paypalSubscriptionId && transactionId) {
              const { subscriptions, plans, billingTransactions } = await import("@shared/schema");
              
              const [subscription] = await db.select({
                sub: subscriptions,
                plan: plans,
              }).from(subscriptions)
                .leftJoin(plans, eq(subscriptions.planId, plans.id))
                .where(eq(subscriptions.paypalSubscriptionId, paypalSubscriptionId));
              
              if (subscription) {
                const amountCents = amount ? Math.round(parseFloat(amount) * 100) : 0;
                
                await db.insert(billingTransactions).values({
                  subscriptionId: subscription.sub.id,
                  userId: subscription.sub.userId,
                  orgId: subscription.sub.orgId,
                  provider: "paypal",
                  externalTransactionId: transactionId,
                  amountCents,
                  currency: currency?.toUpperCase() || "USD",
                  status: "FAILED",
                  description: `Failed payment for ${subscription.plan?.name || 'Subscription'}`,
                  planName: subscription.plan?.name,
                  failureReason,
                  paymentMethodType: "paypal",
                  metadata: { event_type, resource_id: resource?.id },
                  createdAt: new Date(create_time || Date.now()),
                });
                console.log(`[PayPal Webhook] Recorded failed payment for subscription ${subscription.sub.id}`);
              }
            }
          }

          // Always respond 200 to acknowledge receipt
          res.status(200).json({ received: true });
        } catch (error) {
          console.error("[PayPal Webhook] Error processing webhook:", error);
          // Still return 200 to avoid PayPal retries on non-critical errors
          res.status(200).json({ received: true, error: "Processing error logged" });
        }
      });

      console.log("[routes] PayPal Subscription routes registered successfully");
    } catch (error) {
      console.warn("[routes] PayPal routes not registered - credentials may be invalid:", error);
    }
  } else {
    console.log("[routes] PayPal routes not registered - credentials not configured");
  }

  // === REFERRAL PROGRAM ROUTES ===
  
  // Get or create user's referral code
  app.get('/api/referral/my-code', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { referralCodes } = await import("@shared/schema");
      
      // Check if user already has a referral code
      let [existingCode] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
      
      if (!existingCode) {
        // Generate a unique referral code
        const user = await storage.getUser(userId);
        const baseCode = (user?.firstName || user?.email?.split('@')[0] || 'REF').toUpperCase().substring(0, 6);
        const uniqueSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
        const code = `${baseCode}${uniqueSuffix}`;
        
        [existingCode] = await db.insert(referralCodes).values({
          userId,
          code,
          commissionPercent: 10,
          isActive: true,
          totalReferrals: 0,
          totalEarningsCents: 0,
        }).returning();
      }
      
      res.json(existingCode);
    } catch (error) {
      console.error('Error getting referral code:', error);
      res.status(500).json({ message: 'Failed to get referral code' });
    }
  });

  // Get referral statistics for a user
  app.get('/api/referral/stats', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { referralCodes, referrals, referralPayouts } = await import("@shared/schema");
      
      // Get user's referral code - auto-create if none exists
      let [userCode] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
      
      if (!userCode) {
        // Auto-generate a unique referral code
        const user = await storage.getUser(userId);
        const baseCode = (user?.firstName || user?.email?.split('@')[0] || 'REF').toUpperCase().substring(0, 6);
        const uniqueSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
        const code = `${baseCode}${uniqueSuffix}`;
        
        [userCode] = await db.insert(referralCodes).values({
          userId,
          code,
          commissionPercent: 10,
          isActive: true,
          totalReferrals: 0,
          totalEarningsCents: 0,
        }).returning();
      }
      
      // Get referrals for this code
      const userReferrals = await db.select().from(referrals)
        .where(eq(referrals.referralCodeId, userCode.id))
        .orderBy(referrals.createdAt);
      
      // Get payouts
      const userPayouts = await db.select().from(referralPayouts)
        .where(eq(referralPayouts.userId, userId))
        .orderBy(referralPayouts.createdAt);
      
      // Calculate stats
      const signedUp = userReferrals.filter(r => r.status === 'SIGNED_UP' || r.status === 'CONVERTED' || r.status === 'PAID_OUT').length;
      const converted = userReferrals.filter(r => r.status === 'CONVERTED' || r.status === 'PAID_OUT').length;
      const pendingEarningsCents = userReferrals
        .filter(r => r.status === 'CONVERTED')
        .reduce((sum, r) => sum + (r.commissionAmountCents || 0), 0);
      const paidOutCents = userPayouts
        .filter(p => p.status === 'COMPLETED')
        .reduce((sum, p) => sum + p.amountCents, 0);
      
      res.json({
        code: userCode,
        totalReferrals: userReferrals.length,
        signedUp,
        converted,
        pendingEarningsCents,
        paidOutCents,
        referrals: userReferrals,
        payouts: userPayouts,
      });
    } catch (error) {
      console.error('Error getting referral stats:', error);
      res.status(500).json({ message: 'Failed to get referral stats' });
    }
  });

  // Validate a referral code (public endpoint for signup)
  app.get('/api/referral/validate/:code', async (req, res) => {
    try {
      const { referralCodes } = await import("@shared/schema");
      const code = req.params.code.toUpperCase();
      
      const [refCode] = await db.select().from(referralCodes)
        .where(and(eq(referralCodes.code, code), eq(referralCodes.isActive, true)));
      
      if (!refCode) {
        return res.json({ valid: false });
      }
      
      // Get referrer info
      const referrer = await storage.getUser(refCode.userId);
      
      res.json({
        valid: true,
        referrerName: referrer ? `${referrer.firstName || ''} ${referrer.lastName || ''}`.trim() : 'A friend',
      });
    } catch (error) {
      console.error('Error validating referral code:', error);
      res.status(500).json({ message: 'Failed to validate referral code' });
    }
  });

  // Track a referral (called when a new user signs up with a referral code)
  app.post('/api/referral/track', async (req, res) => {
    try {
      const { referralCodes, referrals } = await import("@shared/schema");
      const { code, email, userId } = req.body;
      
      if (!code || (!email && !userId)) {
        return res.status(400).json({ message: 'Code and email or userId required' });
      }
      
      const [refCode] = await db.select().from(referralCodes)
        .where(and(eq(referralCodes.code, code.toUpperCase()), eq(referralCodes.isActive, true)));
      
      if (!refCode) {
        return res.status(404).json({ message: 'Invalid referral code' });
      }
      
      // Create referral record
      const [newReferral] = await db.insert(referrals).values({
        referralCodeId: refCode.id,
        referrerId: refCode.userId,
        referredUserId: userId || null,
        referredEmail: email || null,
        status: userId ? 'SIGNED_UP' : 'PENDING',
        signedUpAt: userId ? new Date() : null,
      }).returning();
      
      // Update total referrals count
      await db.update(referralCodes)
        .set({ totalReferrals: (refCode.totalReferrals || 0) + 1 })
        .where(eq(referralCodes.id, refCode.id));
      
      res.json({ success: true, referral: newReferral });
    } catch (error) {
      console.error('Error tracking referral:', error);
      res.status(500).json({ message: 'Failed to track referral' });
    }
  });

  // Request a payout (user requesting their earnings)
  app.post('/api/referral/request-payout', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { referralCodes, referrals, referralPayouts } = await import("@shared/schema");
      const { paypalEmail } = req.body;
      
      if (!paypalEmail) {
        return res.status(400).json({ message: 'PayPal email required' });
      }
      
      // Get user's referral code
      const [userCode] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
      
      if (!userCode) {
        return res.status(400).json({ message: 'No referral code found' });
      }
      
      // Calculate pending earnings
      const convertedReferrals = await db.select().from(referrals)
        .where(and(eq(referrals.referralCodeId, userCode.id), eq(referrals.status, 'CONVERTED')));
      
      const pendingAmount = convertedReferrals.reduce((sum, r) => sum + (r.commissionAmountCents || 0), 0);
      
      if (pendingAmount < 1000) { // Minimum $10 payout
        return res.status(400).json({ message: 'Minimum payout is $10' });
      }
      
      // Create payout request
      const [payout] = await db.insert(referralPayouts).values({
        userId,
        amountCents: pendingAmount,
        status: 'PENDING',
        paypalEmail,
      }).returning();
      
      // Mark referrals as paid out
      for (const ref of convertedReferrals) {
        await db.update(referrals)
          .set({ status: 'PAID_OUT' })
          .where(eq(referrals.id, ref.id));
      }
      
      res.json({ success: true, payout });
    } catch (error) {
      console.error('Error requesting payout:', error);
      res.status(500).json({ message: 'Failed to request payout' });
    }
  });

  // ==================== TIMESHEETS ====================

  // Get timesheet entries for current user
  app.get('/api/timesheets', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      // Single optimized query with JOINs - replaces N+1 queries
      const entriesWithDetails = await storage.getTimesheetEntriesWithDetails(userId, organizationId, startDate, endDate);
      
      // Transform to expected format
      const enrichedEntries = entriesWithDetails.map(({ entry, task, project }) => ({
        ...entry,
        task,
        project
      }));

      res.json(enrichedEntries);
    } catch (error) {
      console.error('Error getting timesheet entries:', error);
      res.status(500).json({ message: 'Failed to get timesheet entries' });
    }
  });

  // Get timesheet entries for approval (managers/approvers)
  app.get('/api/timesheets/approval', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const status = req.query.status as string;

      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      // Check if user is an approver
      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!userResource?.isApprover) {
        return res.status(403).json({ message: 'You are not authorized to approve timesheets' });
      }

      const entries = await storage.getTimesheetEntriesForApproval(organizationId, status);
      
      // Enrich with task, project and user info
      const enrichedEntries = await Promise.all(entries.map(async (entry) => {
        const task = await storage.getTask(entry.taskId);
        const project = task ? await storage.getProject(task.projectId) : null;
        const resource = await storage.getResource(entry.resourceId);
        return { ...entry, task, project, resource };
      }));

      res.json(enrichedEntries);
    } catch (error) {
      console.error('Error getting timesheet entries for approval:', error);
      res.status(500).json({ message: 'Failed to get timesheet entries for approval' });
    }
  });

  // Get tasks assigned to current user
  app.get('/api/timesheets/assigned-tasks', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      // Find the resource for this user
      const resources = await storage.getResources(organizationId);
      let userResource = resources.find(r => r.userId === userId);

      // If no resource linked by userId, try to auto-link by email
      if (!userResource) {
        const user = await storage.getUser(userId);
        if (user?.email) {
          // Find resource by matching email (even if linked to different user)
          const resourceByEmail = resources.find(r => 
            r.email?.toLowerCase() === user.email?.toLowerCase()
          );
          if (resourceByEmail) {
            // Auto-link or re-link resource to current user
            await storage.updateResource(resourceByEmail.id, { userId });
            userResource = { ...resourceByEmail, userId };
            console.log(`Auto-linked resource ${resourceByEmail.id} to user ${userId} by email ${user.email}`);
          }
        }
      }

      if (!userResource) {
        return res.json([]);
      }

      // Single optimized query with JOINs - replaces N+1 queries
      // Returns { task, project }[] so project is already included
      const assignedTasks = await storage.getAssignedTasksForResource(userResource.id, organizationId);

      // Filter out tasks where the task or project is blocked for timesheets
      const filteredTasks = assignedTasks.filter(item => {
        // Check if task itself is blocked
        if (item.task.timesheetBlocked) return false;
        // Check if the project is blocked
        if (item.project.timesheetBlocked) return false;
        return true;
      });

      res.json(filteredTasks);
    } catch (error) {
      console.error('Error getting assigned tasks:', error);
      res.status(500).json({ message: 'Failed to get assigned tasks' });
    }
  });

  // Get current user's resource record
  app.get('/api/timesheets/current-resource', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      const resources = await storage.getResources(organizationId);
      let userResource = resources.find(r => r.userId === userId);

      // If no resource linked by userId, try to auto-link by email
      if (!userResource) {
        const user = await storage.getUser(userId);
        if (user?.email) {
          // Find resource by matching email (even if linked to different user)
          const resourceByEmail = resources.find(r => 
            r.email?.toLowerCase() === user.email?.toLowerCase()
          );
          if (resourceByEmail) {
            // Auto-link or re-link resource to current user
            await storage.updateResource(resourceByEmail.id, { userId });
            userResource = { ...resourceByEmail, userId };
            console.log(`Auto-linked resource ${resourceByEmail.id} to user ${userId} by email ${user.email}`);
          }
        }
      }

      if (!userResource) {
        return res.status(404).json({ message: 'Resource not found' });
      }

      res.json(userResource);
    } catch (error) {
      console.error('Error getting current resource:', error);
      res.status(500).json({ message: 'Failed to get current resource' });
    }
  });

  // Create timesheet entry
  app.post('/api/timesheets', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { organizationId, taskId, projectId, entryDate, hours, notes, resourceId } = req.body;

      if (!organizationId || !taskId || !projectId || !entryDate || hours === undefined) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Validate hours value
      const hoursNum = parseFloat(hours);
      if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
        return res.status(400).json({ message: 'Hours must be between 0 and 24' });
      }

      // Verify user is assigned to this task
      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!userResource) {
        return res.status(403).json({ message: 'You are not a resource in this organization' });
      }

      const assignments = await storage.getTaskResourceAssignments(taskId);
      const isAssigned = assignments.some(a => a.resourceId === userResource.id);
      
      if (!isAssigned) {
        return res.status(403).json({ message: 'You are not assigned to this task' });
      }

      // Check if task or project is blocked for timesheet entries
      const task = await storage.getTask(taskId);
      if (task?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this task' });
      }
      
      const project = await storage.getProject(projectId);
      if (project?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this project' });
      }

      const entry = await storage.createTimesheetEntry({
        organizationId,
        userId,
        resourceId: userResource.id,
        taskId,
        projectId,
        entryDate,
        hours: String(hours),
        notes,
        status: 'Draft',
      });

      res.json(entry);
    } catch (error) {
      console.error('Error creating timesheet entry:', error);
      res.status(500).json({ message: 'Failed to create timesheet entry' });
    }
  });

  // Bulk upsert timesheet entries
  app.post('/api/timesheets/bulk', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { entries } = req.body;
      if (!entries || !Array.isArray(entries)) {
        return res.status(400).json({ message: 'entries array is required' });
      }

      // Get user's resource to validate assignments
      const organizationId = entries[0]?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!userResource) {
        return res.status(403).json({ message: 'You are not a resource in this organization' });
      }

      // Cache task assignments for validation
      const taskAssignmentCache: Record<number, boolean> = {};
      const validateTaskAssignment = async (taskId: number): Promise<boolean> => {
        if (taskAssignmentCache[taskId] !== undefined) {
          return taskAssignmentCache[taskId];
        }
        const assignments = await storage.getTaskResourceAssignments(taskId);
        taskAssignmentCache[taskId] = assignments.some(a => a.resourceId === userResource.id);
        return taskAssignmentCache[taskId];
      };

      // Cache for checking if tasks/projects are blocked
      const taskBlockedCache: Record<number, boolean> = {};
      const projectBlockedCache: Record<number, boolean> = {};
      
      const isTaskOrProjectBlocked = async (taskId: number, projectId: number): Promise<boolean> => {
        // Check task cache first
        if (taskBlockedCache[taskId] === undefined) {
          const task = await storage.getTask(taskId);
          taskBlockedCache[taskId] = task?.timesheetBlocked || false;
        }
        if (taskBlockedCache[taskId]) return true;
        
        // Check project cache
        if (projectBlockedCache[projectId] === undefined) {
          const project = await storage.getProject(projectId);
          projectBlockedCache[projectId] = project?.timesheetBlocked || false;
        }
        return projectBlockedCache[projectId];
      };

      const results = [];
      for (const entry of entries) {
        // Validate hours for all entries
        const hoursNum = parseFloat(entry.hours);
        if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
          continue; // Skip entries with invalid hours
        }

        if (entry.id) {
          // Update existing - verify ownership and draft status
          const existing = await storage.getTimesheetEntry(entry.id);
          if (!existing) continue;
          
          if (existing.userId !== userId) {
            continue; // Skip entries not owned by user
          }
          
          if (existing.status !== 'Draft' && existing.status !== 'Rejected') {
            continue; // Skip non-editable entries
          }
          
          // Check if task or project is blocked for updates too
          const isBlocked = await isTaskOrProjectBlocked(existing.taskId, existing.projectId);
          if (isBlocked) {
            continue; // Skip blocked tasks/projects
          }
          
          const updated = await storage.updateTimesheetEntry(entry.id, {
            hours: String(hoursNum),
            notes: entry.notes,
          });
          results.push(updated);
        } else if (hoursNum > 0) {
          // Create new - verify task assignment
          const isAssigned = await validateTaskAssignment(entry.taskId);
          if (!isAssigned) {
            continue; // Skip tasks user isn't assigned to
          }
          
          // Check if task or project is blocked
          const isBlocked = await isTaskOrProjectBlocked(entry.taskId, entry.projectId);
          if (isBlocked) {
            continue; // Skip blocked tasks/projects
          }
          
          const created = await storage.createTimesheetEntry({
            organizationId: entry.organizationId,
            userId,
            resourceId: userResource.id,
            taskId: entry.taskId,
            projectId: entry.projectId,
            entryDate: entry.entryDate,
            hours: String(entry.hours),
            notes: entry.notes,
            status: 'Draft',
          });
          results.push(created);
        }
      }

      res.json(results);
    } catch (error) {
      console.error('Error bulk upserting timesheet entries:', error);
      res.status(500).json({ message: 'Failed to save timesheet entries' });
    }
  });

  // Update timesheet entry
  app.put('/api/timesheets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = Number(req.params.id);
      const entry = await storage.getTimesheetEntry(id);
      
      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      if (entry.userId !== userId) {
        return res.status(403).json({ message: 'You can only edit your own timesheet entries' });
      }

      if (entry.status !== 'Draft') {
        return res.status(400).json({ message: 'Only draft entries can be edited' });
      }

      // Check if task or project is blocked for timesheet entries
      const task = await storage.getTask(entry.taskId);
      if (task?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this task' });
      }
      
      const project = await storage.getProject(entry.projectId);
      if (project?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this project' });
      }

      const { hours, notes } = req.body;
      
      // Validate hours if provided
      if (hours !== undefined) {
        const hoursNum = parseFloat(hours);
        if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
          return res.status(400).json({ message: 'Hours must be between 0 and 24' });
        }
      }

      const updated = await storage.updateTimesheetEntry(id, {
        hours: hours !== undefined ? String(parseFloat(hours)) : undefined,
        notes,
      });

      res.json(updated);
    } catch (error) {
      console.error('Error updating timesheet entry:', error);
      res.status(500).json({ message: 'Failed to update timesheet entry' });
    }
  });

  // Delete timesheet entry
  app.delete('/api/timesheets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = Number(req.params.id);
      const entry = await storage.getTimesheetEntry(id);
      
      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      if (entry.userId !== userId) {
        return res.status(403).json({ message: 'You can only delete your own timesheet entries' });
      }

      if (entry.status !== 'Draft') {
        return res.status(400).json({ message: 'Only draft entries can be deleted' });
      }

      await storage.deleteTimesheetEntry(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting timesheet entry:', error);
      res.status(500).json({ message: 'Failed to delete timesheet entry' });
    }
  });

  // Submit timesheet week for approval
  app.post('/api/timesheets/submit-week', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { organizationId, startDate, endDate } = req.body;
      
      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      await storage.submitTimesheetWeek(userId, organizationId, startDate, endDate);
      res.json({ success: true });
    } catch (error) {
      console.error('Error submitting timesheet week:', error);
      res.status(500).json({ message: 'Failed to submit timesheet week' });
    }
  });

  // Approve timesheet entry
  app.post('/api/timesheets/:id/approve', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = Number(req.params.id);
      const entry = await storage.getTimesheetEntry(id);
      
      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      // Check if user is an approver
      const resources = await storage.getResources(entry.organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!userResource?.isApprover) {
        return res.status(403).json({ message: 'You are not authorized to approve timesheets' });
      }

      const updated = await storage.approveTimesheetEntry(id, userId);
      res.json(updated);
    } catch (error) {
      console.error('Error approving timesheet entry:', error);
      res.status(500).json({ message: 'Failed to approve timesheet entry' });
    }
  });

  // Reject timesheet entry
  app.post('/api/timesheets/:id/reject', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = Number(req.params.id);
      const { rejectionReason } = req.body;
      
      const entry = await storage.getTimesheetEntry(id);
      
      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      // Check if user is an approver
      const resources = await storage.getResources(entry.organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!userResource?.isApprover) {
        return res.status(403).json({ message: 'You are not authorized to reject timesheets' });
      }

      const updated = await storage.rejectTimesheetEntry(id, rejectionReason || '');
      res.json(updated);
    } catch (error) {
      console.error('Error rejecting timesheet entry:', error);
      res.status(500).json({ message: 'Failed to reject timesheet entry' });
    }
  });

  // Admin: Get all referral stats (Super Admin only)
  app.get('/api/admin/referrals', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const { referralCodes, referrals, referralPayouts } = await import("@shared/schema");
      
      const allCodes = await db.select().from(referralCodes);
      const allReferrals = await db.select().from(referrals);
      const allPayouts = await db.select().from(referralPayouts);
      
      res.json({
        codes: allCodes,
        referrals: allReferrals,
        payouts: allPayouts,
        summary: {
          totalCodes: allCodes.length,
          totalReferrals: allReferrals.length,
          totalConversions: allReferrals.filter(r => r.status === 'CONVERTED' || r.status === 'PAID_OUT').length,
          totalPayoutsPending: allPayouts.filter(p => p.status === 'PENDING').reduce((sum, p) => sum + p.amountCents, 0),
          totalPayoutsCompleted: allPayouts.filter(p => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amountCents, 0),
        },
      });
    } catch (error) {
      console.error('Error getting admin referral stats:', error);
      res.status(500).json({ message: 'Failed to get referral stats' });
    }
  });

  // Dashboard Export Routes
  app.post('/api/dashboard/:type/export', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { type } = req.params;
      const { format, organizationId } = req.body;
      
      if (!organizationId) {
        return res.status(400).json({ message: 'Organization ID is required' });
      }
      
      const { getDashboardDataForExport, generateDashboardPowerPoint, generateDashboardPdf, generateDashboardHTML } = await import('./services/dashboardExport');
      const data = await getDashboardDataForExport(type, organizationId);
      
      if (format === 'pptx') {
        const buffer = await generateDashboardPowerPoint(data);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-dashboard.pptx"`);
        res.send(buffer);
      } else if (format === 'pdf') {
        const buffer = await generateDashboardPdf(data);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-dashboard.pdf"`);
        res.send(buffer);
      } else if (format === 'html') {
        const html = generateDashboardHTML(data);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } else {
        res.status(400).json({ message: 'Invalid format. Use pptx, pdf or html' });
      }
    } catch (error) {
      console.error('Error exporting dashboard:', error);
      res.status(500).json({ message: 'Failed to export dashboard' });
    }
  });

  // Dashboard Share Route
  app.post('/api/dashboard/:type/share', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { type } = req.params;
      const { recipients, organizationId, formats, message } = req.body;
      
      if (!organizationId || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ message: 'Organization ID and recipients are required' });
      }
      
      const { getDashboardDataForExport, generateDashboardPowerPoint, generateDashboardHTML } = await import('./services/dashboardExport');
      const { sendEmail } = await import('./services/email');
      
      const data = await getDashboardDataForExport(type, organizationId);
      const htmlContent = generateDashboardHTML(data);
      
      const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
      
      if (formats?.includes('pptx')) {
        const pptxBuffer = await generateDashboardPowerPoint(data);
        attachments.push({
          filename: `${type}-dashboard.pptx`,
          content: pptxBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        });
      }
      
      const user = await storage.getUser(userId);
      const senderName = user?.firstName || user?.email || 'A colleague';
      
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
          <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <h1 style="color: white; margin: 0; font-size: 20px;">FridayReport.AI</h1>
          </div>
          <p><strong>${senderName}</strong> has shared a dashboard report with you.</p>
          ${message ? `<p style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-style: italic;">"${message}"</p>` : ''}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          ${htmlContent}
        </div>
      `;
      
      let successCount = 0;
      for (const email of recipients) {
        const success = await sendEmail({
          to: email,
          subject: `${data.title} - Shared Report`,
          text: `${senderName} has shared a ${data.title} report with you.`,
          html: emailHtml,
          attachments,
        });
        if (success) successCount++;
      }
      
      res.json({ 
        success: true, 
        sent: successCount, 
        total: recipients.length 
      });
    } catch (error) {
      console.error('Error sharing dashboard:', error);
      res.status(500).json({ message: 'Failed to share dashboard' });
    }
  });

  // === Custom Dashboards API ===

  // Get all custom dashboards for an organization
  app.get('/api/custom-dashboards', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { organizationId } = req.query;
      if (!organizationId) {
        return res.status(400).json({ message: 'Organization ID required' });
      }

      const dashboards = await db
        .select()
        .from(customDashboards)
        .where(eq(customDashboards.organizationId, Number(organizationId)))
        .orderBy(desc(customDashboards.createdAt));

      res.json(dashboards);
    } catch (error) {
      console.error('Error fetching custom dashboards:', error);
      res.status(500).json({ message: 'Failed to fetch custom dashboards' });
    }
  });

  // Get a specific custom dashboard
  app.get('/api/custom-dashboards/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const dashboardId = Number(req.params.id);
      const [dashboard] = await db
        .select()
        .from(customDashboards)
        .where(eq(customDashboards.id, dashboardId));

      if (!dashboard) {
        return res.status(404).json({ message: 'Dashboard not found' });
      }

      res.json(dashboard);
    } catch (error) {
      console.error('Error fetching custom dashboard:', error);
      res.status(500).json({ message: 'Failed to fetch custom dashboard' });
    }
  });

  // Create a new custom dashboard directly
  app.post('/api/custom-dashboards', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { organizationId, name, description, config } = req.body;
      if (!organizationId || !name || !config) {
        return res.status(400).json({ message: 'Organization ID, name, and config are required' });
      }

      const [newDashboard] = await db
        .insert(customDashboards)
        .values({
          organizationId: Number(organizationId),
          userId,
          name,
          description: description || '',
          config,
        })
        .returning();

      res.status(201).json(newDashboard);
    } catch (error) {
      console.error('Error creating custom dashboard:', error);
      res.status(500).json({ message: 'Failed to create custom dashboard' });
    }
  });

  // Generate a new custom dashboard using AI
  app.post('/api/custom-dashboards/generate', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { description, organizationId } = req.body;
      if (!description || !organizationId) {
        return res.status(400).json({ message: 'Description and organization ID required' });
      }

      const { generateDashboardConfig } = await import('./services/dashboardAI');
      const { name, config } = await generateDashboardConfig(description);

      // Save the generated dashboard
      const [newDashboard] = await db
        .insert(customDashboards)
        .values({
          organizationId: Number(organizationId),
          userId,
          name,
          description,
          config,
        })
        .returning();

      res.status(201).json(newDashboard);
    } catch (error) {
      console.error('Error generating custom dashboard:', error);
      res.status(500).json({ message: 'Failed to generate custom dashboard' });
    }
  });

  // Update a custom dashboard
  app.patch('/api/custom-dashboards/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const dashboardId = Number(req.params.id);
      const { name, config } = req.body;

      const [updated] = await db
        .update(customDashboards)
        .set({
          name,
          config,
          updatedAt: new Date(),
        })
        .where(eq(customDashboards.id, dashboardId))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: 'Dashboard not found' });
      }

      res.json(updated);
    } catch (error) {
      console.error('Error updating custom dashboard:', error);
      res.status(500).json({ message: 'Failed to update custom dashboard' });
    }
  });

  // Delete a custom dashboard
  app.delete('/api/custom-dashboards/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const dashboardId = Number(req.params.id);
      
      await db
        .delete(customDashboards)
        .where(eq(customDashboards.id, dashboardId));

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting custom dashboard:', error);
      res.status(500).json({ message: 'Failed to delete custom dashboard' });
    }
  });

  // ===== USER CONSENT ENDPOINTS =====

  // Get current terms/privacy versions and user's consent status
  app.get('/api/consents/status', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const termsConsent = await storage.getUserConsentByType(userId, 'terms_of_service');
      const privacyConsent = await storage.getUserConsentByType(userId, 'privacy_policy');

      res.json({
        currentTermsVersion: CURRENT_TERMS_VERSION,
        currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
        termsAccepted: termsConsent ? termsConsent.version === CURRENT_TERMS_VERSION : false,
        privacyAccepted: privacyConsent ? privacyConsent.version === CURRENT_PRIVACY_VERSION : false,
        termsConsentDate: termsConsent?.acceptedAt,
        privacyConsentDate: privacyConsent?.acceptedAt,
        needsConsent: !termsConsent || termsConsent.version !== CURRENT_TERMS_VERSION ||
                      !privacyConsent || privacyConsent.version !== CURRENT_PRIVACY_VERSION
      });
    } catch (error) {
      console.error('Error fetching consent status:', error);
      res.status(500).json({ message: 'Failed to fetch consent status' });
    }
  });

  // Get user's consent history
  app.get('/api/consents', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const consents = await storage.getUserConsents(userId);
      res.json(consents);
    } catch (error) {
      console.error('Error fetching consents:', error);
      res.status(500).json({ message: 'Failed to fetch consents' });
    }
  });

  // Record user consent
  app.post('/api/consents', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { consentType, version, method } = req.body;
      
      if (!consentType || !version) {
        return res.status(400).json({ message: 'consentType and version are required' });
      }

      const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      const consent = await storage.createUserConsent({
        userId,
        consentType,
        version,
        ipAddress,
        userAgent,
        method: method || 'checkbox'
      });

      res.status(201).json(consent);
    } catch (error) {
      console.error('Error recording consent:', error);
      res.status(500).json({ message: 'Failed to record consent' });
    }
  });

  // Accept both terms and privacy in one request
  app.post('/api/consents/accept-all', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { method } = req.body;
      const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      const termsConsent = await storage.createUserConsent({
        userId,
        consentType: 'terms_of_service',
        version: CURRENT_TERMS_VERSION,
        ipAddress,
        userAgent,
        method: method || 'modal'
      });

      const privacyConsent = await storage.createUserConsent({
        userId,
        consentType: 'privacy_policy',
        version: CURRENT_PRIVACY_VERSION,
        ipAddress,
        userAgent,
        method: method || 'modal'
      });

      res.status(201).json({
        termsConsent,
        privacyConsent,
        message: 'Consents recorded successfully'
      });
    } catch (error) {
      console.error('Error recording consents:', error);
      res.status(500).json({ message: 'Failed to record consents' });
    }
  });

  // Admin: Get all user consents (super_admin only)
  app.get('/api/admin/consents', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden: Super admin access required' });
      }

      const limit = Number(req.query.limit) || 100;
      const offset = Number(req.query.offset) || 0;

      const consents = await storage.getAllUserConsents(limit, offset);
      
      // Get user details for each consent
      const consentsWithUsers = await Promise.all(
        consents.map(async (consent) => {
          const consentUser = await storage.getUser(consent.userId);
          return {
            ...consent,
            userName: consentUser ? `${consentUser.firstName || ''} ${consentUser.lastName || ''}`.trim() || consentUser.email : 'Unknown',
            userEmail: consentUser?.email || 'Unknown'
          };
        })
      );

      res.json(consentsWithUsers);
    } catch (error) {
      console.error('Error fetching all consents:', error);
      res.status(500).json({ message: 'Failed to fetch consents' });
    }
  });

  // Admin: Get consent statistics (super_admin only)
  app.get('/api/admin/consents/stats', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden: Super admin access required' });
      }

      const stats = await storage.getUserConsentStats();
      res.json({
        stats,
        currentVersions: {
          terms_of_service: CURRENT_TERMS_VERSION,
          privacy_policy: CURRENT_PRIVACY_VERSION
        }
      });
    } catch (error) {
      console.error('Error fetching consent stats:', error);
      res.status(500).json({ message: 'Failed to fetch consent statistics' });
    }
  });

  // ============================================
  // CUSTOM FIELD DEFINITIONS ROUTES
  // ============================================

  // Get all custom field definitions for an organization
  app.get('/api/organizations/:organizationId/custom-fields', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const organizationId = parseInt(req.params.organizationId);
      const fields = await storage.getCustomFieldDefinitions(organizationId);
      res.json(fields);
    } catch (error) {
      console.error('Error fetching custom fields:', error);
      res.status(500).json({ message: 'Failed to fetch custom fields' });
    }
  });

  // Create a custom field definition
  app.post('/api/organizations/:organizationId/custom-fields', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const organizationId = parseInt(req.params.organizationId);
      const field = await storage.createCustomFieldDefinition({
        ...req.body,
        organizationId
      });
      res.status(201).json(field);
    } catch (error) {
      console.error('Error creating custom field:', error);
      res.status(500).json({ message: 'Failed to create custom field' });
    }
  });

  // Update a custom field definition
  app.put('/api/custom-fields/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = parseInt(req.params.id);
      const field = await storage.updateCustomFieldDefinition(id, req.body);
      res.json(field);
    } catch (error) {
      console.error('Error updating custom field:', error);
      res.status(500).json({ message: 'Failed to update custom field' });
    }
  });

  // Delete a custom field definition (soft delete)
  app.delete('/api/custom-fields/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = parseInt(req.params.id);
      await storage.deleteCustomFieldDefinition(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting custom field:', error);
      res.status(500).json({ message: 'Failed to delete custom field' });
    }
  });

  // ============================================
  // PROJECT CUSTOM FIELD VALUES ROUTES
  // ============================================

  // Get all custom field values for a project
  app.get('/api/projects/:projectId/custom-field-values', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const values = await storage.getProjectCustomFieldValues(projectId);
      res.json(values);
    } catch (error) {
      console.error('Error fetching custom field values:', error);
      res.status(500).json({ message: 'Failed to fetch custom field values' });
    }
  });

  // Update/create a custom field value for a project
  app.put('/api/projects/:projectId/custom-field-values/:fieldDefinitionId', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const fieldDefinitionId = parseInt(req.params.fieldDefinitionId);
      const { value } = req.body;
      
      const fieldValue = await storage.upsertProjectCustomFieldValue({
        projectId,
        fieldDefinitionId,
        value
      });
      res.json(fieldValue);
    } catch (error) {
      console.error('Error updating custom field value:', error);
      res.status(500).json({ message: 'Failed to update custom field value' });
    }
  });

  // Bulk update custom field values for a project
  app.put('/api/projects/:projectId/custom-field-values', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const { values } = req.body; // Array of { fieldDefinitionId, value }
      
      const results = await Promise.all(
        values.map((v: { fieldDefinitionId: number; value: string | null }) => 
          storage.upsertProjectCustomFieldValue({
            projectId,
            fieldDefinitionId: v.fieldDefinitionId,
            value: v.value
          })
        )
      );
      res.json(results);
    } catch (error) {
      console.error('Error updating custom field values:', error);
      res.status(500).json({ message: 'Failed to update custom field values' });
    }
  });

  // Delete a custom field value
  app.delete('/api/projects/:projectId/custom-field-values/:fieldDefinitionId', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const fieldDefinitionId = parseInt(req.params.fieldDefinitionId);
      await storage.deleteProjectCustomFieldValue(projectId, fieldDefinitionId);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting custom field value:', error);
      res.status(500).json({ message: 'Failed to delete custom field value' });
    }
  });

  // ============================================
  // CUSTOM PROJECT TABS ROUTES
  // ============================================

  // Get all custom tabs for an organization
  app.get('/api/organizations/:organizationId/custom-tabs', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const organizationId = parseInt(req.params.organizationId);
      const tabs = await storage.getCustomProjectTabs(organizationId);
      res.json(tabs);
    } catch (error) {
      console.error('Error fetching custom tabs:', error);
      res.status(500).json({ message: 'Failed to fetch custom tabs' });
    }
  });

  // Get a single custom tab with sections and fields
  app.get('/api/custom-tabs/:id/full', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = parseInt(req.params.id);
      const fullTab = await storage.getFullCustomProjectTab(id);
      if (!fullTab) {
        return res.status(404).json({ message: 'Tab not found' });
      }
      res.json(fullTab);
    } catch (error) {
      console.error('Error fetching custom tab:', error);
      res.status(500).json({ message: 'Failed to fetch custom tab' });
    }
  });

  // Create a custom tab
  app.post('/api/organizations/:organizationId/custom-tabs', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const organizationId = parseInt(req.params.organizationId);
      const tab = await storage.createCustomProjectTab({
        ...req.body,
        organizationId,
        createdBy: userId
      });
      res.status(201).json(tab);
    } catch (error) {
      console.error('Error creating custom tab:', error);
      res.status(500).json({ message: 'Failed to create custom tab' });
    }
  });

  // Update a custom tab
  app.put('/api/custom-tabs/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = parseInt(req.params.id);
      const tab = await storage.updateCustomProjectTab(id, req.body);
      res.json(tab);
    } catch (error) {
      console.error('Error updating custom tab:', error);
      res.status(500).json({ message: 'Failed to update custom tab' });
    }
  });

  // Delete a custom tab
  app.delete('/api/custom-tabs/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = parseInt(req.params.id);
      await storage.deleteCustomProjectTab(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting custom tab:', error);
      res.status(500).json({ message: 'Failed to delete custom tab' });
    }
  });

  // ============================================
  // CUSTOM TAB SECTIONS ROUTES
  // ============================================

  // Get sections for a tab
  app.get('/api/custom-tabs/:tabId/sections', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const tabId = parseInt(req.params.tabId);
      const sections = await storage.getCustomTabSections(tabId);
      res.json(sections);
    } catch (error) {
      console.error('Error fetching custom tab sections:', error);
      res.status(500).json({ message: 'Failed to fetch sections' });
    }
  });

  // Create a section
  app.post('/api/custom-tabs/:tabId/sections', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const tabId = parseInt(req.params.tabId);
      const section = await storage.createCustomTabSection({
        ...req.body,
        tabId
      });
      res.status(201).json(section);
    } catch (error) {
      console.error('Error creating custom tab section:', error);
      res.status(500).json({ message: 'Failed to create section' });
    }
  });

  // Update a section
  app.put('/api/custom-tab-sections/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = parseInt(req.params.id);
      const section = await storage.updateCustomTabSection(id, req.body);
      res.json(section);
    } catch (error) {
      console.error('Error updating custom tab section:', error);
      res.status(500).json({ message: 'Failed to update section' });
    }
  });

  // Delete a section
  app.delete('/api/custom-tab-sections/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = parseInt(req.params.id);
      await storage.deleteCustomTabSection(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting custom tab section:', error);
      res.status(500).json({ message: 'Failed to delete section' });
    }
  });

  // ============================================
  // CUSTOM TAB FIELDS ROUTES
  // ============================================

  // Get fields for a section
  app.get('/api/custom-tab-sections/:sectionId/fields', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const sectionId = parseInt(req.params.sectionId);
      const fields = await storage.getCustomTabFields(sectionId);
      res.json(fields);
    } catch (error) {
      console.error('Error fetching custom tab fields:', error);
      res.status(500).json({ message: 'Failed to fetch fields' });
    }
  });

  // Create a field
  app.post('/api/custom-tab-sections/:sectionId/fields', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const sectionId = parseInt(req.params.sectionId);
      const field = await storage.createCustomTabField({
        ...req.body,
        sectionId
      });
      res.status(201).json(field);
    } catch (error) {
      console.error('Error creating custom tab field:', error);
      res.status(500).json({ message: 'Failed to create field' });
    }
  });

  // Update a field
  app.put('/api/custom-tab-fields/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = parseInt(req.params.id);
      const field = await storage.updateCustomTabField(id, req.body);
      res.json(field);
    } catch (error) {
      console.error('Error updating custom tab field:', error);
      res.status(500).json({ message: 'Failed to update field' });
    }
  });

  // Delete a field
  app.delete('/api/custom-tab-fields/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const id = parseInt(req.params.id);
      await storage.deleteCustomTabField(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting custom tab field:', error);
      res.status(500).json({ message: 'Failed to delete field' });
    }
  });

  // Get project field definitions for tab builder
  app.get('/api/project-field-definitions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { PROJECT_FIELD_DEFINITIONS } = await import('@shared/schema');
      res.json(PROJECT_FIELD_DEFINITIONS);
    } catch (error) {
      console.error('Error fetching project field definitions:', error);
      res.status(500).json({ message: 'Failed to fetch project field definitions' });
    }
  });

  // ============================================
  // PORTFOLIO SCORING CRITERIA ROUTES
  // ============================================

  app.get('/api/organizations/:organizationId/scoring-criteria', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const organizationId = parseInt(req.params.organizationId);
      const criteria = await storage.getProjectScoringCriteria(organizationId);
      res.json(criteria);
    } catch (error) {
      console.error('Error fetching scoring criteria:', error);
      res.status(500).json({ message: 'Failed to fetch scoring criteria' });
    }
  });

  app.post('/api/organizations/:organizationId/scoring-criteria', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const organizationId = parseInt(req.params.organizationId);
      const criteria = await storage.createProjectScoringCriteria({
        ...req.body,
        organizationId,
        createdBy: userId
      });
      res.status(201).json(criteria);
    } catch (error) {
      console.error('Error creating scoring criteria:', error);
      res.status(500).json({ message: 'Failed to create scoring criteria' });
    }
  });

  app.put('/api/scoring-criteria/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const id = parseInt(req.params.id);
      const criteria = await storage.updateProjectScoringCriteria(id, req.body);
      res.json(criteria);
    } catch (error) {
      console.error('Error updating scoring criteria:', error);
      res.status(500).json({ message: 'Failed to update scoring criteria' });
    }
  });

  app.delete('/api/scoring-criteria/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectScoringCriteria(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting scoring criteria:', error);
      res.status(500).json({ message: 'Failed to delete scoring criteria' });
    }
  });

  // ============================================
  // PROJECT SCORES ROUTES
  // ============================================

  app.get('/api/projects/:projectId/scores', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const projectId = parseInt(req.params.projectId);
      const scores = await storage.getProjectScores(projectId);
      res.json(scores);
    } catch (error) {
      console.error('Error fetching project scores:', error);
      res.status(500).json({ message: 'Failed to fetch project scores' });
    }
  });

  app.post('/api/projects/:projectId/scores', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const projectId = parseInt(req.params.projectId);
      const { criteriaId, score, justification } = req.body;
      const result = await storage.upsertProjectScore(projectId, criteriaId, score, justification, userId);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error saving project score:', error);
      res.status(500).json({ message: 'Failed to save project score' });
    }
  });

  app.delete('/api/project-scores/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectScore(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting project score:', error);
      res.status(500).json({ message: 'Failed to delete project score' });
    }
  });

  // ============================================
  // PROJECT BENEFITS ROUTES
  // ============================================

  app.get('/api/projects/:projectId/benefits', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const projectId = parseInt(req.params.projectId);
      const benefits = await storage.getProjectBenefits(projectId);
      res.json(benefits);
    } catch (error) {
      console.error('Error fetching project benefits:', error);
      res.status(500).json({ message: 'Failed to fetch project benefits' });
    }
  });

  app.post('/api/projects/:projectId/benefits', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const projectId = parseInt(req.params.projectId);
      const benefit = await storage.createProjectBenefit({
        ...req.body,
        projectId,
        createdBy: userId
      });
      res.status(201).json(benefit);
    } catch (error) {
      console.error('Error creating project benefit:', error);
      res.status(500).json({ message: 'Failed to create project benefit' });
    }
  });

  app.put('/api/project-benefits/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const id = parseInt(req.params.id);
      const benefit = await storage.updateProjectBenefit(id, req.body);
      res.json(benefit);
    } catch (error) {
      console.error('Error updating project benefit:', error);
      res.status(500).json({ message: 'Failed to update project benefit' });
    }
  });

  app.delete('/api/project-benefits/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectBenefit(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting project benefit:', error);
      res.status(500).json({ message: 'Failed to delete project benefit' });
    }
  });

  // ============================================
  // PROJECT DECISIONS ROUTES
  // ============================================

  app.get('/api/projects/:projectId/decisions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const projectId = parseInt(req.params.projectId);
      const decisions = await storage.getProjectDecisions(projectId);
      res.json(decisions);
    } catch (error) {
      console.error('Error fetching project decisions:', error);
      res.status(500).json({ message: 'Failed to fetch project decisions' });
    }
  });

  app.post('/api/projects/:projectId/decisions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const projectId = parseInt(req.params.projectId);
      const decision = await storage.createProjectDecision({
        ...req.body,
        projectId,
        createdBy: userId
      });
      res.status(201).json(decision);
    } catch (error) {
      console.error('Error creating project decision:', error);
      res.status(500).json({ message: 'Failed to create project decision' });
    }
  });

  app.put('/api/project-decisions/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const id = parseInt(req.params.id);
      const decision = await storage.updateProjectDecision(id, req.body);
      res.json(decision);
    } catch (error) {
      console.error('Error updating project decision:', error);
      res.status(500).json({ message: 'Failed to update project decision' });
    }
  });

  app.delete('/api/project-decisions/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectDecision(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting project decision:', error);
      res.status(500).json({ message: 'Failed to delete project decision' });
    }
  });

  // ============================================
  // LESSONS LEARNED ROUTES
  // ============================================

  // Get lessons learned for a specific project
  app.get('/api/projects/:projectId/lessons-learned', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const projectId = parseInt(req.params.projectId);
      const lessons = await storage.getLessonsLearned(projectId);
      res.json(lessons);
    } catch (error) {
      console.error('Error fetching lessons learned:', error);
      res.status(500).json({ message: 'Failed to fetch lessons learned' });
    }
  });

  // Get all lessons learned for an organization
  app.get('/api/organizations/:organizationId/lessons-learned', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const organizationId = parseInt(req.params.organizationId);
      const lessons = await storage.getAllLessonsLearned(organizationId);
      res.json(lessons);
    } catch (error) {
      console.error('Error fetching all lessons learned:', error);
      res.status(500).json({ message: 'Failed to fetch lessons learned' });
    }
  });

  // Create a lesson learned
  app.post('/api/projects/:projectId/lessons-learned', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const projectId = parseInt(req.params.projectId);
      const lesson = await storage.createLessonLearned({
        ...req.body,
        projectId,
        createdBy: userId
      });
      res.status(201).json(lesson);
    } catch (error) {
      console.error('Error creating lesson learned:', error);
      res.status(500).json({ message: 'Failed to create lesson learned' });
    }
  });

  // Update a lesson learned
  app.put('/api/lessons-learned/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const id = parseInt(req.params.id);
      const lesson = await storage.updateLessonLearned(id, req.body);
      res.json(lesson);
    } catch (error) {
      console.error('Error updating lesson learned:', error);
      res.status(500).json({ message: 'Failed to update lesson learned' });
    }
  });

  // Delete a lesson learned
  app.delete('/api/lessons-learned/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
      const id = parseInt(req.params.id);
      await storage.deleteLessonLearned(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting lesson learned:', error);
      res.status(500).json({ message: 'Failed to delete lesson learned' });
    }
  });

  // ============================================
  // APPLICATION MONITORING ROUTES (Super Admin)
  // ============================================

  const {
    apiRequestLogs,
    applicationMetrics,
    userActivityLogs,
    featureUsageLogs,
    errorLogs
  } = await import("@shared/schema");

  // Helper to verify super admin
  const requireSuperAdmin = async (userId: string | null): Promise<boolean> => {
    if (!userId) return false;
    const user = await storage.getUser(userId);
    return user?.role === "super_admin";
  };

  // Get monitoring dashboard overview
  app.get('/api/admin/monitoring/overview', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Get active users (users with activity in last 24 hours)
      const activeUsersResult = await db.execute(sql`
        SELECT COUNT(DISTINCT user_id) as count FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);
      const activeUsers24h = Number(activeUsersResult.rows[0]?.count || 0);

      // Get total requests today
      const requestsTodayResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM api_request_logs 
        WHERE DATE(created_at) = CURRENT_DATE
      `);
      const requestsToday = Number(requestsTodayResult.rows[0]?.count || 0);

      // Get average response time
      const avgResponseTimeResult = await db.execute(sql`
        SELECT AVG(duration) as avg FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours' AND duration IS NOT NULL
      `);
      const avgResponseTime = Number(avgResponseTimeResult.rows[0]?.avg || 0).toFixed(0);

      // Get error rate
      const errorRateResult = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE status_code >= 400) as errors,
          COUNT(*) as total
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);
      const errors = Number(errorRateResult.rows[0]?.errors || 0);
      const total = Number(errorRateResult.rows[0]?.total || 1);
      const errorRate = ((errors / total) * 100).toFixed(2);

      // Get total users
      const totalUsersResult = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
      const totalUsers = Number(totalUsersResult.rows[0]?.count || 0);

      // Get total organizations
      const totalOrgsResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM organizations WHERE deactivated_at IS NULL
      `);
      const totalOrganizations = Number(totalOrgsResult.rows[0]?.count || 0);

      // Get total projects
      const totalProjectsResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM projects WHERE deleted_at IS NULL
      `);
      const totalProjects = Number(totalProjectsResult.rows[0]?.count || 0);

      // Get requests per day for last 7 days
      const requestsPerDayResult = await db.execute(sql`
        SELECT DATE(created_at) as date, COUNT(*) as count 
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at) 
        ORDER BY date DESC
      `);

      // Get top endpoints
      const topEndpointsResult = await db.execute(sql`
        SELECT path, method, COUNT(*) as count, AVG(duration) as avg_duration
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY path, method 
        ORDER BY count DESC 
        LIMIT 10
      `);

      // Get user registrations per day for last 30 days
      const registrationsResult = await db.execute(sql`
        SELECT DATE(created_at) as date, COUNT(*) as count 
        FROM users 
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at) 
        ORDER BY date DESC
      `);

      // Get recent errors
      const recentErrorsResult = await db.execute(sql`
        SELECT path, status_code, error_message, COUNT(*) as count
        FROM api_request_logs 
        WHERE status_code >= 400 AND created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY path, status_code, error_message
        ORDER BY count DESC
        LIMIT 10
      `);

      res.json({
        summary: {
          activeUsers24h,
          requestsToday,
          avgResponseTime: `${avgResponseTime}ms`,
          errorRate: `${errorRate}%`,
          totalUsers,
          totalOrganizations,
          totalProjects,
        },
        charts: {
          requestsPerDay: requestsPerDayResult.rows,
          userRegistrations: registrationsResult.rows,
        },
        topEndpoints: topEndpointsResult.rows,
        recentErrors: recentErrorsResult.rows,
      });
    } catch (error) {
      console.error('Error fetching monitoring overview:', error);
      res.status(500).json({ message: 'Failed to fetch monitoring data' });
    }
  });

  // Get API request logs with pagination and filtering
  app.get('/api/admin/monitoring/api-logs', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const { page = '1', limit = '50', method, path, minStatus, maxStatus } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      let query = sql`
        SELECT l.*, u.email as user_email, u.first_name, u.last_name
        FROM api_request_logs l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE 1=1
      `;

      if (method) {
        query = sql`${query} AND l.method = ${method}`;
      }
      if (path) {
        query = sql`${query} AND l.path LIKE ${'%' + path + '%'}`;
      }
      if (minStatus) {
        query = sql`${query} AND l.status_code >= ${parseInt(minStatus as string)}`;
      }
      if (maxStatus) {
        query = sql`${query} AND l.status_code <= ${parseInt(maxStatus as string)}`;
      }

      query = sql`${query} ORDER BY l.created_at DESC LIMIT ${parseInt(limit as string)} OFFSET ${offset}`;

      const logs = await db.execute(query);

      // Get total count
      const countResult = await db.execute(sql`SELECT COUNT(*) as total FROM api_request_logs`);
      const total = Number(countResult.rows[0]?.total || 0);

      res.json({
        logs: logs.rows,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      console.error('Error fetching API logs:', error);
      res.status(500).json({ message: 'Failed to fetch API logs' });
    }
  });

  // Get user activity statistics
  app.get('/api/admin/monitoring/user-activity', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      // Active users by hour for last 24 hours
      const hourlyActiveResult = await db.execute(sql`
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(DISTINCT user_id) as active_users
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
      `);

      // Most active users
      const topUsersResult = await db.execute(sql`
        SELECT 
          l.user_id,
          u.email,
          u.first_name,
          u.last_name,
          COUNT(*) as request_count,
          MAX(l.created_at) as last_activity
        FROM api_request_logs l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.created_at >= NOW() - INTERVAL '24 hours' AND l.user_id IS NOT NULL
        GROUP BY l.user_id, u.email, u.first_name, u.last_name
        ORDER BY request_count DESC
        LIMIT 20
      `);

      // User logins per day
      const loginsResult = await db.execute(sql`
        SELECT 
          DATE(l.created_at) as date,
          COUNT(DISTINCT l.user_id) as unique_users
        FROM api_request_logs l
        WHERE l.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(l.created_at)
        ORDER BY date DESC
      `);

      res.json({
        hourlyActive: hourlyActiveResult.rows,
        topUsers: topUsersResult.rows,
        dailyLogins: loginsResult.rows,
      });
    } catch (error) {
      console.error('Error fetching user activity:', error);
      res.status(500).json({ message: 'Failed to fetch user activity' });
    }
  });

  // Get feature usage statistics
  app.get('/api/admin/monitoring/feature-usage', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      // API endpoint usage grouped by feature
      const featureUsageResult = await db.execute(sql`
        SELECT 
          CASE 
            WHEN path LIKE '/api/projects%' THEN 'Projects'
            WHEN path LIKE '/api/tasks%' THEN 'Tasks'
            WHEN path LIKE '/api/portfolios%' THEN 'Portfolios'
            WHEN path LIKE '/api/risks%' THEN 'Risks'
            WHEN path LIKE '/api/issues%' THEN 'Issues'
            WHEN path LIKE '/api/timesheets%' THEN 'Timesheets'
            WHEN path LIKE '/api/resources%' THEN 'Resources'
            WHEN path LIKE '/api/milestones%' THEN 'Milestones'
            WHEN path LIKE '/api/organizations%' THEN 'Organizations'
            WHEN path LIKE '/api/users%' THEN 'Users'
            WHEN path LIKE '/api/notifications%' THEN 'Notifications'
            WHEN path LIKE '/api/custom-dashboards%' THEN 'Custom Dashboards'
            WHEN path LIKE '/api/project-intakes%' THEN 'Project Intakes'
            WHEN path LIKE '/api/chat%' THEN 'AI Chat'
            ELSE 'Other'
          END as feature,
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE method = 'GET') as get_requests,
          COUNT(*) FILTER (WHERE method = 'POST') as post_requests,
          COUNT(*) FILTER (WHERE method = 'PUT' OR method = 'PATCH') as update_requests,
          COUNT(*) FILTER (WHERE method = 'DELETE') as delete_requests
        FROM api_request_logs
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY 
          CASE 
            WHEN path LIKE '/api/projects%' THEN 'Projects'
            WHEN path LIKE '/api/tasks%' THEN 'Tasks'
            WHEN path LIKE '/api/portfolios%' THEN 'Portfolios'
            WHEN path LIKE '/api/risks%' THEN 'Risks'
            WHEN path LIKE '/api/issues%' THEN 'Issues'
            WHEN path LIKE '/api/timesheets%' THEN 'Timesheets'
            WHEN path LIKE '/api/resources%' THEN 'Resources'
            WHEN path LIKE '/api/milestones%' THEN 'Milestones'
            WHEN path LIKE '/api/organizations%' THEN 'Organizations'
            WHEN path LIKE '/api/users%' THEN 'Users'
            WHEN path LIKE '/api/notifications%' THEN 'Notifications'
            WHEN path LIKE '/api/custom-dashboards%' THEN 'Custom Dashboards'
            WHEN path LIKE '/api/project-intakes%' THEN 'Project Intakes'
            WHEN path LIKE '/api/chat%' THEN 'AI Chat'
            ELSE 'Other'
          END
        ORDER BY total_requests DESC
      `);

      // Feature usage trend over last 7 days
      const trendResult = await db.execute(sql`
        SELECT 
          DATE(created_at) as date,
          CASE 
            WHEN path LIKE '/api/projects%' THEN 'Projects'
            WHEN path LIKE '/api/tasks%' THEN 'Tasks'
            WHEN path LIKE '/api/portfolios%' THEN 'Portfolios'
            ELSE 'Other'
          END as feature,
          COUNT(*) as count
        FROM api_request_logs
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at), 
          CASE 
            WHEN path LIKE '/api/projects%' THEN 'Projects'
            WHEN path LIKE '/api/tasks%' THEN 'Tasks'
            WHEN path LIKE '/api/portfolios%' THEN 'Portfolios'
            ELSE 'Other'
          END
        ORDER BY date DESC, count DESC
      `);

      res.json({
        featureUsage: featureUsageResult.rows,
        trend: trendResult.rows,
      });
    } catch (error) {
      console.error('Error fetching feature usage:', error);
      res.status(500).json({ message: 'Failed to fetch feature usage' });
    }
  });

  // Get performance metrics
  app.get('/api/admin/monitoring/performance', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      // Response time percentiles
      const percentilesResult = await db.execute(sql`
        SELECT 
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration) as p50,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY duration) as p90,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration) as p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration) as p99,
          AVG(duration) as avg,
          MAX(duration) as max,
          MIN(duration) as min
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours' AND duration IS NOT NULL
      `);

      // Slowest endpoints
      const slowEndpointsResult = await db.execute(sql`
        SELECT 
          path,
          method,
          AVG(duration) as avg_duration,
          MAX(duration) as max_duration,
          COUNT(*) as request_count
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours' AND duration IS NOT NULL
        GROUP BY path, method
        HAVING COUNT(*) >= 5
        ORDER BY avg_duration DESC
        LIMIT 10
      `);

      // Response time trend by hour
      const trendResult = await db.execute(sql`
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          AVG(duration) as avg_duration,
          COUNT(*) as request_count
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours' AND duration IS NOT NULL
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
      `);

      // Error rate by hour
      const errorTrendResult = await db.execute(sql`
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
          ROUND(100.0 * COUNT(*) FILTER (WHERE status_code >= 400) / NULLIF(COUNT(*), 0), 2) as error_rate
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
      `);

      res.json({
        percentiles: percentilesResult.rows[0] || {},
        slowEndpoints: slowEndpointsResult.rows,
        responseTrend: trendResult.rows,
        errorTrend: errorTrendResult.rows,
      });
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      res.status(500).json({ message: 'Failed to fetch performance metrics' });
    }
  });

  // Get database statistics
  app.get('/api/admin/monitoring/database', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      // Table row counts
      const tableCountsResult = await db.execute(sql`
        SELECT 
          'users' as table_name, COUNT(*) as row_count FROM users
        UNION ALL
        SELECT 'organizations', COUNT(*) FROM organizations
        UNION ALL
        SELECT 'projects', COUNT(*) FROM projects
        UNION ALL
        SELECT 'tasks', COUNT(*) FROM tasks
        UNION ALL
        SELECT 'issues', COUNT(*) FROM issues
        UNION ALL
        SELECT 'risks', COUNT(*) FROM risks
        UNION ALL
        SELECT 'milestones', COUNT(*) FROM milestones
        UNION ALL
        SELECT 'resources', COUNT(*) FROM resources
        UNION ALL
        SELECT 'portfolios', COUNT(*) FROM portfolios
        UNION ALL
        SELECT 'timesheets', COUNT(*) FROM timesheets
        UNION ALL
        SELECT 'api_request_logs', COUNT(*) FROM api_request_logs
        ORDER BY row_count DESC
      `);

      // Database size
      const dbSizeResult = await db.execute(sql`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);

      // Table sizes
      const tableSizesResult = await db.execute(sql`
        SELECT 
          relname as table_name,
          pg_size_pretty(pg_total_relation_size(relid)) as total_size
        FROM pg_catalog.pg_statio_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 15
      `);

      res.json({
        tableCounts: tableCountsResult.rows,
        databaseSize: dbSizeResult.rows[0]?.size || 'Unknown',
        tableSizes: tableSizesResult.rows,
      });
    } catch (error) {
      console.error('Error fetching database stats:', error);
      res.status(500).json({ message: 'Failed to fetch database statistics' });
    }
  });

  // Get organization usage statistics
  app.get('/api/admin/monitoring/organization-usage', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      // Organization usage statistics
      const orgUsageResult = await db.execute(sql`
        SELECT 
          o.id,
          o.name,
          o.slug,
          (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) as member_count,
          (SELECT COUNT(*) FROM projects p WHERE p.organization_id = o.id AND p.deleted_at IS NULL) as project_count,
          (SELECT COUNT(*) FROM tasks t INNER JOIN projects p ON t.project_id = p.id WHERE p.organization_id = o.id) as task_count,
          (SELECT COUNT(*) FROM api_request_logs l WHERE l.organization_id = o.id AND l.created_at >= NOW() - INTERVAL '7 days') as api_requests_7d
        FROM organizations o
        WHERE o.deactivated_at IS NULL
        ORDER BY api_requests_7d DESC
        LIMIT 20
      `);

      res.json({
        organizations: orgUsageResult.rows,
      });
    } catch (error) {
      console.error('Error fetching organization usage:', error);
      res.status(500).json({ message: 'Failed to fetch organization usage' });
    }
  });

  // ========== HELP TICKETS API ==========
  
  // Create a new help ticket
  app.post('/api/help-tickets', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const { subject, description, imageUrls, organizationId } = req.body;
      
      if (!subject?.trim() || !description?.trim()) {
        return res.status(400).json({ message: 'Subject and description are required' });
      }

      // Validate imageUrls is an array of strings if provided
      const validImageUrls = Array.isArray(imageUrls) 
        ? imageUrls.filter((url: unknown) => typeof url === 'string')
        : [];

      // Get current organization if any
      const orgId = typeof organizationId === 'number' ? organizationId : null;
      let orgName = null;
      if (orgId) {
        const org = await storage.getOrganization(orgId);
        orgName = org?.name || null;
      }

      const ticketData = {
        userId,
        userEmail: user.email,
        userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        organizationId: orgId,
        organizationName: orgName,
        subject: subject.trim(),
        description: description.trim(),
        imageUrls: validImageUrls,
        status: 'new',
        priority: 'normal',
      };

      const [ticket] = await db.insert(helpTickets).values(ticketData).returning();

      // Send email notification to support
      try {
        await sendEmail({
          to: 'support@fridayreport.ai',
          subject: `[Help Ticket #${ticket.id}] ${subject}`,
          html: `
            <h2>New Help Ticket Submitted</h2>
            <p><strong>From:</strong> ${ticketData.userName} (${ticketData.userEmail})</p>
            ${orgName ? `<p><strong>Organization:</strong> ${orgName}</p>` : ''}
            <p><strong>Subject:</strong> ${subject}</p>
            <hr>
            <p><strong>Description:</strong></p>
            <p>${description.replace(/\n/g, '<br>')}</p>
            ${imageUrls?.length ? `<p><strong>Attachments:</strong> ${imageUrls.length} image(s)</p>` : ''}
            <hr>
            <p><em>Ticket ID: ${ticket.id}</em></p>
          `,
        });
        
        // Mark email as sent
        await db.update(helpTickets)
          .set({ emailSent: true, emailSentAt: new Date() })
          .where(eq(helpTickets.id, ticket.id));
      } catch (emailError) {
        console.error('Failed to send help ticket email:', emailError);
        // Don't fail the request if email fails
      }

      res.status(201).json(ticket);
    } catch (error) {
      console.error('Error creating help ticket:', error);
      res.status(500).json({ message: 'Failed to create help ticket' });
    }
  });

  // Get all help tickets (superadmin only)
  app.get('/api/admin/help-tickets', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const tickets = await db.select().from(helpTickets).orderBy(desc(helpTickets.createdAt));
      res.json(tickets);
    } catch (error) {
      console.error('Error fetching help tickets:', error);
      res.status(500).json({ message: 'Failed to fetch help tickets' });
    }
  });

  // Get a single help ticket (superadmin only)
  app.get('/api/admin/help-tickets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const ticketId = parseInt(req.params.id);
      const [ticket] = await db.select().from(helpTickets).where(eq(helpTickets.id, ticketId));
      
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      res.json(ticket);
    } catch (error) {
      console.error('Error fetching help ticket:', error);
      res.status(500).json({ message: 'Failed to fetch help ticket' });
    }
  });

  // Update a help ticket (superadmin only)
  app.patch('/api/admin/help-tickets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const ticketId = parseInt(req.params.id);
      const { status, priority, resolution, assignedTo } = req.body;

      const updateData: Record<string, any> = { updatedAt: new Date() };
      
      if (status) updateData.status = status;
      if (priority) updateData.priority = priority;
      if (resolution !== undefined) updateData.resolution = resolution;
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
      
      // Set resolvedAt if status is resolved
      if (status === 'resolved' || status === 'closed') {
        updateData.resolvedAt = new Date();
      }

      const [updatedTicket] = await db.update(helpTickets)
        .set(updateData)
        .where(eq(helpTickets.id, ticketId))
        .returning();

      if (!updatedTicket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      res.json(updatedTicket);
    } catch (error) {
      console.error('Error updating help ticket:', error);
      res.status(500).json({ message: 'Failed to update help ticket' });
    }
  });

  // Delete a help ticket (superadmin only)
  app.delete('/api/admin/help-tickets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const ticketId = parseInt(req.params.id);
      await db.delete(helpTickets).where(eq(helpTickets.id, ticketId));
      res.json({ message: 'Ticket deleted successfully' });
    } catch (error) {
      console.error('Error deleting help ticket:', error);
      res.status(500).json({ message: 'Failed to delete help ticket' });
    }
  });

  return httpServer;
}
