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

export const procoreCompareConfig: CompareConfig = {
  slug: "procore",
  routePath: "/compare/procore",
  competitor: {
    name: "Procore",
    shortName: "Procore",
    logoBg: "bg-orange-600",
    logoText: "text-white",
    tagline: "Construction Management",
  },
  seo: {
    title:
      "FridayReport.AI vs Procore | Project Controls, EVM & Field Execution",
    description:
      "Compare FridayReport.AI and Procore side-by-side: portfolio EVM (CPI / SPI / EAC / ETC), Primavera P6 / MS Project schedule import, AI variance detection, RFIs, submittals, change orders, cash flow, and lockdowns — without Procore's enterprise license.",
    ogTitle: "FridayReport.AI vs Procore — Capital Projects Comparison",
    ogDescription:
      "Procore covers the field. FridayReport.AI adds true portfolio EVM, P6 / MS Project import, AI variance detection, four EAC scenarios, and cash flow forecasting. Free forever plan.",
  },
  hero: {
    badge: "FridayReport.AI vs Procore",
    title: "Procore covers the field.",
    titleHighlight: "We add real Project Controls.",
    subtitle:
      "Procore is built around the GC's day-to-day field execution. Capital owners and EPC controls leads still need portfolio EVM rollup, four EAC scenarios, AI variance detection, and a real schedule integration with Primavera P6 and MS Project. FridayReport.AI delivers all of that — for a fraction of Procore's enterprise price.",
    bullets: [
      "Import Primavera P6 (XER) and MS Project (MPP / XML) schedules — WBS, predecessors, and critical path intact",
      "True bottom-up portfolio EVM: BAC, PV, EV, AC, CPI, SPI, EAC, ETC, VAC, TCPI",
      "AI-powered variance detection on CPI / SPI thresholds, change-order velocity, and RFI aging",
      "RFIs, submittals, change orders, daily reports, drawings, punch list, and pay apps in one platform",
    ],
  },
  summaryStats: [
    fridayWinsStat,
    {
      icon: BarChart3,
      value: "Portfolio EVM",
      label: "Bottom-Up Rollup",
      description:
        "Bottom-up EVM rollup at project, portfolio, and organization level — not available in Procore out of the box.",
    },
    {
      icon: GitBranch,
      value: "P6 + MSP",
      label: "Native Schedule Import",
      description:
        "Re-import Primavera P6 (XER) and MS Project (MPP / XML) every cycle to keep schedule and controls in sync.",
    },
    {
      icon: DollarSign,
      value: "Free Forever",
      label: "No Enterprise Contract",
      description:
        "Free forever plan with transparent per-seat pricing. Procore is sold via annual enterprise contract sized to construction volume.",
    },
  ],
  advantages: {
    badge: "What FridayReport Adds Beyond Procore",
    title: "Field Execution Plus the Owner-Side Controls Layer",
    subtitle:
      "Procore is the system of record for field execution. FridayReport.AI is the system of record for capital program controls — EVM, EAC, cash flow, and the AI variance layer that owners need to defend the forecast every month.",
    items: [
      {
        icon: BarChart3,
        title: "Portfolio EVM Rollup",
        description:
          "True bottom-up EVM at portfolio and organization level — BAC, PV, EV, AC, CPI, SPI, EAC, ETC, VAC, and TCPI rolled across every program. Procore reports cost-to-complete, not real EVM.",
      },
      {
        icon: Calculator,
        title: "Four EAC Scenarios",
        description:
          "Standard PMI EAC formulas (CPI, CPI × SPI, Optimistic, Pessimistic) side-by-side, with editable target EAC and a live TCPI gauge — built for owner-side cost forecasting, not GC billings.",
      },
      {
        icon: AlertTriangle,
        title: "AI Variance Detection",
        description:
          "Continuous monitoring of CPI / SPI thresholds, change-order velocity, and RFI aging. The AI flags projects before month-end variance reports — Procore has no native AI variance layer.",
      },
      {
        icon: GitBranch,
        title: "Primavera P6 & MS Project Import",
        description:
          "Re-import P6 XER and MS Project MPP / XML each cycle with WBS, predecessors, durations, and critical path intact. Procore integrates with schedules; it does not own the controls layer on top of them.",
      },
      {
        icon: Banknote,
        title: "Cash Flow Forecasting",
        description:
          "Monthly Planned vs Actual outflows, future months projected from FCST or distributed ETC, and a cumulative cash-out curve — true treasury-grade cash flow planning, not GC billing exports.",
      },
      {
        icon: Lock,
        title: "Lockdowns & Audit Trail",
        description:
          "Lock ACT (or any scenario) through month-end so finalized periods cannot be retroactively edited. Cell-level change history with who, what, and when.",
      },
    ],
  },
  comparison: {
    badge: "Side-by-Side",
    title: "FridayReport.AI vs Procore: Detailed Comparison",
    subtitle:
      "How the two platforms stack up across scheduling, EVM, field execution, governance, and pricing.",
    categories: [
      {
        name: "Scheduling & Schedule Integration",
        icon: GitBranch,
        features: [
          {
            name: "Primavera P6 (XER) schedule import",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Integrates via Procore Schedule / connectors; not native CPM.",
          },
          {
            name: "MS Project (MPP / XML) schedule import",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Read-only sync via integrations.",
          },
          {
            name: "WBS, predecessors, durations preserved on import",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Critical path scheduling (CPM)",
            friday: "partial",
            competitor: "no",
            fridayNote: "Imports CPM from P6 / MS Project; dedicated CPM editing on roadmap.",
            competitorNote: "Procore Schedule is task-tracking, not a CPM engine.",
          },
          {
            name: "Re-import each cycle to track baseline vs current",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Multi-project / multi-program scheduling",
            friday: "yes",
            competitor: "partial",
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
            competitor: "no",
            competitorNote: "Procore tracks budget, cost-to-complete, and forecast — not standard EVM.",
          },
          {
            name: "CPI, SPI, CV, SV computation",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "EAC, ETC, VAC, TCPI computation",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Forecast-to-Complete and EAC available; no SPI / TCPI / VAC.",
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
            competitorNote: "Portfolio Financials offers cross-project cost views, not EVM rollup.",
          },
          {
            name: "CPI × SPI quadrant chart",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "S-Curve (PV / EV / AC / EAC) at project & portfolio",
            friday: "yes",
            competitor: "no",
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
            competitorNote: "Cash flow report exists; not a multi-scenario planning grid.",
          },
          {
            name: "Cumulative cash-out curve",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Configurable cost hierarchy (Financial View / Category / Spec)",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Cost code / WBS structure is configurable but contract-centric.",
          },
          {
            name: "Cell-level change history on forecasts",
            friday: "yes",
            competitor: "partial",
          },
          {
            name: "Lockdowns through month-end",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Period close exists in Procore Financials.",
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
            competitor: "partial",
            competitorNote: "Procore Copilot is being rolled out; risk assessment is limited.",
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
            competitor: "partial",
            competitorNote: "Aging reports available; no AI early-warning model.",
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
            competitor: "yes",
          },
          {
            name: "Submittals log & reviewer workflow",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Change orders & PCOs with cost / schedule impact",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Daily reports (weather, labor, equipment)",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Schedule of Values & AIA-style pay apps",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Drawings & markups",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Punch list",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Quality & safety inspections",
            friday: "yes",
            competitor: "yes",
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
            competitorNote: "Custom dashboards in Procore Analytics.",
          },
          {
            name: "Health status history tracking",
            friday: "yes",
            competitor: "no",
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
            competitorNote: "Procore Analytics is a paid add-on.",
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
            competitor: "yes",
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
            competitor: "yes",
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
            competitorNote: "Annual enterprise contract sized to construction volume; no free tier.",
          },
          {
            name: "Setup time",
            friday: "yes",
            fridayNote: "Minutes — sign in and import a P6 / MPP file.",
            competitor: "no",
            competitorNote: "Weeks to months — implementation, training, module configuration.",
          },
        ],
      },
    ],
  },
  faq: [
    {
      question: "Do I have to replace Procore?",
      answer:
        "No. Many capital owners run Procore as the GC's field-execution system and run FridayReport.AI as the owner-side controls layer — true EVM rollup, EAC scenarios, cash flow, and AI variance detection. The two coexist cleanly, and FridayReport.AI re-imports schedules from P6 / MS Project so the controls layer always agrees with the schedule of record.",
    },
    {
      question: "Can FridayReport.AI replace Procore for field execution?",
      answer:
        "For owners and program management offices that don't need GC-side payroll integration or trade contractor management, FridayReport.AI's RFIs, submittals, change orders, daily reports, drawings, punch list, and pay apps cover field execution end-to-end. Many programs adopt FridayReport.AI as the all-in-one platform and skip the Procore enterprise contract entirely.",
    },
    {
      question: "How is pricing different from Procore?",
      answer:
        "Procore is sold as an annual enterprise contract sized to your construction volume, with paid add-ons for Analytics, BIM, and other modules. FridayReport.AI offers a free forever plan and transparent per-seat pricing — no implementation services, no volume-based pricing, no module gating.",
    },
    {
      question: "Does Procore do real EVM?",
      answer:
        "Procore tracks budget, cost-to-complete, and forecast — useful for GC billings — but it does not compute standard EVM metrics (PV, EV, CPI, SPI, TCPI, VAC) or roll them up across the portfolio. Owners and EPC controls leads consistently need a separate tool for real EVM. FridayReport.AI is built for that role.",
    },
  ],
  cta: {
    title: "Add Real Project Controls on Top of Your Procore Field Layer",
    subtitle:
      "Import a Primavera P6 or MS Project schedule, pick a portfolio, and you'll see live EVM, four EAC scenarios, CPI / SPI heatmaps, S-Curves, and cash flow within minutes — for a fraction of Procore's enterprise price.",
  },
};

