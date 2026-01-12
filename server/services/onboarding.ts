import { db } from "../db";
import { users, organizations, organizationMembers, portfolios, projects, risks, milestones, issues, tasks } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { extractDomain, isPersonalEmailDomain, lookupCompanyByDomain } from "./companyLookup";

interface OnboardingData {
  companyName: string;
  industry: string;
  createDemoData: boolean;
}

interface IndustryTemplateData {
  portfolioName: string;
  portfolioDescription: string;
  projects: Array<{
    name: string;
    description: string;
    status: string;
    priority: string;
    health: string;
    milestones: Array<{ title: string; description: string }>;
    risks: Array<{ title: string; description: string; probability: string; impact: string }>;
    issues: Array<{ title: string; description: string; priority: string; type: string }>;
  }>;
}

const industryTemplates: Record<string, IndustryTemplateData> = {
  Technology: {
    portfolioName: "Digital Transformation Initiative",
    portfolioDescription: "Strategic technology initiatives to modernize our infrastructure and capabilities",
    projects: [
      {
        name: "Cloud Migration Project",
        description: "Migrate legacy on-premises infrastructure to cloud platform",
        status: "Execution",
        priority: "High",
        health: "Green",
        milestones: [
          { title: "Infrastructure Assessment Complete", description: "Complete inventory and assessment of current infrastructure" },
          { title: "Migration Plan Approved", description: "Detailed migration plan reviewed and approved by stakeholders" },
          { title: "Pilot Migration Complete", description: "First workload successfully migrated to cloud" },
        ],
        risks: [
          { title: "Data Migration Complexity", description: "Complex data dependencies may extend timeline", probability: "Medium", impact: "High" },
          { title: "Service Disruption", description: "Potential downtime during cutover", probability: "Low", impact: "High" },
        ],
        issues: [
          { title: "Legacy API Compatibility", description: "Some legacy APIs not compatible with cloud environment", priority: "High", type: "Bug" },
        ],
      },
      {
        name: "Mobile App Redesign",
        description: "Redesign and modernize the customer-facing mobile application",
        status: "Planning",
        priority: "Medium",
        health: "Yellow",
        milestones: [
          { title: "UX Research Complete", description: "User research and persona development finished" },
          { title: "Design System Finalized", description: "New design system approved" },
        ],
        risks: [
          { title: "User Adoption", description: "Users may resist significant UI changes", probability: "Medium", impact: "Medium" },
        ],
        issues: [],
      },
    ],
  },
  Healthcare: {
    portfolioName: "Patient Care Excellence Program",
    portfolioDescription: "Initiatives to improve patient outcomes and operational efficiency",
    projects: [
      {
        name: "Electronic Health Records Upgrade",
        description: "Upgrade EHR system to latest version with enhanced interoperability",
        status: "Execution",
        priority: "Critical",
        health: "Yellow",
        milestones: [
          { title: "Vendor Selection Complete", description: "EHR vendor selected and contract signed" },
          { title: "Staff Training Scheduled", description: "Training program developed and scheduled" },
          { title: "Go-Live Preparation", description: "All systems ready for go-live" },
        ],
        risks: [
          { title: "HIPAA Compliance", description: "Data migration must maintain full HIPAA compliance", probability: "Low", impact: "Critical" },
          { title: "Workflow Disruption", description: "New system may disrupt established clinical workflows", probability: "High", impact: "Medium" },
        ],
        issues: [
          { title: "Data Format Incompatibility", description: "Legacy data format needs conversion", priority: "High", type: "Task" },
        ],
      },
      {
        name: "Telehealth Expansion",
        description: "Expand virtual care capabilities across all departments",
        status: "Planning",
        priority: "High",
        health: "Green",
        milestones: [
          { title: "Platform Selection", description: "Telehealth platform evaluated and selected" },
          { title: "Pilot Department Launch", description: "First department goes live with telehealth" },
        ],
        risks: [
          { title: "Patient Digital Literacy", description: "Some patients may struggle with technology", probability: "Medium", impact: "Low" },
        ],
        issues: [],
      },
    ],
  },
  Finance: {
    portfolioName: "Digital Banking Transformation",
    portfolioDescription: "Strategic initiatives to modernize banking services and customer experience",
    projects: [
      {
        name: "Core Banking System Modernization",
        description: "Replace legacy core banking system with modern platform",
        status: "Initiation",
        priority: "Critical",
        health: "Green",
        milestones: [
          { title: "Requirements Gathering Complete", description: "Business requirements documented and approved" },
          { title: "Vendor Evaluation", description: "Core banking vendors evaluated" },
          { title: "Architecture Design Approved", description: "Technical architecture finalized" },
        ],
        risks: [
          { title: "Regulatory Compliance", description: "Must maintain compliance during transition", probability: "Medium", impact: "Critical" },
          { title: "Data Integrity", description: "Transaction history must be preserved accurately", probability: "Low", impact: "Critical" },
        ],
        issues: [],
      },
      {
        name: "Fraud Detection Enhancement",
        description: "Implement AI-powered fraud detection system",
        status: "Execution",
        priority: "High",
        health: "Green",
        milestones: [
          { title: "ML Model Training Complete", description: "Fraud detection models trained on historical data" },
          { title: "Integration Testing", description: "System integrated with transaction processing" },
        ],
        risks: [
          { title: "False Positives", description: "AI may flag legitimate transactions", probability: "High", impact: "Medium" },
        ],
        issues: [
          { title: "Model Accuracy Below Target", description: "Current model accuracy at 94%, target is 97%", priority: "Medium", type: "Enhancement" },
        ],
      },
    ],
  },
  Manufacturing: {
    portfolioName: "Smart Factory Initiative",
    portfolioDescription: "Industry 4.0 transformation for improved efficiency and quality",
    projects: [
      {
        name: "IoT Sensor Deployment",
        description: "Deploy IoT sensors across production lines for real-time monitoring",
        status: "Execution",
        priority: "High",
        health: "Green",
        milestones: [
          { title: "Sensor Selection Complete", description: "IoT sensor vendors evaluated and selected" },
          { title: "Pilot Line Deployment", description: "First production line equipped with sensors" },
          { title: "Data Platform Integration", description: "Sensor data flowing to analytics platform" },
        ],
        risks: [
          { title: "Network Bandwidth", description: "High data volume may strain network", probability: "Medium", impact: "Medium" },
        ],
        issues: [],
      },
      {
        name: "Predictive Maintenance System",
        description: "Implement AI-driven predictive maintenance for critical equipment",
        status: "Planning",
        priority: "Medium",
        health: "Green",
        milestones: [
          { title: "Historical Data Analysis", description: "Analyze equipment failure patterns" },
          { title: "Prediction Model Development", description: "ML models developed for failure prediction" },
        ],
        risks: [
          { title: "Data Quality", description: "Historical maintenance data may be incomplete", probability: "High", impact: "Medium" },
        ],
        issues: [
          { title: "Legacy Equipment Compatibility", description: "Some older machines lack monitoring capability", priority: "Low", type: "Task" },
        ],
      },
    ],
  },
  Retail: {
    portfolioName: "Omnichannel Commerce Program",
    portfolioDescription: "Unified customer experience across all shopping channels",
    projects: [
      {
        name: "E-commerce Platform Upgrade",
        description: "Upgrade online shopping platform with modern features",
        status: "Execution",
        priority: "High",
        health: "Yellow",
        milestones: [
          { title: "Platform Selection", description: "New e-commerce platform selected" },
          { title: "Data Migration Complete", description: "Product catalog and customer data migrated" },
          { title: "Soft Launch", description: "Platform launched to limited audience" },
        ],
        risks: [
          { title: "Peak Season Timing", description: "Launch must avoid holiday shopping season", probability: "Low", impact: "High" },
        ],
        issues: [
          { title: "Payment Gateway Integration", description: "Legacy payment gateway needs custom integration", priority: "High", type: "Bug" },
        ],
      },
      {
        name: "Inventory Visibility System",
        description: "Real-time inventory visibility across all stores and warehouses",
        status: "Planning",
        priority: "Medium",
        health: "Green",
        milestones: [
          { title: "System Requirements Defined", description: "Requirements gathered from all stakeholders" },
          { title: "RFID Pilot Complete", description: "RFID tracking tested in pilot store" },
        ],
        risks: [
          { title: "Store Compliance", description: "Store staff adoption of new processes", probability: "Medium", impact: "Medium" },
        ],
        issues: [],
      },
    ],
  },
  Consulting: {
    portfolioName: "Client Delivery Excellence",
    portfolioDescription: "Improve project delivery methodology and client satisfaction",
    projects: [
      {
        name: "Project Management Standardization",
        description: "Implement standardized PM methodology across all practices",
        status: "Execution",
        priority: "High",
        health: "Green",
        milestones: [
          { title: "Methodology Documentation", description: "PM methodology fully documented" },
          { title: "Training Program Launched", description: "All PMs trained on new methodology" },
          { title: "Tools Implementation", description: "PM tools deployed and configured" },
        ],
        risks: [
          { title: "Consultant Resistance", description: "Senior consultants may prefer existing methods", probability: "Medium", impact: "Medium" },
        ],
        issues: [],
      },
      {
        name: "Knowledge Management Platform",
        description: "Centralized platform for sharing expertise and best practices",
        status: "Planning",
        priority: "Medium",
        health: "Green",
        milestones: [
          { title: "Platform Requirements Defined", description: "Knowledge management needs documented" },
          { title: "Content Migration Plan", description: "Plan for migrating existing knowledge assets" },
        ],
        risks: [
          { title: "Content Quality", description: "Ensuring high-quality, current content", probability: "High", impact: "Low" },
        ],
        issues: [],
      },
    ],
  },
};

