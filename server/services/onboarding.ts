import { db } from "../db";
import { users, organizations, organizationMembers, portfolios, projects, issues, tasks, resources, changeRequests, projectIntakes, subscriptions } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { extractDomain, isPersonalEmailDomain } from "./companyLookup";

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
  const existingMemberships = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, userId));
  let organization: any;
  
  if (existingMemberships.length > 0) {
    const [existingOrg] = await db.select().from(organizations).where(eq(organizations.id, existingMemberships[0].organizationId)).limit(1);
    organization = existingOrg;

    const existingSub = await db.select().from(subscriptions).where(eq(subscriptions.orgId, organization.id)).limit(1);
    if (existingSub.length === 0) {
      try {
        const { billingProvider } = await import("./billing");
        await billingProvider.createSubscription({
          planCode: "FREE",
          orgId: organization.id,
          userId,
        });
      } catch (billingErr) {
        console.error("Failed to assign FREE plan to existing organization:", billingErr);
      }
    }
  } else {
    const slug = generateSlug(data.companyName);
    [organization] = await db.insert(organizations).values({
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

    try {
      const { billingProvider } = await import("./billing");
      await billingProvider.createSubscription({
        planCode: "FREE",
        orgId: organization.id,
        userId,
      });
    } catch (billingErr) {
      console.error("Failed to assign FREE plan to organization during onboarding:", billingErr);
    }
  }
  
  await db.update(users)
    .set({ onboardingCompleted: true })
    .where(eq(users.id, userId));
  
  if (!data.createDemoData) {
    return { organization };
  }
  
  const result = await generateSampleDataForOrg(userId, organization.id, data.industry);
  return { organization, portfolio: result.portfolio, projects: result.projects };
}

export async function generateSampleDataForOrg(
  userId: string,
  organizationId: number,
  industry: string = "General"
): Promise<{ portfolio: any; projects: any[] }> {
  const template = getIndustryTemplate(industry);
  const today = new Date();
  
  const [portfolio] = await db.insert(portfolios).values({
    organizationId,
    name: template.portfolioName,
    description: template.portfolioDescription,
    strategy: `${industry} industry best practices`,
    managerId: userId,
    isDemo: true,
  }).returning();
  
  const createdProjects: any[] = [];
  
  for (let i = 0; i < template.projects.length; i++) {
    const projectTemplate = template.projects[i];
    const startOffset = i * 30;
    const endOffset = startOffset + 120;
    
    const [project] = await db.insert(projects).values({
      organizationId,
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
      await db.insert(tasks).values({
        projectId: project.id,
        name: milestone.title,
        description: milestone.description,
        endDate: formatDate(addDays(today, startOffset + (j + 1) * 20)),
        startDate: formatDate(addDays(today, startOffset + j * 20)),
        status: j === 0 ? 'Done' : j === 1 ? 'In Progress' : 'Backlog',
        progress: j === 0 ? 100 : 0,
        priority: 'Medium',
        taskType: 'Milestone',
        isMilestone: true,
        isDemo: true,
      });
    }
    
    for (const risk of projectTemplate.risks) {
      await db.insert(issues).values({
        projectId: project.id,
        title: risk.title,
        description: risk.description,
        probability: risk.probability,
        impact: risk.impact,
        status: 'Open',
        itemType: 'risk',
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
    
    // Add demo change requests for each project
    const changeRequestTemplates = [
      { title: 'Scope Expansion Request', description: 'Additional features requested by stakeholders', type: 'Scope', priority: 'High', justification: 'Business requirement change based on market feedback' },
      { title: 'Timeline Adjustment', description: 'Schedule change due to resource constraints', type: 'Schedule', priority: 'Medium', justification: 'Resource availability requires timeline shift' },
    ];
    
    for (let crIdx = 0; crIdx < changeRequestTemplates.length; crIdx++) {
      const crTemplate = changeRequestTemplates[crIdx];
      await db.insert(changeRequests).values({
        projectId: project.id,
        requestNumber: `CR-${String(project.id).padStart(3, '0')}-${String(crIdx + 1).padStart(2, '0')}`,
        title: crTemplate.title,
        description: crTemplate.description,
        justification: crTemplate.justification,
        type: crTemplate.type,
        priority: crTemplate.priority,
        status: crIdx === 0 ? 'Under Review' : 'Draft',
        requestedBy: 'Demo User',
        requestedDate: formatDate(addDays(today, -10 + crIdx * 5)),
        isDemo: true,
      });
    }
  }
  
  // Add demo resources
  const resourceTemplates = [
    { name: 'John Smith', email: 'john.smith@demo.com', title: 'Senior Project Manager', department: 'Project Management', skills: 'Agile,Scrum,PMP,Risk Management' },
    { name: 'Sarah Johnson', email: 'sarah.johnson@demo.com', title: 'Business Analyst', department: 'Business Analysis', skills: 'Requirements,BPMN,SQL,Data Analysis' },
    { name: 'Michael Chen', email: 'michael.chen@demo.com', title: 'Technical Lead', department: 'Engineering', skills: 'Architecture,Cloud,DevOps,Python' },
    { name: 'Emily Rodriguez', email: 'emily.rodriguez@demo.com', title: 'UX Designer', department: 'Design', skills: 'Figma,User Research,Prototyping,CSS' },
    { name: 'David Kim', email: 'david.kim@demo.com', title: 'Developer', department: 'Engineering', skills: 'React,TypeScript,Node.js,PostgreSQL' },
  ];
  
  for (const resourceTemplate of resourceTemplates) {
    await db.insert(resources).values({
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
  }
  
  // Add demo project intakes (pipeline items)
  const intakeTemplates = [
    { name: 'Customer Portal Enhancement', status: 'submitted', businessUnit: 'Customer Success', funding: 'Business Funded', budget: '450000', description: 'Enhance self-service capabilities in customer portal' },
    { name: 'Data Analytics Platform', status: 'approved', businessUnit: 'Data & Analytics', funding: 'IT Funded', budget: '800000', description: 'Enterprise data analytics and reporting platform' },
    { name: 'Mobile App v3.0', status: 'draft', businessUnit: 'Digital', funding: 'Shared', budget: '350000', description: 'Major mobile application redesign and feature update' },
    { name: 'Security Compliance Upgrade', status: 'submitted', businessUnit: 'IT Security', funding: 'IT Funded', budget: '275000', description: 'SOC2 and ISO compliance infrastructure updates' },
  ];
  
  const year = today.getFullYear();
  for (let intakeIdx = 0; intakeIdx < intakeTemplates.length; intakeIdx++) {
    const intakeTemplate = intakeTemplates[intakeIdx];
    await db.insert(projectIntakes).values({
      organizationId,
      intakeNumber: `INT-${year}-${String(intakeIdx + 1).padStart(3, '0')}`,
      projectName: intakeTemplate.name,
      description: intakeTemplate.description,
      status: intakeTemplate.status,
      businessUnit: intakeTemplate.businessUnit,
      fundingSource: intakeTemplate.funding,
      estimatedBudget: intakeTemplate.budget,
      portfolioId: portfolio.id,
      submitterId: userId,
      currentStep: intakeTemplate.status === 'approved' ? 'pmo_approved' : 'basic_info',
      basicInfoComplete: true,
      isDemo: true,
    });
  }
  
  return { portfolio, projects: createdProjects };
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
    if (existingOrg) {
      const existingSub = await db.select().from(subscriptions).where(eq(subscriptions.orgId, existingOrg.id)).limit(1);
      if (existingSub.length === 0) {
        try {
          const { billingProvider } = await import("./billing");
          await billingProvider.createSubscription({
            planCode: "FREE",
            orgId: existingOrg.id,
            userId,
          });
        } catch (billingErr) {
          console.error("Failed to assign FREE plan to existing organization:", billingErr);
        }
      }
    }
    return { organization: existingOrg || null, created: false, role: userOrgs[0].role };
  }

  const domain = extractDomain(email);
  const isPersonal = !domain || isPersonalEmailDomain(domain);
  
  // Get user info for naming the organization
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  
  let companyName: string;
  let slugBase: string;
  
  if (isPersonal) {
    // For personal emails, use user's name or fallback to "Personal Workspace"
    if (user?.firstName) {
      companyName = `${user.firstName}'s Workspace`;
      // Sanitize the slug: lowercase, replace non-alphanumeric with hyphens, remove consecutive hyphens
      slugBase = `${user.firstName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}-workspace`;
    } else {
      companyName = 'Personal Workspace';
      slugBase = 'personal-workspace';
    }
  } else {
    const domainSlug = domainToSlug(domain);
    slugBase = domainSlug;
    
    // Use the domain name as the organization name (formatted nicely)
    // e.g., "saltyfreedomusa.com" -> "Saltyfreedomusa"
    companyName = domain.split('.')[0];
    companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1);
    
    // Check if user has a detected company name already set (from registration)
    if (user?.detectedCompany) {
      companyName = user.detectedCompany;
    }
  }

  // Always generate a unique slug for new organizations
  let finalSlug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;

  const [newOrg] = await db.insert(organizations).values({
    name: companyName,
    slug: finalSlug,
    description: `${companyName} organization`,
    ownerId: userId,
  }).returning();

  await db.insert(organizationMembers).values({
    organizationId: newOrg.id,
    userId,
    role: 'org_admin',
  });

  try {
    const { billingProvider } = await import("./billing");
    await billingProvider.createSubscription({
      planCode: "FREE",
      orgId: newOrg.id,
      userId,
    });
  } catch (billingErr) {
    console.error("Failed to assign FREE plan to auto-created organization:", billingErr);
  }

  await db.update(users)
    .set({ 
      onboardingCompleted: true,
      detectedCompany: companyName,
    })
    .where(eq(users.id, userId));

  console.log(`Auto-created organization "${companyName}" for domain "${domain}" with user ${userId} as org_admin`);

  return { organization: newOrg, created: true, role: 'org_admin' };
}
