import { Shield, Building2, TrendingUp, Layers, AlertTriangle, FileCheck, Cpu, Settings, Wrench, Zap, Clock, Target } from "lucide-react";
import IndustryLandingPage from "@/components/landing/IndustryLandingPage";
import type { IndustryConfig } from "@/components/landing/types";
import heroImage from "@/assets/industrial-automation/hero-control-room.png";
import networkImage from "@/assets/industrial-automation/automation-network.png";
import safetyImage from "@/assets/industrial-automation/safety-dashboard.png";
import clientLogo3 from "@assets/client-logo-3.png";
import clientLogo4 from "@assets/client-logo-4.png";

const config: IndustryConfig = {
  slug: "industrial-automation",
  routePath: "/industrial-automation",
  seo: {
    title: "Industrial Automation Project Management Software | FridayReport.AI",
    description: "AI-powered project portfolio management built for industrial automation. Track SCADA modernizations, PLC migrations, safety system upgrades, and MES implementations. Free forever.",
    ogTitle: "Industrial Automation Project Management Software | FridayReport.AI",
    ogDescription: "AI-powered PMO software for industrial automation companies. Free forever.",
  },
  colors: {
    primary: "cyan",
    secondary: "slate",
    heroGradient: "bg-gradient-to-br from-cyan-50 via-slate-50 to-background dark:from-cyan-950/30 dark:via-slate-950/20 dark:to-background",
    patternFillColor: "06b6d4",
    darkSectionGradient: "bg-gradient-to-br from-slate-900 via-cyan-950 to-slate-900",
    ctaSectionGradient: "bg-gradient-to-br from-cyan-50 via-slate-50 to-background dark:from-cyan-950/20 dark:via-slate-950/10 dark:to-background",
    badgeClasses: "bg-cyan-100 text-cyan-800 hover:bg-cyan-100 dark:bg-cyan-900/50 dark:text-cyan-300",
    checkIconClasses: "text-cyan-600 dark:text-cyan-400",
    heroGlowClasses: "bg-gradient-to-r from-cyan-500/20 to-slate-500/20",
    featureIconBg: "bg-cyan-100 dark:bg-cyan-900/40",
    featureIconText: "text-cyan-600 dark:text-cyan-400",
    useCaseIconBg: "bg-cyan-500/20",
    useCaseIconText: "text-cyan-400",
    useCaseBadgeBg: "bg-cyan-500/20",
    useCaseBadgeText: "text-cyan-300",
    useCaseBadgeBorder: "border-cyan-500/30",
    ctaIconBg: "bg-cyan-100 dark:bg-cyan-900/40",
    ctaIconText: "text-cyan-600 dark:text-cyan-400",
    signupIconBg: "bg-cyan-100 dark:bg-cyan-900/40",
    signupIconText: "text-cyan-600 dark:text-cyan-400",
    statGradient: "from-cyan-600 to-slate-600 dark:from-cyan-400 dark:to-slate-400",
  },
  heroIcon: Cpu,
  heroBadgeText: "Built for Industrial Automation",
  heroTitle: "Project Portfolio Management",
  heroTitleHighlight: "Built for Industrial Automation",
  heroSubtitle: "From SCADA modernizations and PLC migrations to safety system upgrades — manage your entire automation PMO with AI-powered oversight that catches risks before they become plant shutdowns.",
  heroChecklist: [
    "Track control system upgrades, safety programs, and MES rollouts in one place",
    "AI-powered risk detection alerts you before issues escalate",
    "Executive dashboards your leadership team will actually use",
  ],
  heroImageAlt: "Industrial automation project management dashboard",
  trustedByText: "Trusted by teams at leading automation & industrial organizations",
  trustedByOrgs: [
    { icon: Cpu, label: "System Integrators" },
    { icon: Settings, label: "Process Industries" },
  ],
  painPointsBadge: "Automation PMO Challenges",
  painPointsTitle: "Your Automation PMO Deserves Better Tools",
  painPointsSubtitle: "Industrial automation companies manage dozens of concurrent modernization programs. Generic project tools were not designed for the complexity of control system operations.",
  painPoints: [
    { icon: Settings, title: "Plant Modernization Complexity", description: "Coordinate legacy system replacements, DCS migrations, and brownfield upgrades across multiple facilities without disrupting ongoing operations.", color: "text-cyan-600 bg-cyan-100 dark:bg-cyan-900/40 dark:text-cyan-400" },
    { icon: Cpu, title: "SCADA/ICS Upgrade Coordination", description: "Manage complex control system upgrades with full dependency tracking, vendor coordination, and integration testing across distributed plant architectures.", color: "text-slate-600 bg-slate-100 dark:bg-slate-900/40 dark:text-slate-400" },
    { icon: Shield, title: "Safety System Compliance", description: "Track IEC 61508 SIL verification, safety instrumented system assessments, and functional safety milestones with audit-ready documentation.", color: "text-rose-600 bg-rose-100 dark:bg-rose-900/40 dark:text-rose-400" },
    { icon: Building2, title: "Multi-Site Rollout Management", description: "Orchestrate automation deployments across geographically distributed plants with standardized templates, resource sharing, and centralized reporting.", color: "text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400" },
  ],
  featuresBadge: "The Solution",
  featuresTitle: "One Platform for Your Entire Automation Enterprise",
  featuresSubtitle: "FridayReport.AI brings AI-powered portfolio management to industrial automation, giving you the visibility and control your leadership team needs.",
  features: [
    { icon: Layers, title: "Portfolio Oversight for Automation Programs", description: "See every automation initiative across your enterprise in one view — from SCADA modernizations to MES rollouts to safety system upgrades.", image: networkImage },
    { icon: AlertTriangle, title: "AI-Powered Risk Detection for Control System Upgrades", description: "Our AI continuously monitors your project portfolio for schedule risks, integration conflicts, and resource bottlenecks — alerting you before small issues become costly plant shutdowns.", image: safetyImage },
    { icon: FileCheck, title: "Safety Compliance Tracking (IEC 61508)", description: "Track SIL verification milestones, functional safety assessments, and regulatory requirements alongside your regular projects. Never miss a safety compliance deadline again.", image: heroImage },
  ],
  useCasesBadge: "Use Cases",
  useCasesTitle: "Built for the Way Automation Delivers Projects",
  useCasesSubtitle: "Whether you are modernizing SCADA, migrating PLCs, or upgrading safety systems — FridayReport.AI adapts to your workflow.",
  useCases: [
    { title: "SCADA Modernization", description: "Plan multi-phase SCADA upgrades with dependency mapping, integration testing schedules, and automated status reporting to plant leadership.", icon: Cpu },
    { title: "PLC Migration Programs", description: "Track PLC hardware replacements, I/O mapping, program conversions, and commissioning across multiple production lines simultaneously.", icon: Wrench },
    { title: "Safety Instrumented System (SIS) Upgrades", description: "Manage SIL-rated system replacements with rigorous milestone tracking, vendor deliverables, and functional safety documentation requirements.", icon: Shield },
    { title: "MES Implementation", description: "Coordinate Manufacturing Execution System deployments across sites with resource planning, integration testing, and executive dashboards.", icon: TrendingUp },
  ],
  stats: [
    { value: "60%", label: "Faster Status Reporting", description: "AI generates weekly reports automatically" },
    { value: "100%", label: "Portfolio Visibility", description: "Real-time health across all initiatives" },
    { value: "3x", label: "Faster Risk Detection", description: "AI spots issues before they escalate" },
    { value: "0", label: "Missed Deadlines", description: "Proactive alerts keep projects on track" },
  ],
  comparisonSubtitle: "See why automation PMOs choose FridayReport.AI over generic project management tools.",
  ctaTitle: "Ready to Modernize Your Automation PMO?",
  ctaSubtitle: "Join industrial automation companies that have already streamlined their project management with AI-powered tools designed for the unique demands of control system programs.",
  ctaItems: [
    { icon: Zap, text: "Set up in minutes, not months" },
    { icon: Shield, text: "Enterprise-grade security" },
    { icon: Clock, text: "Free forever plan — no strings attached" },
    { icon: Target, text: "Import existing projects from MS Project, Planner, and more" },
  ],
  signupSubtitle: "Get your automation PMO up and running in minutes",
  emailPlaceholder: "you@company.com",
  footerLabel: "Industrial Automation Project Management",
  images: { hero: heroImage, clientLogo3, clientLogo4 },
};

export default function IndustrialAutomationLandingPage() {
  return <IndustryLandingPage config={config} />;
}
