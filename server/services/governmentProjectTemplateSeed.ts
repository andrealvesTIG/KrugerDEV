/**
 * Government & Public Sector system template library seeder.
 *
 * Curated plans for federal / state / local government and public-sector
 * agencies: digital services, ATO/FedRAMP, benefits delivery, transit,
 * elections, and grants programs.
 */

import {
  seedTemplateLibrary,
  type TemplatePlan,
} from "./systemTemplateLibrary";

const PLANS: TemplatePlan[] = [
  {
    slug: "gov-digital-service-delivery",
    name: "Citizen Digital Service Delivery (USDS-style)",
    summary: "Discovery → alpha → beta → live for a citizen-facing digital service.",
    description: "Modern public-sector digital service following USDS / GDS patterns: discovery, alpha prototyping, private beta, public beta, and live operations with continuous improvement.",
    category: "Digital Services",
    icon: "Globe",
    phases: [
      {
        slug: "discovery",
        name: "Discovery",
        tasks: [
          { slug: "kickoff", name: "Kickoff & sponsor alignment", days: 5 },
          { slug: "user-research", name: "User research with citizens", days: 25 },
          { slug: "policy", name: "Policy & legal constraints review", days: 12 },
          { slug: "as-is", name: "As-is process & data flows", days: 15 },
          { slug: "service-pattern", name: "Service pattern definition", days: 10 },
        ],
        milestone: { slug: "ms-discovery", name: "Discovery sign-off" },
      },
      {
        slug: "alpha",
        name: "Alpha",
        tasks: [
          { slug: "prototypes", name: "Prototypes & paper testing", days: 20 },
          { slug: "tech-spike", name: "Technical spikes", days: 15 },
          { slug: "accessibility", name: "Accessibility (WCAG) baseline", days: 8 },
          { slug: "alpha-test", name: "Alpha user testing", days: 15 },
        ],
        milestone: { slug: "ms-alpha", name: "Alpha assessment passed" },
      },
      {
        slug: "private-beta",
        name: "Private Beta",
        tasks: [
          { slug: "build", name: "Working service build", days: 60 },
          { slug: "integrations", name: "Authoritative source integrations", days: 30 },
          { slug: "ato-prep", name: "ATO documentation prep", days: 25 },
          { slug: "private-launch", name: "Private beta launch (small cohort)", days: 14 },
          { slug: "iterate", name: "Iterate on private beta feedback", days: 30 },
        ],
        milestone: { slug: "ms-private", name: "Private beta assessment passed" },
      },
      {
        slug: "public-beta",
        name: "Public Beta",
        tasks: [
          { slug: "scaling", name: "Performance & scaling work", days: 25 },
          { slug: "public-launch", name: "Public beta launch", days: 7 },
          { slug: "support", name: "Support model & contact center", days: 20 },
          { slug: "kpi", name: "KPI & analytics", days: 15 },
        ],
        milestone: { slug: "ms-public", name: "Public beta assessment passed" },
      },
      {
        slug: "live",
        name: "Live",
        tasks: [
          { slug: "live-launch", name: "Live launch", days: 7 },
          { slug: "ops", name: "Live operations & on-call", days: 30 },
          { slug: "improvement", name: "Continuous improvement cadence", days: 30 },
        ],
        milestone: { slug: "ms-live", name: "Live & operating" },
      },
    ],
  },
  {
    slug: "gov-fedramp-moderate",
    name: "FedRAMP Moderate Authorization",
    summary: "Stand up a system and obtain FedRAMP Moderate ATO via JAB or Agency path.",
    description: "Achieve FedRAMP Moderate authorization for a cloud service: scope, control implementation (NIST 800-53 Rev 5), 3PAO assessment, agency sponsor, and continuous monitoring.",
    category: "Compliance",
    icon: "ShieldCheck",
    phases: [
      {
        slug: "scope",
        name: "Scope & Sponsor",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "scope", name: "Authorization boundary", days: 20 },
          { slug: "sponsor", name: "Agency sponsor or JAB engagement", days: 30 },
          { slug: "fips199", name: "FIPS 199 categorization", days: 5 },
        ],
        milestone: { slug: "ms-scope", name: "Sponsor confirmed" },
      },
      {
        slug: "implement",
        name: "Control Implementation",
        tasks: [
          { slug: "ssp", name: "System Security Plan (SSP) draft", days: 45 },
          { slug: "controls", name: "Technical control implementation", days: 90 },
          { slug: "policies", name: "Policy & procedure suite", days: 30 },
          { slug: "training", name: "Workforce training", days: 15 },
        ],
        milestone: { slug: "ms-implement", name: "Controls in place" },
      },
      {
        slug: "assess",
        name: "3PAO Assessment",
        tasks: [
          { slug: "sap", name: "Security Assessment Plan", days: 20 },
          { slug: "assessment", name: "3PAO assessment", days: 45 },
          { slug: "remediation", name: "Finding remediation", days: 60 },
          { slug: "sar", name: "Security Assessment Report", days: 20 },
        ],
        milestone: { slug: "ms-assess", name: "Assessment complete" },
      },
      {
        slug: "ato",
        name: "Authorization & ConMon",
        tasks: [
          { slug: "package", name: "Authorization package submission", days: 15 },
          { slug: "ato", name: "ATO issuance", days: 60 },
          { slug: "conmon", name: "Continuous monitoring kickoff", days: 25 },
        ],
        milestone: { slug: "ms-ato", name: "ATO granted" },
      },
    ],
  },
  {
    slug: "gov-medicaid-mes-modernization",
    name: "Medicaid MES Modernization (CMS MITA)",
    summary: "Modular Medicaid Enterprise System modernization aligned to MITA & CMS rules.",
    description: "State Medicaid Enterprise System modernization following MITA / Streamlined Modular Certification: planning APD, module procurement, build, certification, and operations.",
    category: "Health & Human Services",
    icon: "Heart",
    phases: [
      {
        slug: "plan",
        name: "Planning & APD",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "mita-soa", name: "MITA State Self-Assessment", days: 30 },
          { slug: "papd", name: "Planning APD to CMS", days: 30 },
          { slug: "approval", name: "CMS approval", days: 60 },
        ],
        milestone: { slug: "ms-plan", name: "PAPD approved" },
      },
      {
        slug: "procure",
        name: "Module Procurement",
        tasks: [
          { slug: "rfp", name: "Module RFP", days: 60 },
          { slug: "evaluation", name: "Evaluation & selection", days: 45 },
          { slug: "iapd", name: "Implementation APD update", days: 25 },
          { slug: "contract", name: "Contracting", days: 45 },
        ],
        milestone: { slug: "ms-procure", name: "Vendor selected" },
      },
      {
        slug: "build",
        name: "Build & Integrate",
        tasks: [
          { slug: "design", name: "Detailed design", days: 60 },
          { slug: "config", name: "Configuration & build", days: 90 },
          { slug: "integration", name: "MES bus & integration", days: 60 },
          { slug: "data", name: "Data conversion & history", days: 60 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "test",
        name: "Test & Certification",
        tasks: [
          { slug: "sit", name: "System integration test", days: 35 },
          { slug: "uat", name: "User acceptance test", days: 35 },
          { slug: "ort", name: "Operational readiness test", days: 25 },
          { slug: "smc", name: "Streamlined Modular Certification", days: 60 },
        ],
        milestone: { slug: "ms-test", name: "Certification approved" },
      },
      {
        slug: "operate",
        name: "Operations",
        tasks: [
          { slug: "training", name: "Workforce training", days: 25 },
          { slug: "go-live", name: "Go-live", days: 7 },
          { slug: "stabilize", name: "Stabilization", days: 60 },
        ],
        milestone: { slug: "ms-operate", name: "Production stable" },
      },
    ],
  },
  {
    slug: "gov-elections-equipment",
    name: "Elections Voting System Modernization",
    summary: "Voting system selection, certification, deployment, and election readiness.",
    description: "County / state voting system modernization: vendor selection, EAC certification, ballot design, poll worker training, and pre-election logic & accuracy testing.",
    category: "Elections",
    icon: "Vote",
    phases: [
      {
        slug: "select",
        name: "Selection",
        tasks: [
          { slug: "requirements", name: "Requirements & accessibility", days: 25 },
          { slug: "rfp", name: "RFP & evaluation", days: 60 },
          { slug: "demos", name: "Public demos", days: 15 },
          { slug: "contract", name: "Contracting", days: 30 },
        ],
        milestone: { slug: "ms-select", name: "Vendor selected" },
      },
      {
        slug: "certify",
        name: "Certification & Configuration",
        tasks: [
          { slug: "eac-cert", name: "EAC / state certification verification", days: 45 },
          { slug: "config", name: "Configuration & ballot programming", days: 30 },
          { slug: "security", name: "Security hardening", days: 25 },
        ],
        milestone: { slug: "ms-certify", name: "Configuration certified" },
      },
      {
        slug: "deploy",
        name: "Deployment & Training",
        tasks: [
          { slug: "logistics", name: "Equipment logistics to precincts", days: 25 },
          { slug: "poll-worker", name: "Poll worker training", days: 30 },
          { slug: "tech-deploy", name: "Tabulator / scanner deployment", days: 25 },
        ],
        milestone: { slug: "ms-deploy", name: "Deployed to precincts" },
      },
      {
        slug: "election",
        name: "Election Readiness",
        tasks: [
          { slug: "lat", name: "Logic & accuracy testing", days: 15 },
          { slug: "mock", name: "Mock election", days: 5 },
          { slug: "early-voting", name: "Early voting period", days: 14 },
          { slug: "election-day", name: "Election day operations", days: 1 },
          { slug: "canvass", name: "Canvass & post-election audit", days: 15 },
        ],
        milestone: { slug: "ms-election", name: "Election certified" },
      },
    ],
  },
  {
    slug: "gov-transit-bus-electrification",
    name: "Transit Bus Fleet Electrification",
    summary: "Transition a transit bus fleet to battery-electric: depot, charging, fleet, training.",
    description: "Public transit agency program to electrify a bus fleet: depot upgrade, charging infrastructure, vehicle procurement, route analysis, training, and phased fleet transition.",
    category: "Transportation",
    icon: "Bus",
    phases: [
      {
        slug: "plan",
        name: "Strategic Plan",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "route-analysis", name: "Route & duty cycle analysis", days: 25 },
          { slug: "fleet-strategy", name: "Fleet replacement strategy", days: 25 },
          { slug: "funding", name: "Funding (FTA Low-No, etc.)", days: 60 },
        ],
        milestone: { slug: "ms-plan", name: "Plan funded" },
      },
      {
        slug: "depot",
        name: "Depot Upgrade",
        tasks: [
          { slug: "engineering", name: "Depot electrification engineering", days: 45 },
          { slug: "utility", name: "Utility upgrades", days: 90 },
          { slug: "construction", name: "Depot construction", days: 120 },
          { slug: "chargers", name: "Charger install", days: 45 },
          { slug: "ems", name: "Charge management system", days: 25 },
        ],
        milestone: { slug: "ms-depot", name: "Depot ready" },
      },
      {
        slug: "fleet",
        name: "Fleet Procurement",
        tasks: [
          { slug: "rfp", name: "Bus RFP", days: 60 },
          { slug: "buy-america", name: "Buy America certifications", days: 25 },
          { slug: "production", name: "Vehicle production", days: 240 },
          { slug: "delivery", name: "Delivery & inspection", days: 45 },
        ],
        milestone: { slug: "ms-fleet", name: "Buses delivered" },
      },
      {
        slug: "operations",
        name: "Operations & Training",
        tasks: [
          { slug: "operator-training", name: "Operator training", days: 30 },
          { slug: "maintenance-training", name: "Maintenance technician training", days: 35 },
          { slug: "pilot-routes", name: "Pilot route operation", days: 30 },
          { slug: "ramp", name: "Fleet transition ramp", days: 90 },
        ],
        milestone: { slug: "ms-operations", name: "Fleet in service" },
      },
    ],
  },
  {
    slug: "gov-grants-program-launch",
    name: "Federal Grants Program Launch",
    summary: "Stand up a new grants program: NOFO, intake, review, awards, monitoring.",
    description: "Launch a new federal grants program: program design, NOFO publication, application intake, merit review panel, award administration, and post-award monitoring.",
    category: "Programs",
    icon: "Banknote",
    phases: [
      {
        slug: "design",
        name: "Program Design",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "policy", name: "Program policy & eligibility", days: 25 },
          { slug: "criteria", name: "Selection criteria & scoring", days: 15 },
          { slug: "performance", name: "Performance measures", days: 12 },
        ],
        milestone: { slug: "ms-design", name: "Program design approved" },
      },
      {
        slug: "nofo",
        name: "NOFO & Intake",
        tasks: [
          { slug: "nofo-draft", name: "Draft NOFO", days: 20 },
          { slug: "ogc", name: "Office of General Counsel review", days: 25 },
          { slug: "publish", name: "Publish on Grants.gov", days: 7 },
          { slug: "tac", name: "Technical assistance / pre-app webinars", days: 30 },
          { slug: "intake", name: "Application intake window", days: 60 },
        ],
        milestone: { slug: "ms-nofo", name: "Intake closed" },
      },
      {
        slug: "review",
        name: "Review & Award",
        tasks: [
          { slug: "screening", name: "Eligibility & completeness screen", days: 12 },
          { slug: "panel", name: "Merit review panels", days: 35 },
          { slug: "selection", name: "Selection recommendations", days: 12 },
          { slug: "negotiation", name: "Award negotiation", days: 30 },
          { slug: "obligation", name: "Obligation & notification", days: 15 },
        ],
        milestone: { slug: "ms-review", name: "Awards made" },
      },
      {
        slug: "monitor",
        name: "Post-Award Monitoring",
        tasks: [
          { slug: "kickoff-pa", name: "Awardee kickoff calls", days: 12 },
          { slug: "reporting", name: "Quarterly reporting", days: 30 },
          { slug: "site-visits", name: "Site visits", days: 30 },
          { slug: "audits", name: "Single audits & risk reviews", days: 30 },
        ],
        milestone: { slug: "ms-monitor", name: "Monitoring cadence in place" },
      },
    ],
  },
  {
    slug: "gov-cjis-compliance",
    name: "CJIS Compliance Program (Public Safety)",
    summary: "Achieve and maintain CJIS Security Policy compliance for a public safety agency.",
    description: "Public safety agency CJIS Security Policy compliance program: gap analysis, technical safeguards, personnel security, audit readiness, and continuous compliance.",
    category: "Public Safety",
    icon: "Shield",
    phases: [
      {
        slug: "scope",
        name: "Scope & Gap",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "data-flow", name: "CJI data flow mapping", days: 15 },
          { slug: "gap", name: "CJIS Security Policy gap", days: 20 },
        ],
        milestone: { slug: "ms-scope", name: "Gap baseline" },
      },
      {
        slug: "technical",
        name: "Technical Safeguards",
        tasks: [
          { slug: "encryption", name: "Encryption (FIPS 140-2)", days: 25 },
          { slug: "access-control", name: "Advanced authentication", days: 25 },
          { slug: "audit", name: "Audit logging", days: 20 },
          { slug: "config", name: "Configuration management", days: 18 },
        ],
        milestone: { slug: "ms-technical", name: "Technical controls live" },
      },
      {
        slug: "personnel",
        name: "Personnel Security",
        tasks: [
          { slug: "fingerprints", name: "Fingerprint background checks", days: 25 },
          { slug: "training", name: "CJIS Security Awareness training", days: 25 },
          { slug: "policies", name: "Personnel policies", days: 12 },
        ],
        milestone: { slug: "ms-personnel", name: "Personnel compliant" },
      },
      {
        slug: "audit",
        name: "Audit Readiness",
        tasks: [
          { slug: "readiness", name: "Readiness review", days: 12 },
          { slug: "remediation", name: "Remediation", days: 25 },
          { slug: "fbi-audit", name: "FBI / state CSO audit", days: 7 },
        ],
        milestone: { slug: "ms-audit", name: "Audit clean" },
      },
    ],
  },
  {
    slug: "gov-courts-ecourt",
    name: "eCourt / Case Management Modernization",
    summary: "Modernize court case management with e-filing, online portal, and workflows.",
    description: "Trial court modernization of case management: e-filing, judge / clerk workflows, attorney portal, public access, and integrations with prosecutors and corrections.",
    category: "Justice",
    icon: "Gavel",
    phases: [
      {
        slug: "design",
        name: "Discovery & Design",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "case-types", name: "Case type process design", days: 35 },
          { slug: "roles", name: "Role-based workflows", days: 20 },
          { slug: "interfaces", name: "Interface design", days: 20 },
        ],
        milestone: { slug: "ms-design", name: "Design baseline" },
      },
      {
        slug: "build",
        name: "Build",
        tasks: [
          { slug: "config", name: "Configuration build", days: 60 },
          { slug: "efiling", name: "E-filing module", days: 30 },
          { slug: "portal", name: "Public / attorney portal", days: 35 },
          { slug: "integration", name: "Integration with prosecutors / corrections", days: 35 },
          { slug: "calendar", name: "Calendaring & docketing", days: 25 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "test",
        name: "Test",
        tasks: [
          { slug: "sit", name: "System integration test", days: 25 },
          { slug: "uat", name: "User acceptance test (judges, clerks, attorneys)", days: 25 },
          { slug: "accessibility", name: "Accessibility & language access", days: 12 },
        ],
        milestone: { slug: "ms-test", name: "Test exit" },
      },
      {
        slug: "rollout",
        name: "Court-by-Court Rollout",
        tasks: [
          { slug: "training", name: "Court staff training", days: 25 },
          { slug: "pilot", name: "Pilot court", days: 25 },
          { slug: "wave1", name: "Wave 1 courts", days: 35 },
          { slug: "wave2", name: "Wave 2 courts", days: 35 },
        ],
        milestone: { slug: "ms-rollout", name: "Statewide rollout complete" },
      },
    ],
  },
  {
    slug: "gov-dmv-modernization",
    name: "DMV / Driver & Vehicle System Modernization",
    summary: "Replace legacy DMV system covering driver, vehicle, and titles.",
    description: "State DMV modernization: driver licensing, vehicle registration, titles, and online services. Includes Real ID, AAMVA integration, and counter rollout.",
    category: "Citizen Services",
    icon: "Car",
    phases: [
      {
        slug: "select",
        name: "Vendor Selection",
        tasks: [
          { slug: "rfp", name: "RFP & evaluation", days: 90 },
          { slug: "demos", name: "Vendor demos", days: 25 },
          { slug: "contract", name: "Contracting", days: 45 },
        ],
        milestone: { slug: "ms-select", name: "Vendor selected" },
      },
      {
        slug: "design",
        name: "Design",
        tasks: [
          { slug: "process-design", name: "Driver / vehicle / titles process design", days: 60 },
          { slug: "interfaces", name: "AAMVA / federal / law enforcement interfaces", days: 35 },
          { slug: "real-id", name: "Real ID compliance", days: 20 },
        ],
        milestone: { slug: "ms-design", name: "Design baseline" },
      },
      {
        slug: "build",
        name: "Build & Convert",
        tasks: [
          { slug: "config", name: "Configuration build", days: 90 },
          { slug: "online", name: "Online services portal", days: 45 },
          { slug: "conversion", name: "Legacy data conversion", days: 60 },
          { slug: "issuance", name: "Card issuance system", days: 30 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "test",
        name: "Test",
        tasks: [
          { slug: "sit", name: "System integration test", days: 30 },
          { slug: "uat", name: "User acceptance test", days: 30 },
          { slug: "perf", name: "Performance test", days: 15 },
        ],
        milestone: { slug: "ms-test", name: "Test exit" },
      },
      {
        slug: "rollout",
        name: "Counter Rollout",
        tasks: [
          { slug: "training", name: "Counter staff training", days: 35 },
          { slug: "pilot", name: "Pilot office", days: 25 },
          { slug: "wave1", name: "Wave 1 offices", days: 45 },
          { slug: "wave2", name: "Wave 2 offices", days: 45 },
          { slug: "wave3", name: "Wave 3 offices", days: 45 },
        ],
        milestone: { slug: "ms-rollout", name: "Statewide rollout complete" },
      },
    ],
  },
  {
    slug: "gov-emergency-management",
    name: "Emergency Management EOC Activation",
    summary: "Activate, run, and demobilize an Emergency Operations Center for an incident.",
    description: "ICS / NIMS-aligned plan to activate an Emergency Operations Center: activation, planning P, response, recovery transition, and demobilization with after-action review.",
    category: "Public Safety",
    icon: "Siren",
    phases: [
      {
        slug: "activate",
        name: "Activation",
        tasks: [
          { slug: "trigger", name: "Activation trigger & order", days: 1 },
          { slug: "ics", name: "ICS organization stand-up", days: 1 },
          { slug: "facility", name: "EOC facility setup", days: 1 },
          { slug: "comms", name: "Comms plan & ICS-205", days: 1 },
        ],
        milestone: { slug: "ms-activate", name: "EOC operational" },
      },
      {
        slug: "plan",
        name: "Planning P (Operational Periods)",
        tasks: [
          { slug: "period-1", name: "Operational Period 1 IAP", days: 1 },
          { slug: "period-2", name: "Operational Period 2 IAP", days: 1 },
          { slug: "period-3", name: "Operational Period 3 IAP", days: 1 },
          { slug: "period-n", name: "Subsequent operational periods", days: 7 },
        ],
        milestone: { slug: "ms-plan", name: "Steady operations" },
      },
      {
        slug: "respond",
        name: "Response",
        tasks: [
          { slug: "life-safety", name: "Life-safety operations", days: 7 },
          { slug: "logistics", name: "Logistics & resource ordering", days: 10 },
          { slug: "shelters", name: "Shelters & mass care", days: 10 },
          { slug: "infrastructure", name: "Infrastructure restoration coordination", days: 14 },
          { slug: "public-info", name: "Public information & JIC", days: 14 },
        ],
        milestone: { slug: "ms-respond", name: "Response objectives met" },
      },
      {
        slug: "recover",
        name: "Recovery Transition",
        tasks: [
          { slug: "transition-plan", name: "Recovery transition plan", days: 5 },
          { slug: "lro", name: "Long-term recovery organization", days: 10 },
          { slug: "fema", name: "FEMA / state declaration & PA", days: 15 },
        ],
        milestone: { slug: "ms-recover", name: "Recovery handoff" },
      },
      {
        slug: "demob",
        name: "Demobilization & AAR",
        tasks: [
          { slug: "demob-plan", name: "Demobilization plan", days: 3 },
          { slug: "release", name: "Release of resources", days: 5 },
          { slug: "aar", name: "After-action review & improvement plan", days: 10 },
        ],
        milestone: { slug: "ms-demob", name: "EOC deactivated" },
      },
    ],
  },
];

export async function seedGovernmentSystemTemplates(): Promise<void> {
  await seedTemplateLibrary({
    industry: "government",
    plans: PLANS,
    logTag: "government-templates",
  });
}

export const GOVERNMENT_TEMPLATE_SLUGS = PLANS.map((p) => p.slug);
