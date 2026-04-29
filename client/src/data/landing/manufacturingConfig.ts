import { Shield, Building2, TrendingUp, Layers, AlertTriangle, FileCheck, Factory, Settings, Zap, Clock, Target } from "lucide-react";
import { Package, Workflow } from "lucide-react";
import type { IndustryConfig } from "@/components/landing/types";
import heroImage from "@/assets/manufacturing/hero-factory.webp";
import networkImage from "@/assets/manufacturing/supply-chain-network.webp";
import qualityImage from "@/assets/manufacturing/quality-dashboard.webp";
import clientLogo3 from "@assets/client-logo-3.png";
import clientLogo4 from "@assets/client-logo-4.png";

export const manufacturingConfig: IndustryConfig = {
  slug: "manufacturing",
  routePath: "/manufacturing",
  seo: {
    title: "Manufacturing Project Management Software | FridayReport.AI",
    description: "AI-powered project portfolio management built for manufacturing operations. Track new product introductions, plant expansions, quality programs, and supply chain initiatives. Free forever.",
    ogTitle: "Manufacturing Project Management Software | FridayReport.AI",
    ogDescription: "AI-powered PMO software for manufacturing operations. Free forever.",
  },
  faq: [
    {
      question: "Can FridayReport.AI manage New Product Introduction (NPI) and stage-gate programs?",
      answer:
        "Yes. NPI, stage-gate, and product launch programs are tracked across engineering, manufacturing, supply chain, and quality — with portfolio-level visibility into which launches are on track and which are slipping against gate dates.",
    },
    {
      question: "Does it handle plant expansions and capital equipment installs?",
      answer:
        "Yes. Greenfield builds, plant expansions, line conversions, and capex installs run as full capital projects with EVM, cash flow, change orders, RFIs, and submittals — the same controls layer used on construction programs.",
    },
    {
      question: "Can it track ISO 9001, IATF 16949, and other quality program work?",
      answer:
        "Yes. Quality system implementations, internal audits, corrective actions, and certification programs run as milestone-driven projects with automated alerts before audit windows and a full change history for the auditors.",
    },
    {
      question: "How does the AI risk detection help operations leaders?",
      answer:
        "The platform continuously scans portfolio health and project signals to flag risks that could disrupt production — supplier slips, qualification delays, equipment commissioning issues, and quality holds — before they hit the line.",
    },
    {
      question: "Is there a free plan for manufacturing PMOs?",
      answer:
        "Yes. FridayReport.AI offers a free forever plan with no per-seat license tax. Plant engineering, operations, and corporate PMO teams can run their entire portfolio without an enterprise license or implementation contract.",
    },
  ],
  colors: {
    primary: "orange",
    secondary: "amber",
    heroGradient: "bg-gradient-to-br from-orange-50 via-amber-50 to-background dark:from-orange-950/30 dark:via-amber-950/20 dark:to-background",
    patternFillColor: "F37021",
    darkSectionGradient: "bg-gradient-to-br from-slate-900 via-orange-950 to-slate-900",
    ctaSectionGradient: "bg-gradient-to-br from-orange-50 via-amber-50 to-background dark:from-orange-950/20 dark:via-amber-950/10 dark:to-background",
    badgeClasses: "bg-orange-100 text-orange-800 hover:bg-orange-100 dark:bg-orange-900/50 dark:text-orange-300",
    checkIconClasses: "text-orange-600 dark:text-orange-400",
    heroGlowClasses: "bg-gradient-to-r from-orange-500/20 to-amber-500/20",
    featureIconBg: "bg-orange-100 dark:bg-orange-900/40",
    featureIconText: "text-orange-600 dark:text-orange-400",
    useCaseIconBg: "bg-orange-500/20",
    useCaseIconText: "text-orange-400",
    useCaseBadgeBg: "bg-orange-500/20",
    useCaseBadgeText: "text-orange-300",
    useCaseBadgeBorder: "border-orange-500/30",
    ctaIconBg: "bg-orange-100 dark:bg-orange-900/40",
    ctaIconText: "text-orange-600 dark:text-orange-400",
    signupIconBg: "bg-orange-100 dark:bg-orange-900/40",
    signupIconText: "text-orange-600 dark:text-orange-400",
    statGradient: "from-orange-600 to-amber-600 dark:from-orange-400 dark:to-amber-400",
  },
  heroIcon: Factory,
  heroBadgeText: "Built for Manufacturing",
  heroTitle: "Project Portfolio Management",
  heroTitleHighlight: "Built for Manufacturing",
  heroSubtitle: "From new product introductions and plant expansions to quality compliance — manage your entire manufacturing PMO with AI-powered oversight that catches risks before they halt production.",
  heroChecklist: [
    "Track NPI programs, plant expansions, and quality initiatives in one place",
    "AI-powered risk detection alerts you before issues impact production",
    "Executive dashboards your leadership team will actually use",
  ],
  heroImageAlt: "Manufacturing project management dashboard",
  trustedByText: "Trusted by teams at leading manufacturing organizations",
  trustedByOrgs: [
    { icon: Factory, label: "Global Manufacturers" },
    { icon: Settings, label: "Industrial Leaders" },
  ],
  painPointsBadge: "Manufacturing PMO Challenges",
  painPointsTitle: "Your Manufacturing PMO Deserves Better Tools",
  painPointsSubtitle: "Manufacturing operations manage hundreds of concurrent initiatives across multiple plants. Generic project tools were not designed for the complexity of manufacturing operations.",
  painPoints: [
    { icon: Package, title: "New Product Introduction Delays", description: "Accelerate NPI programs with dependency tracking, milestone management, and real-time visibility across engineering, procurement, and production teams.", color: "text-orange-600 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-400" },
    { icon: Building2, title: "Plant Expansion Coordination", description: "Manage complex facility buildouts, equipment installations, and production line commissioning across multiple sites with full portfolio oversight.", color: "text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400" },
    { icon: Shield, title: "Quality Management Programs", description: "Track ISO 9001 audits, corrective actions, and continuous improvement initiatives with compliance-ready milestone tracking and automated alerts.", color: "text-rose-600 bg-rose-100 dark:bg-rose-100 dark:bg-rose-900/40 dark:text-rose-400" },
    { icon: Workflow, title: "Supply Chain Optimization", description: "Coordinate supplier qualification, logistics improvements, and digitization programs with cross-functional resource planning and risk detection.", color: "text-teal-600 bg-teal-100 dark:bg-teal-900/40 dark:text-teal-400" },
  ],
  featuresBadge: "The Solution",
  featuresTitle: "One Platform for Your Entire Manufacturing Operation",
  featuresSubtitle: "FridayReport.AI brings AI-powered portfolio management to manufacturing, giving you the visibility and control your leadership team needs.",
  features: [
    { icon: Layers, title: "Portfolio Oversight for Manufacturing Initiatives", description: "See every initiative across your manufacturing operation in one view — from new product introductions to plant expansions to quality improvement programs.", image: networkImage },
    { icon: AlertTriangle, title: "AI-Powered Risk Detection for Production Timelines", description: "Our AI continuously monitors your project portfolio for schedule risks, budget overruns, and resource conflicts — alerting you before small issues shut down production lines.", image: qualityImage },
    { icon: FileCheck, title: "ISO & Quality Compliance Tracking", description: "Track ISO 9001 milestones, audit preparation tasks, and quality management requirements alongside your regular projects. Never miss a compliance deadline again.", image: heroImage },
  ],
  useCasesBadge: "Use Cases",
  useCasesTitle: "Built for the Way Manufacturing Delivers Projects",
  useCasesSubtitle: "Whether you are launching new products, expanding plants, or driving quality improvements — FridayReport.AI adapts to your workflow.",
  useCases: [
    { title: "New Product Introductions (NPI)", description: "Plan multi-phase NPI programs with task dependencies, design review gates, and automated status reporting to leadership across engineering and production.", icon: Package },
    { title: "Plant Expansions & Relocations", description: "Track construction timelines, equipment procurement, production line commissioning, and workforce readiness across multiple facility projects simultaneously.", icon: Building2 },
    { title: "Quality Management (ISO 9001)", description: "Manage ISO certification preparation, internal audits, corrective action programs, and continuous improvement initiatives with milestone-driven tracking.", icon: Shield },
    { title: "Supply Chain Digitization", description: "Coordinate ERP implementations, supplier portal rollouts, warehouse automation, and logistics optimization programs with resource planning and executive dashboards.", icon: TrendingUp },
  ],
  stats: [
    { value: "60%", label: "Faster Status Reporting", description: "AI generates weekly reports automatically" },
    { value: "100%", label: "Portfolio Visibility", description: "Real-time health across all initiatives" },
    { value: "3x", label: "Faster Risk Detection", description: "AI spots issues before they escalate" },
    { value: "0", label: "Missed Deadlines", description: "Proactive alerts keep projects on track" },
  ],
  comparisonSubtitle: "See why manufacturing PMOs choose FridayReport.AI over generic project management tools.",
  ctaTitle: "Ready to Modernize Your Manufacturing PMO?",
  ctaSubtitle: "Join manufacturing organizations that have already streamlined their project management with AI-powered tools designed for the unique demands of production operations.",
  ctaItems: [
    { icon: Zap, text: "Set up in minutes, not months" },
    { icon: Shield, text: "Enterprise-grade security" },
    { icon: Clock, text: "Free forever plan — no strings attached" },
    { icon: Target, text: "Import existing projects from MS Project, Planner, and more" },
  ],
  signupSubtitle: "Get your manufacturing PMO up and running in minutes",
  emailPlaceholder: "you@company.com",
  footerLabel: "Manufacturing Project Management",
  images: { hero: heroImage, clientLogo3, clientLogo4 },
};
