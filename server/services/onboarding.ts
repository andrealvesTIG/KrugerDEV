import { db } from "../db";
import {
  users,
  organizations,
  organizationMembers,
  portfolios,
  portfolioKeyDates,
  projects,
  issues,
  tasks,
  taskDependencies,
  taskResourceAssignments,
  milestones,
  resources,
  changeRequests,
  projectIntakes,
  subscriptions,
  financialEntries,
} from "@shared/schema";
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
  "Capital Projects": {
    portfolioName: "Capital Project Portfolio",
    portfolioDescription: "Owner-side capital projects from front-end loading through execution and turnover",
    projects: [
      {
        name: "FEL 3 — Front-End Loading (Process Plant)",
        description: "Mature project definition through FEED, Class 3 estimate, integrated L3 schedule, and external benchmarking ahead of FID.",
        status: "Planning",
        priority: "High",
        health: "Green",
        milestones: [
          { title: "FEED 30% Review Complete", description: "30% engineering deliverables reviewed and accepted" },
          { title: "Class 3 Estimate Issued", description: "AACE Class 3 estimate (±15%) issued to sponsors" },
          { title: "FID / Sanction Approved", description: "Final investment decision approved at stage gate" },
        ],
        risks: [
          { title: "Long-Lead Equipment Slippage", description: "Vendor lead times for compressors / vessels could push the integrated schedule", probability: "Medium", impact: "High" },
          { title: "Permit Delays", description: "Air / water permit approvals may extend the FEED-to-FID window", probability: "Medium", impact: "High" },
          { title: "Estimate Accuracy", description: "Scope gaps could break the ±15% Class 3 accuracy band", probability: "Medium", impact: "High" },
        ],
        issues: [
          { title: "PFD vs P&ID Mismatch", description: "Process flow updates not yet reflected in P&IDs — blocking 60% IDR", priority: "High", type: "Bug" },
        ],
      },
      {
        name: "EPC Execution — Process Plant",
        description: "Detailed engineering, procurement, fabrication, construction, mechanical completion, and commissioning of a process plant.",
        status: "Execution",
        priority: "Critical",
        health: "Yellow",
        milestones: [
          { title: "IFC Drawings Released", description: "Issued-for-construction package released to site" },
          { title: "Major Equipment On-Site", description: "Rotating equipment, vessels, and switchgear delivered" },
          { title: "Mechanical Completion", description: "Construction complete and ready for commissioning" },
          { title: "Care, Custody & Control", description: "CCC transferred from EPC contractor to owner operations" },
        ],
        risks: [
          { title: "Productivity Below Plan", description: "Field labor productivity tracking below estimate baseline", probability: "High", impact: "High" },
          { title: "Subcontractor Default", description: "Mechanical sub financial distress could force replacement mid-execution", probability: "Low", impact: "Critical" },
          { title: "Commissioning Punch List Growth", description: "Late discovery items could extend RFSU window", probability: "Medium", impact: "Medium" },
        ],
        issues: [
          { title: "RFI Backlog > 14 Days", description: "Engineering RFI response time exceeding contract SLA", priority: "High", type: "Task" },
        ],
      },
    ],
  },
  "Project Controls": {
    portfolioName: "Project Controls Excellence",
    portfolioDescription: "Cost, schedule, change, and earned-value standards across the capital portfolio",
    projects: [
      {
        name: "Earned Value Management Rollout",
        description: "Stand up EVM (PV / EV / AC, CPI, SPI, EAC, VAC) across the capital portfolio with monthly performance reporting.",
        status: "Execution",
        priority: "High",
        health: "Green",
        milestones: [
          { title: "Cost & Schedule Baselines Locked", description: "Performance measurement baselines (PMB) frozen for pilot projects" },
          { title: "Monthly EVM Cycle Live", description: "First monthly CPI / SPI / EAC report issued to sponsors" },
          { title: "Forecast (EAC) Reconciliation", description: "Bottom-up EAC reconciled to top-down EAC for all pilot projects" },
        ],
        risks: [
          { title: "% Complete Subjectivity", description: "Inconsistent earning rules across PMs distorts CPI / SPI", probability: "High", impact: "Medium" },
          { title: "Source-System Data Gaps", description: "Actual cost feed from ERP missing commitments and accruals", probability: "Medium", impact: "High" },
        ],
        issues: [
          { title: "WBS Misaligned to Cost Codes", description: "Schedule WBS doesn't roll up cleanly to ERP cost codes", priority: "High", type: "Task" },
        ],
      },
      {
        name: "Integrated Cost & Schedule Reporting",
        description: "Build a single pane of glass: integrated L3 schedule, cost-loaded resources, change log, and risk-adjusted forecast.",
        status: "Planning",
        priority: "Medium",
        health: "Green",
        milestones: [
          { title: "Reporting Standards Approved", description: "Owner reporting standards for cost / schedule / change documented" },
          { title: "Pilot Dashboard Live", description: "Pilot project displaying integrated CPI / SPI / change / forecast" },
        ],
        risks: [
          { title: "Schedule Quality (DCMA-14)", description: "Contractor schedules failing DCMA-14 metrics (logic, float, lags)", probability: "High", impact: "Medium" },
        ],
        issues: [],
      },
    ],
  },
  "Industrial Automation": {
    portfolioName: "Industrial Automation Program",
    portfolioDescription: "PLC / SCADA, robotics, IIoT, and OT cybersecurity projects across the plant",
    projects: [
      {
        name: "PLC & SCADA Migration",
        description: "Replace end-of-life PLCs and SCADA: code conversion, I/O rewire, HMI redevelopment, FAT, SAT, and phased cutover with minimal downtime.",
        status: "Execution",
        priority: "High",
        health: "Yellow",
        milestones: [
          { title: "Logic Redesign Complete", description: "PLC logic ported to target platform and peer-reviewed" },
          { title: "Factory Acceptance Test Pass", description: "Simulated FAT signed off by ops and engineering" },
          { title: "Site Acceptance Test Pass", description: "On-site loop checks and SAT complete" },
          { title: "Hot Cutover Complete", description: "Production cut over within planned outage window" },
        ],
        risks: [
          { title: "Cutover Window Overrun", description: "Hot cutover could exceed planned shutdown and impact production", probability: "Medium", impact: "High" },
          { title: "I/O Mapping Errors", description: "Legacy as-built drawings out of date — wiring errors likely", probability: "High", impact: "Medium" },
          { title: "Operator Familiarity", description: "New HMI screens require operator retraining before stable run", probability: "Medium", impact: "Medium" },
        ],
        issues: [
          { title: "Spare Parts Strategy Undefined", description: "Spares for new platform not yet stocked at site stores", priority: "Medium", type: "Task" },
        ],
      },
      {
        name: "OT Cybersecurity Program (IEC 62443)",
        description: "Stand up an OT cybersecurity program: passive asset inventory, zones & conduits, secure remote access, OT detection / SIEM, and IR playbooks.",
        status: "Planning",
        priority: "Critical",
        health: "Green",
        milestones: [
          { title: "OT Asset Inventory Baseline", description: "Passive discovery completed across plant networks" },
          { title: "Zones & Conduits Designed", description: "ISA/IEC 62443 zones and conduits designed and reviewed" },
          { title: "Secure Remote Access Live", description: "Vendor remote access routed through hardened jump host with MFA" },
        ],
        risks: [
          { title: "Patch Window Constraints", description: "Patching OT endpoints requires coordinated production windows", probability: "High", impact: "Medium" },
          { title: "Vendor Remote Access Sprawl", description: "Multiple OEM remote-access tools bypass corporate controls", probability: "High", impact: "High" },
        ],
        issues: [],
      },
    ],
  },
  Construction: {
    portfolioName: "Construction Delivery Program",
    portfolioDescription: "Owner / GC delivery of vertical and horizontal construction across CSI MasterFormat divisions",
    projects: [
      {
        name: "Commercial Construction (CSI MasterFormat)",
        description: "Owner / general contractor delivery of a commercial building: pre-construction, sitework, structure, envelope, MEP rough-in & trim, finishes, and turnover.",
        status: "Execution",
        priority: "High",
        health: "Yellow",
        milestones: [
          { title: "Notice to Proceed", description: "GMP signed and NTP issued to GC" },
          { title: "Building Dried In", description: "Envelope complete — interior trades can mobilize" },
          { title: "MEP Trim Out Complete", description: "MEP systems trimmed out and ready for T&B" },
          { title: "Substantial Completion", description: "Certificate of occupancy issued and turnover to owner" },
        ],
        risks: [
          { title: "Submittal Backlog", description: "Long-lead submittal approvals slipping behind procurement plan", probability: "High", impact: "High" },
          { title: "Weather Days", description: "Site is outdoor through structure / envelope phases — weather contingency at risk", probability: "High", impact: "Medium" },
          { title: "Skilled Labor Availability", description: "Local market shortage of MEP skilled labor", probability: "Medium", impact: "High" },
        ],
        issues: [
          { title: "RFI #142 Open > 21 Days", description: "Structural connection RFI awaiting EOR response — holding steel detailer", priority: "High", type: "Task" },
        ],
      },
      {
        name: "Highway Bridge Construction",
        description: "DOT-led highway bridge: traffic management, foundations, substructure, superstructure erection, deck pour, and approach works.",
        status: "Planning",
        priority: "Medium",
        health: "Green",
        milestones: [
          { title: "Traffic Management Plan Approved", description: "DOT-approved TMP issued ahead of mobilization" },
          { title: "Substructure Complete", description: "Piles, footings, abutments, and piers complete" },
          { title: "Superstructure Erected", description: "Girders and diaphragms erected" },
          { title: "Open to Traffic", description: "Punch list cleared and bridge opened to traffic" },
        ],
        risks: [
          { title: "Utility Relocation Delays", description: "Third-party utility relocations could delay foundation start", probability: "Medium", impact: "High" },
          { title: "Concrete Pour Weather Window", description: "Deck pour requires temperature window — narrow seasonal window", probability: "Medium", impact: "Medium" },
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
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1..12

  // ── 1. Resources first ──────────────────────────────────────────────
  // Created up-front so tasks can be assigned to them in the project
  // loop below. The exact list is intentionally generic (industry-
  // agnostic role coverage: PM, BA, lead, designer, developer).
  const resourceTemplates = [
    { name: 'John Smith', email: 'john.smith@demo.com', title: 'Senior Project Manager', department: 'Project Management', skills: 'Agile,Scrum,PMP,Risk Management' },
    { name: 'Sarah Johnson', email: 'sarah.johnson@demo.com', title: 'Business Analyst', department: 'Business Analysis', skills: 'Requirements,BPMN,SQL,Data Analysis' },
    { name: 'Michael Chen', email: 'michael.chen@demo.com', title: 'Technical Lead', department: 'Engineering', skills: 'Architecture,Cloud,DevOps,Python' },
    { name: 'Emily Rodriguez', email: 'emily.rodriguez@demo.com', title: 'UX Designer', department: 'Design', skills: 'Figma,User Research,Prototyping,CSS' },
    { name: 'David Kim', email: 'david.kim@demo.com', title: 'Developer', department: 'Engineering', skills: 'React,TypeScript,Node.js,PostgreSQL' },
  ];

  const createdResources: Array<{ id: number; displayName: string }> = [];
  for (const resourceTemplate of resourceTemplates) {
    const [r] = await db.insert(resources).values({
      organizationId,
      displayName: resourceTemplate.name,
      email: resourceTemplate.email,
      title: resourceTemplate.title,
      department: resourceTemplate.department,
      skills: resourceTemplate.skills,
      hourlyRate: Math.floor(Math.random() * 100) + 80,
      isActive: true,
      isDemo: true,
    }).returning({ id: resources.id, displayName: resources.displayName });
    createdResources.push(r);
  }

  // ── 2. Portfolio + portfolio key dates ──────────────────────────────
  const [portfolio] = await db.insert(portfolios).values({
    organizationId,
    name: template.portfolioName,
    description: template.portfolioDescription,
    strategy: `${industry} industry best practices`,
    managerId: userId,
    isDemo: true,
  }).returning();

  // Portfolio-level key dates so the Portfolio overview renders a
  // populated timeline instead of an empty state.
  const keyDateTemplates = [
    { title: 'Portfolio Kickoff', type: 'Milestone', daysFromToday: -30, status: 'Completed', completed: true },
    { title: 'Q2 Steering Committee Review', type: 'Review', daysFromToday: 45, status: 'Upcoming', completed: false },
    { title: 'Mid-Year Budget Reforecast', type: 'Deadline', daysFromToday: 90, status: 'Upcoming', completed: false },
    { title: 'Annual Portfolio Close-Out', type: 'Milestone', daysFromToday: 270, status: 'Upcoming', completed: false },
  ];
  for (const kd of keyDateTemplates) {
    await db.insert(portfolioKeyDates).values({
      portfolioId: portfolio.id,
      organizationId,
      title: kd.title,
      keyDateType: kd.type,
      date: formatDate(addDays(today, kd.daysFromToday)),
      status: kd.status,
      completed: kd.completed,
      createdBy: userId,
      isDemo: true,
    });
  }

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
      budget: (Math.floor(Math.random() * 500) + 100) * 1000,
      managerId: userId,
      completionPercentage: Math.floor(Math.random() * 60) + 10,
      source: 'manual',
      isDemo: true,
    }).returning();

    createdProjects.push(project);

    // ── 3a. Milestone tasks (with IDs captured for deps + assignments)
    const createdTaskIds: number[] = [];
    for (let j = 0; j < projectTemplate.milestones.length; j++) {
      const milestone = projectTemplate.milestones[j];
      const dueDate = formatDate(addDays(today, startOffset + (j + 1) * 20));
      const startDate = formatDate(addDays(today, startOffset + j * 20));
      const status = j === 0 ? 'Completed' : j === 1 ? 'In Progress' : 'Not Started';

      const [t] = await db.insert(tasks).values({
        projectId: project.id,
        name: milestone.title,
        description: milestone.description,
        endDate: dueDate,
        startDate,
        status,
        progress: j === 0 ? 100 : j === 1 ? 40 : 0,
        priority: 'Medium',
        taskType: 'Milestone',
        isMilestone: true,
        isDemo: true,
      }).returning({ id: tasks.id });
      createdTaskIds.push(t.id);

      // Mirror the same milestone into the dedicated `milestones` table
      // so pages that read from there (governance/phase-gate views)
      // also see populated demo data.
      await db.insert(milestones).values({
        projectId: project.id,
        organizationId,
        milestoneNumber: `MS-${String(project.id).padStart(3, '0')}-${String(j + 1).padStart(2, '0')}`,
        title: milestone.title,
        description: milestone.description,
        milestoneType: j === projectTemplate.milestones.length - 1 ? 'Phase Gate' : 'Deliverable',
        dueDate,
        baselineDueDate: dueDate,
        startDate,
        completed: status === 'Completed',
        actualCompletionDate: status === 'Completed' ? dueDate : null,
        status,
        priority: 'Medium',
        ownerId: userId,
        isDemo: true,
      });
    }

    // ── 3b. Task dependencies (finish-to-start chain across milestones)
    for (let depIdx = 1; depIdx < createdTaskIds.length; depIdx++) {
      await db.insert(taskDependencies).values({
        taskId: createdTaskIds[depIdx],
        dependsOnTaskId: createdTaskIds[depIdx - 1],
        dependencyType: 'finish-to-start',
        lagDays: 0,
        isDemo: true,
      });
    }

    // ── 3c. Task → resource assignments (round-robin so every demo
    //         resource shows up on at least one task across the portfolio)
    for (let asgnIdx = 0; asgnIdx < createdTaskIds.length; asgnIdx++) {
      const resource = createdResources[(i * 2 + asgnIdx) % createdResources.length];
      if (!resource) continue;
      await db.insert(taskResourceAssignments).values({
        taskId: createdTaskIds[asgnIdx],
        resourceId: resource.id,
        allocationPercentage: 50,
        role: asgnIdx === 0 ? 'Lead' : 'Support',
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

    // ── 3d. Financial entries — populate the Financials grid with three
    //         line items (Capital / Direct Expense / Labor) across the
    //         current calendar year. Each item gets 36 cells: AOP +
    //         Forecast for all 12 months, plus Actuals for past months.
    //         Storage is calendar-anchored (server translates to the
    //         org's fiscal-month index at the API boundary).
    const financialItems = [
      {
        suffix: 'eng-labor',
        itemName: 'Engineering Labor',
        financialView: 'Labor',
        costCategory: 'Engineering',
        costSpecification: 'In-House',
        category: 'Direct Expense',
        wbs: '1.1',
        aopMonthly: 65000,
        fcstMonthly: 67500,
        actMonthly: 64200,
      },
      {
        suffix: 'equipment',
        itemName: 'Equipment & Hardware',
        financialView: 'Capital',
        costCategory: 'Equipment',
        costSpecification: 'Purchased',
        category: 'Capital',
        wbs: '2.1',
        aopMonthly: 42000,
        fcstMonthly: 45500,
        actMonthly: 41000,
      },
      {
        suffix: 'software',
        itemName: 'Software & Licenses',
        financialView: 'Direct Expense',
        costCategory: 'Software',
        costSpecification: 'Subscription',
        category: 'OpEx',
        wbs: '3.1',
        aopMonthly: 18000,
        fcstMonthly: 19500,
        actMonthly: 17800,
      },
    ];

    const financialRows: Array<typeof financialEntries.$inferInsert> = [];
    for (let fIdx = 0; fIdx < financialItems.length; fIdx++) {
      const item = financialItems[fIdx];
      const itemKey = `demo-${project.id}-${item.suffix}`;
      const scenarios: Array<{ s: 'aop' | 'fcst' | 'act'; base: number }> = [
        { s: 'aop', base: item.aopMonthly },
        { s: 'fcst', base: item.fcstMonthly },
        { s: 'act', base: item.actMonthly },
      ];
      for (const { s, base } of scenarios) {
        for (let m = 1; m <= 12; m++) {
          // Don't seed actuals into the future — only past + current month.
          if (s === 'act' && m > currentMonth) continue;
          // Small seasonal sine wave (±15%) so charts have variance.
          const seasonal = 1 + 0.15 * Math.sin(((m - 1) / 12) * 2 * Math.PI);
          const amount = Math.round(base * seasonal);
          financialRows.push({
            projectId: project.id,
            fiscalYear: currentYear,
            scenario: s,
            month: m,
            amount,
            itemKey,
            itemName: item.itemName,
            financialView: item.financialView,
            costCategory: item.costCategory,
            costSpecification: item.costSpecification,
            category: item.category,
            wbs: item.wbs,
            sortOrder: fIdx,
            isDemo: true,
          });
        }
      }
    }
    if (financialRows.length > 0) {
      await db.insert(financialEntries).values(financialRows);
    }
  }
  
  // Add demo project intakes (pipeline items)
  const intakeTemplates = [
    { name: 'Customer Portal Enhancement', status: 'in_progress', businessUnit: 'Customer Success', funding: 'Business Funded', budget: '450000', description: 'Enhance self-service capabilities in customer portal' },
    { name: 'Data Analytics Platform', status: 'approved', businessUnit: 'Data & Analytics', funding: 'IT Funded', budget: '800000', description: 'Enterprise data analytics and reporting platform' },
    { name: 'Mobile App v3.0', status: 'draft', businessUnit: 'Digital', funding: 'Shared', budget: '350000', description: 'Major mobile application redesign and feature update' },
    { name: 'Security Compliance Upgrade', status: 'in_progress', businessUnit: 'IT Security', funding: 'IT Funded', budget: '275000', description: 'SOC2 and ISO compliance infrastructure updates' },
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
      estimatedBudget: Number(intakeTemplate.budget),
      portfolioId: portfolio.id,
      submitterId: userId,
      currentStep: intakeTemplate.status === 'approved' ? 'pmo_approved' : 'basic_info',
      basicInfoComplete: true,
      isDemo: true,
    });
  }
  
  return { portfolio, projects: createdProjects };
}

export const SUPPORTED_ONBOARDING_INDUSTRIES = [
  "Capital Projects",
  "Project Controls",
  "Industrial Automation",
  "Construction",
] as const;

export type SupportedOnboardingIndustry = typeof SUPPORTED_ONBOARDING_INDUSTRIES[number];

export async function getOrganizationSetupStatus(
  organizationId: number,
  userId?: string,
): Promise<{
  needsSetup: boolean;
  projectCount: number;
  portfolioCount: number;
  industry: string | null;
  onboardingCompleted: boolean;
}> {
  const [projectRows, portfolioRows, userRow] = await Promise.all([
    db.select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt))),
    db.select({ id: portfolios.id })
      .from(portfolios)
      .where(and(eq(portfolios.organizationId, organizationId), isNull(portfolios.deletedAt))),
    userId
      ? db.select({ onboardingCompleted: users.onboardingCompleted })
          .from(users).where(eq(users.id, userId)).limit(1)
      : Promise.resolve([] as Array<{ onboardingCompleted: boolean | null }>),
  ]);
  const onboardingCompleted = !!userRow[0]?.onboardingCompleted;
  const isEmpty = projectRows.length === 0 && portfolioRows.length === 0;
  return {
    needsSetup: isEmpty && !onboardingCompleted,
    projectCount: projectRows.length,
    portfolioCount: portfolioRows.length,
    industry: null,
    onboardingCompleted,
  };
}