const defaultTemplate: IndustryTemplateData = {
  portfolioName: "Strategic Initiatives",
  portfolioDescription: "Key projects and initiatives for organizational success",
  projects: [
    {
      name: "Digital Transformation Project",
      description: "Modernize systems and processes for improved efficiency",
      status: "Execution",
      priority: "High",
      health: "Green",
      milestones: [
        { title: "Assessment Complete", description: "Current state assessment finished" },
        { title: "Solution Design Approved", description: "Target solution designed and approved" },
        { title: "Implementation Phase 1", description: "First phase of implementation complete" },
      ],
      risks: [
        { title: "Resource Availability", description: "Key resources may be pulled for other priorities", probability: "Medium", impact: "Medium" },
        { title: "Scope Creep", description: "Additional requirements may expand scope", probability: "High", impact: "Medium" },
      ],
      issues: [
        { title: "Budget Approval Pending", description: "Phase 2 budget pending final approval", priority: "Medium", type: "Task" },
      ],
    },
    {
      name: "Process Improvement Initiative",
      description: "Streamline core business processes",
      status: "Planning",
      priority: "Medium",
      health: "Green",
      milestones: [
        { title: "Process Mapping Complete", description: "All core processes documented" },
        { title: "Improvement Plan Approved", description: "Improvement opportunities identified and prioritized" },
      ],
      risks: [
        { title: "Change Resistance", description: "Staff may resist process changes", probability: "Medium", impact: "Low" },
      ],
      issues: [],
    },
  ],
};

