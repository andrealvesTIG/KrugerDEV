/**
 * Capital Projects system template library seeder.
 *
 * Curated plans for capital projects / EPC / construction owners: stage-gate
 * front-end planning, design / build, commissioning, and turnover.
 */

import {
  seedTemplateLibrary,
  type TemplatePlan,
} from "./systemTemplateLibrary";

const PLANS: TemplatePlan[] = [
  {
    slug: "cp-fel-1-2-3",
    name: "FEL 1 / 2 / 3 Front-End Planning (AACE / IPA)",
    summary: "Stage-gate front-end planning from concept screening through fully defined FEL 3.",
    description: "Owner-led front-end loading per AACE / IPA: opportunity framing (FEL 1), preliminary engineering (FEL 2), and full project definition (FEL 3) ready for execution sanction.",
    category: "Front-End Loading",
    icon: "Compass",
    phases: [
      {
        slug: "fel1",
        name: "FEL 1 — Opportunity Framing",
        tasks: [
          { slug: "kickoff", name: "Kickoff & sponsor alignment", days: 3 },
          { slug: "drivers", name: "Business drivers & screening", days: 12 },
          { slug: "alternatives", name: "Alternative concepts", days: 20 },
          { slug: "screening-est", name: "Class 5 estimate", days: 10 },
          { slug: "schedule-l1", name: "Level 1 schedule", days: 5 },
        ],
        milestone: { slug: "ms-fel1", name: "FEL 1 gate approval" },
      },
      {
        slug: "fel2",
        name: "FEL 2 — Preliminary Engineering",
        tasks: [
          { slug: "selected-concept", name: "Selected concept design", days: 25 },
          { slug: "permits-strategy", name: "Permitting strategy", days: 15 },
          { slug: "site", name: "Site selection / confirmation", days: 30 },
          { slug: "exec-strategy", name: "Execution strategy", days: 15 },
          { slug: "class4", name: "Class 4 estimate", days: 20 },
          { slug: "schedule-l2", name: "Level 2 schedule", days: 10 },
          { slug: "risk", name: "Major-risk register", days: 10 },
        ],
        milestone: { slug: "ms-fel2", name: "FEL 2 gate approval" },
      },
      {
        slug: "fel3",
        name: "FEL 3 — Full Project Definition",
        tasks: [
          { slug: "fel3-eng", name: "Front-end engineering design (FEED)", days: 90 },
          { slug: "permits", name: "Permitting submissions", days: 60 },
          { slug: "procurement-strategy", name: "Long-lead procurement strategy", days: 30 },
          { slug: "contracting", name: "Contracting strategy & packages", days: 45 },
          { slug: "class3", name: "Class 3 estimate (±15%)", days: 30 },
          { slug: "schedule-l3", name: "Level 3 integrated schedule", days: 25 },
          { slug: "constructability", name: "Constructability review", days: 15 },
          { slug: "ipa-review", name: "IPA / external benchmarking", days: 20 },
        ],
        milestone: { slug: "ms-fel3", name: "Sanction (FID) approved" },
      },
    ],
  },
  {
    slug: "cp-epc-execution",
    name: "EPC Execution — Process Plant",
    summary: "Detailed engineering, procurement, construction, and commissioning of a process plant.",
    description: "Owner / EPC integrated execution plan for a process plant: detailed engineering, procurement, fabrication, construction, mechanical completion, and commissioning.",
    category: "Execution",
    icon: "Construction",
    phases: [
      {
        slug: "engineering",
        name: "Detailed Engineering",
        tasks: [
          { slug: "kickoff", name: "Engineering kickoff", days: 5 },
          { slug: "process", name: "Process engineering (PFDs, P&IDs)", days: 90 },
          { slug: "mechanical", name: "Mechanical engineering", days: 80 },
          { slug: "civil", name: "Civil & structural engineering", days: 70 },
          { slug: "electrical", name: "Electrical engineering", days: 75 },
          { slug: "instrumentation", name: "Instrumentation & control", days: 70 },
          { slug: "piping", name: "Piping design & isometrics", days: 90 },
          { slug: "models", name: "3D model reviews (30/60/90)", days: 30 },
        ],
        milestone: { slug: "ms-engineering", name: "IFC drawings released" },
      },
      {
        slug: "procurement",
        name: "Procurement",
        tasks: [
          { slug: "long-lead", name: "Long-lead equipment award", days: 30 },
          { slug: "rotating", name: "Rotating equipment fab & FAT", days: 180 },
          { slug: "vessels", name: "Vessels & exchangers fab", days: 200 },
          { slug: "bulks", name: "Bulk materials (pipe, valves, fittings)", days: 150 },
          { slug: "expediting", name: "Expediting & inspection", days: 200 },
          { slug: "logistics", name: "Logistics to site", days: 120 },
        ],
        milestone: { slug: "ms-procurement", name: "Major equipment delivered" },
      },
      {
        slug: "construction",
        name: "Construction",
        tasks: [
          { slug: "site-prep", name: "Site preparation & earthworks", days: 60 },
          { slug: "foundations", name: "Foundations", days: 90 },
          { slug: "structural", name: "Structural steel erection", days: 120 },
          { slug: "equip-set", name: "Equipment setting", days: 90 },
          { slug: "piping-erect", name: "Piping erection", days: 150 },
          { slug: "electrical-install", name: "Electrical install", days: 120 },
          { slug: "instrumentation-install", name: "Instrumentation install", days: 100 },
          { slug: "insulation-paint", name: "Insulation & paint", days: 60 },
        ],
        milestone: { slug: "ms-construction", name: "Mechanical completion" },
      },
      {
        slug: "commissioning",
        name: "Commissioning & Startup",
        tasks: [
          { slug: "pre-comm", name: "Pre-commissioning (loop checks, flushing)", days: 45 },
          { slug: "comm", name: "Commissioning systems", days: 60 },
          { slug: "ready-startup", name: "Ready for startup", days: 15 },
          { slug: "startup", name: "Startup & introduction of feed", days: 20 },
          { slug: "performance", name: "Performance test run", days: 30 },
        ],
        milestone: { slug: "ms-commissioning", name: "Care, custody & control transfer" },
      },
    ],
  },
  {
    slug: "cp-commercial-construction",
    name: "Commercial Construction (CSI MasterFormat)",
    summary: "Owner / GC plan for commercial construction across all CSI divisions.",
    description: "Owner / general contractor plan for a commercial construction project (office, retail, mixed-use): pre-construction, sitework, structure, envelope, MEP, finishes, and turnover.",
    category: "Construction",
    icon: "Building",
    phases: [
      {
        slug: "preconstruction",
        name: "Pre-Construction",
        tasks: [
          { slug: "kickoff", name: "Owner kickoff", days: 3 },
          { slug: "design-coord", name: "Design coordination", days: 20 },
          { slug: "permits", name: "Permits & approvals", days: 45 },
          { slug: "subs", name: "Subcontractor buy-out", days: 30 },
          { slug: "gmp", name: "GMP / contract finalization", days: 20 },
        ],
        milestone: { slug: "ms-preconstruction", name: "Notice to proceed" },
      },
      {
        slug: "sitework",
        name: "Sitework",
        tasks: [
          { slug: "demolition", name: "Demolition & abatement", days: 25 },
          { slug: "excavation", name: "Excavation & earthwork", days: 30 },
          { slug: "utilities", name: "Site utilities", days: 25 },
          { slug: "paving-base", name: "Paving base", days: 15 },
        ],
        milestone: { slug: "ms-sitework", name: "Site ready" },
      },
      {
        slug: "structure",
        name: "Structure",
        tasks: [
          { slug: "foundations", name: "Foundations", days: 35 },
          { slug: "structural-steel", name: "Structural steel / concrete frame", days: 75 },
          { slug: "deck", name: "Floor deck & topping", days: 30 },
          { slug: "roof-deck", name: "Roof deck", days: 20 },
        ],
        milestone: { slug: "ms-structure", name: "Structure topped out" },
      },
      {
        slug: "envelope",
        name: "Envelope",
        tasks: [
          { slug: "exterior-walls", name: "Exterior walls", days: 50 },
          { slug: "windows", name: "Windows & curtain wall", days: 40 },
          { slug: "roofing", name: "Roofing", days: 25 },
          { slug: "weather-tight", name: "Building weather-tight", days: 10 },
        ],
        milestone: { slug: "ms-envelope", name: "Building dried in" },
      },
      {
        slug: "mep",
        name: "MEP Rough-In & Trim",
        tasks: [
          { slug: "mech-rough", name: "Mechanical rough-in", days: 60 },
          { slug: "elec-rough", name: "Electrical rough-in", days: 55 },
          { slug: "plumb-rough", name: "Plumbing rough-in", days: 50 },
          { slug: "fire-rough", name: "Fire protection rough-in", days: 35 },
          { slug: "mep-trim", name: "MEP trim out", days: 40 },
        ],
        milestone: { slug: "ms-mep", name: "MEP complete" },
      },
      {
        slug: "finishes",
        name: "Finishes & Specialties",
        tasks: [
          { slug: "drywall", name: "Drywall & paint", days: 50 },
          { slug: "ceilings", name: "Ceilings", days: 25 },
          { slug: "flooring", name: "Flooring", days: 30 },
          { slug: "millwork", name: "Millwork & casework", days: 25 },
          { slug: "specialties", name: "Specialties & equipment", days: 20 },
        ],
        milestone: { slug: "ms-finishes", name: "Finishes complete" },
      },
      {
        slug: "turnover",
        name: "Commissioning & Turnover",
        tasks: [
          { slug: "tab", name: "Test, adjust & balance", days: 20 },
          { slug: "commissioning", name: "Building commissioning", days: 30 },
          { slug: "punch", name: "Punch list", days: 25 },
          { slug: "co", name: "Certificate of Occupancy", days: 15 },
          { slug: "owner-training", name: "Owner training", days: 10 },
        ],
        milestone: { slug: "ms-turnover", name: "Substantial completion" },
      },
    ],
  },
  {
    slug: "cp-data-center-build",
    name: "Hyperscale Data Center Build",
    summary: "From greenfield site to power-on for a hyperscale data center.",
    description: "Owner / GC plan for a hyperscale data center build: utility coordination, base building, power & cooling infrastructure, white space fit-out, and commissioning to L5.",
    category: "Construction",
    icon: "Server",
    phases: [
      {
        slug: "preconstruction",
        name: "Pre-Construction",
        tasks: [
          { slug: "site-survey", name: "Site survey & geotech", days: 30 },
          { slug: "utility", name: "Utility coordination & power agreement", days: 90 },
          { slug: "permits", name: "Permits & approvals", days: 60 },
          { slug: "subs", name: "Sub buy-out", days: 35 },
        ],
        milestone: { slug: "ms-pre", name: "NTP" },
      },
      {
        slug: "civil",
        name: "Civil & Structure",
        tasks: [
          { slug: "earthworks", name: "Earthworks", days: 45 },
          { slug: "foundations", name: "Foundations & SOG", days: 60 },
          { slug: "structural", name: "Structure & roof deck", days: 90 },
        ],
        milestone: { slug: "ms-civil", name: "Building dried in" },
      },
      {
        slug: "power",
        name: "Power Infrastructure",
        tasks: [
          { slug: "switchgear", name: "MV switchgear install", days: 50 },
          { slug: "generators", name: "Generators & fuel system", days: 45 },
          { slug: "ups", name: "UPS & battery rooms", days: 40 },
          { slug: "pdu", name: "PDUs & busway", days: 35 },
        ],
        milestone: { slug: "ms-power", name: "Power infrastructure complete" },
      },
      {
        slug: "cooling",
        name: "Cooling Infrastructure",
        tasks: [
          { slug: "chillers", name: "Chillers & cooling towers", days: 45 },
          { slug: "crahs", name: "CRAHs / RDHx", days: 40 },
          { slug: "controls", name: "BMS / EPMS controls", days: 35 },
        ],
        milestone: { slug: "ms-cooling", name: "Cooling infrastructure complete" },
      },
      {
        slug: "whitespace",
        name: "White Space Fit-Out",
        tasks: [
          { slug: "raised-floor", name: "Raised floor / containment", days: 30 },
          { slug: "racks", name: "Rack & cable tray install", days: 30 },
          { slug: "fiber", name: "Structured cabling & MMR", days: 35 },
          { slug: "security", name: "Physical security install", days: 25 },
        ],
        milestone: { slug: "ms-whitespace", name: "White space ready" },
      },
      {
        slug: "commissioning",
        name: "Commissioning",
        tasks: [
          { slug: "l1", name: "L1 factory witness", days: 15 },
          { slug: "l2", name: "L2 component verification", days: 20 },
          { slug: "l3", name: "L3 system testing", days: 25 },
          { slug: "l4", name: "L4 integrated systems test", days: 20 },
          { slug: "l5", name: "L5 IST with load banks", days: 20 },
        ],
        milestone: { slug: "ms-commissioning", name: "Power-on complete" },
      },
    ],
  },
  {
    slug: "cp-airport-terminal",
    name: "Airport Terminal Expansion",
    summary: "Multi-stage airside / landside expansion of an airport terminal.",
    description: "Owner-led plan for an airport terminal expansion: airside coordination, civil enabling works, terminal building, baggage handling system, security & passenger systems, and operational readiness.",
    category: "Infrastructure",
    icon: "Plane",
    phases: [
      {
        slug: "enable",
        name: "Enabling Works",
        tasks: [
          { slug: "kickoff", name: "Kickoff & airport ops alignment", days: 5 },
          { slug: "airside-coord", name: "Airside coordination & NOTAMs", days: 30 },
          { slug: "utilities-relocate", name: "Utility relocations", days: 60 },
          { slug: "demolition", name: "Demolition", days: 45 },
        ],
        milestone: { slug: "ms-enable", name: "Site ready" },
      },
      {
        slug: "civil",
        name: "Civil & Apron",
        tasks: [
          { slug: "apron", name: "Apron & taxiway works", days: 90 },
          { slug: "foundations", name: "Terminal foundations", days: 60 },
          { slug: "structure", name: "Terminal structure", days: 120 },
        ],
        milestone: { slug: "ms-civil", name: "Structure topped out" },
      },
      {
        slug: "terminal",
        name: "Terminal Fit-Out",
        tasks: [
          { slug: "envelope", name: "Envelope & roof", days: 90 },
          { slug: "mep", name: "MEP install", days: 120 },
          { slug: "finishes", name: "Finishes", days: 70 },
          { slug: "jet-bridges", name: "Jet bridges", days: 45 },
        ],
        milestone: { slug: "ms-terminal", name: "Terminal complete" },
      },
      {
        slug: "systems",
        name: "Special Airport Systems",
        tasks: [
          { slug: "bhs", name: "Baggage handling system", days: 90 },
          { slug: "security", name: "Security screening (TSA/equiv.)", days: 60 },
          { slug: "passenger-systems", name: "FIDS, PA, CUTE/CUSS", days: 55 },
          { slug: "comms", name: "Comms & networks", days: 45 },
        ],
        milestone: { slug: "ms-systems", name: "Systems commissioned" },
      },
      {
        slug: "ort",
        name: "Operational Readiness",
        tasks: [
          { slug: "trials", name: "Operational readiness trials", days: 45 },
          { slug: "training", name: "Airline & airport staff training", days: 30 },
          { slug: "regulator", name: "Regulator inspections", days: 20 },
          { slug: "open", name: "Phased opening", days: 21 },
        ],
        milestone: { slug: "ms-open", name: "Public opening" },
      },
    ],
  },
  {
    slug: "cp-bridge-construction",
    name: "Highway Bridge Construction",
    summary: "Substructure, superstructure, and deck for a highway bridge.",
    description: "DOT-led highway bridge construction: traffic management, foundations, substructure, superstructure erection, deck, and approach works.",
    category: "Infrastructure",
    icon: "GitMerge",
    phases: [
      {
        slug: "mobilize",
        name: "Mobilize & Traffic Plan",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "tma", name: "Traffic management plan", days: 15 },
          { slug: "site", name: "Site setup & access roads", days: 20 },
          { slug: "environmental", name: "Environmental controls", days: 15 },
        ],
        milestone: { slug: "ms-mobilize", name: "Mobilization complete" },
      },
      {
        slug: "foundations",
        name: "Foundations & Substructure",
        tasks: [
          { slug: "piles", name: "Pile driving / drilled shafts", days: 45 },
          { slug: "footings", name: "Footings", days: 30 },
          { slug: "abutments", name: "Abutments & wingwalls", days: 35 },
          { slug: "piers", name: "Piers", days: 40 },
        ],
        milestone: { slug: "ms-substructure", name: "Substructure complete" },
      },
      {
        slug: "super",
        name: "Superstructure",
        tasks: [
          { slug: "girder-fab", name: "Girder fabrication", days: 60 },
          { slug: "girder-erect", name: "Girder erection", days: 30 },
          { slug: "diaphragms", name: "Cross-frames / diaphragms", days: 15 },
        ],
        milestone: { slug: "ms-super", name: "Superstructure erected" },
      },
      {
        slug: "deck",
        name: "Deck & Finishes",
        tasks: [
          { slug: "forms", name: "Deck forms", days: 25 },
          { slug: "rebar", name: "Rebar placement", days: 20 },
          { slug: "pour", name: "Deck pour & cure", days: 30 },
          { slug: "barriers", name: "Barriers & joints", days: 20 },
          { slug: "paving", name: "Approach paving", days: 20 },
          { slug: "striping", name: "Striping & signage", days: 10 },
        ],
        milestone: { slug: "ms-deck", name: "Deck complete" },
      },
      {
        slug: "open",
        name: "Inspection & Opening",
        tasks: [
          { slug: "load-test", name: "Load test (if specified)", days: 5 },
          { slug: "punch", name: "Punch list", days: 10 },
          { slug: "open", name: "Open to traffic", days: 2 },
        ],
        milestone: { slug: "ms-open", name: "Bridge opened" },
      },
    ],
  },
  {
    slug: "cp-mining-project",
    name: "Mining Project Execution",
    summary: "Process plant, mine infrastructure, and tailings facility delivery.",
    description: "Owner-led mining project execution: mining infrastructure, ore processing plant, tailings storage facility, and bulk handling. Includes commissioning to nameplate throughput.",
    category: "Execution",
    icon: "Mountain",
    phases: [
      {
        slug: "engineering",
        name: "Engineering",
        tasks: [
          { slug: "process-eng", name: "Process & metallurgical engineering", days: 90 },
          { slug: "geotech", name: "Geotechnical & TSF design", days: 60 },
          { slug: "infrastructure", name: "Mine infrastructure design", days: 70 },
        ],
        milestone: { slug: "ms-eng", name: "IFC released" },
      },
      {
        slug: "procurement",
        name: "Procurement",
        tasks: [
          { slug: "mills", name: "SAG / ball mills procurement", days: 240 },
          { slug: "crushers", name: "Crushers procurement", days: 180 },
          { slug: "fleet", name: "Mining fleet procurement", days: 150 },
          { slug: "bulks", name: "Bulks procurement", days: 150 },
        ],
        milestone: { slug: "ms-procurement", name: "Major equipment delivered" },
      },
      {
        slug: "construction",
        name: "Construction",
        tasks: [
          { slug: "earthworks", name: "Mass earthworks", days: 120 },
          { slug: "tsf", name: "Tailings storage facility", days: 180 },
          { slug: "process-plant", name: "Process plant construction", days: 240 },
          { slug: "infrastructure-build", name: "Roads, power, water", days: 150 },
        ],
        milestone: { slug: "ms-construction", name: "Mechanical completion" },
      },
      {
        slug: "commissioning",
        name: "Commissioning & Ramp-Up",
        tasks: [
          { slug: "pre-comm", name: "Pre-commissioning", days: 30 },
          { slug: "wet-comm", name: "Wet commissioning", days: 45 },
          { slug: "ramp", name: "Ramp to nameplate", days: 120 },
        ],
        milestone: { slug: "ms-commissioning", name: "Nameplate achieved" },
      },
    ],
  },
  {
    slug: "cp-water-treatment-plant",
    name: "Water Treatment Plant Upgrade",
    summary: "Upgrade or expand a municipal water / wastewater treatment plant.",
    description: "Municipal owner-led upgrade of a water or wastewater treatment plant: process design, regulatory approvals, civil & process build, and commissioning while maintaining service.",
    category: "Infrastructure",
    icon: "Droplets",
    phases: [
      {
        slug: "design",
        name: "Design & Permits",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "process-design", name: "Process design", days: 60 },
          { slug: "civil-design", name: "Civil & structural design", days: 50 },
          { slug: "permits", name: "Regulatory approvals", days: 90 },
        ],
        milestone: { slug: "ms-design", name: "Design approved" },
      },
      {
        slug: "civil",
        name: "Civil",
        tasks: [
          { slug: "earthworks", name: "Earthworks", days: 30 },
          { slug: "structures", name: "Concrete structures (basins, channels)", days: 90 },
          { slug: "buildings", name: "Process buildings", days: 75 },
        ],
        milestone: { slug: "ms-civil", name: "Civil complete" },
      },
      {
        slug: "process",
        name: "Process & Mechanical",
        tasks: [
          { slug: "equipment-set", name: "Equipment setting", days: 60 },
          { slug: "piping", name: "Process piping", days: 70 },
          { slug: "electrical", name: "Electrical install", days: 50 },
          { slug: "controls", name: "SCADA / instrumentation", days: 40 },
        ],
        milestone: { slug: "ms-process", name: "Mechanical completion" },
      },
      {
        slug: "commissioning",
        name: "Commissioning",
        tasks: [
          { slug: "clean-water", name: "Clean-water testing", days: 25 },
          { slug: "biological", name: "Biological seeding", days: 30 },
          { slug: "performance", name: "Performance test", days: 30 },
          { slug: "regulator", name: "Regulator sign-off", days: 20 },
        ],
        milestone: { slug: "ms-commissioning", name: "Operations handover" },
      },
    ],
  },
  {
    slug: "cp-renewable-solar-utility",
    name: "Utility-Scale Solar PV Project",
    summary: "Utility solar PV from interconnection to commercial operation.",
    description: "Utility-scale solar photovoltaic project: interconnection, permitting, civil works, racking & module install, electrical, substation, commissioning, and PPA energization.",
    category: "Execution",
    icon: "Sun",
    phases: [
      {
        slug: "develop",
        name: "Development",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 5 },
          { slug: "interconnection", name: "Interconnection studies", days: 90 },
          { slug: "permits", name: "Permits & environmental", days: 90 },
          { slug: "ppa", name: "PPA negotiations", days: 60 },
        ],
        milestone: { slug: "ms-develop", name: "Notice to proceed" },
      },
      {
        slug: "engineering",
        name: "Engineering",
        tasks: [
          { slug: "site-eng", name: "Site engineering & layout", days: 30 },
          { slug: "electrical-eng", name: "Electrical & SCADA design", days: 35 },
          { slug: "substation-eng", name: "Substation design", days: 35 },
        ],
        milestone: { slug: "ms-eng", name: "IFC released" },
      },
      {
        slug: "civil",
        name: "Civil & Mounting",
        tasks: [
          { slug: "site-prep", name: "Site preparation & roads", days: 45 },
          { slug: "piles", name: "Pile driving", days: 60 },
          { slug: "racking", name: "Racking install", days: 45 },
          { slug: "trenching", name: "Trenching & DC cable", days: 40 },
        ],
        milestone: { slug: "ms-civil", name: "Foundations / racking complete" },
      },
      {
        slug: "modules-elec",
        name: "Modules & Electrical",
        tasks: [
          { slug: "modules", name: "Module install", days: 60 },
          { slug: "inverters", name: "Inverter & MV transformer install", days: 30 },
          { slug: "collection", name: "Collection system", days: 30 },
          { slug: "substation", name: "Substation construction", days: 60 },
        ],
        milestone: { slug: "ms-modules-elec", name: "Mechanical completion" },
      },
      {
        slug: "commissioning",
        name: "Commissioning & Energization",
        tasks: [
          { slug: "pre-comm", name: "Pre-commissioning", days: 20 },
          { slug: "back-feed", name: "Back-feed & first energization", days: 10 },
          { slug: "perf-test", name: "Performance test", days: 20 },
          { slug: "cod", name: "Commercial operation date", days: 5 },
        ],
        milestone: { slug: "ms-commissioning", name: "COD achieved" },
      },
    ],
  },
  {
    slug: "cp-tenant-improvement",
    name: "Office / Retail Tenant Improvement",
    summary: "Mid-size tenant improvement build-out from design to occupancy.",
    description: "Tenant improvement build-out for office or retail space: programming, permit drawings, construction, MEP, finishes, FF&E, and move-in.",
    category: "Construction",
    icon: "Hammer",
    phases: [
      {
        slug: "design",
        name: "Design & Permits",
        tasks: [
          { slug: "programming", name: "Programming & test fits", days: 12 },
          { slug: "design", name: "Design development", days: 25 },
          { slug: "permit-set", name: "Permit set", days: 15 },
          { slug: "permit-issue", name: "Permit issuance", days: 30 },
        ],
        milestone: { slug: "ms-design", name: "Permit issued" },
      },
      {
        slug: "demo",
        name: "Demo & Rough-In",
        tasks: [
          { slug: "demo", name: "Demolition", days: 10 },
          { slug: "framing", name: "Framing", days: 20 },
          { slug: "mep-rough", name: "MEP rough-in", days: 25 },
          { slug: "inspections", name: "In-wall inspections", days: 8 },
        ],
        milestone: { slug: "ms-demo", name: "Rough-in inspections passed" },
      },
      {
        slug: "finishes",
        name: "Finishes",
        tasks: [
          { slug: "drywall", name: "Drywall & paint", days: 20 },
          { slug: "ceilings", name: "Ceilings", days: 12 },
          { slug: "flooring", name: "Flooring", days: 15 },
          { slug: "millwork", name: "Millwork", days: 12 },
          { slug: "trim-mep", name: "MEP trim out", days: 15 },
        ],
        milestone: { slug: "ms-finishes", name: "Finishes complete" },
      },
      {
        slug: "occupancy",
        name: "Occupancy",
        tasks: [
          { slug: "punch", name: "Punch list", days: 10 },
          { slug: "co", name: "Certificate of Occupancy", days: 8 },
          { slug: "ffe", name: "FF&E install", days: 12 },
          { slug: "move-in", name: "Move-in & day-one support", days: 5 },
        ],
        milestone: { slug: "ms-occupancy", name: "Tenant occupied" },
      },
    ],
  },
];

export async function seedCapitalProjectsSystemTemplates(): Promise<void> {
  await seedTemplateLibrary({
    industry: "capital-projects",
    plans: PLANS,
    logTag: "capital-projects-templates",
  });
}

export const CAPITAL_PROJECTS_TEMPLATE_SLUGS = PLANS.map((p) => p.slug);
