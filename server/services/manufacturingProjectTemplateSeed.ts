/**
 * Manufacturing system template library seeder.
 *
 * Curated plans for discrete and process manufacturers: ERP/MES rollouts,
 * new product introductions, lean transformations, plant moves, and quality.
 */

import {
  seedTemplateLibrary,
  type TemplatePlan,
} from "./systemTemplateLibrary";

const PLANS: TemplatePlan[] = [
  {
    slug: "mfg-sap-s4-rollout",
    name: "SAP S/4HANA Manufacturing Rollout",
    summary: "Multi-plant S/4HANA rollout covering PP, MM, QM, EWM, and finance integration.",
    description: "Greenfield or template rollout of SAP S/4HANA for a manufacturing enterprise: production planning, materials management, quality, warehouse, and finance integration. Phased plant rollout strategy.",
    category: "ERP",
    icon: "Database",
    phases: [
      {
        slug: "prepare",
        name: "Prepare",
        tasks: [
          { slug: "kickoff", name: "Kickoff & sponsor alignment", days: 3 },
          { slug: "template", name: "Global template scope", days: 15 },
          { slug: "landscape", name: "System landscape provisioning", days: 12 },
        ],
        milestone: { slug: "ms-prepare", name: "Prepare phase complete" },
      },
      {
        slug: "explore",
        name: "Explore",
        tasks: [
          { slug: "fit-gap-pp", name: "Fit-gap workshops — PP", days: 15 },
          { slug: "fit-gap-mm", name: "Fit-gap workshops — MM", days: 15 },
          { slug: "fit-gap-qm", name: "Fit-gap workshops — QM", days: 10 },
          { slug: "fit-gap-ewm", name: "Fit-gap workshops — EWM", days: 12 },
          { slug: "fit-gap-fi", name: "Fit-gap workshops — FI/CO", days: 12 },
          { slug: "rica", name: "RICEFW inventory", days: 8 },
        ],
        milestone: { slug: "ms-explore", name: "Design baseline" },
      },
      {
        slug: "realize",
        name: "Realize",
        tasks: [
          { slug: "config", name: "Configuration build", days: 50 },
          { slug: "extensions", name: "Extensions (Z-objects)", days: 35 },
          { slug: "interfaces", name: "Interface build (CPI/PI)", days: 30 },
          { slug: "reports", name: "Reports & Fiori apps", days: 20 },
          { slug: "data-conversion", name: "Data conversion build", days: 25 },
          { slug: "auths", name: "Authorization roles", days: 15 },
        ],
        milestone: { slug: "ms-realize", name: "Build complete" },
      },
      {
        slug: "test",
        name: "Test",
        tasks: [
          { slug: "sit", name: "System integration test", days: 25 },
          { slug: "uat", name: "User acceptance test", days: 20 },
          { slug: "perf", name: "Performance & volume", days: 12 },
          { slug: "mock-1", name: "Mock cutover 1", days: 7 },
          { slug: "mock-2", name: "Mock cutover 2", days: 7 },
        ],
        milestone: { slug: "ms-test", name: "Test exit" },
      },
      {
        slug: "deploy-pilot",
        name: "Deploy — Pilot Plant",
        tasks: [
          { slug: "training", name: "End-user training", days: 15 },
          { slug: "cutover", name: "Pilot cutover", days: 5 },
          { slug: "hypercare", name: "Hypercare (8 weeks)", days: 40 },
        ],
        milestone: { slug: "ms-deploy-pilot", name: "Pilot live" },
      },
      {
        slug: "deploy-rollout",
        name: "Deploy — Rollout Plants",
        tasks: [
          { slug: "wave1", name: "Wave 1 plants", days: 30 },
          { slug: "wave2", name: "Wave 2 plants", days: 30 },
          { slug: "wave3", name: "Wave 3 plants", days: 30 },
          { slug: "decommission", name: "Legacy decommission", days: 20 },
        ],
        milestone: { slug: "ms-deploy-rollout", name: "Rollout complete" },
      },
    ],
  },
  {
    slug: "mfg-mes-implementation",
    name: "MES (Manufacturing Execution System) Implementation",
    summary: "Plant-floor MES rollout with OEE, work orders, and ERP integration.",
    description: "Implement a Manufacturing Execution System (e.g., Rockwell FT Production Centre, Siemens Opcenter): work order execution, machine connectivity, OEE, traceability, and ERP integration.",
    category: "Operations",
    icon: "Cog",
    phases: [
      {
        slug: "scope",
        name: "Scope & Selection",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "as-is", name: "As-is process & data flow", days: 12 },
          { slug: "vendor", name: "Vendor selection", days: 25 },
        ],
        milestone: { slug: "ms-scope", name: "Vendor selected" },
      },
      {
        slug: "design",
        name: "Design",
        tasks: [
          { slug: "to-be", name: "To-be workflows by line", days: 15 },
          { slug: "data-model", name: "Production data model", days: 12 },
          { slug: "integration", name: "ERP / SCADA integration design", days: 12 },
        ],
        milestone: { slug: "ms-design", name: "Design approved" },
      },
      {
        slug: "build",
        name: "Build & Connect",
        tasks: [
          { slug: "config", name: "MES configuration", days: 30 },
          { slug: "machine-connect", name: "Machine connectivity (OPC UA / MTConnect)", days: 25 },
          { slug: "oee", name: "OEE engine setup", days: 12 },
          { slug: "traceability", name: "Traceability & genealogy", days: 15 },
          { slug: "erp-integration", name: "ERP integration", days: 18 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "pilot-line",
        name: "Pilot Line",
        tasks: [
          { slug: "pilot-train", name: "Pilot line operator training", days: 8 },
          { slug: "pilot-run", name: "Pilot line live operation (4 weeks)", days: 20 },
          { slug: "pilot-tune", name: "Pilot tuning & adjustments", days: 8 },
        ],
        milestone: { slug: "ms-pilot", name: "Pilot successful" },
      },
      {
        slug: "rollout",
        name: "Plant Rollout",
        tasks: [
          { slug: "wave1", name: "Wave 1 lines", days: 20 },
          { slug: "wave2", name: "Wave 2 lines", days: 20 },
          { slug: "wave3", name: "Wave 3 lines", days: 20 },
        ],
        milestone: { slug: "ms-rollout", name: "Plant cutover complete" },
      },
    ],
  },
  {
    slug: "mfg-npi",
    name: "New Product Introduction (NPI)",
    summary: "From concept to mass production: design, validation, supply chain, and ramp.",
    description: "End-to-end New Product Introduction: concept, engineering, design verification, design validation, pilot build, supplier qualification, and mass-production ramp.",
    category: "Product Development",
    icon: "Lightbulb",
    phases: [
      {
        slug: "concept",
        name: "Concept",
        tasks: [
          { slug: "voc", name: "Voice of customer & market sizing", days: 15 },
          { slug: "concept-def", name: "Concept definition", days: 12 },
          { slug: "biz-case", name: "Business case", days: 10 },
        ],
        milestone: { slug: "ms-concept", name: "Concept approved (Gate 1)" },
      },
      {
        slug: "feasibility",
        name: "Feasibility",
        tasks: [
          { slug: "specs", name: "Product specifications", days: 15 },
          { slug: "feasibility-study", name: "Engineering feasibility", days: 20 },
          { slug: "ip", name: "IP / patent search", days: 10 },
        ],
        milestone: { slug: "ms-feasibility", name: "Feasibility approved (Gate 2)" },
      },
      {
        slug: "design",
        name: "Design",
        tasks: [
          { slug: "industrial", name: "Industrial design", days: 20 },
          { slug: "mechanical", name: "Mechanical design", days: 35 },
          { slug: "electrical", name: "Electrical design", days: 30 },
          { slug: "firmware", name: "Firmware development", days: 35 },
          { slug: "dfx", name: "DFM / DFA / DFT review", days: 12 },
        ],
        milestone: { slug: "ms-design", name: "Design freeze (Gate 3)" },
      },
      {
        slug: "verify",
        name: "Verification & Validation",
        tasks: [
          { slug: "ep", name: "Engineering prototype build", days: 20 },
          { slug: "dvt", name: "Design verification test", days: 25 },
          { slug: "regulatory", name: "Regulatory compliance testing", days: 30 },
          { slug: "reliability", name: "Reliability / HALT testing", days: 25 },
        ],
        milestone: { slug: "ms-verify", name: "DVT pass" },
      },
      {
        slug: "supply",
        name: "Supply Chain",
        tasks: [
          { slug: "suppliers", name: "Supplier selection & qualification", days: 35 },
          { slug: "tooling", name: "Production tooling", days: 60 },
          { slug: "ppap", name: "PPAP submissions", days: 25 },
        ],
        milestone: { slug: "ms-supply", name: "Supply chain ready" },
      },
      {
        slug: "pilot",
        name: "Pilot & Ramp",
        tasks: [
          { slug: "pilot-build", name: "Pilot production build", days: 20 },
          { slug: "pvt", name: "Production validation test", days: 15 },
          { slug: "soft-launch", name: "Soft launch", days: 15 },
          { slug: "ramp", name: "Mass-production ramp", days: 30 },
        ],
        milestone: { slug: "ms-pilot", name: "Mass production released" },
      },
    ],
  },
  {
    slug: "mfg-lean-transformation",
    name: "Lean / Operational Excellence Transformation",
    summary: "Value-stream mapping, kaizen events, and standard work across a plant.",
    description: "Plant-wide lean transformation: value-stream mapping, kaizen waves, 5S deployment, standard work, daily management, and performance dashboards.",
    category: "Operations",
    icon: "Activity",
    phases: [
      {
        slug: "diagnose",
        name: "Diagnose",
        tasks: [
          { slug: "kickoff", name: "Kickoff & guiding coalition", days: 3 },
          { slug: "vsm", name: "Current-state value-stream maps", days: 15 },
          { slug: "future-state", name: "Future-state design", days: 10 },
          { slug: "biz-case", name: "Business case & savings target", days: 8 },
        ],
        milestone: { slug: "ms-diagnose", name: "Transformation approved" },
      },
      {
        slug: "wave1",
        name: "Wave 1 — Foundation",
        tasks: [
          { slug: "5s", name: "5S deployment in pilot area", days: 15 },
          { slug: "standard-work", name: "Standard work documentation", days: 20 },
          { slug: "visual", name: "Visual management boards", days: 10 },
          { slug: "daily-mgmt", name: "Daily management cadence", days: 15 },
        ],
        milestone: { slug: "ms-wave1", name: "Foundation in place" },
      },
      {
        slug: "wave2",
        name: "Wave 2 — Flow",
        tasks: [
          { slug: "kaizen-1", name: "Kaizen event #1 (changeover)", days: 5 },
          { slug: "kaizen-2", name: "Kaizen event #2 (line balance)", days: 5 },
          { slug: "kaizen-3", name: "Kaizen event #3 (material flow)", days: 5 },
          { slug: "tpm", name: "TPM rollout in pilot area", days: 25 },
        ],
        milestone: { slug: "ms-wave2", name: "Flow established" },
      },
      {
        slug: "wave3",
        name: "Wave 3 — Sustainment",
        tasks: [
          { slug: "leader-standard", name: "Leader standard work", days: 15 },
          { slug: "kpi", name: "KPI dashboards & gemba walks", days: 12 },
          { slug: "training", name: "Lean practitioner training", days: 30 },
        ],
        milestone: { slug: "ms-wave3", name: "Sustainment cadence in place" },
      },
    ],
  },
  {
    slug: "mfg-iso-9001",
    name: "ISO 9001 Quality Management System",
    summary: "Implement or recertify ISO 9001 QMS across a manufacturing site.",
    description: "Implement a compliant ISO 9001:2015 Quality Management System or prepare for recertification: scope, processes, internal audits, management review, and certification audit.",
    category: "Quality",
    icon: "Award",
    phases: [
      {
        slug: "scope",
        name: "Scope & Gap",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "scope", name: "Scope & context", days: 8 },
          { slug: "gap", name: "Gap assessment", days: 12 },
        ],
        milestone: { slug: "ms-scope", name: "Scope confirmed" },
      },
      {
        slug: "process",
        name: "Process Design",
        tasks: [
          { slug: "process-map", name: "Process map & turtle diagrams", days: 20 },
          { slug: "policy", name: "Quality policy & objectives", days: 5 },
          { slug: "manual", name: "QMS documentation", days: 25 },
          { slug: "risk", name: "Risk-based thinking & risk register", days: 12 },
        ],
        milestone: { slug: "ms-process", name: "QMS documentation complete" },
      },
      {
        slug: "implement",
        name: "Implement",
        tasks: [
          { slug: "training", name: "Workforce training", days: 20 },
          { slug: "operations", name: "Operate per QMS (3 months)", days: 60 },
          { slug: "internal-audit", name: "Internal audit cycle", days: 15 },
          { slug: "mgmt-review", name: "Management review", days: 5 },
          { slug: "corrective", name: "Corrective actions", days: 20 },
        ],
        milestone: { slug: "ms-implement", name: "Internal evidence complete" },
      },
      {
        slug: "audit",
        name: "Certification Audit",
        tasks: [
          { slug: "stage1", name: "Stage 1 audit", days: 5 },
          { slug: "remediation", name: "Stage 1 remediation", days: 15 },
          { slug: "stage2", name: "Stage 2 audit", days: 5 },
          { slug: "cert", name: "Certificate issuance", days: 10 },
        ],
        milestone: { slug: "ms-audit", name: "ISO 9001 certified" },
      },
    ],
  },
  {
    slug: "mfg-plant-relocation",
    name: "Plant Relocation / Greenfield Build",
    summary: "Site selection through hot cutover for relocating or standing up a plant.",
    description: "Relocate manufacturing operations to a new facility (or stand up a greenfield plant): site selection, facility build, equipment move, validation, and production transfer with minimal downtime.",
    category: "Capital",
    icon: "Truck",
    phases: [
      {
        slug: "site",
        name: "Site Selection",
        tasks: [
          { slug: "criteria", name: "Site criteria & shortlist", days: 15 },
          { slug: "diligence", name: "Site due diligence", days: 25 },
          { slug: "incentives", name: "Incentives & permitting", days: 30 },
          { slug: "selection", name: "Site selection decision", days: 5 },
        ],
        milestone: { slug: "ms-site", name: "Site selected" },
      },
      {
        slug: "design",
        name: "Facility Design",
        tasks: [
          { slug: "concept", name: "Concept design & layout", days: 25 },
          { slug: "detail", name: "Detailed design", days: 45 },
          { slug: "permits", name: "Permits & approvals", days: 40 },
        ],
        milestone: { slug: "ms-design", name: "Design released" },
      },
      {
        slug: "build",
        name: "Construction & Fit-Out",
        tasks: [
          { slug: "shell", name: "Building shell construction", days: 90 },
          { slug: "utilities", name: "Utilities & services", days: 60 },
          { slug: "fit-out", name: "Interior fit-out", days: 45 },
          { slug: "fire-life", name: "Fire & life safety", days: 25 },
        ],
        milestone: { slug: "ms-build", name: "Building beneficial occupancy" },
      },
      {
        slug: "equipment",
        name: "Equipment Move & Install",
        tasks: [
          { slug: "rigging", name: "Rigging & transport plan", days: 15 },
          { slug: "move", name: "Equipment relocation", days: 20 },
          { slug: "install", name: "Install & commissioning", days: 30 },
          { slug: "validation", name: "Equipment validation (FAT/SAT)", days: 25 },
        ],
        milestone: { slug: "ms-equipment", name: "Equipment validated" },
      },
      {
        slug: "transfer",
        name: "Production Transfer",
        tasks: [
          { slug: "ppap", name: "PPAP / re-qualification", days: 30 },
          { slug: "pilot", name: "Pilot production runs", days: 20 },
          { slug: "ramp", name: "Production ramp", days: 30 },
          { slug: "old-site", name: "Old site decommission", days: 20 },
        ],
        milestone: { slug: "ms-transfer", name: "Production transferred" },
      },
    ],
  },
  {
    slug: "mfg-iatf-16949",
    name: "IATF 16949 Automotive QMS Certification",
    summary: "Automotive QMS implementation: APQP, PPAP, FMEA, and certification audit.",
    description: "Implement IATF 16949 automotive Quality Management System: customer-specific requirements, APQP, PPAP, FMEA, control plans, and IATF certification audit.",
    category: "Quality",
    icon: "ShieldCheck",
    phases: [
      {
        slug: "scope",
        name: "Scope",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "csr", name: "Customer-specific requirements review", days: 10 },
          { slug: "gap", name: "Gap analysis vs. IATF 16949", days: 15 },
        ],
        milestone: { slug: "ms-scope", name: "Scope baseline" },
      },
      {
        slug: "core-tools",
        name: "Core Tools Implementation",
        tasks: [
          { slug: "apqp", name: "APQP framework rollout", days: 25 },
          { slug: "fmea", name: "Process & design FMEAs", days: 30 },
          { slug: "ppap", name: "PPAP submission packages", days: 20 },
          { slug: "msa", name: "Measurement Systems Analysis", days: 15 },
          { slug: "spc", name: "Statistical Process Control", days: 20 },
          { slug: "control-plans", name: "Control plans", days: 20 },
        ],
        milestone: { slug: "ms-core-tools", name: "Core tools live" },
      },
      {
        slug: "operate",
        name: "Operate & Audit",
        tasks: [
          { slug: "training", name: "Workforce training", days: 20 },
          { slug: "operate", name: "Operate per QMS (4 months)", days: 80 },
          { slug: "internal", name: "Internal audits", days: 20 },
        ],
        milestone: { slug: "ms-operate", name: "Audit evidence complete" },
      },
      {
        slug: "certify",
        name: "Certification",
        tasks: [
          { slug: "stage1", name: "Stage 1 audit", days: 5 },
          { slug: "stage2", name: "Stage 2 audit", days: 8 },
          { slug: "remediation", name: "Non-conformance remediation", days: 25 },
          { slug: "cert", name: "Certificate issued", days: 15 },
        ],
        milestone: { slug: "ms-certify", name: "IATF 16949 certified" },
      },
    ],
  },
  {
    slug: "mfg-supply-chain-resilience",
    name: "Supply Chain Resilience Program",
    summary: "Dual-source critical inputs, build inventory buffers, and stand up control tower.",
    description: "Increase supply chain resilience after a disruption: critical-input mapping, alternate-source qualification, inventory buffer optimization, and a multi-tier control tower.",
    category: "Supply Chain",
    icon: "Network",
    phases: [
      {
        slug: "map",
        name: "Map & Diagnose",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "criticality", name: "Component criticality scoring", days: 15 },
          { slug: "tier-mapping", name: "Multi-tier supplier mapping", days: 25 },
          { slug: "risk", name: "Risk scoring & dependencies", days: 12 },
        ],
        milestone: { slug: "ms-map", name: "Risk map complete" },
      },
      {
        slug: "second-source",
        name: "Second-Source Qualification",
        tasks: [
          { slug: "shortlist", name: "Alternate supplier shortlist", days: 15 },
          { slug: "engagement", name: "Engagement & samples", days: 25 },
          { slug: "ppap", name: "PPAP / qualification", days: 45 },
          { slug: "contracts", name: "Contracts & pricing", days: 25 },
        ],
        milestone: { slug: "ms-second", name: "Second sources qualified" },
      },
      {
        slug: "inventory",
        name: "Inventory Strategy",
        tasks: [
          { slug: "policy", name: "Inventory policy by criticality", days: 12 },
          { slug: "buffers", name: "Buffer build", days: 30 },
          { slug: "vmi", name: "VMI / consignment programs", days: 20 },
        ],
        milestone: { slug: "ms-inventory", name: "Inventory strategy live" },
      },
      {
        slug: "control-tower",
        name: "Control Tower",
        tasks: [
          { slug: "platform", name: "Control tower platform setup", days: 25 },
          { slug: "data-integration", name: "Supplier data integration", days: 25 },
          { slug: "playbooks", name: "Disruption playbooks", days: 12 },
        ],
        milestone: { slug: "ms-control-tower", name: "Control tower live" },
      },
    ],
  },
  {
    slug: "mfg-warehouse-automation",
    name: "Warehouse Automation Deployment",
    summary: "Automate a DC with AS/RS, AMRs, or shuttle systems and a new WMS.",
    description: "Automate a distribution center with conveyance, AS/RS or shuttle systems, AMRs, and a modern Warehouse Management System. Includes WMS implementation, integration, and steady-state cutover.",
    category: "Logistics",
    icon: "Boxes",
    phases: [
      {
        slug: "design",
        name: "Design",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "data-analysis", name: "Slotting & throughput analysis", days: 20 },
          { slug: "concept", name: "Concept design & simulation", days: 25 },
          { slug: "vendor-select", name: "Integrator & equipment selection", days: 30 },
        ],
        milestone: { slug: "ms-design", name: "Design approved" },
      },
      {
        slug: "build",
        name: "Build",
        tasks: [
          { slug: "civil", name: "Civil & structural prep", days: 45 },
          { slug: "equipment", name: "Equipment fabrication & delivery", days: 90 },
          { slug: "install", name: "Installation", days: 60 },
          { slug: "wms", name: "WMS configuration & build", days: 50 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "commission",
        name: "Commission",
        tasks: [
          { slug: "fat", name: "Factory acceptance test", days: 15 },
          { slug: "sat", name: "Site acceptance test", days: 20 },
          { slug: "integration-test", name: "WMS / WCS / equipment integration test", days: 20 },
          { slug: "perf", name: "Performance test (rate & dwell)", days: 15 },
        ],
        milestone: { slug: "ms-commission", name: "Commissioned" },
      },
      {
        slug: "cutover",
        name: "Cutover & Ramp",
        tasks: [
          { slug: "training", name: "Operator training", days: 12 },
          { slug: "cutover", name: "Cutover weekend", days: 5 },
          { slug: "ramp", name: "Ramp to design rate", days: 45 },
        ],
        milestone: { slug: "ms-cutover", name: "Steady-state achieved" },
      },
    ],
  },
  {
    slug: "mfg-product-recall",
    name: "Product Recall Execution",
    summary: "Manage a regulator-coordinated product recall end to end.",
    description: "Execute a regulator-coordinated product recall: classify, scope, regulator notification, customer communications, retrieval, replacement, and effectiveness checks.",
    category: "Quality",
    icon: "AlertTriangle",
    phases: [
      {
        slug: "trigger",
        name: "Trigger & Classification",
        tasks: [
          { slug: "incident", name: "Incident triage & RCA kick-off", days: 3 },
          { slug: "classify", name: "Classify hazard & severity", days: 3 },
          { slug: "scope", name: "Affected lots / serials scoping", days: 5 },
        ],
        milestone: { slug: "ms-trigger", name: "Recall declared" },
      },
      {
        slug: "regulators",
        name: "Regulator Engagement",
        tasks: [
          { slug: "notify", name: "Regulator notification (FDA / CPSC / NHTSA)", days: 2 },
          { slug: "strategy", name: "Recall strategy submission", days: 8 },
          { slug: "press", name: "Press release & website notice", days: 3 },
        ],
        milestone: { slug: "ms-regulators", name: "Regulator strategy approved" },
      },
      {
        slug: "execute",
        name: "Execution",
        tasks: [
          { slug: "customer-list", name: "Customer / distributor lists", days: 5 },
          { slug: "outreach", name: "Customer outreach (multi-channel)", days: 30 },
          { slug: "retrieval", name: "Retrieval / repair / refund logistics", days: 60 },
          { slug: "tracking", name: "Recall tracking dashboard", days: 8 },
        ],
        milestone: { slug: "ms-execute", name: "Execution underway" },
      },
      {
        slug: "close",
        name: "Effectiveness & Closure",
        tasks: [
          { slug: "effectiveness", name: "Effectiveness checks", days: 30 },
          { slug: "rca", name: "Final root cause & CAPA", days: 25 },
          { slug: "regulator-close", name: "Regulator closeout", days: 30 },
        ],
        milestone: { slug: "ms-close", name: "Recall closed" },
      },
    ],
  },
];

export async function seedManufacturingSystemTemplates(): Promise<void> {
  await seedTemplateLibrary({
    industry: "manufacturing",
    plans: PLANS,
    logTag: "manufacturing-templates",
  });
}

export const MANUFACTURING_TEMPLATE_SLUGS = PLANS.map((p) => p.slug);
