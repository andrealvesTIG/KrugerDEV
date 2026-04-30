/**
 * Financial Services system template library seeder.
 *
 * Curated plans for banks, insurers, asset managers, and fintechs:
 * core banking modernization, payments, regulatory programs, and risk.
 */

import {
  seedTemplateLibrary,
  type TemplatePlan,
} from "./systemTemplateLibrary";

const PLANS: TemplatePlan[] = [
  {
    slug: "fs-core-banking-replacement",
    name: "Core Banking System Replacement",
    summary: "Multi-year core replacement: vendor select, parallel build, conversion, and pilot-first go-live.",
    description: "End-to-end replacement of a legacy core banking platform (deposits, loans, GL). Includes vendor selection, target operating model, parallel build, integration, conversion mock-runs, and a pilot-first go-live strategy.",
    category: "Core Modernization",
    icon: "Building2",
    phases: [
      {
        slug: "select",
        name: "Vendor Selection",
        tasks: [
          { slug: "rfp", name: "Issue RFP", days: 15 },
          { slug: "demos", name: "Vendor demos & scripted scenarios", days: 20 },
          { slug: "tco", name: "TCO modeling & scoring", days: 10 },
          { slug: "due-diligence", name: "Due diligence & references", days: 15 },
          { slug: "select-decision", name: "Selection decision & contract", days: 30 },
        ],
        milestone: { slug: "ms-select", name: "Vendor selected & contracted" },
      },
      {
        slug: "design",
        name: "Target Operating Model & Design",
        tasks: [
          { slug: "tom", name: "Target operating model", days: 25 },
          { slug: "products", name: "Product catalog mapping", days: 20 },
          { slug: "fit-gap", name: "Fit-gap workshops", days: 25 },
          { slug: "interfaces", name: "Interface architecture", days: 15 },
          { slug: "controls", name: "Controls & SOX design", days: 10 },
        ],
        milestone: { slug: "ms-design", name: "Design baseline approved" },
      },
      {
        slug: "build",
        name: "Configuration & Build",
        tasks: [
          { slug: "config", name: "Core configuration", days: 60 },
          { slug: "extensions", name: "Custom extensions", days: 45 },
          { slug: "interfaces-build", name: "Interface build", days: 50 },
          { slug: "reports", name: "Regulatory & MIS reports", days: 30 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "convert",
        name: "Data Conversion",
        tasks: [
          { slug: "mapping", name: "Legacy data mapping", days: 25 },
          { slug: "etl", name: "Conversion ETL build", days: 30 },
          { slug: "mock-1", name: "Mock conversion 1", days: 7 },
          { slug: "mock-2", name: "Mock conversion 2", days: 7 },
          { slug: "mock-3", name: "Mock conversion 3 (full volume)", days: 7 },
          { slug: "reconciliation", name: "Reconciliation framework", days: 15 },
        ],
        milestone: { slug: "ms-convert", name: "Conversion certified" },
      },
      {
        slug: "test",
        name: "Test",
        tasks: [
          { slug: "sit", name: "System integration test", days: 30 },
          { slug: "uat", name: "User acceptance test", days: 30 },
          { slug: "perf", name: "Performance & resilience test", days: 15 },
          { slug: "parallel", name: "Parallel run", days: 30 },
        ],
        milestone: { slug: "ms-test", name: "Test exit gate" },
      },
      {
        slug: "pilot",
        name: "Pilot Branch / Region",
        tasks: [
          { slug: "pilot-prep", name: "Pilot region preparation", days: 15 },
          { slug: "pilot-cutover", name: "Pilot cutover", days: 5 },
          { slug: "pilot-stabilize", name: "Pilot stabilization", days: 30 },
        ],
        milestone: { slug: "ms-pilot", name: "Pilot successful" },
      },
      {
        slug: "rollout",
        name: "Enterprise Rollout",
        tasks: [
          { slug: "wave1", name: "Wave 1 region cutover", days: 20 },
          { slug: "wave2", name: "Wave 2 region cutover", days: 20 },
          { slug: "wave3", name: "Wave 3 region cutover", days: 20 },
          { slug: "decommission", name: "Legacy decommission", days: 30 },
        ],
        milestone: { slug: "ms-rollout", name: "Rollout complete" },
      },
    ],
  },
  {
    slug: "fs-payments-modernization",
    name: "Real-Time Payments (RTP / FedNow) Onboarding",
    summary: "Connect to RTP / FedNow with new rails, fraud controls, and customer experience.",
    description: "Onboard a bank to instant payment rails (TCH RTP and/or FedNow): connectivity, message format, settlement, fraud controls, customer-facing channels, and operations playbooks.",
    category: "Payments",
    icon: "Send",
    phases: [
      {
        slug: "scope",
        name: "Strategy & Scope",
        tasks: [
          { slug: "use-cases", name: "Use case prioritization (P2P, B2B, payroll)", days: 8 },
          { slug: "rails", name: "Rails decision (RTP / FedNow / both)", days: 5 },
          { slug: "biz-case", name: "Business case", days: 10 },
        ],
        milestone: { slug: "ms-scope", name: "Strategy approved" },
      },
      {
        slug: "connect",
        name: "Connectivity & Build",
        tasks: [
          { slug: "endpoint", name: "Endpoint provisioning & certs", days: 15 },
          { slug: "iso20022", name: "ISO 20022 message build", days: 20 },
          { slug: "settlement", name: "Settlement & GL integration", days: 20 },
          { slug: "channels", name: "Mobile / online channel updates", days: 25 },
        ],
        milestone: { slug: "ms-connect", name: "Connectivity ready" },
      },
      {
        slug: "fraud",
        name: "Fraud & Risk",
        tasks: [
          { slug: "fraud-rules", name: "Fraud rules & velocity limits", days: 12 },
          { slug: "scams", name: "Authorized push-payment scam controls", days: 10 },
          { slug: "aml", name: "AML real-time screening", days: 15 },
        ],
        milestone: { slug: "ms-fraud", name: "Fraud controls live" },
      },
      {
        slug: "test",
        name: "Test & Certification",
        tasks: [
          { slug: "self-test", name: "Self-test scenarios", days: 10 },
          { slug: "cert", name: "Network certification", days: 15 },
          { slug: "uat", name: "Internal UAT", days: 10 },
        ],
        milestone: { slug: "ms-test", name: "Certified" },
      },
      {
        slug: "launch",
        name: "Launch & Operations",
        tasks: [
          { slug: "soft-launch", name: "Soft launch (employees / pilot customers)", days: 14 },
          { slug: "ops-runbook", name: "Operations runbook", days: 8 },
          { slug: "ga", name: "General availability", days: 5 },
        ],
        milestone: { slug: "ms-launch", name: "GA live" },
      },
    ],
  },
  {
    slug: "fs-aml-bsa-program",
    name: "AML / BSA Program Modernization",
    summary: "KYC, transaction monitoring, sanctions, and case management uplift.",
    description: "Modernize an AML/BSA program: KYC/CIP refresh, transaction monitoring rules tuning, sanctions screening, suspicious activity reporting workflow, and audit-ready case management.",
    category: "Compliance & Risk",
    icon: "Search",
    phases: [
      {
        slug: "assess",
        name: "Assess",
        tasks: [
          { slug: "ra", name: "Enterprise risk assessment refresh", days: 20 },
          { slug: "gap", name: "Regulatory gap analysis", days: 15 },
          { slug: "model-val", name: "Model validation review", days: 10 },
        ],
        milestone: { slug: "ms-assess", name: "Assessment baseline" },
      },
      {
        slug: "kyc",
        name: "KYC & CIP",
        tasks: [
          { slug: "policies", name: "Policy & procedure updates", days: 12 },
          { slug: "ids", name: "Identity verification provider integration", days: 20 },
          { slug: "edd", name: "Enhanced due diligence workflow", days: 15 },
          { slug: "remediation", name: "Customer file remediation", days: 30 },
        ],
        milestone: { slug: "ms-kyc", name: "KYC uplift complete" },
      },
      {
        slug: "tm",
        name: "Transaction Monitoring",
        tasks: [
          { slug: "rules", name: "Rules library tuning", days: 20 },
          { slug: "scenarios", name: "New scenario build (P2P, RTP)", days: 15 },
          { slug: "above-line", name: "Above-the-line testing", days: 10 },
          { slug: "below-line", name: "Below-the-line testing", days: 10 },
        ],
        milestone: { slug: "ms-tm", name: "Tuning complete" },
      },
      {
        slug: "sanctions",
        name: "Sanctions Screening",
        tasks: [
          { slug: "list-mgmt", name: "List management process", days: 10 },
          { slug: "rt-screen", name: "Real-time screening tuning", days: 15 },
          { slug: "alert-mgmt", name: "Alert management workflow", days: 10 },
        ],
        milestone: { slug: "ms-sanctions", name: "Sanctions uplift complete" },
      },
      {
        slug: "case",
        name: "Case Management & Reporting",
        tasks: [
          { slug: "case-mgmt", name: "Case management platform build", days: 25 },
          { slug: "sar-workflow", name: "SAR / CTR workflow", days: 12 },
          { slug: "audit-pkg", name: "Audit-ready evidence package", days: 8 },
        ],
        milestone: { slug: "ms-case", name: "Operations ready" },
      },
    ],
  },
  {
    slug: "fs-basel-iv-program",
    name: "Basel IV / III Endgame Implementation",
    summary: "Risk-weighted asset model, capital reporting, and disclosures alignment.",
    description: "Implement Basel IV / Basel III Endgame requirements: standardized RWA models, output floor, operational risk SMA, FRTB market risk, capital reporting and Pillar 3 disclosures.",
    category: "Regulatory",
    icon: "Scale",
    phases: [
      {
        slug: "scope",
        name: "Scope & Impact",
        tasks: [
          { slug: "kickoff", name: "Kickoff & sponsor alignment", days: 3 },
          { slug: "impact", name: "Quantitative impact study", days: 25 },
          { slug: "gap", name: "Gap analysis vs. final rule", days: 15 },
        ],
        milestone: { slug: "ms-scope", name: "Impact baseline" },
      },
      {
        slug: "credit",
        name: "Credit Risk (SA-CR)",
        tasks: [
          { slug: "sa-cr", name: "SA-CR model build", days: 30 },
          { slug: "data", name: "Data sourcing & quality", days: 25 },
          { slug: "validation", name: "Independent validation", days: 15 },
        ],
        milestone: { slug: "ms-credit", name: "Credit risk live" },
      },
      {
        slug: "market",
        name: "Market Risk (FRTB)",
        tasks: [
          { slug: "boundary", name: "Trading book boundary", days: 12 },
          { slug: "sa", name: "Standardized approach build", days: 25 },
          { slug: "ima", name: "Internal models approach (where in-scope)", days: 30 },
        ],
        milestone: { slug: "ms-market", name: "FRTB live" },
      },
      {
        slug: "ops",
        name: "Operational Risk (SMA)",
        tasks: [
          { slug: "loss-data", name: "Internal loss data refresh", days: 15 },
          { slug: "bi", name: "Business indicator calc", days: 12 },
          { slug: "sma", name: "SMA engine build", days: 20 },
        ],
        milestone: { slug: "ms-ops", name: "SMA live" },
      },
      {
        slug: "report",
        name: "Reporting & Disclosure",
        tasks: [
          { slug: "regrep", name: "Regulatory reporting build", days: 25 },
          { slug: "pillar3", name: "Pillar 3 disclosures", days: 15 },
          { slug: "parallel", name: "Parallel run", days: 30 },
        ],
        milestone: { slug: "ms-report", name: "First filing complete" },
      },
    ],
  },
  {
    slug: "fs-loan-origination-platform",
    name: "Loan Origination System Implementation",
    summary: "Implement a new LOS for consumer or commercial lending with credit decisioning.",
    description: "Implement a modern Loan Origination System (LOS) covering application, automated decisioning, document management, closing, and core integration.",
    category: "Lending",
    icon: "FileSignature",
    phases: [
      {
        slug: "design",
        name: "Process Design",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "process", name: "Origination process redesign", days: 20 },
          { slug: "credit-policy", name: "Credit policy alignment", days: 15 },
        ],
        milestone: { slug: "ms-design", name: "Design baseline" },
      },
      {
        slug: "build",
        name: "Build & Integration",
        tasks: [
          { slug: "config", name: "Platform configuration", days: 35 },
          { slug: "decisioning", name: "Decision engine & rules", days: 25 },
          { slug: "bureau", name: "Credit bureau integration", days: 12 },
          { slug: "doc-prep", name: "Document preparation integration", days: 15 },
          { slug: "core-integration", name: "Core / servicing integration", days: 20 },
          { slug: "esign", name: "eSign & disclosures", days: 10 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "test",
        name: "Test",
        tasks: [
          { slug: "sit", name: "System integration test", days: 15 },
          { slug: "uat", name: "User acceptance test", days: 15 },
          { slug: "compliance", name: "Compliance testing (TILA/RESPA, ECOA)", days: 10 },
        ],
        milestone: { slug: "ms-test", name: "Test exit" },
      },
      {
        slug: "rollout",
        name: "Rollout",
        tasks: [
          { slug: "training", name: "Loan officer training", days: 12 },
          { slug: "pilot", name: "Pilot branch", days: 20 },
          { slug: "wave1", name: "Wave 1 rollout", days: 20 },
          { slug: "wave2", name: "Wave 2 rollout", days: 20 },
        ],
        milestone: { slug: "ms-rollout", name: "Rollout complete" },
      },
    ],
  },
  {
    slug: "fs-cecl-implementation",
    name: "CECL Allowance Modeling & Reporting",
    summary: "Build CECL models, controls, and reporting for the loan portfolio.",
    description: "Implement Current Expected Credit Loss (CECL) for the loan portfolio: methodology selection by segment, model build, qualitative overlay framework, controls, and quarterly reporting.",
    category: "Regulatory",
    icon: "TrendingDown",
    phases: [
      {
        slug: "method",
        name: "Methodology",
        tasks: [
          { slug: "segmentation", name: "Portfolio segmentation", days: 10 },
          { slug: "method-select", name: "Methodology selection (DCF, vintage, PD/LGD)", days: 15 },
          { slug: "scenarios", name: "Macroeconomic scenario design", days: 12 },
        ],
        milestone: { slug: "ms-method", name: "Methodology approved" },
      },
      {
        slug: "data",
        name: "Data & Models",
        tasks: [
          { slug: "data-sourcing", name: "Loan-level data sourcing", days: 25 },
          { slug: "model-build", name: "Model build by segment", days: 35 },
          { slug: "qualitative", name: "Qualitative overlay framework", days: 12 },
          { slug: "validation", name: "Independent model validation", days: 20 },
        ],
        milestone: { slug: "ms-data", name: "Models validated" },
      },
      {
        slug: "controls",
        name: "Controls & Governance",
        tasks: [
          { slug: "policy", name: "Allowance policy", days: 8 },
          { slug: "approvals", name: "Approval & challenge process", days: 8 },
          { slug: "scfo", name: "SOX / ICFR controls", days: 12 },
        ],
        milestone: { slug: "ms-controls", name: "Controls in place" },
      },
      {
        slug: "report",
        name: "Reporting",
        tasks: [
          { slug: "parallel", name: "Parallel run vs. incurred-loss", days: 30 },
          { slug: "disclosures", name: "Disclosure package", days: 12 },
          { slug: "first-quarter", name: "First quarterly close", days: 15 },
        ],
        milestone: { slug: "ms-report", name: "First close complete" },
      },
    ],
  },
  {
    slug: "fs-trading-system-migration",
    name: "Trading System / OMS Migration",
    summary: "Migrate to a new order management / execution platform with parallel run.",
    description: "Migrate front-office to a new Order Management / Execution Management System (OMS/EMS): connectivity to venues, FIX testing, algo configuration, risk limits, and parallel-run cutover.",
    category: "Capital Markets",
    icon: "BarChart3",
    phases: [
      {
        slug: "design",
        name: "Design",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "trader-workflows", name: "Trader workflow design", days: 12 },
          { slug: "asset-classes", name: "Asset class scoping", days: 8 },
        ],
        milestone: { slug: "ms-design", name: "Design approved" },
      },
      {
        slug: "build",
        name: "Build & Integration",
        tasks: [
          { slug: "fix", name: "FIX gateway build", days: 20 },
          { slug: "venues", name: "Venue & broker connectivity", days: 25 },
          { slug: "algos", name: "Algo configuration", days: 15 },
          { slug: "risk", name: "Pre-trade risk limits", days: 15 },
          { slug: "post-trade", name: "Post-trade & allocation", days: 15 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "test",
        name: "Test",
        tasks: [
          { slug: "fix-cert", name: "FIX certification with venues", days: 15 },
          { slug: "simulation", name: "Simulation environment trading", days: 15 },
          { slug: "uat", name: "Trader UAT", days: 12 },
        ],
        milestone: { slug: "ms-test", name: "Certification complete" },
      },
      {
        slug: "cutover",
        name: "Parallel Run & Cutover",
        tasks: [
          { slug: "parallel", name: "Parallel-run period", days: 20 },
          { slug: "cutover", name: "Production cutover", days: 3 },
          { slug: "decommission", name: "Legacy decommission", days: 15 },
        ],
        milestone: { slug: "ms-cutover", name: "Cutover complete" },
      },
    ],
  },
  {
    slug: "fs-digital-banking-platform",
    name: "Digital Banking Platform Launch",
    summary: "Mobile + web digital banking with onboarding, account servicing, and money movement.",
    description: "Launch a refreshed digital banking experience: mobile and web channels, account opening, account servicing, P2P, transfers, and remote deposit. Vendor-led or build with custom UI.",
    category: "Channels",
    icon: "Smartphone",
    phases: [
      {
        slug: "ux",
        name: "UX & Product Design",
        tasks: [
          { slug: "research", name: "Customer research", days: 10 },
          { slug: "ia", name: "Information architecture", days: 8 },
          { slug: "ui", name: "High-fidelity UI", days: 25 },
          { slug: "usability", name: "Usability testing", days: 8 },
        ],
        milestone: { slug: "ms-ux", name: "Design approved" },
      },
      {
        slug: "build",
        name: "Build",
        tasks: [
          { slug: "platform-config", name: "Platform configuration", days: 30 },
          { slug: "core-integration", name: "Core integration", days: 25 },
          { slug: "auth", name: "Authentication & MFA", days: 12 },
          { slug: "p2p", name: "P2P & transfers", days: 15 },
          { slug: "rdc", name: "Remote deposit capture", days: 12 },
        ],
        milestone: { slug: "ms-build", name: "Build complete" },
      },
      {
        slug: "security",
        name: "Security & Fraud",
        tasks: [
          { slug: "pen-test", name: "Penetration test", days: 10 },
          { slug: "fraud-rules", name: "Fraud rule configuration", days: 15 },
          { slug: "device-bind", name: "Device binding & risk scoring", days: 12 },
        ],
        milestone: { slug: "ms-security", name: "Security signed off" },
      },
      {
        slug: "launch",
        name: "Launch",
        tasks: [
          { slug: "beta", name: "Customer beta", days: 21 },
          { slug: "marketing", name: "Marketing & migration comms", days: 15 },
          { slug: "ga", name: "GA cutover", days: 5 },
        ],
        milestone: { slug: "ms-launch", name: "GA live" },
      },
    ],
  },
  {
    slug: "fs-soc2-readiness-fs",
    name: "SOC 2 Type II Readiness for FinServ",
    summary: "Control design, evidence collection, and external audit for a financial services SaaS.",
    description: "Achieve SOC 2 Type II for a financial services SaaS or fintech: scope definition, Trust Services Criteria mapping, control implementation, evidence automation, readiness assessment, and external audit.",
    category: "Compliance & Risk",
    icon: "ShieldCheck",
    phases: [
      {
        slug: "scope",
        name: "Scope & Mapping",
        tasks: [
          { slug: "kickoff", name: "Kickoff", days: 3 },
          { slug: "trust-criteria", name: "Trust Services Criteria selection", days: 5 },
          { slug: "system-desc", name: "System description draft", days: 8 },
        ],
        milestone: { slug: "ms-scope", name: "Scope confirmed" },
      },
      {
        slug: "controls",
        name: "Control Implementation",
        tasks: [
          { slug: "access", name: "Access control build-out", days: 15 },
          { slug: "change", name: "Change management process", days: 10 },
          { slug: "monitoring", name: "Monitoring & alerting", days: 12 },
          { slug: "vendor", name: "Vendor management", days: 8 },
          { slug: "ir", name: "Incident response runbooks", days: 8 },
        ],
        milestone: { slug: "ms-controls", name: "Controls in place" },
      },
      {
        slug: "evidence",
        name: "Evidence Collection",
        tasks: [
          { slug: "automation", name: "Evidence automation tooling", days: 12 },
          { slug: "samples", name: "Sample evidence collection", days: 20 },
          { slug: "remediation", name: "Pre-audit remediation", days: 15 },
        ],
        milestone: { slug: "ms-evidence", name: "Evidence library ready" },
      },
      {
        slug: "audit",
        name: "External Audit",
        tasks: [
          { slug: "readiness", name: "Readiness assessment", days: 10 },
          { slug: "type1", name: "Type I audit (point-in-time)", days: 20 },
          { slug: "observation", name: "Type II observation period", days: 90 },
          { slug: "type2", name: "Type II audit", days: 30 },
        ],
        milestone: { slug: "ms-audit", name: "SOC 2 Type II report received" },
      },
    ],
  },
  {
    slug: "fs-ifrs9-implementation",
    name: "IFRS 9 Impairment Implementation",
    summary: "Stage classification, ECL modeling, hedging, and disclosures.",
    description: "Implement IFRS 9 financial instruments: stage classification, expected credit loss modeling, hedge accounting, and disclosure framework for a banking entity.",
    category: "Regulatory",
    icon: "FileBarChart",
    phases: [
      {
        slug: "method",
        name: "Methodology",
        tasks: [
          { slug: "staging", name: "Staging criteria & SICR triggers", days: 15 },
          { slug: "ecl-method", name: "ECL methodology", days: 20 },
          { slug: "macro", name: "Macroeconomic scenarios", days: 12 },
        ],
        milestone: { slug: "ms-method", name: "Methodology approved" },
      },
      {
        slug: "build",
        name: "Models & Data",
        tasks: [
          { slug: "data", name: "Data sourcing & quality", days: 25 },
          { slug: "models", name: "PD / LGD / EAD model build", days: 35 },
          { slug: "validation", name: "Model validation", days: 20 },
        ],
        milestone: { slug: "ms-build", name: "Models validated" },
      },
      {
        slug: "hedge",
        name: "Hedge Accounting",
        tasks: [
          { slug: "designations", name: "Hedge designations", days: 12 },
          { slug: "effectiveness", name: "Effectiveness testing", days: 15 },
          { slug: "system", name: "Hedge system updates", days: 15 },
        ],
        milestone: { slug: "ms-hedge", name: "Hedge accounting live" },
      },
      {
        slug: "report",
        name: "Disclosure & Reporting",
        tasks: [
          { slug: "disclosures", name: "Disclosure templates", days: 15 },
          { slug: "parallel", name: "Parallel reporting", days: 30 },
          { slug: "first-close", name: "First IFRS 9 close", days: 15 },
        ],
        milestone: { slug: "ms-report", name: "First close complete" },
      },
    ],
  },
];

export async function seedFinancialServicesSystemTemplates(): Promise<void> {
  await seedTemplateLibrary({
    industry: "financial-services",
    plans: PLANS,
    logTag: "financial-services-templates",
  });
}

export const FINANCIAL_SERVICES_TEMPLATE_SLUGS = PLANS.map((p) => p.slug);
