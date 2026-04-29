import {
  Activity,
  AlertTriangle,
  Banknote,
  BarChart3,
  Calculator,
  ClipboardList,
  Cloud,
  DollarSign,
  GitBranch,
  Inbox,
  Layers,
  Lock,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type CompareStatus = "yes" | "partial" | "no";

export interface CompareFeatureRow {
  name: string;
  description?: string;
  friday: CompareStatus;
  competitor: CompareStatus;
  fridayNote?: string;
  competitorNote?: string;
}

export interface CompareCategory {
  name: string;
  icon: LucideIcon;
  features: CompareFeatureRow[];
}

export interface CompareSummaryStat {
  icon: LucideIcon;
  value: string;
  label: string;
  description: string;
}

export interface CompareAdvantage {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface CompareFaqItem {
  question: string;
  answer: string;
}

export interface CompareConfig {
  slug: string;
  routePath: string;
  competitor: {
    name: string;
    shortName: string;
    logoSrc?: string;
    logoIcon?: LucideIcon;
    logoBg: string;
    logoText: string;
    tagline: string;
  };
  seo: {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
  };
  hero: {
    badge: string;
    title: string;
    titleHighlight: string;
    subtitle: string;
    bullets: string[];
  };
  summaryStats: CompareSummaryStat[];
  advantages: {
    badge: string;
    title: string;
    subtitle: string;
    items: CompareAdvantage[];
  };
  comparison: {
    badge: string;
    title: string;
    subtitle: string;
    categories: CompareCategory[];
  };
  faq?: CompareFaqItem[];
  cta: {
    title: string;
    subtitle: string;
  };
}

const fridayWinsStat: CompareSummaryStat = {
  icon: Sparkles,
  value: "AI-Native",
  label: "AI Variance Detection",
  description:
    "Continuous CPI / SPI monitoring with AI-flagged early warnings before month-end close.",
};

export const primaveraP6CompareConfig: CompareConfig = {
  slug: "primavera-p6",
  routePath: "/compare/primavera-p6",
  competitor: {
    name: "Oracle Primavera P6",
    shortName: "Primavera P6",
    logoBg: "bg-red-600",
    logoText: "text-white",
    tagline: "Critical Path Scheduling",
  },
  seo: {
    title:
      "FridayReport.AI vs Oracle Primavera P6 | Project Controls Comparison",
    description:
      "Compare FridayReport.AI and Oracle Primavera P6 side-by-side: P6 / MS Project schedule import, full EVM (CPI / SPI / EAC / ETC), AI variance detection, RFIs, submittals, change orders, cash flow, and lockdowns — all in one platform.",
    ogTitle: "FridayReport.AI vs Primavera P6 — Capital Projects Comparison",
    ogDescription:
      "Keep P6 schedules. Add real-time EVM rollup, AI variance detection, RFIs / submittals, cash flow, and audit-ready lockdowns in one platform. Free forever plan.",
  },
  hero: {
    badge: "FridayReport.AI vs Primavera P6",
    title: "Keep P6 schedules.",
    titleHighlight: "Get everything else.",
    subtitle:
      "Primavera P6 is the gold standard for critical-path scheduling — but capital programs need EVM rollup, AI variance detection, change orders, RFIs, submittals, and cash flow in the same platform. FridayReport.AI imports P6 schedules and adds the controls layer P6 alone never delivered.",
    bullets: [
      "Import Primavera P6 (XER) schedules with WBS, predecessors, durations, and critical path intact",
      "Live EVM rollup across the entire portfolio: BAC, PV, EV, AC, CPI, SPI, EAC, ETC, VAC, TCPI",
      "AI-powered variance detection on CPI / SPI, change-order velocity, and RFI aging — before month-end",
      "RFIs, submittals, change orders, cash flow, S-Curves, and lockdowns built in — no bolt-ons",
    ],
  },
  summaryStats: [
    fridayWinsStat,
    {
      icon: Layers,
      value: "1 Platform",
      label: "Controls + Field Execution",
      description:
        "Schedule, EVM, RFIs, submittals, change orders, cash flow, and pay apps in a single tool.",
    },
    {
      icon: DollarSign,
      value: "Free Forever",
      label: "Transparent Pricing",
      description:
        "Free forever plan with no per-named-user license tax. Primavera P6 is enterprise-priced and license-heavy.",
    },
    {
      icon: Cloud,
      value: "Cloud-Native",
      label: "Modern Web UI",
      description:
        "Browser-first, dark mode, mobile-friendly dashboards. No EPPM client install or thick desktop tool.",
    },
  ],
  advantages: {
    badge: "What FridayReport Adds Beyond P6",
    title: "P6 Schedules Plus Everything P6 Doesn't Do",
    subtitle:
      "Primavera P6 owns the schedule. FridayReport.AI owns the controls layer that turns the schedule into a defensible monthly forecast and a live capital-program dashboard.",
    items: [
      {
        icon: AlertTriangle,
        title: "AI Variance Detection",
        description:
          "Continuous monitoring of CPI / SPI thresholds, change-order velocity, and RFI aging. The AI flags projects before they breach — no waiting for month-end variance reports.",
      },
      {
        icon: BarChart3,
        title: "Portfolio EVM Rollup",
        description:
          "Roll BAC, PV, EV, AC, CPI, SPI, EAC, ETC, and VAC bottom-up from project to portfolio to organization. CPI × SPI quadrant chart pinpoints which projects need executive attention.",
      },
      {
        icon: Inbox,
        title: "RFIs & Submittals",
        description:
          "Full RFI register with priority, distribution, official responses, and cost / schedule impact. Submittal log with spec sections, lead times, revisions, and reviewer workflow.",
      },
      {
        icon: ScrollText,
        title: "Change Orders & PCOs",
        description:
          "Potential and approved change orders with reason codes, cost impact, schedule impact, and contract amount reconciliation — feeding straight back into EVM and EAC.",
      },
      {
        icon: Banknote,
        title: "Cash Flow Forecast",
        description:
          "Monthly Planned vs Actual outflows with future months projected from FCST or distributed ETC, and a cumulative cash-out curve for liquidity planning.",
      },
      {
        icon: Lock,
        title: "Lockdowns & Audit Trail",
        description:
          "Lock ACT (or any scenario) through month-end so finalized periods cannot be retroactively edited. Every change captured with who, what, and when.",
      },
    ],
  },
  comparison: {
    badge: "Side-by-Side",
    title: "FridayReport.AI vs Primavera P6: Detailed Comparison",
    subtitle:
      "How the two platforms stack up across scheduling, EVM, field execution, governance, and platform experience.",
    categories: [
      {
        name: "Scheduling & Schedule Integration",
        icon: GitBranch,
        features: [
          {
            name: "Critical path scheduling (CPM)",
            friday: "partial",
            competitor: "yes",
            fridayNote: "Imports CPM from P6 / MS Project; dedicated CPM editing is on roadmap.",
            competitorNote: "Industry-standard CPM engine.",
          },
          {
            name: "Primavera P6 (XER) schedule import",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "MS Project (MPP / XML) schedule import",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Limited round-trip with MS Project.",
          },
          {
            name: "WBS, predecessors, durations preserved on import",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Re-import each cycle to track baseline vs current",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Resource-loaded schedules",
            friday: "partial",
            competitor: "yes",
          },
          {
            name: "Multi-project / multi-program scheduling",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Gantt chart / visual scheduling",
            friday: "yes",
            competitor: "yes",
          },
        ],
      },
      {
        name: "Earned Value Management (EVM)",
        icon: Activity,
        features: [
          {
            name: "BAC, PV, EV, AC tracking",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "CPI, SPI, CV, SV computation",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "EAC, ETC, VAC, TCPI computation",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Four EAC scenarios side-by-side (CPI, CPI×SPI, Optimistic, Pessimistic)",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Available via custom configuration / scripts.",
          },
          {
            name: "Editable target EAC with live TCPI gauge",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Portfolio-level EVM rollup (bottom-up)",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Requires P6 EPPM and configuration.",
          },
          {
            name: "CPI × SPI quadrant chart",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "S-Curve (PV / EV / AC / EAC) at project & portfolio",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "CPI / SPI threshold heatmaps over time",
            friday: "yes",
            competitor: "no",
          },
        ],
      },
      {
        name: "Forecasting & Cash Flow",
        icon: Calculator,
        features: [
          {
            name: "Multi-scenario cost grid (AOP / FCST / ACT / EAC)",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Period views (month / quarter / year)",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Cash flow forecast (Planned vs Actual outflows)",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Cumulative cash-out curve",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Configurable cost hierarchy (Financial View / Category / Spec)",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Cell-level change history on forecasts",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Lockdowns through month-end",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Available via baseline locking and project security.",
          },
        ],
      },
      {
        name: "AI & Risk Intelligence",
        icon: Sparkles,
        features: [
          {
            name: "AI-powered project risk assessment",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "AI-powered portfolio risk assessment",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "AI variance detection (CPI / SPI early warning)",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "AI change-order velocity & RFI aging alerts",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Shareable public risk assessment links",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Risk register with change history",
            friday: "yes",
            competitor: "yes",
          },
        ],
      },
      {
        name: "Field Execution",
        icon: ClipboardList,
        features: [
          {
            name: "RFIs (Requests for Information)",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Submittals log & reviewer workflow",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Change orders & PCOs with cost / schedule impact",
            friday: "yes",
            competitor: "no",
            competitorNote: "Typically handled in a separate cost system or Unifier.",
          },
          {
            name: "Daily reports (weather, labor, equipment)",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Schedule of Values & AIA-style pay apps",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Drawings & markups",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Punch list",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Quality & safety inspections",
            friday: "yes",
            competitor: "no",
          },
        ],
      },
      {
        name: "Governance & Reporting",
        icon: ShieldCheck,
        features: [
          {
            name: "Portfolio health scoring (RAG)",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Health status history tracking",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Project change logs / audit trail",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Custom dashboards & saved views",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Report subscriptions (scheduled email)",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Analytics API for Power BI / external tools",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Lessons learned module",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Project intake / demand management",
            friday: "yes",
            competitor: "no",
          },
        ],
      },
      {
        name: "Platform, UX & Pricing",
        icon: Cloud,
        features: [
          {
            name: "Cloud-native, modern web UI",
            friday: "yes",
            competitor: "partial",
            competitorNote: "P6 EPPM offers a web client; many users still rely on the thick desktop client.",
          },
          {
            name: "Dark mode",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Magic-link / passwordless sign-in",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Onboarding flow & in-app guide",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Demo data generation",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Free forever plan",
            friday: "yes",
            competitor: "no",
            competitorNote: "Enterprise-priced, named-user licensing.",
          },
          {
            name: "Setup time",
            friday: "yes",
            fridayNote: "Minutes — sign in and import P6 file.",
            competitor: "no",
            competitorNote: "Weeks to months — implementation, training, server / EPPM setup.",
          },
        ],
      },
    ],
  },
  faq: [
    {
      question: "Do I have to give up Primavera P6?",
      answer:
        "No. Most capital programs that adopt FridayReport.AI keep P6 as the schedule of record and use FridayReport for EVM, forecasting, change orders, RFIs, submittals, cash flow, and executive reporting. We re-import the P6 XER each cycle so the schedule and the controls always agree.",
    },
    {
      question: "Can FridayReport.AI replace P6 entirely?",
      answer:
        "For programs that don't need full CPM editing in P6 (e.g., owners and EPC clients consuming contractor schedules), FridayReport.AI can be the single platform. For schedule authoring shops, keep P6 for CPM and use FridayReport.AI for everything downstream.",
    },
    {
      question: "How is pricing different from P6?",
      answer:
        "Primavera P6 is enterprise-priced with named-user licenses, optional Cloud Service, and implementation services. FridayReport.AI offers a free forever plan and transparent per-seat pricing with no implementation fee — you can be running EVM by the end of the day.",
    },
    {
      question: "What about Primavera Unifier or P6 EPPM?",
      answer:
        "FridayReport.AI replaces the need for a separate cost / change management tool (the Unifier-style layer). RFIs, submittals, change orders, cost forecasting, lockdowns, and pay apps are all built in — no second product to license, integrate, or implement.",
    },
  ],
  cta: {
    title: "See FridayReport.AI on Top of Your Primavera P6 Schedule",
    subtitle:
      "Import a P6 XER, pick a portfolio, and you'll see live EVM, CPI / SPI heatmaps, S-Curves, and an audit-ready monthly forecast within minutes. Keep P6 — add the controls layer it never delivered.",
  },
};

export const msProjectCompareConfig: CompareConfig = {
  slug: "ms-project",
  routePath: "/compare/ms-project",
  competitor: {
    name: "Microsoft Project",
    shortName: "MS Project",
    logoBg: "bg-sky-600",
    logoText: "text-white",
    tagline: "Project Scheduling",
  },
  seo: {
    title:
      "FridayReport.AI vs Microsoft Project | Project Controls & EVM Comparison",
    description:
      "Compare FridayReport.AI and Microsoft Project side-by-side: MPP / XML schedule import, full EVM (CPI / SPI / EAC / ETC), portfolio rollup, AI variance detection, RFIs, submittals, change orders, and cash flow — all in one platform.",
    ogTitle: "FridayReport.AI vs Microsoft Project — Capital Projects Comparison",
    ogDescription:
      "Keep MS Project schedules. Add live EVM, AI variance detection, RFIs, submittals, change orders, and cash flow in one platform. Free forever plan.",
  },
  hero: {
    badge: "FridayReport.AI vs Microsoft Project",
    title: "MS Project schedules,",
    titleHighlight: "real Project Controls.",
    subtitle:
      "Microsoft Project is great for building schedules. It is not built for portfolio EVM rollup, AI variance detection, change orders, RFIs, submittals, or cash flow. FridayReport.AI imports your MPP and adds the controls layer capital programs actually need.",
    bullets: [
      "Import MS Project (.mpp / XML) and Primavera P6 (XER) schedules with WBS, predecessors, and critical path",
      "Live EVM at project and portfolio level: BAC, PV, EV, AC, CPI, SPI, EAC, ETC, VAC, TCPI",
      "AI-powered variance detection on CPI / SPI, change-order velocity, and RFI aging",
      "RFIs, submittals, change orders, cash flow, lockdowns, and audit trail built in",
    ],
  },
  summaryStats: [
    fridayWinsStat,
    {
      icon: Layers,
      value: "Portfolio EVM",
      label: "Bottom-Up Rollup",
      description:
        "Roll EVM bottom-up from project to portfolio to organization — without buying Project Online or Project Server.",
    },
    {
      icon: Workflow,
      value: "All-in-One",
      label: "Schedule + Controls + Field",
      description:
        "Schedules, EVM, change orders, RFIs, submittals, cash flow, and pay apps in one cloud platform.",
    },
    {
      icon: DollarSign,
      value: "Free Forever",
      label: "No Project Plan Tax",
      description:
        "Free forever plan and transparent per-seat pricing — no Project Plan 1 / 3 / 5 license matrix.",
    },
  ],
  advantages: {
    badge: "What FridayReport Adds Beyond MS Project",
    title: "MS Project Schedules Plus the Controls Layer",
    subtitle:
      "MS Project Plan 5 covers planning. FridayReport.AI covers what comes after the schedule: defending the EAC, detecting variance early, and running the field workflows that feed cost and schedule impact straight back into EVM.",
    items: [
      {
        icon: AlertTriangle,
        title: "AI Variance Detection",
        description:
          "Continuous CPI / SPI monitoring with AI-flagged early warnings on change-order velocity, RFI aging, and threshold breaches — before the variance becomes material.",
      },
      {
        icon: BarChart3,
        title: "Portfolio EVM Rollup",
        description:
          "True bottom-up EVM rollup at portfolio and organization level — no Project Server, Project Online, or Power BI patchwork required.",
      },
      {
        icon: Calculator,
        title: "Four EAC Scenarios",
        description:
          "Standard PMI EAC formulas (CPI, CPI × SPI, Optimistic, Pessimistic) side-by-side, with an editable target EAC and live TCPI gauge.",
      },
      {
        icon: Inbox,
        title: "RFIs, Submittals & Change Orders",
        description:
          "Full RFI, submittal, and change order registers with cost / schedule impact and reviewer workflows — feeding straight back into EVM and EAC.",
      },
      {
        icon: Banknote,
        title: "Cash Flow & Multi-Scenario Cost Grid",
        description:
          "Spreadsheet-grade AOP / FCST / ACT / EAC grid with month / quarter / year views and a cumulative cash-out curve for liquidity planning.",
      },
      {
        icon: Lock,
        title: "Lockdowns & Audit Trail",
        description:
          "Lock finalized periods so they cannot be retroactively edited. Every cell-level change captured with who, what, and when.",
      },
    ],
  },
  comparison: {
    badge: "Side-by-Side",
    title: "FridayReport.AI vs Microsoft Project: Detailed Comparison",
    subtitle:
      "How the two platforms stack up across scheduling, EVM, field execution, governance, and platform experience.",
    categories: [
      {
        name: "Scheduling & Schedule Integration",
        icon: GitBranch,
        features: [
          {
            name: "MS Project (MPP / XML) schedule authoring",
            friday: "partial",
            competitor: "yes",
            fridayNote: "Imports MPP / XML; dedicated authoring is on roadmap.",
            competitorNote: "Industry-standard scheduling tool.",
          },
          {
            name: "MS Project (MPP / XML) schedule import",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Primavera P6 (XER) schedule import",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "WBS, predecessors, durations preserved on import",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Critical path analysis",
            friday: "partial",
            competitor: "yes",
            fridayNote: "Critical path read in from MPP / XER.",
          },
          {
            name: "Re-import each cycle to track baseline vs current",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Multi-project / multi-program scheduling",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Requires Project Online / Project Server.",
          },
          {
            name: "Gantt chart / visual scheduling",
            friday: "yes",
            competitor: "yes",
          },
        ],
      },
      {
        name: "Earned Value Management (EVM)",
        icon: Activity,
        features: [
          {
            name: "BAC, PV, EV, AC tracking",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "CPI, SPI, CV, SV computation",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "EAC, ETC, VAC, TCPI computation",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Limited; usually exported to Excel for full EVM math.",
          },
          {
            name: "Four EAC scenarios side-by-side (CPI, CPI×SPI, Optimistic, Pessimistic)",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Editable target EAC with live TCPI gauge",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Portfolio-level EVM rollup (bottom-up)",
            friday: "yes",
            competitor: "no",
            competitorNote: "Requires Project Online + Power BI to approximate.",
          },
          {
            name: "CPI × SPI quadrant chart",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "S-Curve (PV / EV / AC / EAC) at project & portfolio",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "CPI / SPI threshold heatmaps over time",
            friday: "yes",
            competitor: "no",
          },
        ],
      },
      {
        name: "Forecasting & Cash Flow",
        icon: Calculator,
        features: [
          {
            name: "Multi-scenario cost grid (AOP / FCST / ACT / EAC)",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Period views (month / quarter / year)",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Cash flow forecast (Planned vs Actual outflows)",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Cash-flow report exists; not real planning grid.",
          },
          {
            name: "Cumulative cash-out curve",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Configurable cost hierarchy (Financial View / Category / Spec)",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Cell-level change history on forecasts",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Lockdowns through month-end",
            friday: "yes",
            competitor: "no",
          },
        ],
      },
      {
        name: "AI & Risk Intelligence",
        icon: Sparkles,
        features: [
          {
            name: "AI-powered project risk assessment",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "AI-powered portfolio risk assessment",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "AI variance detection (CPI / SPI early warning)",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "AI change-order velocity & RFI aging alerts",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Shareable public risk assessment links",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Risk register with change history",
            friday: "yes",
            competitor: "partial",
          },
        ],
      },
      {
        name: "Field Execution",
        icon: ClipboardList,
        features: [
          {
            name: "RFIs (Requests for Information)",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Submittals log & reviewer workflow",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Change orders & PCOs with cost / schedule impact",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Daily reports (weather, labor, equipment)",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Schedule of Values & AIA-style pay apps",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Drawings & markups",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Punch list",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Quality & safety inspections",
            friday: "yes",
            competitor: "no",
          },
        ],
      },
      {
        name: "Governance & Reporting",
        icon: ShieldCheck,
        features: [
          {
            name: "Portfolio health scoring (RAG)",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Available in Project Online via custom fields.",
          },
          {
            name: "Health status history tracking",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Project change logs / audit trail",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Custom dashboards & saved views",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Report subscriptions (scheduled email)",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Analytics API for Power BI / external tools",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Lessons learned module",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Project intake / demand management",
            friday: "yes",
            competitor: "no",
          },
        ],
      },
      {
        name: "Platform, UX & Pricing",
        icon: Cloud,
        features: [
          {
            name: "Cloud-native, modern web UI",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Project for the web is web-based; Project desktop is not.",
          },
          {
            name: "Dark mode",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Magic-link / passwordless sign-in",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Onboarding flow & in-app guide",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Demo data generation",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Free forever plan",
            friday: "yes",
            competitor: "no",
            competitorNote: "Project Plan 1 / 3 / 5 license matrix; no free tier.",
          },
          {
            name: "Setup time",
            friday: "yes",
            fridayNote: "Minutes — sign in and import the MPP.",
            competitor: "partial",
            competitorNote: "Project for the web: minutes; Project Server / Online: weeks.",
          },
        ],
      },
    ],
  },
  faq: [
    {
      question: "Do I have to stop using Microsoft Project?",
      answer:
        "No. Most teams keep MS Project as the schedule authoring tool and use FridayReport.AI for EVM, forecasting, RFIs, submittals, change orders, cash flow, and executive reporting. We re-import the MPP / XML each cycle so the schedule and the controls always agree.",
    },
    {
      question: "What about Project Online or Project Server?",
      answer:
        "FridayReport.AI replaces the portfolio rollup, dashboards, custom fields, and Power BI reporting that organizations typically build on top of Project Online — without the Plan 5 license, the SharePoint dependency, or the implementation project.",
    },
    {
      question: "How is pricing different from Microsoft Project?",
      answer:
        "Microsoft Project uses a Plan 1 / 3 / 5 license matrix per user, plus optional Project Online. FridayReport.AI offers a free forever plan and transparent per-seat pricing with no implementation fee.",
    },
    {
      question: "What about MS Planner?",
      answer:
        "MS Planner is for lightweight task tracking, not capital project controls. FridayReport.AI integrates with Planner for sync, but the comparison that matters for capital programs is FridayReport vs MS Project for scheduling and EVM.",
    },
  ],
  cta: {
    title: "See Real Project Controls on Top of Your MS Project Schedule",
    subtitle:
      "Import an MPP, pick a portfolio, and you'll see live EVM, CPI / SPI heatmaps, S-Curves, RFIs, change orders, and cash flow within minutes. Keep MS Project — add the controls layer it never delivered.",
  },
};

export const compareConfigs: Record<string, CompareConfig> = {
  "primavera-p6": primaveraP6CompareConfig,
  "ms-project": msProjectCompareConfig,
};
