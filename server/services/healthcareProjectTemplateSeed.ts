/**
 * Healthcare system template library seeder.
 *
 * Curated plans for hospital/health-system PMOs: EHR/EMR rollouts, HIPAA work,
 * clinical service line stand-ups, accreditation, and digital health programs.
 * Authoring DSL + idempotent upsert live in `./systemTemplateLibrary`.
 */

import {
  seedTemplateLibrary,
  type TemplatePlan,
} from "./systemTemplateLibrary";

const PLANS: TemplatePlan[] = [
  {
    slug: "hc-epic-ehr-implementation",
    name: "Epic EHR Implementation",
    summary: "Vendor-led Epic install: discovery, build, training, dress rehearsal, go-live, and stabilization.",
    description: "End-to-end multi-hospital Epic electronic health record implementation including current-state assessment, application build, integrated testing, end-user training, dress rehearsals, cutover, and post-live optimization.",
    category: "Clinical Systems",
    icon: "Stethoscope",
    phases: [
      {
        slug: "assess",
        name: "Current-State Assessment",
        tasks: [
          { slug: "kickoff", name: "Project kickoff & sponsor alignment", days: 3 },
          { slug: "workflows", name: "Document current clinical workflows", days: 15 },
          { slug: "interfaces", name: "Inventory legacy interfaces & devices", days: 8 },
          { slug: "gap", name: "Gap analysis vs. Epic foundation", days: 5 },
        ],
        milestone: { slug: "ms-assess", name: "Assessment approved" },
      },
      {
        slug: "design",
        name: "Application Design & Build",
        tasks: [
          { slug: "decisions", name: "Workflow design decisions", days: 20 },
          { slug: "ambulatory", name: "Ambulatory build", days: 25 },
          { slug: "inpatient", name: "Inpatient (ClinDoc/Orders) build", days: 30 },
          { slug: "asap", name: "ASAP (ED) build", days: 15 },
          { slug: "anesthesia", name: "Anesthesia & OpTime build", days: 20 },
          { slug: "billing", name: "Resolute Hospital/Pro Billing build", days: 25 },
          { slug: "interfaces-build", name: "Interface build (Bridges)", days: 20 },
          { slug: "reports", name: "Report & dashboard build", days: 12 },
        ],
        milestone: { slug: "ms-build", name: "Application build complete" },
      },
      {
        slug: "test",
        name: "Integrated Testing",
        tasks: [
          { slug: "unit", name: "Unit testing by application team", days: 10 },
          { slug: "integration", name: "Integrated testing cycle 1", days: 10 },
          { slug: "integration2", name: "Integrated testing cycle 2", days: 10 },
          { slug: "uat", name: "End-user acceptance testing", days: 8 },
          { slug: "defects", name: "Defect remediation", days: 10 },
        ],
        milestone: { slug: "ms-test", name: "Test exit gate passed" },
      },
      {
        slug: "training",
        name: "End-User Training",
        tasks: [
          { slug: "curriculum", name: "Build role-based curricula", days: 10 },
          { slug: "credentialing", name: "Credentialed trainer certification", days: 15 },
          { slug: "classroom", name: "Classroom training delivery", days: 30 },
          { slug: "elearning", name: "eLearning rollout", days: 10 },
          { slug: "rounding", name: "At-the-elbow support training", days: 5 },
        ],
        milestone: { slug: "ms-training", name: "Training complete" },
      },
      {
        slug: "rehearsal",
        name: "Dress Rehearsals & Cutover",
        tasks: [
          { slug: "tech-dress-1", name: "Technical dress rehearsal #1", days: 3 },
          { slug: "tech-dress-2", name: "Technical dress rehearsal #2", days: 3 },
          { slug: "biz-dress", name: "Business dress rehearsal", days: 3 },
          { slug: "cutover-plan", name: "Cutover plan & runbook", days: 5 },
          { slug: "downtime-prep", name: "Downtime procedures preparation", days: 5 },
        ],
        milestone: { slug: "ms-rehearsal", name: "Rehearsals complete" },
      },
      {
        slug: "golive",
        name: "Go-Live & Stabilization",
        tasks: [
          { slug: "freeze", name: "Code freeze & change moratorium", days: 5 },
          { slug: "cutover", name: "Cutover weekend", days: 3 },
          { slug: "command", name: "Command center operations", days: 14 },
          { slug: "elbow", name: "At-the-elbow support floor coverage", days: 14 },
          { slug: "issue-triage", name: "Issue triage & rapid fix", days: 21 },
        ],
        milestone: { slug: "ms-golive", name: "Go-live successful" },
      },
      {
        slug: "optimize",
        name: "Post-Live Optimization",
        tasks: [
          { slug: "metrics", name: "Adoption & efficiency metrics review", days: 10 },
          { slug: "tickets", name: "Optimization ticket triage", days: 10 },
          { slug: "personalization", name: "Personalization labs", days: 10 },
          { slug: "stabilization-report", name: "Stabilization closeout report", days: 3 },
        ],
        milestone: { slug: "ms-optimize", name: "Stabilization complete" },
      },
    ],
  },
  {
    slug: "hc-cerner-ehr-implementation",
    name: "Oracle Health (Cerner) EHR Implementation",
    summary: "Cerner Millennium build, integration testing, training, conversion, and go-live.",
    description: "Multi-domain Oracle Health (Cerner Millennium) EHR implementation across acute, ambulatory, ED, and revenue cycle. Includes data conversion from legacy systems and dual-go-live support.",
    category: "Clinical Systems",
    icon: "Stethoscope",
    phases: [
      {
        slug: "plan",
        name: "Plan & Discovery",
        tasks: [
          { slug: "kickoff", name: "Kickoff & governance", days: 3 },
          { slug: "discovery", name: "Discovery sessions per domain", days: 20 },
          { slug: "scope", name: "Scope confirmation", days: 5 },
        ],
        milestone: { slug: "ms-plan", name: "Plan baseline approved" },
      },
      {
        slug: "build",
        name: "Domain Build",
        tasks: [
          { slug: "powerchart", name: "PowerChart build", days: 25 },
          { slug: "firstnet", name: "FirstNet (ED) build", days: 15 },
          { slug: "surginet", name: "SurgiNet build", days: 15 },
          { slug: "pharmnet", name: "PharmNet build", days: 12 },
          { slug: "revenue", name: "Revenue Cycle build", days: 20 },
          { slug: "interfaces", name: "Interface build (CCL/HL7)", days: 18 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "convert",
        name: "Data Conversion",
        tasks: [
          { slug: "mapping", name: "Legacy data mapping", days: 12 },
          { slug: "extract", name: "Extract & transform", days: 10 },
          { slug: "mock-load-1", name: "Mock conversion #1", days: 5 },
          { slug: "mock-load-2", name: "Mock conversion #2", days: 5 },
          { slug: "validation", name: "Conversion validation", days: 8 },
        ],
        milestone: { slug: "ms-convert", name: "Conversion ready" },
      },
      {
        slug: "test",
        name: "Integrated Testing",
        tasks: [
          { slug: "cycle1", name: "Integrated test cycle 1", days: 10 },
          { slug: "cycle2", name: "Integrated test cycle 2", days: 10 },
          { slug: "uat", name: "User acceptance testing", days: 10 },
          { slug: "defects", name: "Defect remediation", days: 10 },
        ],
        milestone: { slug: "ms-test", name: "Test sign-off" },
      },
      {
        slug: "train",
        name: "Training",
        tasks: [
          { slug: "curriculum", name: "Curriculum design", days: 8 },
          { slug: "tt", name: "Train-the-trainer", days: 10 },
          { slug: "classroom", name: "Classroom delivery", days: 25 },
          { slug: "competency", name: "Competency validation", days: 5 },
        ],
        milestone: { slug: "ms-train", name: "Training complete" },
      },
      {
        slug: "golive",
        name: "Go-Live & Hypercare",
        tasks: [
          { slug: "rehearsal", name: "Mock go-live rehearsal", days: 3 },
          { slug: "cutover", name: "Cutover weekend", days: 3 },
          { slug: "command", name: "Command center", days: 14 },
          { slug: "hypercare", name: "Hypercare floor support", days: 21 },
        ],
        milestone: { slug: "ms-golive", name: "Go-live complete" },
      },
    ],
  },
  {
    slug: "hc-hipaa-compliance",
    name: "HIPAA Privacy & Security Compliance Program",
    summary: "Risk analysis, control gaps, remediation, training, and breach response readiness.",
    description: "Establish or refresh a HIPAA Privacy and Security compliance program for a covered entity: risk analysis, policies, technical safeguards, workforce training, and incident response.",
    category: "Compliance & Risk",
    icon: "Shield",
    phases: [
      {
        slug: "scope",
        name: "Scope & Inventory",
        tasks: [
          { slug: "kickoff", name: "Kickoff & sponsor alignment", days: 2 },
          { slug: "phi-inventory", name: "PHI data inventory & flow mapping", days: 10 },
          { slug: "system-inventory", name: "System & application inventory", days: 5 },
          { slug: "ba-inventory", name: "Business associate inventory", days: 5 },
        ],
        milestone: { slug: "ms-scope", name: "Scope confirmed" },
      },
      {
        slug: "assess",
        name: "Risk & Gap Analysis",
        tasks: [
          { slug: "risk-analysis", name: "HIPAA Security Rule risk analysis", days: 15 },
          { slug: "privacy-gap", name: "Privacy Rule gap assessment", days: 8 },
          { slug: "breach-gap", name: "Breach notification readiness", days: 5 },
          { slug: "report", name: "Risk analysis report", days: 4 },
        ],
        milestone: { slug: "ms-assess", name: "Risk analysis approved" },
      },
      {
        slug: "remediate",
        name: "Remediation",
        tasks: [
          { slug: "policies", name: "Policy & procedure updates", days: 12 },
          { slug: "access", name: "Access management remediation", days: 10 },
          { slug: "encryption", name: "Encryption at rest / in transit", days: 12 },
          { slug: "logging", name: "Audit logging & SIEM tuning", days: 10 },
          { slug: "ba-agreements", name: "BA agreement updates", days: 8 },
        ],
        milestone: { slug: "ms-remediate", name: "High-risk gaps closed" },
      },
      {
        slug: "train",
        name: "Workforce Training",
        tasks: [
          { slug: "curriculum", name: "Role-based curriculum", days: 5 },
          { slug: "delivery", name: "Workforce training delivery", days: 20 },
          { slug: "attestation", name: "Training attestation tracking", days: 5 },
        ],
        milestone: { slug: "ms-train", name: "Workforce trained" },
      },
      {
        slug: "ir",
        name: "Incident Response",
        tasks: [
          { slug: "ir-plan", name: "Incident response plan refresh", days: 5 },
          { slug: "tabletop", name: "Tabletop exercise", days: 3 },
          { slug: "breach-runbook", name: "Breach notification runbook", days: 4 },
        ],
        milestone: { slug: "ms-ir", name: "IR program operational" },
      },
    ],
  },
  {
    slug: "hc-joint-commission-survey",
    name: "Joint Commission Accreditation Readiness",
    summary: "Mock surveys, gap remediation, and survey-day readiness for hospital accreditation.",
    description: "Prepare a hospital for a Joint Commission triennial survey: mock tracers, environment of care rounds, documentation review, performance improvement, and survey-day logistics.",
    category: "Accreditation",
    icon: "ClipboardCheck",
    phases: [
      {
        slug: "baseline",
        name: "Baseline & Mock Survey",
        tasks: [
          { slug: "kickoff", name: "Readiness kickoff", days: 2 },
          { slug: "mock-survey", name: "External mock survey", days: 5 },
          { slug: "report", name: "Findings & risk scoring", days: 4 },
        ],
        milestone: { slug: "ms-baseline", name: "Baseline established" },
      },
      {
        slug: "remediate",
        name: "Gap Remediation",
        tasks: [
          { slug: "policies", name: "Policy & procedure updates", days: 15 },
          { slug: "ec-rounds", name: "Environment of Care rounds & fixes", days: 20 },
          { slug: "infection", name: "Infection prevention controls", days: 12 },
          { slug: "medication", name: "Medication management remediation", days: 10 },
          { slug: "credentialing", name: "Credentialing & privileging cleanup", days: 8 },
        ],
        milestone: { slug: "ms-remediate", name: "Top findings closed" },
      },
      {
        slug: "tracers",
        name: "Tracer Methodology",
        tasks: [
          { slug: "patient-tracers", name: "Patient tracer rounds", days: 15 },
          { slug: "system-tracers", name: "System tracer rounds", days: 10 },
          { slug: "leader-rounds", name: "Leader rounding", days: 10 },
        ],
        milestone: { slug: "ms-tracers", name: "Tracer program active" },
      },
      {
        slug: "ready",
        name: "Survey-Day Readiness",
        tasks: [
          { slug: "binder", name: "Survey binder & document repository", days: 5 },
          { slug: "logistics", name: "Survey-day logistics & coverage", days: 3 },
          { slug: "drill", name: "Survey-day dress rehearsal", days: 2 },
        ],
        milestone: { slug: "ms-ready", name: "Survey-ready" },
      },
    ],
  },
  {
    slug: "hc-clinical-service-line",
    name: "New Clinical Service Line Launch",
    summary: "Stand up a new service line: market analysis, staffing, space, technology, and launch.",
    description: "Launch a new clinical service line (e.g., bariatrics, oncology, cardiac). Includes market analysis, physician recruitment, space build-out, equipment, payer contracting, and patient marketing.",
    category: "Strategic Growth",
    icon: "HeartPulse",
    phases: [
      {
        slug: "strategy",
        name: "Strategy & Business Case",
        tasks: [
          { slug: "market", name: "Market & demand analysis", days: 15 },
          { slug: "competitor", name: "Competitor & referral analysis", days: 8 },
          { slug: "proforma", name: "5-year pro forma", days: 8 },
          { slug: "approval", name: "Board approval", days: 5 },
        ],
        milestone: { slug: "ms-strategy", name: "Business case approved" },
      },
      {
        slug: "people",
        name: "Physician & Staff Recruitment",
        tasks: [
          { slug: "physician-recruit", name: "Physician recruitment & contracting", days: 60 },
          { slug: "credentialing", name: "Credentialing & privileging", days: 30 },
          { slug: "nursing", name: "Nursing & APP recruitment", days: 45 },
          { slug: "training", name: "Service-specific training", days: 20 },
        ],
        milestone: { slug: "ms-people", name: "Care team ready" },
      },
      {
        slug: "space",
        name: "Space & Equipment",
        tasks: [
          { slug: "design", name: "Clinic / OR space design", days: 20 },
          { slug: "construction", name: "Construction / renovation", days: 90 },
          { slug: "equipment", name: "Capital equipment procurement", days: 60 },
          { slug: "install", name: "Equipment install & validation", days: 15 },
        ],
        milestone: { slug: "ms-space", name: "Space ready" },
      },
      {
        slug: "ops",
        name: "Operations & Payer Setup",
        tasks: [
          { slug: "workflows", name: "Clinical workflows", days: 12 },
          { slug: "ehr-build", name: "EHR build for service line", days: 15 },
          { slug: "supply", name: "Supply chain & PAR levels", days: 8 },
          { slug: "payer", name: "Payer contracting & credentialing", days: 45 },
        ],
        milestone: { slug: "ms-ops", name: "Operations ready" },
      },
      {
        slug: "launch",
        name: "Launch & Marketing",
        tasks: [
          { slug: "marketing", name: "Patient marketing campaign", days: 20 },
          { slug: "referral", name: "Referring-provider outreach", days: 15 },
          { slug: "soft-open", name: "Soft launch / first cases", days: 14 },
          { slug: "grand-open", name: "Grand opening", days: 2 },
        ],
        milestone: { slug: "ms-launch", name: "Service line live" },
      },
    ],
  },
  {
    slug: "hc-telehealth-rollout",
    name: "Enterprise Telehealth Program Rollout",
    summary: "Telehealth platform selection, EHR integration, provider enablement, and patient adoption.",
    description: "Stand up a multi-specialty telehealth program: vendor selection, EHR integration, scheduling and intake workflows, device provisioning, provider training, and patient onboarding.",
    category: "Digital Health",
    icon: "Video",
    phases: [
      {
        slug: "select",
        name: "Vendor Selection",
        tasks: [
          { slug: "requirements", name: "Requirements & RFI", days: 8 },
          { slug: "demos", name: "Vendor demos & scoring", days: 10 },
          { slug: "security", name: "Security & HIPAA review", days: 8 },
          { slug: "contract", name: "Contracting", days: 15 },
        ],
        milestone: { slug: "ms-select", name: "Vendor selected" },
      },
      {
        slug: "integrate",
        name: "Integration & Build",
        tasks: [
          { slug: "ehr-integration", name: "EHR integration build", days: 15 },
          { slug: "scheduling", name: "Scheduling workflow build", days: 10 },
          { slug: "billing", name: "Billing & charge capture", days: 10 },
          { slug: "devices", name: "Peripheral device integration", days: 8 },
        ],
        milestone: { slug: "ms-integrate", name: "Integration complete" },
      },
      {
        slug: "pilot",
        name: "Pilot",
        tasks: [
          { slug: "pilot-clinics", name: "Pilot clinic onboarding", days: 8 },
          { slug: "pilot-run", name: "8-week pilot operation", days: 40 },
          { slug: "pilot-review", name: "Pilot review & adjustments", days: 5 },
        ],
        milestone: { slug: "ms-pilot", name: "Pilot complete" },
      },
      {
        slug: "rollout",
        name: "Enterprise Rollout",
        tasks: [
          { slug: "wave1", name: "Wave 1 specialties onboard", days: 20 },
          { slug: "wave2", name: "Wave 2 specialties onboard", days: 20 },
          { slug: "wave3", name: "Wave 3 specialties onboard", days: 20 },
          { slug: "patient-comms", name: "Patient communications & tutorials", days: 15 },
        ],
        milestone: { slug: "ms-rollout", name: "Enterprise rollout complete" },
      },
    ],
  },
  {
    slug: "hc-revenue-cycle-optimization",
    name: "Revenue Cycle Optimization",
    summary: "Reduce denials, accelerate cash, and improve patient financial experience.",
    description: "Cross-functional revenue cycle improvement: denials root cause, prior auth automation, charge capture, coding accuracy, patient estimation, and collections workflow.",
    category: "Revenue Cycle",
    icon: "DollarSign",
    phases: [
      {
        slug: "diagnose",
        name: "Diagnostic & Baseline",
        tasks: [
          { slug: "kpis", name: "Baseline KPI capture (DNFB, AR days, denial %)", days: 8 },
          { slug: "denials-rca", name: "Denials root cause analysis", days: 10 },
          { slug: "process", name: "End-to-end process mapping", days: 10 },
        ],
        milestone: { slug: "ms-diagnose", name: "Baseline established" },
      },
      {
        slug: "front",
        name: "Front-End",
        tasks: [
          { slug: "registration", name: "Registration accuracy program", days: 15 },
          { slug: "auth", name: "Prior authorization automation", days: 20 },
          { slug: "estimation", name: "Patient cost estimation tool", days: 12 },
          { slug: "pos-collect", name: "Point-of-service collections", days: 10 },
        ],
        milestone: { slug: "ms-front", name: "Front-end optimized" },
      },
      {
        slug: "mid",
        name: "Mid-Cycle",
        tasks: [
          { slug: "cdi", name: "Clinical documentation improvement", days: 25 },
          { slug: "coding", name: "Coding accuracy & education", days: 20 },
          { slug: "charge-capture", name: "Charge capture audits", days: 15 },
        ],
        milestone: { slug: "ms-mid", name: "Mid-cycle optimized" },
      },
      {
        slug: "back",
        name: "Back-End",
        tasks: [
          { slug: "denials-mgmt", name: "Denials management workflow", days: 15 },
          { slug: "ar-followup", name: "AR follow-up automation", days: 15 },
          { slug: "patient-collect", name: "Patient collections workflow", days: 12 },
        ],
        milestone: { slug: "ms-back", name: "Back-end optimized" },
      },
      {
        slug: "monitor",
        name: "Monitor & Sustain",
        tasks: [
          { slug: "dashboard", name: "Executive RCM dashboard", days: 8 },
          { slug: "huddles", name: "Daily huddle cadence", days: 5 },
          { slug: "post-impl", name: "Post-implementation review", days: 5 },
        ],
        milestone: { slug: "ms-monitor", name: "Sustainment cadence in place" },
      },
    ],
  },
  {
    slug: "hc-medical-device-deployment",
    name: "Medical Device Fleet Deployment",
    summary: "Procure, validate, integrate, and roll out a clinical device fleet.",
    description: "Procure and deploy a fleet of clinical medical devices (e.g., infusion pumps, vital signs monitors, smart beds): clinical evaluation, biomed validation, EHR integration, training, and unit-by-unit rollout.",
    category: "Clinical Engineering",
    icon: "Activity",
    phases: [
      {
        slug: "select",
        name: "Selection & Procurement",
        tasks: [
          { slug: "requirements", name: "Clinical requirements", days: 8 },
          { slug: "evaluation", name: "On-unit device evaluation", days: 15 },
          { slug: "selection", name: "Vendor selection", days: 5 },
          { slug: "po", name: "Purchase order & delivery", days: 30 },
        ],
        milestone: { slug: "ms-select", name: "Devices ordered" },
      },
      {
        slug: "validate",
        name: "Biomed & Integration",
        tasks: [
          { slug: "incoming", name: "Incoming inspection", days: 8 },
          { slug: "calibration", name: "Calibration & tagging", days: 10 },
          { slug: "ehr-integration", name: "EHR / middleware integration", days: 12 },
          { slug: "alarm-tuning", name: "Alarm management tuning", days: 8 },
        ],
        milestone: { slug: "ms-validate", name: "Devices validated" },
      },
      {
        slug: "train",
        name: "Clinical Training",
        tasks: [
          { slug: "super-user", name: "Super-user training", days: 5 },
          { slug: "staff", name: "Staff training", days: 20 },
          { slug: "competency", name: "Competency sign-off", days: 5 },
        ],
        milestone: { slug: "ms-train", name: "Staff trained" },
      },
      {
        slug: "deploy",
        name: "Unit-by-Unit Rollout",
        tasks: [
          { slug: "wave1", name: "Wave 1 unit deployment", days: 10 },
          { slug: "wave2", name: "Wave 2 unit deployment", days: 10 },
          { slug: "wave3", name: "Wave 3 unit deployment", days: 10 },
          { slug: "decommission", name: "Decommission old fleet", days: 8 },
        ],
        milestone: { slug: "ms-deploy", name: "Fleet deployed" },
      },
    ],
  },
  {
    slug: "hc-pop-health",
    name: "Population Health & Value-Based Care Program",
    summary: "Risk stratification, care management, and quality measure performance.",
    description: "Stand up a population health program for value-based contracts: data integration, risk stratification, care management workflows, quality measure performance, and shared-savings reporting.",
    category: "Population Health",
    icon: "Users",
    phases: [
      {
        slug: "data",
        name: "Data Aggregation",
        tasks: [
          { slug: "sources", name: "Identify data sources (EHR, claims, ADT)", days: 10 },
          { slug: "ingestion", name: "Ingestion pipeline build", days: 20 },
          { slug: "mdm", name: "Patient master data management", days: 15 },
          { slug: "quality", name: "Data quality validation", days: 10 },
        ],
        milestone: { slug: "ms-data", name: "Data foundation ready" },
      },
      {
        slug: "stratify",
        name: "Risk Stratification",
        tasks: [
          { slug: "model", name: "Risk model selection / build", days: 12 },
          { slug: "registries", name: "Disease registries", days: 10 },
          { slug: "care-gaps", name: "Care gap engine", days: 12 },
        ],
        milestone: { slug: "ms-stratify", name: "Risk model live" },
      },
      {
        slug: "carem",
        name: "Care Management",
        tasks: [
          { slug: "workflows", name: "Care management workflows", days: 12 },
          { slug: "staffing", name: "Staffing model & ratios", days: 8 },
          { slug: "playbooks", name: "Condition-specific playbooks", days: 15 },
          { slug: "outreach", name: "Patient outreach automation", days: 12 },
        ],
        milestone: { slug: "ms-carem", name: "Care management operational" },
      },
      {
        slug: "perform",
        name: "Quality & Performance",
        tasks: [
          { slug: "measures", name: "Quality measure definitions", days: 10 },
          { slug: "dashboards", name: "Performance dashboards", days: 10 },
          { slug: "feedback", name: "Provider feedback reports", days: 8 },
          { slug: "shared-savings", name: "Shared-savings reporting", days: 10 },
        ],
        milestone: { slug: "ms-perform", name: "Reporting cadence in place" },
      },
    ],
  },
  {
    slug: "hc-meditech-expanse",
    name: "MEDITECH Expanse Implementation",
    summary: "MEDITECH Expanse build, training, and go-live for community hospitals.",
    description: "Plan, build, test, train, and go-live with MEDITECH Expanse across acute, ambulatory, and revenue cycle for a community hospital.",
    category: "Clinical Systems",
    icon: "Hospital",
    phases: [
      {
        slug: "plan",
        name: "Plan & Discovery",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "current-state", name: "Current-state workflows", days: 12 },
          { slug: "decisions", name: "Workflow decisions", days: 15 },
        ],
        milestone: { slug: "ms-plan", name: "Plan baseline" },
      },
      {
        slug: "build",
        name: "Build",
        tasks: [
          { slug: "amb", name: "Ambulatory build", days: 20 },
          { slug: "acute", name: "Acute build", days: 25 },
          { slug: "ed", name: "Emergency Department build", days: 12 },
          { slug: "rev", name: "Revenue cycle build", days: 18 },
          { slug: "interfaces", name: "Interface build", days: 15 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "test-train",
        name: "Test & Train",
        tasks: [
          { slug: "int-test", name: "Integrated testing", days: 15 },
          { slug: "uat", name: "User acceptance testing", days: 10 },
          { slug: "training", name: "End-user training", days: 20 },
        ],
        milestone: { slug: "ms-test-train", name: "Test & train complete" },
      },
      {
        slug: "golive",
        name: "Go-Live",
        tasks: [
          { slug: "rehearsal", name: "Mock go-live", days: 3 },
          { slug: "cutover", name: "Cutover weekend", days: 3 },
          { slug: "command", name: "Command center", days: 14 },
        ],
        milestone: { slug: "ms-golive", name: "Go-live complete" },
      },
    ],
  },
  {
    slug: "hc-clinical-trial-startup",
    name: "Clinical Trial Site Startup",
    summary: "IRB submission, contracts, training, and site activation for a sponsor-led trial.",
    description: "Stand up a sponsor-led clinical trial at a research site: feasibility, contracting, IRB submission, regulatory packet, site initiation visit, and first patient first visit.",
    category: "Research",
    icon: "Microscope",
    phases: [
      {
        slug: "feasibility",
        name: "Feasibility & Selection",
        tasks: [
          { slug: "feasibility-survey", name: "Sponsor feasibility survey", days: 5 },
          { slug: "pi-confirm", name: "PI confirmation", days: 3 },
          { slug: "team", name: "Study team identification", days: 5 },
        ],
        milestone: { slug: "ms-feasibility", name: "Site selected" },
      },
      {
        slug: "contracts",
        name: "Contracts & Budget",
        tasks: [
          { slug: "cda", name: "Confidentiality agreement", days: 5 },
          { slug: "budget", name: "Budget negotiation", days: 20 },
          { slug: "ctsa", name: "Clinical trial agreement", days: 25 },
          { slug: "coverage", name: "Coverage analysis", days: 10 },
        ],
        milestone: { slug: "ms-contracts", name: "Contracts executed" },
      },
      {
        slug: "regulatory",
        name: "Regulatory & IRB",
        tasks: [
          { slug: "irb", name: "IRB submission & approval", days: 30 },
          { slug: "regulatory-binder", name: "Regulatory binder build", days: 8 },
          { slug: "1572", name: "FDA 1572 & financial disclosures", days: 5 },
        ],
        milestone: { slug: "ms-regulatory", name: "IRB approved" },
      },
      {
        slug: "activate",
        name: "Site Activation",
        tasks: [
          { slug: "siv", name: "Site initiation visit", days: 3 },
          { slug: "training", name: "Protocol & device training", days: 5 },
          { slug: "supplies", name: "Supplies & drug shipment", days: 10 },
        ],
        milestone: { slug: "ms-activate", name: "Site activated" },
      },
      {
        slug: "enroll",
        name: "Enrollment Launch",
        tasks: [
          { slug: "recruit", name: "Recruitment outreach", days: 15 },
          { slug: "screening", name: "Screening visits", days: 20 },
          { slug: "fpfv", name: "First patient first visit", days: 1 },
        ],
        milestone: { slug: "ms-enroll", name: "FPFV achieved" },
      },
    ],
  },
];

export async function seedHealthcareSystemTemplates(): Promise<void> {
  await seedTemplateLibrary({
    industry: "healthcare",
    plans: PLANS,
    logTag: "healthcare-templates",
  });
}

export const HEALTHCARE_TEMPLATE_SLUGS = PLANS.map((p) => p.slug);