export const aconexCompareConfig: CompareConfig = {
  slug: "aconex",
  routePath: "/compare/aconex",
  competitor: {
    name: "Oracle Aconex",
    shortName: "Aconex",
    logoBg: "bg-red-700",
    logoText: "text-white",
    tagline: "Document Control & Collaboration",
  },
  seo: {
    title:
      "FridayReport.AI vs Oracle Aconex | Project Controls, EVM & Capital Programs",
    description:
      "Compare FridayReport.AI and Oracle Aconex side-by-side: portfolio EVM (CPI / SPI / EAC / ETC), Primavera P6 / MS Project schedule import, AI variance detection, RFIs, submittals, change orders, cash flow, and lockdowns — beyond Aconex's document control layer.",
    ogTitle: "FridayReport.AI vs Aconex — Capital Projects Comparison",
    ogDescription:
      "Aconex owns document control. FridayReport.AI adds the controls layer: portfolio EVM, schedule integration, AI variance detection, change orders, and cash flow. Free forever plan.",
  },
  hero: {
    badge: "FridayReport.AI vs Oracle Aconex",
    title: "Aconex owns documents.",
    titleHighlight: "We own the controls layer.",
    subtitle:
      "Oracle Aconex is the gold standard for document control, transmittals, and contractually-defensible mail on mega projects. It is not an EVM, scheduling, or forecasting platform. FridayReport.AI sits next to Aconex and gives capital programs the project controls layer that Aconex was never built to deliver.",
    bullets: [
      "Import Primavera P6 (XER) and MS Project (MPP / XML) schedules — WBS, predecessors, and critical path intact",
      "Live EVM at project and portfolio level: BAC, PV, EV, AC, CPI, SPI, EAC, ETC, VAC, TCPI",
      "AI-powered variance detection on CPI / SPI thresholds, change-order velocity, and RFI aging",
      "RFIs, submittals, change orders, cash flow forecast, daily reports, and pay apps in one platform",
    ],
  },
  summaryStats: [
    fridayWinsStat,
    {
      icon: BarChart3,
      value: "Portfolio EVM",
      label: "Bottom-Up Rollup",
      description:
        "Bottom-up EVM rollup at project, portfolio, and organization level — Aconex has no EVM engine.",
    },
    {
      icon: Workflow,
      value: "All-in-One",
      label: "Schedule + EVM + Field",
      description:
        "Schedules, EVM, RFIs, submittals, change orders, cash flow, and pay apps in one cloud platform.",
    },
    {
      icon: DollarSign,
      value: "Free Forever",
      label: "No Mega-Project Contract",
      description:
        "Free forever plan with transparent per-seat pricing. Aconex is sold via large enterprise contracts on mega programs.",
    },
  ],
  advantages: {
    badge: "What FridayReport Adds Beyond Aconex",
    title: "Document Control Plus Project Controls",
    subtitle:
      "Aconex is the audit-grade record of correspondence, transmittals, and BIM coordination. FridayReport.AI is the audit-grade record of cost and schedule performance — the two halves of a defensible mega-project file.",
    items: [
      {
        icon: BarChart3,
        title: "Portfolio EVM Rollup",
        description:
          "Roll BAC, PV, EV, AC, CPI, SPI, EAC, ETC, VAC, and TCPI bottom-up from project to portfolio to organization. Aconex has no EVM model — its data is documents and mail, not cost and schedule performance.",
      },
      {
        icon: GitBranch,
        title: "Primavera P6 & MS Project Import",
        description:
          "Import Primavera P6 (XER) and MS Project (MPP / XML) every cycle with WBS, predecessors, durations, and critical path intact — the basis Aconex's schedule data is missing.",
      },
      {
        icon: Calculator,
        title: "Four EAC Scenarios",
        description:
          "Standard PMI EAC formulas (CPI, CPI × SPI, Optimistic, Pessimistic) side-by-side with editable target EAC and a live TCPI gauge.",
      },
      {
        icon: AlertTriangle,
        title: "AI Variance Detection",
        description:
          "Continuous monitoring of CPI / SPI thresholds, change-order velocity, and RFI aging. The AI flags projects before month-end variance reports — Aconex has no AI variance or risk layer.",
      },
      {
        icon: Banknote,
        title: "Cash Flow Forecasting",
        description:
          "Monthly Planned vs Actual outflows, future months projected from FCST or distributed ETC, and a cumulative cash-out curve for liquidity planning.",
      },
      {
        icon: Inbox,
        title: "RFIs, Submittals & Change Orders With Cost / Schedule Impact",
        description:
          "RFI register, submittal log, and change-order workflow that feed straight back into EVM and EAC — not just transmittal records.",
      },
    ],
  },
  comparison: {
    badge: "Side-by-Side",
    title: "FridayReport.AI vs Oracle Aconex: Detailed Comparison",
    subtitle:
      "How the two platforms stack up across scheduling, EVM, field execution, governance, and pricing.",
    categories: [
      {
        name: "Scheduling & Schedule Integration",
        icon: GitBranch,
        features: [
          {
            name: "Primavera P6 (XER) schedule import",
            friday: "yes",
            competitor: "no",
            competitorNote: "Aconex stores schedule files as documents; no schedule data model.",
          },
          {
            name: "MS Project (MPP / XML) schedule import",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "WBS, predecessors, durations preserved on import",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Critical path scheduling (CPM)",
            friday: "partial",
            competitor: "no",
            fridayNote: "Imports CPM from P6 / MS Project; dedicated CPM editing on roadmap.",
          },
          {
            name: "Re-import each cycle to track baseline vs current",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Multi-project / multi-program scheduling",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Gantt chart / visual scheduling",
            friday: "yes",
            competitor: "no",
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
            competitor: "no",
          },
          {
            name: "CPI, SPI, CV, SV computation",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "EAC, ETC, VAC, TCPI computation",
            friday: "yes",
            competitor: "no",
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
          },
          {
            name: "CPI × SPI quadrant chart",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "S-Curve (PV / EV / AC / EAC) at project & portfolio",
            friday: "yes",
            competitor: "no",
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
            competitor: "no",
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
            competitor: "partial",
            competitorNote: "Document and mail records are immutable, but no cost lockdowns.",
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
            competitor: "no",
          },
        ],
      },
      {
        name: "Field Execution & Document Control",
        icon: ClipboardList,
        features: [
          {
            name: "Document control & transmittals",
            friday: "partial",
            competitor: "yes",
            fridayNote: "Drawings + attachments per workflow; not a full document control system of record.",
            competitorNote: "Aconex's core strength.",
          },
          {
            name: "RFIs (Requests for Information)",
            friday: "yes",
            competitor: "yes",
            competitorNote: "RFI workflow available in Aconex.",
          },
          {
            name: "Submittals log & reviewer workflow",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Change orders & PCOs with cost / schedule impact",
            friday: "yes",
            competitor: "no",
            competitorNote: "Aconex stores change documents; no cost / schedule impact engine.",
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
            competitor: "yes",
          },
          {
            name: "Punch list",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Quality & safety inspections",
            friday: "yes",
            competitor: "partial",
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
            competitor: "no",
          },
          {
            name: "Health status history tracking",
            friday: "yes",
            competitor: "no",
          },
          {
            name: "Project change logs / audit trail",
            friday: "yes",
            competitor: "yes",
            competitorNote: "Document and mail records are audit-grade by design.",
          },
          {
            name: "Custom dashboards & saved views",
            friday: "yes",
            competitor: "partial",
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
            competitor: "yes",
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
            competitorNote: "Sold via large enterprise / mega-project contracts.",
          },
          {
            name: "Setup time",
            friday: "yes",
            fridayNote: "Minutes — sign in and import a P6 / MPP file.",
            competitor: "no",
            competitorNote: "Weeks to months — implementation, configuration, training.",
          },
        ],
      },
    ],
  },
  faq: [
    {
      question: "Do I have to replace Aconex?",
      answer:
        "No. Aconex remains the contractually-defensible system of record for documents, transmittals, mail, and BIM coordination on mega programs. FridayReport.AI sits next to Aconex and adds the project controls layer — EVM, EAC, schedule integration, AI variance detection, and cash flow — that Aconex was never built to deliver.",
    },
    {
      question: "Can FridayReport.AI replace Aconex on smaller programs?",
      answer:
        "For owners and PMOs that don't need Aconex's mega-project document-control workflows, FridayReport.AI's drawings, RFI / submittal / correspondence registers, and audit trail cover most day-to-day collaboration needs. Many capital teams adopt FridayReport.AI as the all-in-one platform and reserve Aconex for the largest mega projects.",
    },
    {
      question: "How is pricing different from Aconex?",
      answer:
        "Aconex is sold as a large enterprise / mega-project contract via Oracle. FridayReport.AI offers a free forever plan and transparent per-seat pricing with no implementation fee — you can be running EVM by the end of the day.",
    },
    {
      question: "What about Oracle Smart Construction Platform / Primavera Cloud?",
      answer:
        "Smart Construction Platform bundles Aconex with Primavera Cloud and other Oracle modules at enterprise pricing. FridayReport.AI replaces the controls portion of that stack — schedule import, EVM, EAC, change orders, cash flow, and AI variance — with one transparent product.",
    },
  ],
  cta: {
    title: "Add Real Project Controls on Top of Your Aconex Document Layer",
    subtitle:
      "Import a Primavera P6 or MS Project schedule, pick a portfolio, and you'll see live EVM, four EAC scenarios, CPI / SPI heatmaps, S-Curves, and cash flow within minutes — without negotiating another mega-project Oracle contract.",
  },
};