function getIndustryTemplate(industry: string): IndustryTemplateData {
  return industryTemplates[industry] || defaultTemplate;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    + '-' + Math.random().toString(36).substring(2, 8);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function completeOnboarding(
  userId: string,
  data: OnboardingData
): Promise<{ organization: any; portfolio?: any; projects?: any[] }> {
  const slug = generateSlug(data.companyName);
  
  const [organization] = await db.insert(organizations).values({
    name: data.companyName,
    slug,
    description: `${data.companyName} organization`,
    ownerId: userId,
  }).returning();
  
  await db.insert(organizationMembers).values({
    organizationId: organization.id,
    userId,
    role: 'org_admin',
  });
  
  await db.update(users)
    .set({ onboardingCompleted: true })
    .where(eq(users.id, userId));
  
  if (!data.createDemoData) {
    return { organization };
  }
  
  const template = getIndustryTemplate(data.industry);
  const today = new Date();
  
  const [portfolio] = await db.insert(portfolios).values({
    organizationId: organization.id,
    name: template.portfolioName,
    description: template.portfolioDescription,
    strategy: `${data.industry} industry best practices`,
    managerId: userId,
    isDemo: true,
  }).returning();
  
  const createdProjects: any[] = [];
  
  for (let i = 0; i < template.projects.length; i++) {
    const projectTemplate = template.projects[i];
    const startOffset = i * 30;
    const endOffset = startOffset + 120;
    
    const [project] = await db.insert(projects).values({
      organizationId: organization.id,
      portfolioId: portfolio.id,
      name: projectTemplate.name,
      description: projectTemplate.description,
      status: projectTemplate.status,
      priority: projectTemplate.priority,
      health: projectTemplate.health,
      startDate: formatDate(addDays(today, startOffset - 30)),
      endDate: formatDate(addDays(today, endOffset)),
      budget: String((Math.floor(Math.random() * 500) + 100) * 1000),
      managerId: userId,
      completionPercentage: Math.floor(Math.random() * 60) + 10,
      source: 'manual',
      isDemo: true,
    }).returning();
    
    createdProjects.push(project);
    
    for (let j = 0; j < projectTemplate.milestones.length; j++) {
      const milestone = projectTemplate.milestones[j];
      await db.insert(milestones).values({
        projectId: project.id,
        title: milestone.title,
        description: milestone.description,
        dueDate: formatDate(addDays(today, startOffset + (j + 1) * 20)),
        startDate: formatDate(addDays(today, startOffset + j * 20)),
        completed: j === 0,
        status: j === 0 ? 'Done' : j === 1 ? 'In Progress' : 'Backlog',
        priority: 'Medium',
        isDemo: true,
      });
    }
    
    for (const risk of projectTemplate.risks) {
      await db.insert(risks).values({
        projectId: project.id,
        title: risk.title,
        description: risk.description,
        probability: risk.probability,
        impact: risk.impact,
        status: 'Open',
        isDemo: true,
      });
    }
    
    for (const issue of projectTemplate.issues) {
      await db.insert(issues).values({
        projectId: project.id,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        status: 'Open',
        type: issue.type,
        isDemo: true,
      });
    }
  }
  
  return { organization, portfolio, projects: createdProjects };
}

export async function getUserOnboardingStatus(userId: string): Promise<{
  needsOnboarding: boolean;
  detectedCompany: string | null;
  detectedIndustry: string | null;
  hasOrganization: boolean;
}> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  
  if (!user) {
    return {
      needsOnboarding: false,
      detectedCompany: null,
      detectedIndustry: null,
      hasOrganization: false,
    };
  }
  
  const userOrgs = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, userId));
  const hasOrganization = userOrgs.length > 0;
  
  return {
    needsOnboarding: !user.onboardingCompleted && !hasOrganization,
    detectedCompany: user.detectedCompany || null,
    detectedIndustry: user.detectedIndustry || null,
    hasOrganization,
  };
}

