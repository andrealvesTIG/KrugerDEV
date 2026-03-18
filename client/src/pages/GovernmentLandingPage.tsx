import { Shield, Building2, TrendingUp, Layers, AlertTriangle, FileCheck, Landmark, Globe, Users, Zap, Clock, Target } from "lucide-react";
import IndustryLandingPage from "@/components/landing/IndustryLandingPage";
import type { IndustryConfig } from "@/components/landing/types";
import heroImage from "@/assets/government/hero-gov-ops.png";
import networkImage from "@/assets/government/gov-network.png";
import auditImage from "@/assets/government/audit-dashboard.png";
import clientLogo3 from "@assets/client-logo-3.png";
import clientLogo4 from "@assets/client-logo-4.png";

const config: IndustryConfig = {
  slug: "government",
  routePath: "/government",
  seo: {
    title: "Government Project Management Software | FridayReport.AI",
    description: "AI-powered project portfolio management built for government agencies and the public sector. Track IT modernization, infrastructure programs, grant compliance, and more. Free forever.",
    ogTitle: "Government Project Management Software | FridayReport.AI",
    ogDescription: "AI-powered PMO software for government agencies and the public sector. Free forever.",
  },
  colors: {
    primary: "slate",
    secondary: "blue",
    heroGradient: "bg-gradient-to-br from-slate-50 via-blue-50 to-background dark:from-slate-950/30 dark:via-blue-950/20 dark:to-background",
    patternFillColor: "475569",
    darkSectionGradient: "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900",
    ctaSectionGradient: "bg-gradient-to-br from-slate-50 via-blue-50 to-background dark:from-slate-950/20 dark:via-blue-950/10 dark:to-background",
    badgeClasses: "bg-slate-100 text-slate-800 hover:bg-slate-100 dark:bg-slate-800/50 dark:text-slate-300",
    checkIconClasses: "text-blue-600 dark:text-blue-400",
    heroGlowClasses: "bg-gradient-to-r from-slate-500/20 to-blue-500/20",
    featureIconBg: "bg-blue-100 dark:bg-blue-900/40",
    featureIconText: "text-blue-600 dark:text-blue-400",
    useCaseIconBg: "bg-blue-500/20",
    useCaseIconText: "text-blue-400",
    useCaseBadgeBg: "bg-blue-500/20",
    useCaseBadgeText: "text-blue-300",
    useCaseBadgeBorder: "border-blue-500/30",
    ctaIconBg: "bg-blue-100 dark:bg-blue-900/40",
    ctaIconText: "text-blue-600 dark:text-blue-400",
    signupIconBg: "bg-slate-100 dark:bg-slate-800/40",
    signupIconText: "text-slate-600 dark:text-slate-400",
    statGradient: "from-slate-600 to-blue-600 dark:from-slate-400 dark:to-blue-400",
  },
  heroIcon: Landmark,
  heroBadgeText: "Built for Government & Public Sector",
  heroTitle: "Project Portfolio Management",
  heroTitleHighlight: "Built for Government",
  heroSubtitle: "From IT modernization and infrastructure programs to grant compliance — manage your entire government PMO with AI-powered oversight that catches risks before they become crises.",
  heroChecklist: [
    "Track IT modernization, infrastructure, and grant programs in one place",
    "AI-powered risk detection alerts you before issues escalate",
    "Audit-ready dashboards your leadership will actually use",
  ],
  heroImageAlt: "Government project management dashboard",
  trustedByText: "Trusted by teams at leading government organizations",
  trustedByOrgs: [
    { icon: Landmark, label: "Federal Agencies" },
    { icon: Building2, label: "State & Local Government" },
  ],
  painPointsBadge: "Government PMO Challenges",
  painPointsTitle: "Your Government PMO Deserves Better Tools",
  painPointsSubtitle: "Government agencies manage complex multi-year programs under intense public scrutiny. Generic project tools were not designed for the accountability requirements of the public sector.",
  painPoints: [
    { icon: Landmark, title: "IT Modernization Mandates", description: "Stay on track with federal and state IT modernization directives. Track cloud migrations, legacy system replacements, and digital transformation milestones with full audit trails.", color: "text-slate-700 bg-slate-100 dark:bg-slate-800/40 dark:text-slate-300" },
    { icon: Globe, title: "Cross-Agency Coordination", description: "Manage complex inter-agency programs with shared timelines, dependency tracking, and unified dashboards that keep all stakeholders aligned across departments.", color: "text-blue-700 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300" },
    { icon: Shield, title: "Grant & Funding Compliance", description: "Track grant-funded initiatives with milestone-driven reporting, budget allocation visibility, and automated alerts to ensure compliance with federal and state funding requirements.", color: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-400" },
    { icon: Users, title: "Citizen Service Delivery Programs", description: "Coordinate citizen-facing digital service projects across departments with capacity planning, workload dashboards, and real-time progress tracking.", color: "text-cyan-600 bg-cyan-100 dark:bg-cyan-900/40 dark:text-cyan-400" },
  ],
  featuresBadge: "The Solution",
  featuresTitle: "One Platform for Your Entire Agency",
  featuresSubtitle: "FridayReport.AI brings AI-powered portfolio management to government, giving you the visibility and accountability your agency needs.",
  features: [
    { icon: Layers, title: "Portfolio Oversight for Government Programs", description: "See every initiative across your agency in one view — from IT modernization to infrastructure programs to grant-funded projects — with real-time status and budget tracking.", image: networkImage },
    { icon: AlertTriangle, title: "AI-Powered Risk Detection for Public Projects", description: "Our AI continuously monitors your project portfolio for schedule risks, budget overruns, and resource conflicts — alerting you before small issues become costly problems for taxpayers.", image: auditImage },
    { icon: FileCheck, title: "Audit-Ready Compliance Tracking", description: "Track regulatory milestones, audit preparation tasks, and compliance requirements alongside your regular projects. Maintain full audit trails for every change and decision.", image: heroImage },
  ],
  useCasesBadge: "Use Cases",
  useCasesTitle: "Built for the Way Government Delivers Projects",
  useCasesSubtitle: "Whether you are modernizing IT, managing infrastructure, or delivering citizen services — FridayReport.AI adapts to your workflow.",
  useCases: [
    { title: "IT Modernization (Cloud Migration)", description: "Plan multi-phase cloud migrations with task dependencies, go-live checklists, and automated status reporting to agency leadership and oversight committees.", icon: Globe },
    { title: "Infrastructure Programs", description: "Track construction timelines, vendor deliverables, and procurement milestones across multiple public infrastructure projects simultaneously.", icon: Building2 },
    { title: "Grant-Funded Initiatives", description: "Manage federal and state grant programs with milestone-driven tracking, budget allocation oversight, and compliance reporting for funding agencies.", icon: Shield },
    { title: "Digital Citizen Services", description: "Coordinate digital transformation initiatives across departments with resource planning, outcome tracking, and executive dashboards for public accountability.", icon: TrendingUp },
  ],
  stats: [
    { value: "60%", label: "Faster Status Reporting", description: "AI generates weekly reports automatically" },
    { value: "100%", label: "Portfolio Visibility", description: "Real-time health across all initiatives" },
    { value: "3x", label: "Faster Risk Detection", description: "AI spots issues before they escalate" },
    { value: "0", label: "Missed Deadlines", description: "Proactive alerts keep projects on track" },
  ],
  comparisonSubtitle: "See why government PMOs choose FridayReport.AI over generic project management tools.",
  ctaTitle: "Ready to Modernize Your Government PMO?",
  ctaSubtitle: "Join government organizations that have already streamlined their project management with AI-powered tools designed for the unique demands of the public sector.",
  ctaItems: [
    { icon: Zap, text: "Set up in minutes, not months" },
    { icon: Shield, text: "Enterprise-grade security" },
    { icon: Clock, text: "Free forever plan — no strings attached" },
    { icon: Target, text: "Import existing projects from MS Project, Planner, and more" },
  ],
  signupSubtitle: "Get your government PMO up and running in minutes",
  emailPlaceholder: "you@agency.gov",
  footerLabel: "Government Project Management",
  images: { hero: heroImage, clientLogo3, clientLogo4 },
};

export default function GovernmentLandingPage() {
  return <IndustryLandingPage config={config} />;
}
