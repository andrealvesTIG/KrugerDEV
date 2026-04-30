/**
 * Industrial Automation system template library seeder.
 *
 * Curated plans for OT/automation engineers and integrators: PLC/SCADA
 * upgrades, robot cells, IIoT, OT cybersecurity, batch process projects.
 */

import {
  seedTemplateLibrary,
  type TemplatePlan,
} from "./systemTemplateLibrary";

const PLANS: TemplatePlan[] = [
  {
    slug: "ia-plc-scada-upgrade",
    name: "PLC & SCADA Migration",
    summary: "Migrate aging PLCs and SCADA to modern controllers with minimal downtime.",
    description: "End-of-life PLC and SCADA migration: code conversion, I/O rewire, HMI redevelopment, factory acceptance test, site acceptance test, and phased cutover.",
    category: "Controls",
    icon: "Cpu",
    phases: [
      {
        slug: "assess",
        name: "Assess",
        tasks: [
          { slug: "kickoff", name: "Kickoff & sponsor alignment", days: 3 },
          { slug: "audit", name: "Existing controls audit", days: 12 },
          { slug: "io-list", name: "I/O list extraction", days: 10 },
          { slug: "logic-extract", name: "Legacy logic export", days: 8 },
        ],
        milestone: { slug: "ms-assess", name: "Assessment baseline" },
      },
      {
        slug: "design",
        name: "Design",
        tasks: [
          { slug: "platform", name: "Target platform selection", days: 5 },
          { slug: "arch", name: "Network & redundancy architecture", days: 10 },
          { slug: "panel", name: "Panel design & BOM", days: 15 },
          { slug: "logic-redesign", name: "Logic redesign & standards", days: 25 },
          { slug: "hmi", name: "HMI redesign", days: 20 },
        ],
        milestone: { slug: "ms-design", name: "Design released" },
      },
      {
        slug: "build",
        name: "Build & FAT",
        tasks: [
          { slug: "panels", name: "Panel fabrication", days: 30 },
          { slug: "code", name: "PLC code development", days: 35 },
          { slug: "hmi-build", name: "HMI/SCADA development", days: 30 },
          { slug: "simulation", name: "Simulation environment", days: 12 },
          { slug: "fat", name: "Factory acceptance test", days: 10 },
        ],
        milestone: { slug: "ms-build", name: "FAT pass" },
      },
      {
        slug: "site",
        name: "Site Install & SAT",
        tasks: [
          { slug: "rewire", name: "I/O rewiring", days: 20 },
          { slug: "io-check", name: "Loop checks & I/O test", days: 12 },
          { slug: "commissioning", name: "Loop commissioning", days: 15 },
          { slug: "sat", name: "Site acceptance test", days: 10 },
        ],
        milestone: { slug: "ms-site", name: "SAT pass" },
      },
      {
        slug: "cutover",
        name: "Cutover & Stabilize",
        tasks: [
          { slug: "training", name: "Operator & maintenance training", days: 10 },
          { slug: "hot-cutover", name: "Hot cutover", days: 5 },
          { slug: "stabilize", name: "Stabilization (4 weeks)", days: 20 },
        ],
        milestone: { slug: "ms-cutover", name: "Production stable" },
      },
    ],
  },
  {
    slug: "ia-robot-cell",
    name: "Robotic Work Cell Deployment",
    summary: "Design, integrate, and qualify a robot cell (assembly, weld, pick & place).",
    description: "Stand up a new robotic work cell — robot selection, end-of-arm-tooling, fixtures, safety, vision, integration, FAT, SAT, and operator training.",
    category: "Robotics",
    icon: "Bot",
    phases: [
      {
        slug: "concept",
        name: "Concept",
        tasks: [
          { slug: "kickoff", name: "Kickoff & process review", days: 3 },
          { slug: "cycle", name: "Cycle-time study & throughput targets", days: 8 },
          { slug: "robot-select", name: "Robot platform selection", days: 8 },
          { slug: "concept-layout", name: "Concept layout & ROI", days: 8 },
        ],
        milestone: { slug: "ms-concept", name: "Concept approved" },
      },
      {
        slug: "design",
        name: "Detailed Design",
        tasks: [
          { slug: "eoat", name: "End-of-arm-tool design", days: 20 },
          { slug: "fixtures", name: "Fixtures & nests", days: 25 },
          { slug: "safety", name: "Safety design (Cat 3 / PLd)", days: 15 },
          { slug: "vision", name: "Vision system design", days: 15 },
          { slug: "controls", name: "Controls & integration design", days: 15 },
        ],
        milestone: { slug: "ms-design", name: "Design released" },
      },
      {
        slug: "build",
        name: "Build & FAT",
        tasks: [
          { slug: "fab", name: "Fabrication & assembly", days: 35 },
          { slug: "program", name: "Robot programming", days: 25 },
          { slug: "vision-prog", name: "Vision setup & teaching", days: 15 },
          { slug: "fat", name: "FAT (with parts)", days: 10 },
        ],
        milestone: { slug: "ms-build", name: "FAT pass" },
      },
      {
        slug: "install",
        name: "Site Install & SAT",
        tasks: [
          { slug: "ship", name: "Ship & install", days: 15 },
          { slug: "safety-cert", name: "Safety certification & risk assessment", days: 10 },
          { slug: "sat", name: "SAT", days: 10 },
          { slug: "ramp", name: "Production ramp", days: 20 },
        ],
        milestone: { slug: "ms-install", name: "Cell qualified" },
      },
    ],
  },
  {
    slug: "ia-iiot-platform",
    name: "Industrial IoT Platform Rollout",
    summary: "Connect plant assets to an IIoT platform for monitoring and analytics.",
    description: "Deploy an IIoT platform: edge gateways, asset connectivity (OPC UA, Modbus, MQTT), cloud ingestion, data model, dashboards, and predictive maintenance use cases.",
    category: "IIoT & Analytics",
    icon: "Wifi",
    phases: [
      {
        slug: "strategy",
        name: "Strategy",
        tasks: [
          { slug: "use-cases", name: "Use case prioritization", days: 10 },
          { slug: "platform", name: "Platform selection (vs. build)", days: 15 },
          { slug: "biz-case", name: "Business case", days: 8 },
        ],
        milestone: { slug: "ms-strategy", name: "Strategy approved" },
      },
      {
        slug: "edge",
        name: "Edge & Connectivity",
        tasks: [
          { slug: "asset-inv", name: "Asset & protocol inventory", days: 15 },
          { slug: "gateway-deploy", name: "Edge gateway deployment", days: 25 },
          { slug: "ot-network", name: "OT network segmentation", days: 15 },
          { slug: "tag-mapping", name: "Tag dictionary & namespace", days: 12 },
        ],
        milestone: { slug: "ms-edge", name: "Edge connectivity live" },
      },
      {
        slug: "platform-build",
        name: "Cloud Platform Build",
        tasks: [
          { slug: "ingestion", name: "Ingestion pipeline", days: 15 },
          { slug: "data-model", name: "Asset data model (UNS / ISA-95)", days: 20 },
          { slug: "storage", name: "Time-series storage tuning", days: 10 },
          { slug: "security", name: "Security & access controls", days: 12 },
        ],
        milestone: { slug: "ms-platform", name: "Platform live" },
      },
      {
        slug: "use-cases",
        name: "Use Cases",
        tasks: [
          { slug: "oee", name: "OEE dashboards", days: 15 },
          { slug: "energy", name: "Energy monitoring", days: 12 },
          { slug: "pdm", name: "Predictive maintenance pilot", days: 30 },
          { slug: "alarms", name: "Alarm & event analytics", days: 12 },
        ],
        milestone: { slug: "ms-use-cases", name: "Use cases live" },
      },
      {
        slug: "scale",
        name: "Scale",
        tasks: [
          { slug: "wave1", name: "Wave 1 plants onboard", days: 25 },
          { slug: "wave2", name: "Wave 2 plants onboard", days: 25 },
          { slug: "ops", name: "Operating model & ownership", days: 10 },
        ],
        milestone: { slug: "ms-scale", name: "Multi-plant rollout complete" },
      },
    ],
  },
  {
    slug: "ia-ot-cybersecurity",
    name: "OT Cybersecurity Program (IEC 62443)",
    summary: "Stand up an OT cybersecurity program aligned to IEC 62443.",
    description: "Implement an OT cybersecurity program aligned to IEC 62443: asset inventory, zones & conduits, vulnerability management, secure remote access, monitoring, and incident response.",
    category: "OT Security",
    icon: "Lock",
    phases: [
      {
        slug: "discover",
        name: "Discover",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "inventory", name: "Passive OT asset inventory", days: 25 },
          { slug: "data-flows", name: "Data flow mapping", days: 12 },
          { slug: "risk", name: "Risk assessment per ISA/IEC 62443", days: 15 },
        ],
        milestone: { slug: "ms-discover", name: "Risk baseline" },
      },
      {
        slug: "architect",
        name: "Zones & Conduits",
        tasks: [
          { slug: "zoning", name: "Zone & conduit design", days: 15 },
          { slug: "segmentation", name: "Network segmentation build", days: 30 },
          { slug: "firewalls", name: "Firewall rules & DPI", days: 20 },
          { slug: "remote-access", name: "Secure remote access", days: 20 },
        ],
        milestone: { slug: "ms-architect", name: "Architecture remediated" },
      },
      {
        slug: "harden",
        name: "Harden",
        tasks: [
          { slug: "patch-strategy", name: "Patch & change strategy", days: 10 },
          { slug: "endpoints", name: "OT endpoint hardening", days: 20 },
          { slug: "backup", name: "Configuration backup & golden images", days: 15 },
          { slug: "vendor", name: "Vendor risk & supply chain", days: 12 },
        ],
        milestone: { slug: "ms-harden", name: "Hardening complete" },
      },
      {
        slug: "monitor",
        name: "Monitor & Respond",
        tasks: [
          { slug: "ot-siem", name: "OT detection / SIEM", days: 20 },
          { slug: "playbooks", name: "Playbooks & runbooks", days: 12 },
          { slug: "tabletop", name: "Tabletop exercises", days: 5 },
          { slug: "soc-handover", name: "SOC handover", days: 10 },
        ],
        milestone: { slug: "ms-monitor", name: "Monitoring live" },
      },
    ],
  },
  {
    slug: "ia-mes-pi-historian",
    name: "Process Historian (PI / Aveva) Deployment",
    summary: "Deploy a process historian with interfaces, AF model, and analytics.",
    description: "Deploy an OSIsoft PI / Aveva PI System (or equivalent historian): interfaces, asset framework model, event frames, analytics, and notifications.",
    category: "IIoT & Analytics",
    icon: "Database",
    phases: [
      {
        slug: "design",
        name: "Design",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "tag-survey", name: "Tag survey & criticality", days: 15 },
          { slug: "af-model", name: "Asset Framework model design", days: 20 },
          { slug: "naming", name: "Naming conventions", days: 5 },
        ],
        milestone: { slug: "ms-design", name: "Design baseline" },
      },
      {
        slug: "build",
        name: "Build",
        tasks: [
          { slug: "infrastructure", name: "Infrastructure & HA setup", days: 12 },
          { slug: "interfaces", name: "Source-system interfaces", days: 25 },
          { slug: "af-build", name: "AF templates & elements", days: 25 },
          { slug: "event-frames", name: "Event frames & analytics", days: 18 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "consume",
        name: "Consumption",
        tasks: [
          { slug: "vision", name: "PI Vision dashboards", days: 20 },
          { slug: "notifications", name: "Notifications & subscriptions", days: 8 },
          { slug: "integration", name: "Downstream integration (BI, ML)", days: 15 },
        ],
        milestone: { slug: "ms-consume", name: "Consumers live" },
      },
      {
        slug: "operate",
        name: "Operate",
        tasks: [
          { slug: "training", name: "Engineer & analyst training", days: 10 },
          { slug: "support", name: "Support model & runbooks", days: 8 },
        ],
        milestone: { slug: "ms-operate", name: "Operational handover" },
      },
    ],
  },
  {
    slug: "ia-batch-process",
    name: "ISA-88 Batch Control System",
    summary: "Implement an ISA-88 batch control system on a chemical or pharma line.",
    description: "Implement an ISA-88 batch control system on a process line: recipe model, equipment model, batch engine, electronic batch records, and integration to MES/ERP.",
    category: "Process Control",
    icon: "Beaker",
    phases: [
      {
        slug: "model",
        name: "Process Model",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "physical", name: "Physical model (S88)", days: 12 },
          { slug: "procedural", name: "Procedural model (recipes)", days: 20 },
          { slug: "process-cells", name: "Process cell decomposition", days: 10 },
        ],
        milestone: { slug: "ms-model", name: "S88 model approved" },
      },
      {
        slug: "build",
        name: "Build",
        tasks: [
          { slug: "phases", name: "Equipment phases", days: 30 },
          { slug: "operations", name: "Operations & unit procedures", days: 25 },
          { slug: "recipes", name: "Master recipes", days: 25 },
          { slug: "ebr", name: "Electronic batch records", days: 20 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "qualify",
        name: "Qualify",
        tasks: [
          { slug: "iq-oq", name: "IQ / OQ", days: 20 },
          { slug: "pq", name: "PQ runs", days: 25 },
          { slug: "validation", name: "Validation report", days: 12 },
        ],
        milestone: { slug: "ms-qualify", name: "System qualified" },
      },
      {
        slug: "release",
        name: "Release & Train",
        tasks: [
          { slug: "training", name: "Operator & supervisor training", days: 12 },
          { slug: "release", name: "Release to production", days: 5 },
          { slug: "stabilize", name: "Stabilization", days: 20 },
        ],
        milestone: { slug: "ms-release", name: "Production release" },
      },
    ],
  },
  {
    slug: "ia-vfd-motor-upgrade",
    name: "VFD & Motor Control Center Upgrade",
    summary: "Replace legacy MCCs and add VFDs across a motor population.",
    description: "Replace aging Motor Control Centers and deploy variable-frequency drives across a motor population for energy savings and process flexibility. Includes harmonics study and commissioning.",
    category: "Power & Drives",
    icon: "Zap",
    phases: [
      {
        slug: "study",
        name: "Engineering Study",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "motor-list", name: "Motor list & criticality", days: 12 },
          { slug: "harmonics", name: "Harmonics & power quality study", days: 15 },
          { slug: "savings", name: "Energy savings analysis", days: 10 },
        ],
        milestone: { slug: "ms-study", name: "Study complete" },
      },
      {
        slug: "design",
        name: "Design",
        tasks: [
          { slug: "single-line", name: "Single-line diagrams", days: 12 },
          { slug: "panel-design", name: "MCC & VFD panel design", days: 25 },
          { slug: "controls-design", name: "Controls integration design", days: 15 },
        ],
        milestone: { slug: "ms-design", name: "Design released" },
      },
      {
        slug: "build",
        name: "Procurement & Build",
        tasks: [
          { slug: "procure", name: "MCC & VFD procurement", days: 60 },
          { slug: "panel-fab", name: "Panel fabrication", days: 30 },
          { slug: "fat", name: "Factory acceptance test", days: 10 },
        ],
        milestone: { slug: "ms-build", name: "FAT pass" },
      },
      {
        slug: "install",
        name: "Install & Commission",
        tasks: [
          { slug: "demo", name: "Demolition / lockout-tagout", days: 10 },
          { slug: "install", name: "Installation", days: 30 },
          { slug: "commissioning", name: "Commissioning & loop checks", days: 20 },
          { slug: "training", name: "Maintenance training", days: 5 },
        ],
        milestone: { slug: "ms-install", name: "Production restored" },
      },
    ],
  },
  {
    slug: "ia-functional-safety",
    name: "Functional Safety / SIS Project (IEC 61511)",
    summary: "Design, build, and validate a Safety Instrumented System.",
    description: "Implement a Safety Instrumented System (SIS) per IEC 61511: HAZOP, LOPA, SIL allocation, design, FAT, SAT, and proof-test program.",
    category: "Process Safety",
    icon: "ShieldAlert",
    phases: [
      {
        slug: "hazard",
        name: "Hazard & Risk",
        tasks: [
          { slug: "hazop", name: "HAZOP study", days: 15 },
          { slug: "lopa", name: "LOPA & SIL allocation", days: 15 },
          { slug: "srs", name: "Safety requirements specification", days: 15 },
        ],
        milestone: { slug: "ms-hazard", name: "SRS approved" },
      },
      {
        slug: "design",
        name: "Design",
        tasks: [
          { slug: "arch", name: "SIF architecture & PFDavg calc", days: 20 },
          { slug: "instrumentation", name: "Instrumentation selection", days: 15 },
          { slug: "logic", name: "Safety logic design", days: 20 },
        ],
        milestone: { slug: "ms-design", name: "Design verified" },
      },
      {
        slug: "build",
        name: "Build & FAT",
        tasks: [
          { slug: "panels", name: "Safety panels", days: 25 },
          { slug: "code", name: "Logic implementation", days: 25 },
          { slug: "fat", name: "FAT", days: 12 },
        ],
        milestone: { slug: "ms-build", name: "FAT pass" },
      },
      {
        slug: "site",
        name: "Site Install & SAT",
        tasks: [
          { slug: "install", name: "Install & loop checks", days: 25 },
          { slug: "sat", name: "SAT", days: 12 },
          { slug: "validation", name: "Safety validation report", days: 8 },
        ],
        milestone: { slug: "ms-site", name: "SIS validated" },
      },
      {
        slug: "operate",
        name: "Operate",
        tasks: [
          { slug: "proof-test", name: "Proof-test program rollout", days: 12 },
          { slug: "moc", name: "Management of change", days: 8 },
          { slug: "training", name: "Operations training", days: 8 },
        ],
        milestone: { slug: "ms-operate", name: "Operational handover" },
      },
    ],
  },
  {
    slug: "ia-line-controls-upgrade",
    name: "Production Line Controls Upgrade",
    summary: "Mid-life controls upgrade on a single production line.",
    description: "Single-line controls upgrade: PLC refresh, drive replacement, HMI redo, safety upgrade, and production transfer with minimal downtime window.",
    category: "Controls",
    icon: "Settings",
    phases: [
      {
        slug: "scope",
        name: "Scope & Design",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "audit", name: "Existing controls audit", days: 8 },
          { slug: "design", name: "Upgrade design", days: 15 },
        ],
        milestone: { slug: "ms-scope", name: "Design baseline" },
      },
      {
        slug: "build",
        name: "Build",
        tasks: [
          { slug: "panels", name: "Panel fabrication", days: 25 },
          { slug: "logic", name: "PLC & HMI development", days: 25 },
          { slug: "fat", name: "FAT", days: 8 },
        ],
        milestone: { slug: "ms-build", name: "FAT pass" },
      },
      {
        slug: "install",
        name: "Site Install",
        tasks: [
          { slug: "shutdown", name: "Shutdown plan", days: 5 },
          { slug: "rewire", name: "Rewire & install", days: 14 },
          { slug: "commissioning", name: "Commissioning", days: 10 },
        ],
        milestone: { slug: "ms-install", name: "Line restarted" },
      },
      {
        slug: "ramp",
        name: "Ramp",
        tasks: [
          { slug: "ramp", name: "Production ramp", days: 15 },
          { slug: "training", name: "Operator & maintenance training", days: 5 },
        ],
        milestone: { slug: "ms-ramp", name: "Ramp complete" },
      },
    ],
  },
  {
    slug: "ia-digital-twin",
    name: "Digital Twin for Plant Operations",
    summary: "Build a process & asset digital twin for monitoring and what-if scenarios.",
    description: "Build a digital twin for plant operations: 3D / process model, real-time data binding, simulation engine, and scenario library for operator training and what-if analysis.",
    category: "IIoT & Analytics",
    icon: "Boxes",
    phases: [
      {
        slug: "scope",
        name: "Scope",
        tasks: [
          { slug: "use-cases", name: "Use case selection", days: 10 },
          { slug: "platform", name: "Platform & data architecture", days: 12 },
        ],
        milestone: { slug: "ms-scope", name: "Scope confirmed" },
      },
      {
        slug: "model",
        name: "Model",
        tasks: [
          { slug: "asset-model", name: "Asset & process model", days: 25 },
          { slug: "3d", name: "3D / geometric model", days: 20 },
          { slug: "physics", name: "Physics / simulation engine", days: 25 },
        ],
        milestone: { slug: "ms-model", name: "Twin model ready" },
      },
      {
        slug: "bind",
        name: "Live Data Binding",
        tasks: [
          { slug: "tag-binding", name: "Tag binding & quality monitor", days: 15 },
          { slug: "calibration", name: "Calibration vs. plant", days: 15 },
          { slug: "dashboards", name: "Operator dashboards", days: 12 },
        ],
        milestone: { slug: "ms-bind", name: "Live twin operational" },
      },
      {
        slug: "scenarios",
        name: "Scenarios & Training",
        tasks: [
          { slug: "scenarios", name: "Scenario library", days: 20 },
          { slug: "ots", name: "Operator training simulator content", days: 15 },
          { slug: "what-if", name: "What-if dashboards", days: 12 },
        ],
        milestone: { slug: "ms-scenarios", name: "Scenarios live" },
      },
    ],
  },
];

export async function seedIndustrialAutomationSystemTemplates(): Promise<void> {
  await seedTemplateLibrary({
    industry: "industrial-automation",
    plans: PLANS,
    logTag: "industrial-automation-templates",
  });
}

export const INDUSTRIAL_AUTOMATION_TEMPLATE_SLUGS = PLANS.map((p) => p.slug);