function domainToSlug(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/\./g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export async function ensureUserOrganization(userId: string, email: string): Promise<{
  organization: typeof organizations.$inferSelect | null;
  created: boolean;
  role: string;
}> {
  const userOrgs = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, userId));
  
  if (userOrgs.length > 0) {
    const [existingOrg] = await db.select().from(organizations).where(eq(organizations.id, userOrgs[0].organizationId)).limit(1);
    return { organization: existingOrg || null, created: false, role: userOrgs[0].role };
  }

  const domain = extractDomain(email);
  if (!domain || isPersonalEmailDomain(domain)) {
    return { organization: null, created: false, role: '' };
  }

  const domainSlug = domainToSlug(domain);
  
  // Only match active (non-deactivated) organizations
  const [existingOrg] = await db.select().from(organizations)
    .where(and(
      eq(organizations.slug, domainSlug),
      isNull(organizations.deactivatedAt)
    ))
    .limit(1);
  
  if (existingOrg) {
    const existingMembership = await db.select().from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, existingOrg.id),
        eq(organizationMembers.userId, userId)
      ))
      .limit(1);
    
    if (existingMembership.length === 0) {
      const memberCount = await db.select().from(organizationMembers)
        .where(eq(organizationMembers.organizationId, existingOrg.id));
      
      const role = memberCount.length === 0 ? 'org_admin' : 'member';
      
      await db.insert(organizationMembers).values({
        organizationId: existingOrg.id,
        userId,
        role,
      });
      
      return { organization: existingOrg, created: false, role };
    }
    
    return { organization: existingOrg, created: false, role: existingMembership[0].role };
  }

  let companyName = domain.split('.')[0];
  companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1);
  
  try {
    const companyInfo = await lookupCompanyByDomain(domain);
    if (companyInfo.companyName && !companyInfo.isPersonalEmail) {
      companyName = companyInfo.companyName;
    }
  } catch (error) {
    console.error('Company lookup failed during auto-org creation:', error);
  }

  const [newOrg] = await db.insert(organizations).values({
    name: companyName,
    slug: domainSlug,
    description: `${companyName} organization`,
    ownerId: userId,
  }).returning();

  await db.insert(organizationMembers).values({
    organizationId: newOrg.id,
    userId,
    role: 'org_admin',
  });

  await db.update(users)
    .set({ 
      onboardingCompleted: true,
      detectedCompany: companyName,
    })
    .where(eq(users.id, userId));

  console.log(`Auto-created organization "${companyName}" for domain "${domain}" with user ${userId} as org_admin`);

  return { organization: newOrg, created: true, role: 'org_admin' };
}
