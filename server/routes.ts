import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";

// Seed data function
async function seedDatabase() {
  const portfolios = await storage.getPortfolios();
  if (portfolios.length === 0) {
    console.log("Seeding database...");
    
    // Create Portfolios
    const p1 = await storage.createPortfolio({
      name: "Digital Transformation",
      description: "Modernizing core business infrastructure and customer facing channels.",
      strategy: "Cloud-first approach to improve agility and reduce costs.",
      managerId: null
    });

    const p2 = await storage.createPortfolio({
      name: "New Product Development",
      description: "R&D initiatives for Q4 2024 and 2025.",
      strategy: "Innovation and market expansion.",
      managerId: null
    });

    // Create Projects for P1
    const prj1 = await storage.createProject({
      portfolioId: p1.id,
      name: "Cloud Migration Alpha",
      description: "Migrating legacy ERP to cloud infrastructure.",
      status: "Execution",
      priority: "High",
      startDate: new Date("2024-01-15").toISOString(),
      endDate: new Date("2024-08-30").toISOString(),
      budget: "500000",
      managerId: null,
      health: "Green",
      completionPercentage: 65
    });

    await storage.createProject({
      portfolioId: p1.id,
      name: "Customer Portal Revamp",
      description: "Redesigning the customer portal with new UI/UX.",
      status: "Planning",
      priority: "Medium",
      startDate: new Date("2024-06-01").toISOString(),
      endDate: new Date("2024-12-20").toISOString(),
      budget: "150000",
      managerId: null,
      health: "Yellow",
      completionPercentage: 20
    });

    // Create Projects for P2
    const prj3 = await storage.createProject({
      portfolioId: p2.id,
      name: "AI-Driven Analytics",
      description: "Implementing predictive analytics for sales forecasting.",
      status: "Initiation",
      priority: "Critical",
      startDate: new Date("2024-09-01").toISOString(),
      endDate: new Date("2025-03-31").toISOString(),
      budget: "300000",
      managerId: null,
      health: "Green",
      completionPercentage: 5
    });

    // Add Risks
    await storage.createRisk({
      projectId: prj1.id,
      title: "Data Corruption during Migration",
      description: "Risk of data loss or corruption when moving from on-prem to cloud.",
      probability: "Medium",
      impact: "High",
      status: "Open",
      mitigationPlan: "Perform 3 rounds of dry-run migrations and full backup verification."
    });

    await storage.createRisk({
      projectId: prj3.id,
      title: "Model Accuracy",
      description: "AI models might not achieve the target accuracy of 95%.",
      probability: "High",
      impact: "Medium",
      status: "Open",
      mitigationPlan: "Engage external data science consultants for validation."
    });

    // Add Milestones
    await storage.createMilestone({
      projectId: prj1.id,
      title: "Phase 1 Migration Complete",
      dueDate: new Date("2024-04-01").toISOString(),
      completed: true
    });

    await storage.createMilestone({
      projectId: prj1.id,
      title: "UAT Sign-off",
      dueDate: new Date("2024-08-15").toISOString(),
      completed: false
    });

    // Add Issues
    await storage.createIssue({
      projectId: prj1.id,
      title: "Database connection timeout",
      description: "Intermittent connection failures during peak hours.",
      priority: "High",
      status: "Open",
      type: "Bug",
      assignee: "John Smith"
    });

    await storage.createIssue({
      projectId: prj1.id,
      title: "Add audit logging feature",
      description: "Need comprehensive audit trail for compliance.",
      priority: "Medium",
      status: "In Progress",
      type: "Enhancement",
      assignee: "Sarah Johnson"
    });

    await storage.createIssue({
      projectId: prj3.id,
      title: "Model training documentation",
      description: "Create documentation for ML model training process.",
      priority: "Low",
      status: "Open",
      type: "Task",
      assignee: null
    });

    console.log("Database seeded successfully.");
  }
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
    const org = await storage.getOrganization(Number(req.params.id));
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
      const { name, description } = req.body;
      const updated = await storage.updateOrganization(Number(req.params.id), { name, description });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: 'Failed to update organization' });
    }
  });

  app.delete('/api/organizations/:id', async (req, res) => {
    await storage.deleteOrganization(Number(req.params.id));
    res.status(204).send();
  });

  // --- Organization Members ---
  app.get('/api/organizations/:id/members', async (req, res) => {
    try {
      const members = await storage.getOrganizationMembers(Number(req.params.id));
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
      const { userId, role } = req.body;
      const member = await storage.addOrganizationMember({
        organizationId: Number(req.params.id),
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
      const { role } = req.body;
      const updated = await storage.updateOrganizationMemberRole(
        Number(req.params.id),
        req.params.userId,
        role
      );
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: 'Failed to update member role' });
    }
  });

  app.delete('/api/organizations/:id/members/:userId', async (req, res) => {
    await storage.removeOrganizationMember(Number(req.params.id), req.params.userId);
    res.status(204).send();
  });

  // --- Portfolios ---
  app.get(api.portfolios.list.path, async (req, res) => {
    const portfolios = await storage.getPortfolios();
    res.json(portfolios);
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

  // --- Projects ---
  app.get(api.projects.list.path, async (req, res) => {
    const portfolioId = req.query.portfolioId ? Number(req.query.portfolioId) : undefined;
    const projects = await storage.getProjects(portfolioId);
    res.json(projects);
  });

  app.get(api.projects.get.path, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post(api.projects.create.path, async (req, res) => {
    try {
      const input = api.projects.create.input.parse(req.body);
      const project = await storage.createProject(input);
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
      const updated = await storage.updateProject(Number(req.params.id), input);
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
    const issues = await storage.getAllIssues();
    res.json(issues);
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
    const tasks = await storage.getAllTasks();
    res.json(tasks);
  });

  app.post(api.tasks.create.path, async (req, res) => {
    try {
      const input = api.tasks.create.input.parse(req.body);
      const task = await storage.createTask(input);
      res.status(201).json(task);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put(api.tasks.update.path, async (req, res) => {
    try {
      const input = api.tasks.update.input.parse(req.body);
      const updated = await storage.updateTask(Number(req.params.id), input);
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

  return httpServer;
}