export const astaCompareConfig: CompareConfig = {
  slug: "asta",
  routePath: "/compare/asta",
  competitor: {
    name: "Asta Powerproject",
    shortName: "Asta Powerproject",
    logoBg: "bg-blue-700",
    logoText: "text-white",
    tagline: "UK / EU Critical Path Scheduling",
  },
  seo: {
    title:
      "FridayReport.AI vs Asta Powerproject | Project Controls & EVM Comparison",
    description:
      "Compare FridayReport.AI and Asta Powerproject side-by-side: schedule import, full EVM (CPI / SPI / EAC / ETC), portfolio rollup, AI variance detection, RFIs, submittals, change orders, and cash flow — the controls layer Asta alone never delivered.",
    ogTitle: "FridayReport.AI vs Asta Powerproject — Capital Projects Comparison",
    ogDescription:
      "Keep Asta Powerproject schedules. Add live EVM, AI variance detection, RFIs, submittals, change orders, and cash flow in one platform. Free forever plan.",
  },
  hero: {
    badge: "FridayReport.AI vs Asta Powerproject",
    title: "Asta schedules,",
    titleHighlight: "real Project Controls.",
    subtitle:
      "Asta Powerproject is a popular CPM scheduling tool for UK and European construction programs. It is not built for portfolio EVM rollup, AI variance detection, change orders, RFIs, submittals, or cash flow. FridayReport.AI imports your schedules and adds the controls layer capital programs actually need.",
    bullets: [
      "Import Asta-authored schedules via MS Project (MPP / XML) and Primavera P6 (XER) export — WBS, predecessors, durations intact",
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
        "Roll EVM bottom-up from project to portfolio to organization — without a separate Power BI or Excel layer on top of Asta.",
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
      label: "No Per-Seat License Tax",
      description:
        "Free forever plan with transparent per-seat pricing — no Asta named-user license matrix.",
    },
  ],
  advantages: {
    badge: "What FridayReport Adds Beyond Asta Powerproject",
    title: "Asta Schedules Plus the Controls Layer",
    subtitle:
      "Asta Powerproject owns the CPM schedule. FridayReport.AI owns what comes after the schedule: defending the EAC, detecting variance early, and running the field workflows that feed cost and schedule impact straight back into EVM.",
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
          "True bottom-up EVM rollup at portfolio and organization level — no Asta Vision or Power BI patchwork required.",
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
    title: "FridayReport.AI vs Asta Powerproject: Detailed Comparison",
    subtitle:
      "How the two platforms stack up across scheduling, EVM, field execution, governance, and pricing.",
    categories: [
      {
        name: "Scheduling & Schedule Integration",
        icon: GitBranch,
        features: [
          {
            name: "Critical path scheduling (CPM) authoring",
            friday: "partial",
            competitor: "yes",
            fridayNote: "Imports CPM from P6 / MS Project / Asta exports; dedicated CPM editing on roadmap.",
            competitorNote: "Native CPM scheduling tool.",
          },
          {
            name: "Asta schedule import (via MPP / XML / XER export)",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Primavera P6 (XER) schedule import",
            friday: "yes",
            competitor: "partial",
            competitorNote: "Asta supports XER import / export.",
          },
          {
            name: "MS Project (MPP / XML) schedule import",
            friday: "yes",
            competitor: "yes",
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
            name: "Multi-project / multi-program scheduling",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "Gantt chart / visual scheduling",
            friday: "yes",
            competitor: "yes",
          },
          {
            name: "4D / BIM-linked scheduling",
            friday: "no",
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
            competitor: "partial",
            competitorNote: "Earned Value module exists; usually exported for portfolio reporting.",
          },
          {
            name: "CPI, SPI, CV, SV computation",
            friday: "yes",
            competitor: "partial",
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
            competitorNote: "Asta Vision / Power BI required to approximate.",
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
            competitorNote: "Cash-flow histogram exists; not a multi-scenario planning grid.",
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
            competitor: "partial",
            competitorNote: "Baseline locking is available in Asta.",
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
            competitorNote: "Risk Analysis add-on (Monte Carlo) is sold separately.",
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
            competitorNote: "Available via Asta Vision custom dashboards.",
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
            competitor: "partial",
            competitorNote: "Asta Vision is a separate paid module.",
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
            competitorNote: "Asta Powerproject is desktop-first; Powerproject Cloud / Vision adds browser access.",
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
            competitorNote: "Per-named-user perpetual or subscription license.",
          },
          {
            name: "Setup time",
            friday: "yes",
            fridayNote: "Minutes — sign in and import the schedule.",
            competitor: "partial",
            competitorNote: "Days for desktop install + training; longer for Vision rollout.",
          },
        ],
      },
    ],
  },
  faq: [
    {
      question: "Do I have to stop using Asta Powerproject?",
      answer:
        "No. Most teams keep Asta as the schedule authoring tool and use FridayReport.AI for EVM, forecasting, RFIs, submittals, change orders, cash flow, and executive reporting. We re-import the schedule (via MPP / XML / XER export) each cycle so the schedule and the controls always agree.",
    },
    {
      question: "What about Asta Vision and the Risk Analysis add-on?",
      answer:
        "FridayReport.AI replaces the dashboard / portfolio rollup that organizations typically build on top of Asta Vision and Power BI — without the additional license. AI variance detection covers most of the early-warning use cases that teams use Monte Carlo Risk Analysis for at the portfolio level.",
    },
    {
      question: "How is pricing different from Asta Powerproject?",
      answer:
        "Asta Powerproject is sold as a per-named-user perpetual or subscription license, with separate modules for Vision and Risk Analysis. FridayReport.AI offers a free forever plan and transparent per-seat pricing — every controls capability included, no module gating.",
    },
    {
      question: "Does Asta Powerproject do real EVM?",
      answer:
        "Asta has an Earned Value module, but standard EVM math (full PMI EAC scenarios, TCPI, VAC, portfolio rollup) is typically exported to Excel or Power BI in practice. FridayReport.AI delivers the full EVM model, four EAC scenarios, and portfolio rollup natively.",
    },
  ],
  cta: {
    title: "Add Real Project Controls on Top of Your Asta Powerproject Schedule",
    subtitle:
      "Import an Asta-authored schedule (MPP / XML / XER), pick a portfolio, and you'll see live EVM, four EAC scenarios, CPI / SPI heatmaps, S-Curves, and cash flow within minutes. Keep Asta — add the controls layer it never delivered.",
  },
};

export const compareConfigs: Record<string, CompareConfig> = {
  "primavera-p6": primaveraP6CompareConfig,
  "ms-project": msProjectCompareConfig,
  procore: procoreCompareConfig,
  aconex: aconexCompareConfig,
  asta: astaCompareConfig,
};