/**
 * Friday-driven org setup. By default refuses if the org already has
 * projects/portfolios so we don't double-seed an active workspace. Pass
 * `force: true` to override and add demo data anyway. Reuses the existing
 * `generateSampleDataForOrg` so we get the same templates the regular
 * onboarding wizard produces.
 */
export async function configureOrganizationFromIndustry(
  userId: string,
  organizationId: number,
  industry: string,
  options: { force?: boolean } = {},
): Promise<{
  success: boolean;
  message: string;
  industry?: string;
  portfolio?: { id: number; name: string } | null;
  projects?: Array<{ id: number; name: string }>;
}> {
  if (!options.force) {
    const status = await getOrganizationSetupStatus(organizationId);
    if (!status.needsSetup) {
      return {
        success: false,
        message: `This workspace already has ${status.projectCount} project${status.projectCount === 1 ? "" : "s"} and ${status.portfolioCount} portfolio${status.portfolioCount === 1 ? "" : "s"}. To avoid duplicating data, the one-click setup only runs on empty workspaces. You can still ask me to create individual projects, tasks, or risks.`,
      };
    }
  }

  const matched = (SUPPORTED_ONBOARDING_INDUSTRIES as readonly string[]).includes(industry)
    ? industry
    : "General";

  const result = await generateSampleDataForOrg(userId, organizationId, matched);

  // Mark this user's onboarding as done so the legacy onboarding dialog
  // doesn't pop up after Friday already configured the workspace.
  try {
    await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, userId));
  } catch (err) {
    console.error("[onboarding] Failed to mark user onboardingCompleted after Friday setup:", err);
  }

  return {
    success: true,
    message: `Configured your workspace with the ${matched} industry template.`,
    industry: matched,
    portfolio: result.portfolio
      ? { id: result.portfolio.id, name: result.portfolio.name }
      : null,
    projects: (result.projects ?? []).map((p: any) => ({ id: p.id, name: p.name })),
  };
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
