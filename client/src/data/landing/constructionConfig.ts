import {
  Building2,
  HardHat,
  MapPin,
  Layers,
  AlertTriangle,
  Hammer,
  TrendingUp,
  Zap,
  Clock,
  Target,
  Shield,
  GitBranch,
  LineChart,
  Activity,
  Calculator,
  Gauge,
  Banknote,
  CalendarRange,
  Lock,
  ClipboardList,
  FileText,
  Inbox,
  ScrollText,
  ListChecks,
  PencilRuler,
  ShieldCheck,
  Receipt,
  Factory,
} from "lucide-react";
import type { IndustryConfig } from "@/components/landing/types";
import heroImage from "@/assets/construction/hero-construction-site.webp";
import networkImage from "@/assets/construction/construction-network.webp";
import dashboardImage from "@/assets/construction/project-dashboard.webp";
import clientLogo3 from "@assets/client-logo-3.png";
import clientLogo4 from "@assets/client-logo-4.png";

export const constructionConfig: IndustryConfig = {
  slug: "construction",
  routePath: "/construction",
  seo: {
    title: "Capital Projects & Project Controls Software | FridayReport.AI",
    description:
      "Project Controls and Earned Value Management for capital programs. Import Primavera P6 and MS Project schedules, track CPI / SPI / EAC / ETC, run S-Curves, forecasts, cash flow, RFIs, submittals, and change orders. Free forever.",
    ogTitle: "Capital Projects & Project Controls | FridayReport.AI",
    ogDescription:
      "AI-powered Project Controls and EVM for capital programs. Primavera P6 + MS Project ready. Free forever.",
  },
  colors: {
    primary: "yellow",
    secondary: "amber",
    heroGradient:
      "bg-gradient-to-br from-yellow-50 via-amber-50 to-background dark:from-yellow-950/30 dark:via-amber-950/20 dark:to-background",
    patternFillColor: "D97706",
    darkSectionGradient: "bg-gradient-to-br from-slate-900 via-amber-950 to-slate-900",
    ctaSectionGradient:
      "bg-gradient-to-br from-yellow-50 via-amber-50 to-background dark:from-yellow-950/20 dark:via-amber-950/10 dark:to-background",
    badgeClasses:
      "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/50 dark:text-yellow-300",
    checkIconClasses: "text-yellow-600 dark:text-yellow-400",
    heroGlowClasses: "bg-gradient-to-r from-yellow-500/20 to-amber-500/20",
    featureIconBg: "bg-yellow-100 dark:bg-yellow-900/40",
    featureIconText: "text-yellow-600 dark:text-yellow-400",
    useCaseIconBg: "bg-yellow-500/20",
    useCaseIconText: "text-yellow-400",
    useCaseBadgeBg: "bg-yellow-500/20",
    useCaseBadgeText: "text-yellow-300",
    useCaseBadgeBorder: "border-yellow-500/30",
    ctaIconBg: "bg-yellow-100 dark:bg-yellow-900/40",
    ctaIconText: "text-yellow-600 dark:text-yellow-400",
    signupIconBg: "bg-yellow-100 dark:bg-yellow-900/40",
    signupIconText: "text-yellow-600 dark:text-yellow-400",
    statGradient:
      "from-yellow-600 to-amber-600 dark:from-yellow-400 dark:to-amber-400",
  },
  heroIcon: HardHat,
  heroBadgeText: "Built for Capital Projects & Project Controls",
  heroTitle: "Project Controls & EVM for",
  heroTitleHighlight: "Capital Projects",
  heroSubtitle:
    "From Primavera P6 and MS Project schedules to full Earned Value Management — run your entire capital program with the cost, schedule, and forecast controls your owners, controls leads, and PMOs depend on.",
  heroChecklist: [
    "Import Primavera P6 (XER) and MS Project (MPP/XML) schedules with WBS, predecessors, and critical path",
    "Live EVM: BAC, PV, EV, AC, CPI, SPI, EAC, ETC, VAC, TCPI across every project",
    "S-Curves, forecast EAC, cash flow, RFIs, submittals, and change orders in one platform",
  ],
  heroImageAlt: "Capital projects controls and earned value dashboard",
  trustedByText:
    "Trusted by capital program owners, project controls leads, and EPC firms",
  trustedByOrgs: [
    { icon: Building2, label: "Capital Program Owners" },
    { icon: HardHat, label: "EPC & Engineering Firms" },
  ],
  painPointsBadge: "Capital Program Challenges",
  painPointsTitle: "Capital Projects Need More Than a Generic PMO Tool",
  painPointsSubtitle:
    "Capital programs run on baselines, EVM, change orders, and forecast-to-complete confidence. Generic project tools cannot answer the questions your steering committee asks every month.",
  painPoints: [
    {
      icon: GitBranch,
      title: "Schedule Slippage Against the P6 Baseline",
      description:
        "Imported P6 / MS Project baselines drift the moment work starts. Without continuous SPI tracking and critical-path visibility, slippage hides until milestones are missed.",
      color:
        "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-400",
    },
    {
      icon: LineChart,
      title: "Cost Performance Erosion You Catch Too Late",
      description:
        "When CPI quietly slides below 1.0 across a portfolio, the cumulative impact on EAC is brutal. Spot CPI, CV, and TCPI trends early — not at month-end close.",
      color:
        "text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400",
    },
    {
      icon: ScrollText,
      title: "Change Order & RFI Leakage",
      description:
        "Unlogged PCOs, undocumented field directives, and RFIs that never close turn into disputed claims. Capture cost and schedule impact the moment a change is identified.",
      color:
        "text-orange-600 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-400",
    },
    {
      icon: Calculator,
      title: "Forecast-to-Complete You Cannot Defend",
      description:
        "Owners want a defensible EAC every month: CPI-based, CPI×SPI, optimistic, and pessimistic — with the assumptions, lockdowns, and audit trail that survive an external review.",
      color:
        "text-yellow-700 bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-300",
    },
  ],
  featuresBadge: "The Solution",
  featuresTitle: "One Platform for Schedule, Cost, and Field Execution",
  featuresSubtitle:
    "FridayReport.AI brings industry-standard Project Controls — Earned Value, S-Curves, forecasting, and cash flow — together with the field execution modules your construction teams already need.",
  features: [
    {
      icon: Layers,
      title: "Capital Program Portfolio with EVM Rollup",
      description:
        "See every project across your capital program in one view: baseline vs forecast, CPI / SPI heatmaps, EAC vs BAC, and the CPI × SPI quadrant that pinpoints which projects need executive attention.",
      image: networkImage,
    },
    {
      icon: GitBranch,
      title: "Primavera P6 & MS Project Schedule Integration",
      description:
        "Import P6 (XER) and MS Project (MPP / XML) schedules with WBS, predecessors, durations, and critical path intact. Re-import each cycle to track baseline vs current and surface slipping milestones.",
      image: dashboardImage,
    },
    {
      icon: AlertTriangle,
      title: "AI-Powered Variance & Risk Detection",
      description:
        "Continuous monitoring of CPI, SPI, milestone slip, change-order velocity, and RFI aging. The AI flags projects before they breach thresholds — so corrective action happens, not post-mortems.",
      image: heroImage,
    },
  ],
  projectControls: {
    badge: "Project Controls & Earned Value",
    title: "Full PMI-Standard Earned Value Management",
    subtitle:
      "The same Project Controls engine that powers our Financials dashboards: BAC, PV, EV, AC, CPI, SPI, CV, SV, EAC, ETC, VAC, and TCPI — computed at project, portfolio, and organization level.",
    highlights: [
      "BAC",
      "PV",
      "EV",
      "AC",
      "CPI",
      "SPI",
      "CV",
      "SV",
      "EAC",
      "ETC",
      "VAC",
      "TCPI",
    ],
    capabilities: [
      {
        icon: Activity,
        title: "Earned Value Analysis",
        description:
          "CPI / SPI quadrant chart, KPI tiles, and a sortable per-project EVM detail table with grand-total rollups computed bottom-up.",
      },
      {
        icon: LineChart,
        title: "S-Curve Analysis",
        description:
          "Cumulative Planned (PV), Earned (EV), Actual (AC), and Forecast (EAC) curves — monthly or quarterly, scoped to a project or rolled up across the portfolio.",
      },
      {
        icon: Calculator,
        title: "Forecasting & EAC Scenarios",
        description:
          "Four standard PMI EAC formulas side-by-side (CPI, CPI × SPI, Optimistic, Pessimistic), plus an editable target EAC with live TCPI gauge.",
      },
      {
        icon: Banknote,
        title: "Cash Flow Forecast",
        description:
          "Monthly Planned vs Actual outflows with future months projected from FCST or distributed ETC, and a cumulative cash-out curve for liquidity planning.",
      },
      {
        icon: CalendarRange,
        title: "Multi-Scenario Cost Grid",
        description:
          "Spreadsheet-grade grid for AOP, FCST, ACT, and EAC scenarios with month / quarter / year period views, inline editing, and cell-level change history.",
      },
      {
        icon: Lock,
        title: "Lockdowns & Audit Trail",
        description:
          "Lock ACT (or any scenario) through month-end so finalized periods cannot be retroactively edited. Every change is captured with who, what, and when.",
      },
      {
        icon: Gauge,
        title: "Variance Trends & Heatmaps",
        description:
          "CPI and SPI threshold heatmaps over time make it obvious which projects are eroding before the variance becomes material.",
      },
      {
        icon: Factory,
        title: "Configurable Cost Hierarchy",
        description:
          "Three-level structure — Financial View → Cost Category → Cost Specification — that maps to your chart of accounts and capital vs OpEx reporting.",
      },
    ],
  },
  fieldExecution: {
    badge: "Field Execution",
    title: "Construction Workflows the Field Actually Uses",
    subtitle:
      "Project Controls is half the picture. Capital projects also need the day-to-day construction modules that capture what happens on site — and feed cost and schedule impact straight back into EVM.",
    capabilities: [
      {
        icon: Inbox,
        title: "RFIs",
        description:
          "Track Requests for Information with priority, category, distribution lists, official responses, and cost / schedule impact.",
      },
      {
        icon: FileText,
        title: "Submittals",
        description:
          "Submittal log with spec sections, lead times, revision tracking, and a reviewer workflow tied to the schedule.",
      },
      {
        icon: ScrollText,
        title: "Change Orders & PCOs",
        description:
          "Potential and approved change orders with reason codes, cost impact, schedule impact, and contract amount reconciliation.",
      },
      {
        icon: ClipboardList,
        title: "Daily Reports",
        description:
          "Capture site weather, visitors, labor headcount and hours by trade, and equipment usage — every day, every site.",
      },
      {
        icon: Receipt,
        title: "Schedule of Values & Pay Apps",
        description:
          "AIA-style payment applications with SOV line items: scheduled value, previous billed, current billed, retainage, and balance to finish.",
      },
      {
        icon: PencilRuler,
        title: "Drawings & Markups",
        description:
          "Drawing set management with revision control and coordinate-based markups so the latest issue is always in field hands.",
      },
      {
        icon: ListChecks,
        title: "Punch List",
        description:
          "Punch items by location and category with photo attachments, assignments, and closeout tracking.",
      },
      {
        icon: ShieldCheck,
        title: "Quality & Safety",
        description:
          "Template-based inspections with deficiency tracking, plus safety incident reporting with severity, root cause, and investigation status.",
      },
    ],
  },
  useCasesBadge: "Use Cases",
  useCasesTitle: "Built for the Way Capital Programs Are Delivered",
  useCasesSubtitle:
    "Whether you own a multi-billion capital portfolio, deliver an EPC project, or execute a turnaround — FridayReport.AI runs the controls and the field together.",
  useCases: [
    {
      title: "Capital Program Portfolios",
      description:
        "Plan and govern multi-project capital programs with EVM rollup, baseline vs forecast variance, and executive dashboards built for steering committees and capital review boards.",
      icon: Building2,
    },
    {
      title: "Infrastructure & Heavy Civil",
      description:
        "Manage road, bridge, utility, and public works projects with P6-level scheduling, milestone tracking, permit management, and multi-agency coordination.",
      icon: MapPin,
    },
    {
      title: "Plant Turnarounds & Shutdowns",
      description:
        "Run high-density turnaround windows with critical-path tracking, daily progress against the baseline, and EVM that lets you see CPI / SPI hourly during outages.",
      icon: Hammer,
    },
    {
      title: "Campus & Facility Expansions",
      description:
        "Oversee multi-building campus and facility expansions with cross-project resource planning, shared milestones, and capital program oversight for owners.",
      icon: TrendingUp,
    },
  ],
  stats: [
    {
      value: "12+",
      label: "EVM Metrics Tracked",
      description: "BAC, PV, EV, AC, CPI, SPI, CV, SV, EAC, ETC, VAC, TCPI",
    },
    {
      value: "4",
      label: "EAC Scenarios",
      description: "CPI · CPI × SPI · Optimistic · Pessimistic",
    },
    {
      value: "3x",
      label: "Faster Variance Detection",
      description: "AI surfaces CPI / SPI erosion before month-end",
    },
    {
      value: "100%",
      label: "Audit-Ready",
      description: "Lockdowns and full change history on every cell",
    },
  ],
  comparisonSubtitle:
    "See why capital program owners and project controls teams choose FridayReport.AI over generic PM tools that cannot do real EVM.",
  comparisonFeatureSet: "capital-projects",
  ctaTitle: "Ready to Run Your Capital Program on Real Project Controls?",
  ctaSubtitle:
    "Join the capital program owners, controls leads, and EPC teams who replaced spreadsheets and one-off P6 reports with a live EVM platform — built to defend every EAC and forecast in front of the steering committee.",
  ctaItems: [
    { icon: Zap, text: "Set up in minutes, not months" },
    { icon: Shield, text: "Enterprise-grade security & financial lockdowns" },
    { icon: Clock, text: "Free forever plan — no strings attached" },
    {
      icon: Target,
      text: "Import schedules from Primavera P6, MS Project, Planner, and more",
    },
  ],
  signupSubtitle:
    "Get your capital program controls up and running in minutes",
  emailPlaceholder: "you@your-firm.com",
  footerLabel: "Capital Projects & Project Controls",
  images: { hero: heroImage, clientLogo3, clientLogo4 },
};
