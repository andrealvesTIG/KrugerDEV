import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

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
      
      const { name, description } = req.body;
      const updated = await storage.updateOrganization(orgId, { name, description });
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
    await storage.deletePortfolio(Number(req.params.id));
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
      const input = api.projects.update.input.parse(req.body);
      const sanitizedInput = {
        ...input,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
      };
      const updated = await storage.updateProject(Number(req.params.id), sanitizedInput);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Error updating project" });
    }
  });

  app.delete(api.projects.delete.path, async (req, res) => {
    await storage.deleteProject(Number(req.params.id));
    res.status(204).send();
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
      const input = api.risks.update.input.parse(req.body);
      const updated = await storage.updateRisk(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
       if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
       res.status(500).json({ message: "Error" });
    }
  });

  app.delete(api.risks.delete.path, async (req, res) => {
    await storage.deleteRisk(Number(req.params.id));
    res.status(204).send();
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
    await storage.deleteMilestone(Number(req.params.id));
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
      res.status(201).json(issue);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.issues.update.path, async (req, res) => {
    try {
      const input = api.issues.update.input.parse(req.body);
      const updated = await storage.updateIssue(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Error updating issue" });
    }
  });

  app.delete(api.issues.delete.path, async (req, res) => {
    await storage.deleteIssue(Number(req.params.id));
    res.status(204).send();
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
    await storage.deleteTask(Number(req.params.id));
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

  return httpServer;
}
