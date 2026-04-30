/**
 * Energy & Utilities system template library seeder.
 *
 * Curated plans for power, oil & gas, midstream, and utilities: substation,
 * AMI, wind farm, pipeline, refinery turnaround, and grid-modernization.
 */

import {
  seedTemplateLibrary,
  type TemplatePlan,
} from "./systemTemplateLibrary";

const PLANS: TemplatePlan[] = [
  {
    slug: "eu-substation-construction",
    name: "Substation Construction (138/345 kV)",
    summary: "Greenfield substation from civil to energization and SCADA cutover.",
    description: "Owner-led construction of a transmission substation: civil works, structures, transformers and switchgear, protection & control, SCADA, and energization with system operator coordination.",
    category: "Transmission & Distribution",
    icon: "Zap",
    phases: [
      {
        slug: "engineering",
        name: "Engineering",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "single-line", name: "Single-line & protection design", days: 35 },
          { slug: "civil-design", name: "Civil & structural design", days: 30 },
          { slug: "p-and-c", name: "Protection & control design", days: 35 },
          { slug: "scada-design", name: "SCADA / RTU design", days: 25 },
        ],
        milestone: { slug: "ms-eng", name: "IFC released" },
      },
      {
        slug: "procurement",
        name: "Procurement",
        tasks: [
          { slug: "transformer", name: "Power transformer (long-lead)", days: 240 },
          { slug: "switchgear", name: "Breakers & disconnects", days: 180 },
          { slug: "protection", name: "Protection relays", days: 90 },
          { slug: "structures", name: "Steel structures", days: 90 },
        ],
        milestone: { slug: "ms-procurement", name: "Major equipment delivered" },
      },
      {
        slug: "civil",
        name: "Civil & Structures",
        tasks: [
          { slug: "earthworks", name: "Earthworks & grading", days: 25 },
          { slug: "ground-grid", name: "Ground grid", days: 20 },
          { slug: "foundations", name: "Foundations", days: 30 },
          { slug: "structures-erect", name: "Structure erection", days: 25 },
          { slug: "fence", name: "Perimeter fence", days: 12 },
          { slug: "controls-bldg", name: "Control building", days: 35 },
        ],
        milestone: { slug: "ms-civil", name: "Civil complete" },
      },
      {
        slug: "install",
        name: "Equipment Install & Wiring",
        tasks: [
          { slug: "transformer-set", name: "Transformer setting", days: 10 },
          { slug: "switchgear-install", name: "Switchgear install", days: 25 },
          { slug: "bus", name: "Bus & conductor install", days: 25 },
          { slug: "control-cable", name: "Control cable & terminations", days: 30 },
          { slug: "scada-install", name: "SCADA / RTU install", days: 20 },
        ],
        milestone: { slug: "ms-install", name: "Mechanical completion" },
      },
      {
        slug: "commissioning",
        name: "Commissioning & Energization",
        tasks: [
          { slug: "relay-test", name: "Relay testing", days: 25 },
          { slug: "trip-checks", name: "Trip checks & end-to-end", days: 15 },
          { slug: "scada-pt", name: "SCADA point-to-point", days: 15 },
          { slug: "iso-coord", name: "ISO/RTO energization coordination", days: 15 },
          { slug: "energize", name: "Energization", days: 5 },
        ],
        milestone: { slug: "ms-energize", name: "In-service" },
      },
    ],
  },
  {
    slug: "eu-ami-rollout",
    name: "AMI / Smart Meter Rollout",
    summary: "Mass deployment of smart meters with head-end, MDM, and customer programs.",
    description: "Utility-wide Advanced Metering Infrastructure rollout: meter procurement, head-end & MDM, network deployment, mass meter exchange, billing integration, and customer-facing programs.",
    category: "Smart Grid",
    icon: "Gauge",
    phases: [
      {
        slug: "design",
        name: "Design & Vendor",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "vendor", name: "Meter & network vendor selection", days: 60 },
          { slug: "system-design", name: "Head-end / MDM design", days: 30 },
          { slug: "billing-design", name: "CIS / billing integration design", days: 25 },
        ],
        milestone: { slug: "ms-design", name: "Design baseline" },
      },
      {
        slug: "build",
        name: "Build & Integrate",
        tasks: [
          { slug: "head-end", name: "Head-end system build", days: 45 },
          { slug: "mdm", name: "Meter Data Management build", days: 50 },
          { slug: "billing-integration", name: "Billing integration", days: 40 },
          { slug: "network-design", name: "Mesh / cellular network design", days: 25 },
          { slug: "collector-deploy", name: "Collector / DCU deployment", days: 60 },
        ],
        milestone: { slug: "ms-build", name: "System ready" },
      },
      {
        slug: "pilot",
        name: "Pilot Deployment",
        tasks: [
          { slug: "pilot-prep", name: "Pilot circuit prep", days: 12 },
          { slug: "pilot-install", name: "Pilot meter install (5k meters)", days: 30 },
          { slug: "pilot-billing", name: "Pilot billing parallel", days: 60 },
        ],
        milestone: { slug: "ms-pilot", name: "Pilot successful" },
      },
      {
        slug: "mass",
        name: "Mass Deployment",
        tasks: [
          { slug: "logistics", name: "Logistics & field workforce ramp", days: 30 },
          { slug: "wave1", name: "Wave 1 deployment", days: 60 },
          { slug: "wave2", name: "Wave 2 deployment", days: 60 },
          { slug: "wave3", name: "Wave 3 deployment", days: 60 },
          { slug: "exception", name: "Exception meter handling", days: 60 },
        ],
        milestone: { slug: "ms-mass", name: "Mass deployment complete" },
      },
      {
        slug: "programs",
        name: "Customer Programs",
        tasks: [
          { slug: "portal", name: "Customer portal & insights", days: 30 },
          { slug: "tou", name: "Time-of-use rate enablement", days: 25 },
          { slug: "dr", name: "Demand response programs", days: 30 },
        ],
        milestone: { slug: "ms-programs", name: "Customer programs live" },
      },
    ],
  },
  {
    slug: "eu-onshore-wind-farm",
    name: "Onshore Wind Farm Construction",
    summary: "Wind farm construction from access roads to commercial operation.",
    description: "Owner / EPC plan for an onshore wind farm: civil access, foundations, turbine erection, collection system, substation, and commissioning to commercial operation.",
    category: "Renewables",
    icon: "Wind",
    phases: [
      {
        slug: "develop",
        name: "Development & Permits",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "interconnection", name: "Interconnection studies", days: 90 },
          { slug: "permits", name: "Permits & environmental approvals", days: 120 },
          { slug: "ppa", name: "PPA / offtake agreements", days: 60 },
        ],
        milestone: { slug: "ms-develop", name: "Notice to proceed" },
      },
      {
        slug: "engineering",
        name: "Engineering",
        tasks: [
          { slug: "site-eng", name: "Site & micrositing", days: 30 },
          { slug: "civil-eng", name: "Roads & foundations design", days: 35 },
          { slug: "electrical-eng", name: "Collection & substation design", days: 35 },
        ],
        milestone: { slug: "ms-eng", name: "IFC released" },
      },
      {
        slug: "civil",
        name: "Civil",
        tasks: [
          { slug: "access-roads", name: "Access roads & crane pads", days: 60 },
          { slug: "foundations", name: "Turbine foundations", days: 90 },
          { slug: "trenching", name: "Underground collection trenching", days: 60 },
        ],
        milestone: { slug: "ms-civil", name: "Civil complete" },
      },
      {
        slug: "turbines",
        name: "Turbine Delivery & Erection",
        tasks: [
          { slug: "logistics", name: "Component logistics to site", days: 75 },
          { slug: "tower", name: "Tower erection", days: 60 },
          { slug: "nacelle-rotor", name: "Nacelle & rotor erection", days: 60 },
          { slug: "mech-completion", name: "Mechanical completion", days: 30 },
        ],
        milestone: { slug: "ms-turbines", name: "Turbines erected" },
      },
      {
        slug: "electrical",
        name: "Collection & Substation",
        tasks: [
          { slug: "collection", name: "Collection cable install", days: 60 },
          { slug: "substation", name: "Project substation construction", days: 90 },
          { slug: "interconnection-build", name: "Interconnection facilities", days: 45 },
        ],
        milestone: { slug: "ms-electrical", name: "Electrical complete" },
      },
      {
        slug: "commissioning",
        name: "Commissioning & COD",
        tasks: [
          { slug: "turbine-comm", name: "Turbine commissioning", days: 45 },
          { slug: "energization", name: "First energization", days: 10 },
          { slug: "perf-test", name: "Performance / power-curve test", days: 30 },
          { slug: "cod", name: "Commercial operation date", days: 5 },
        ],
        milestone: { slug: "ms-cod", name: "COD achieved" },
      },
    ],
  },
  {
    slug: "eu-pipeline-construction",
    name: "Natural Gas Pipeline Construction",
    summary: "ROW acquisition through hydro-test for a midstream gas pipeline.",
    description: "Mainline natural gas pipeline construction: ROW acquisition, environmental compliance, mainline construction (clear, grade, weld, lower, backfill), HDDs at crossings, and hydro-test commissioning.",
    category: "Midstream",
    icon: "Cable",
    phases: [
      {
        slug: "develop",
        name: "Development & Permits",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "row", name: "ROW acquisition", days: 180 },
          { slug: "permits", name: "FERC / state permits", days: 240 },
          { slug: "environmental", name: "Environmental & cultural surveys", days: 90 },
        ],
        milestone: { slug: "ms-develop", name: "Construction authorization" },
      },
      {
        slug: "procurement",
        name: "Procurement",
        tasks: [
          { slug: "pipe", name: "Line pipe procurement & coating", days: 180 },
          { slug: "valves", name: "Mainline valves", days: 150 },
          { slug: "compressor", name: "Compressor station equipment", days: 240 },
        ],
        milestone: { slug: "ms-procurement", name: "Materials staged" },
      },
      {
        slug: "construction",
        name: "Mainline Construction",
        tasks: [
          { slug: "clear-grade", name: "Clear & grade ROW", days: 60 },
          { slug: "stringing", name: "Pipe stringing", days: 45 },
          { slug: "welding", name: "Welding & NDE", days: 90 },
          { slug: "ditch", name: "Trenching", days: 60 },
          { slug: "lower", name: "Lower-in & backfill", days: 60 },
          { slug: "tie-ins", name: "Tie-ins", days: 30 },
        ],
        milestone: { slug: "ms-construction", name: "Mainline laid" },
      },
      {
        slug: "crossings",
        name: "Special Crossings",
        tasks: [
          { slug: "hdd", name: "Horizontal directional drills", days: 60 },
          { slug: "bores", name: "Auger bores at roads", days: 30 },
          { slug: "river", name: "River crossings", days: 45 },
        ],
        milestone: { slug: "ms-crossings", name: "Crossings complete" },
      },
      {
        slug: "facilities",
        name: "Compressor / M&R Facilities",
        tasks: [
          { slug: "civil-facilities", name: "Facility civils", days: 60 },
          { slug: "compressor-install", name: "Compressor install", days: 60 },
          { slug: "meter-stations", name: "Meter & regulator stations", days: 45 },
        ],
        milestone: { slug: "ms-facilities", name: "Facilities complete" },
      },
      {
        slug: "commissioning",
        name: "Commissioning & In-Service",
        tasks: [
          { slug: "cleaning", name: "Cleaning & gauging pigs", days: 20 },
          { slug: "hydro", name: "Hydrostatic test", days: 25 },
          { slug: "drying", name: "Drying & dewatering", days: 15 },
          { slug: "purging", name: "Purging & gas-up", days: 10 },
          { slug: "in-service", name: "In-service", days: 5 },
        ],
        milestone: { slug: "ms-in-service", name: "Pipeline in service" },
      },
    ],
  },
  {
    slug: "eu-refinery-turnaround",
    name: "Refinery Turnaround (TAR)",
    summary: "Planned refinery turnaround: planning, shutdown, work execution, startup.",
    description: "Plan and execute a refinery / process plant turnaround: 18-month planning cycle, shutdown coordination, scope freeze, work-list execution, inspection, and startup back to feed.",
    category: "Operations",
    icon: "Factory",
    phases: [
      {
        slug: "long-range",
        name: "Long-Range Planning (T-18)",
        tasks: [
          { slug: "kickoff", name: "Kickoff & TAR organization", days: 5 },
          { slug: "scope-build", name: "Scope build & challenge", days: 45 },
          { slug: "long-lead", name: "Long-lead procurement", days: 90 },
          { slug: "estimate", name: "TAR estimate", days: 25 },
        ],
        milestone: { slug: "ms-long-range", name: "Scope freeze" },
      },
      {
        slug: "detail-plan",
        name: "Detailed Planning (T-6)",
        tasks: [
          { slug: "work-pack", name: "Work pack development", days: 60 },
          { slug: "schedule", name: "Detailed P6 schedule", days: 45 },
          { slug: "contractors", name: "Contractor mobilization plan", days: 30 },
          { slug: "logistics", name: "Site logistics & laydown", days: 25 },
          { slug: "safety", name: "Safety plan & permits", days: 25 },
        ],
        milestone: { slug: "ms-detail-plan", name: "Ready for execution" },
      },
      {
        slug: "shutdown",
        name: "Shutdown & Decontamination",
        tasks: [
          { slug: "feed-cut", name: "Feed cut & blowdown", days: 3 },
          { slug: "decon", name: "Decontamination & N2 purge", days: 5 },
          { slug: "isolation", name: "Equipment isolation & LOTO", days: 5 },
          { slug: "open-equip", name: "Open equipment & inspect", days: 5 },
        ],
        milestone: { slug: "ms-shutdown", name: "Equipment ready for work" },
      },
      {
        slug: "execution",
        name: "Work Execution",
        tasks: [
          { slug: "vessels", name: "Vessel & exchanger work", days: 25 },
          { slug: "rotating", name: "Rotating equipment overhaul", days: 20 },
          { slug: "piping", name: "Piping replacements", days: 25 },
          { slug: "instruments", name: "Instrumentation work", days: 20 },
          { slug: "inspection", name: "Inspection sign-offs", days: 25 },
        ],
        milestone: { slug: "ms-execution", name: "Work complete" },
      },
      {
        slug: "startup",
        name: "Startup",
        tasks: [
          { slug: "box-up", name: "Box-up & leak test", days: 5 },
          { slug: "n2-purge", name: "N2 purge & utilities", days: 4 },
          { slug: "feed-in", name: "Feed introduction", days: 4 },
          { slug: "stabilize", name: "Stabilization to spec", days: 7 },
        ],
        milestone: { slug: "ms-startup", name: "Back to normal operation" },
      },
    ],
  },
  {
    slug: "eu-grid-modernization",
    name: "Distribution Grid Modernization",
    summary: "DA, FLISR, and DERMS rollout across distribution feeders.",
    description: "Distribution grid modernization program: distribution automation, FLISR, voltage optimization, DERMS for DER integration, and field communications backbone.",
    category: "Smart Grid",
    icon: "Network",
    phases: [
      {
        slug: "strategy",
        name: "Strategy",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "use-cases", name: "Use case prioritization", days: 20 },
          { slug: "tech-arch", name: "Reference architecture", days: 25 },
        ],
        milestone: { slug: "ms-strategy", name: "Strategy approved" },
      },
      {
        slug: "comms",
        name: "Field Communications",
        tasks: [
          { slug: "comms-design", name: "Field comms design (RF/cellular)", days: 30 },
          { slug: "comms-deploy", name: "Backbone deployment", days: 90 },
          { slug: "security", name: "OT cybersecurity controls", days: 30 },
        ],
        milestone: { slug: "ms-comms", name: "Comms operational" },
      },
      {
        slug: "da-flisr",
        name: "DA & FLISR",
        tasks: [
          { slug: "device-deploy", name: "Reclosers / sectionalizers deployment", days: 90 },
          { slug: "ads", name: "Advanced Distribution Mgmt System config", days: 60 },
          { slug: "flisr", name: "FLISR scheme commissioning", days: 60 },
          { slug: "vvo", name: "Volt/VAR optimization", days: 50 },
        ],
        milestone: { slug: "ms-da-flisr", name: "DA / FLISR live" },
      },
      {
        slug: "derms",
        name: "DERMS & DER Integration",
        tasks: [
          { slug: "derms-build", name: "DERMS platform deployment", days: 60 },
          { slug: "der-onboard", name: "DER onboarding & telemetry", days: 60 },
          { slug: "market-integration", name: "Wholesale market integration", days: 45 },
        ],
        milestone: { slug: "ms-derms", name: "DERMS live" },
      },
    ],
  },
  {
    slug: "eu-battery-storage",
    name: "Utility Battery Energy Storage System (BESS)",
    summary: "BESS construction from interconnection through commercial operation.",
    description: "Owner / EPC plan for a utility-scale battery energy storage system: interconnection, civil works, container delivery & install, electrical, controls, and commissioning to commercial operation.",
    category: "Renewables",
    icon: "Battery",
    phases: [
      {
        slug: "develop",
        name: "Development",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "interconnection", name: "Interconnection studies", days: 90 },
          { slug: "permits", name: "Permits & environmental", days: 60 },
          { slug: "agreement", name: "Tolling / capacity agreement", days: 60 },
        ],
        milestone: { slug: "ms-develop", name: "Notice to proceed" },
      },
      {
        slug: "engineering",
        name: "Engineering",
        tasks: [
          { slug: "site-eng", name: "Site engineering", days: 30 },
          { slug: "electrical-eng", name: "Electrical & PCS design", days: 30 },
          { slug: "controls-eng", name: "EMS / SCADA design", days: 25 },
        ],
        milestone: { slug: "ms-eng", name: "IFC released" },
      },
      {
        slug: "civil",
        name: "Civil & Foundations",
        tasks: [
          { slug: "site-prep", name: "Site preparation", days: 30 },
          { slug: "foundations", name: "Container & PCS pads", days: 35 },
          { slug: "trenching", name: "Trenching & conduits", days: 30 },
        ],
        milestone: { slug: "ms-civil", name: "Civil complete" },
      },
      {
        slug: "install",
        name: "Equipment Install",
        tasks: [
          { slug: "containers", name: "Battery container delivery & set", days: 30 },
          { slug: "pcs", name: "PCS / inverter install", days: 25 },
          { slug: "transformer", name: "Step-up transformer install", days: 20 },
          { slug: "controls-install", name: "EMS / SCADA install", days: 20 },
        ],
        milestone: { slug: "ms-install", name: "Mechanical completion" },
      },
      {
        slug: "commissioning",
        name: "Commissioning & COD",
        tasks: [
          { slug: "pre-energize", name: "Pre-energization checks", days: 12 },
          { slug: "energize", name: "First energization", days: 5 },
          { slug: "capacity-test", name: "Capacity test", days: 15 },
          { slug: "cod", name: "Commercial operation", days: 5 },
        ],
        milestone: { slug: "ms-cod", name: "COD achieved" },
      },
    ],
  },
  {
    slug: "eu-nuclear-outage",
    name: "Nuclear Refueling Outage",
    summary: "Refueling outage from coast-down through return-to-power.",
    description: "Nuclear plant refueling outage: outage scope, integrated schedule, plant cool-down, refueling & maintenance, fuel reload, plant heat-up and return to service.",
    category: "Operations",
    icon: "Atom",
    phases: [
      {
        slug: "plan",
        name: "Outage Planning",
        tasks: [
          { slug: "kickoff", name: "Kickoff & outage org", days: 5 },
          { slug: "scope", name: "Outage scope & risk", days: 30 },
          { slug: "schedule", name: "Integrated outage schedule", days: 30 },
          { slug: "logistics", name: "Logistics & contractor staging", days: 20 },
        ],
        milestone: { slug: "ms-plan", name: "Ready for outage" },
      },
      {
        slug: "shutdown",
        name: "Shutdown & Cooldown",
        tasks: [
          { slug: "coast-down", name: "Coast-down & shutdown", days: 2 },
          { slug: "cool-down", name: "Plant cool-down", days: 3 },
          { slug: "head-removal", name: "Reactor head removal", days: 4 },
          { slug: "fuel-prep", name: "Fuel handling preparations", days: 3 },
        ],
        milestone: { slug: "ms-shutdown", name: "Mode-6 / refuel ready" },
      },
      {
        slug: "execute",
        name: "Refuel & Maintenance",
        tasks: [
          { slug: "fuel-move", name: "Spent fuel offload", days: 6 },
          { slug: "isi", name: "In-service inspections", days: 10 },
          { slug: "maintenance", name: "Maintenance work-list", days: 15 },
          { slug: "modifications", name: "Plant modifications", days: 10 },
          { slug: "fuel-reload", name: "Fresh fuel reload", days: 5 },
        ],
        milestone: { slug: "ms-execute", name: "Work scope complete" },
      },
      {
        slug: "startup",
        name: "Startup & Return to Service",
        tasks: [
          { slug: "head-replace", name: "Reactor head replacement", days: 4 },
          { slug: "heatup", name: "Plant heat-up", days: 4 },
          { slug: "criticality", name: "Initial criticality", days: 2 },
          { slug: "low-power", name: "Low-power physics testing", days: 4 },
          { slug: "ramp", name: "Power ascension to 100%", days: 5 },
        ],
        milestone: { slug: "ms-startup", name: "Back on the grid" },
      },
    ],
  },
  {
    slug: "eu-cis-replacement",
    name: "Customer Information System (CIS) Replacement",
    summary: "Replace utility CIS with customer-data conversion and billing parallel.",
    description: "Utility Customer Information System replacement: vendor selection, configuration, billing rules, customer data conversion, billing parallel, and pilot-first cutover.",
    category: "Customer Operations",
    icon: "Users",
    phases: [
      {
        slug: "select",
        name: "Vendor Selection",
        tasks: [
          { slug: "rfp", name: "RFP & evaluation", days: 60 },
          { slug: "demo", name: "Vendor demos", days: 25 },
          { slug: "contract", name: "Contracting", days: 30 },
        ],
        milestone: { slug: "ms-select", name: "Vendor selected" },
      },
      {
        slug: "design",
        name: "Design & Build",
        tasks: [
          { slug: "fit-gap", name: "Fit-gap workshops", days: 40 },
          { slug: "config", name: "Configuration build", days: 60 },
          { slug: "billing-rules", name: "Rate & billing rules", days: 45 },
          { slug: "interfaces", name: "Interface build", days: 50 },
        ],
        milestone: { slug: "ms-design", name: "Build complete" },
      },
      {
        slug: "convert",
        name: "Data Conversion",
        tasks: [
          { slug: "mapping", name: "Customer data mapping", days: 30 },
          { slug: "etl", name: "Conversion ETL build", days: 40 },
          { slug: "mock-1", name: "Mock conversion 1", days: 10 },
          { slug: "mock-2", name: "Mock conversion 2", days: 10 },
          { slug: "mock-3", name: "Mock conversion 3", days: 10 },
        ],
        milestone: { slug: "ms-convert", name: "Conversion certified" },
      },
      {
        slug: "test",
        name: "Test & Parallel Billing",
        tasks: [
          { slug: "sit", name: "System integration test", days: 30 },
          { slug: "uat", name: "User acceptance test", days: 30 },
          { slug: "billing-parallel", name: "Billing parallel", days: 60 },
        ],
        milestone: { slug: "ms-test", name: "Parallel reconciled" },
      },
      {
        slug: "cutover",
        name: "Cutover",
        tasks: [
          { slug: "training", name: "CSR training", days: 25 },
          { slug: "cutover", name: "Cutover weekend", days: 5 },
          { slug: "stabilize", name: "Stabilization", days: 60 },
        ],
        milestone: { slug: "ms-cutover", name: "Production stable" },
      },
    ],
  },
  {
    slug: "eu-storm-restoration",
    name: "Major Storm Restoration Program",
    summary: "Activate, restore, and close out a major-storm response.",
    description: "Utility major-storm restoration program: pre-storm staging, mutual assistance, damage assessment, restoration waves, customer communications, and post-storm review.",
    category: "Emergency Response",
    icon: "CloudLightning",
    phases: [
      {
        slug: "prep",
        name: "Pre-Storm Preparation",
        tasks: [
          { slug: "activation", name: "EOC activation", days: 1 },
          { slug: "mutual", name: "Mutual assistance request", days: 2 },
          { slug: "staging", name: "Materials & contractor staging", days: 3 },
          { slug: "comms-prep", name: "Customer communications prep", days: 2 },
        ],
        milestone: { slug: "ms-prep", name: "Ready for storm" },
      },
      {
        slug: "assess",
        name: "Damage Assessment",
        tasks: [
          { slug: "patrols", name: "Field damage patrols", days: 5 },
          { slug: "ete", name: "Estimated time of restoration", days: 3 },
          { slug: "scope", name: "Restoration scope & priorities", days: 3 },
        ],
        milestone: { slug: "ms-assess", name: "Damage assessed" },
      },
      {
        slug: "restore",
        name: "Restoration",
        tasks: [
          { slug: "transmission", name: "Transmission restoration", days: 4 },
          { slug: "substations", name: "Substation restoration", days: 4 },
          { slug: "feeders", name: "Distribution feeder restoration", days: 7 },
          { slug: "service", name: "Service drops & individual outages", days: 10 },
        ],
        milestone: { slug: "ms-restore", name: "All customers restored" },
      },
      {
        slug: "close",
        name: "Demobilization & Review",
        tasks: [
          { slug: "demob", name: "Crew demobilization", days: 5 },
          { slug: "cost", name: "Cost capture & FEMA package", days: 15 },
          { slug: "lessons", name: "After-action review", days: 5 },
        ],
        milestone: { slug: "ms-close", name: "Storm closed out" },
      },
    ],
  },
];

export async function seedEnergySystemTemplates(): Promise<void> {
  await seedTemplateLibrary({
    industry: "energy",
    plans: PLANS,
    logTag: "energy-templates",
  });
}

export const ENERGY_TEMPLATE_SLUGS = PLANS.map((p) => p.slug);
