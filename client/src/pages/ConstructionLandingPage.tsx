import { Building2, HardHat, MapPin, Users, BarChart3, Shield, Layers, AlertTriangle, FileCheck, Hammer, TrendingUp, Zap, Clock, Target } from "lucide-react";
import IndustryLandingPage from "@/components/landing/IndustryLandingPage";
import type { IndustryConfig } from "@/components/landing/types";
import heroImage from "@/assets/construction/hero-construction-site.png";
import networkImage from "@/assets/construction/construction-network.png";
import dashboardImage from "@/assets/construction/project-dashboard.png";
import clientLogo3 from "@assets/client-logo-3.png";
import clientLogo4 from "@assets/client-logo-4.png";

const config: IndustryConfig = {
  slug: "construction",
  routePath: "/construction",
  seo: {
    title: "Construction Project Management Software | FridayReport.AI",
    description: "AI-powered project portfolio management built for construction and engineering firms. Track capital programs, contractor timelines, permits, and more. Free forever.",
    ogTitle: "Construction Project Management Software | FridayReport.AI",
    ogDescription: "AI-powered PMO software for construction and engineering firms. Free forever.",
  },
  colors: {
    primary: "yellow",
    secondary: "amber",
    heroGradient: "bg-gradient-to-br from-yellow-50 via-amber-50 to-background dark:from-yellow-950/30 dark:via-amber-950/20 dark:to-background",
    patternFillColor: "D97706",
    darkSectionGradient: "bg-gradient-to-br from-slate-900 via-amber-950 to-slate-900",
    ctaSectionGradient: "bg-gradient-to-br from-yellow-50 via-amber-50 to-background dark:from-yellow-950/20 dark:via-amber-950/10 dark:to-background",
    badgeClasses: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/50 dark:text-yellow-300",
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
    statGradient: "from-yellow-600 to-amber-600 dark:from-yellow-400 dark:to-amber-400",
  },
  heroIcon: HardHat,
  heroBadgeText: "Built for Construction & Engineering",
  heroTitle: "Project Portfolio Management",
  heroTitleHighlight: "Built for Construction",
  heroSubtitle: "From capital programs and multi-site builds to permitting and contractor management — manage your entire construction PMO with AI-powered oversight that catches risks before they become costly change orders.",
  heroChecklist: [
    "Track capital programs, contractor timelines, and permits in one place",
    "AI-powered risk detection alerts you before issues escalate",
    "Executive dashboards your leadership team will actually use",
  ],
  heroImageAlt: "Construction project management dashboard",
  trustedByText: "Trusted by teams at leading construction & engineering organizations",
  trustedByOrgs: [
    { icon: Building2, label: "General Contractors" },
    { icon: HardHat, label: "Engineering Firms" },
  ],
  painPointsBadge: "Construction PMO Challenges",
  painPointsTitle: "Your Construction PMO Deserves Better Tools",
  painPointsSubtitle: "Construction firms manage dozens of concurrent job sites and hundreds of contractors. Generic project tools were not designed for the complexity of capital program delivery.",
  painPoints: [
    { icon: MapPin, title: "Multi-Site Project Coordination", description: "Manage dozens of concurrent job sites with real-time progress tracking, milestone dependencies, and centralized reporting across your entire capital program.", color: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-400" },
    { icon: Users, title: "Contractor & Vendor Management", description: "Track subcontractor deliverables, vendor timelines, and procurement schedules across all active projects with automated alerts when deadlines are at risk.", color: "text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400" },
    { icon: BarChart3, title: "Budget Overrun Visibility", description: "Get instant visibility into budget vs. actuals across your portfolio. AI-powered forecasting detects cost overruns early so you can take corrective action before it is too late.", color: "text-orange-600 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-400" },
    { icon: Shield, title: "Permitting & Regulatory Tracking", description: "Never miss a permit deadline or inspection milestone. Track building permits, environmental approvals, and safety compliance across all job sites in one place.", color: "text-yellow-700 bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-300" },
  ],
  featuresBadge: "The Solution",
  featuresTitle: "One Platform for Your Entire Construction Portfolio",
  featuresSubtitle: "FridayReport.AI brings AI-powered portfolio management to construction, giving you the visibility and control your leadership team needs across every job site.",
  features: [
    { icon: Layers, title: "Portfolio Oversight for Capital Programs", description: "See every project across your construction portfolio in one view — from commercial builds and infrastructure projects to renovations and facility expansions.", image: networkImage },
    { icon: AlertTriangle, title: "AI-Powered Risk Detection for Construction Timelines", description: "Our AI continuously monitors your project portfolio for schedule delays, budget overruns, and resource conflicts — alerting you before small issues become costly change orders.", image: dashboardImage },
    { icon: FileCheck, title: "Permit & Compliance Tracking", description: "Track building permits, inspection milestones, environmental approvals, and safety requirements alongside your regular project tasks. Stay ahead of every regulatory requirement.", image: heroImage },
  ],
  useCasesBadge: "Use Cases",
  useCasesTitle: "Built for the Way Construction Delivers Projects",
  useCasesSubtitle: "Whether you are building a commercial complex, expanding a campus, or managing infrastructure — FridayReport.AI adapts to your workflow.",
  useCases: [
    { title: "Commercial Building Programs", description: "Plan and execute multi-phase commercial construction with task dependencies, subcontractor coordination, and automated status reporting to stakeholders.", icon: Building2 },
    { title: "Infrastructure Projects", description: "Manage road, bridge, utility, and public works projects with milestone tracking, permit management, and multi-agency coordination built in.", icon: MapPin },
    { title: "Renovation & Retrofit", description: "Coordinate renovation programs across occupied buildings with phased rollouts, tenant communication tracking, and budget management for each scope package.", icon: Hammer },
    { title: "Campus & Facility Expansions", description: "Oversee multi-building campus expansions with cross-project resource planning, shared milestone tracking, and executive dashboards for capital program oversight.", icon: TrendingUp },
  ],
  stats: [
    { value: "60%", label: "Faster Status Reporting", description: "AI generates weekly reports automatically" },
    { value: "100%", label: "Portfolio Visibility", description: "Real-time health across all job sites" },
    { value: "3x", label: "Faster Risk Detection", description: "AI spots issues before they escalate" },
    { value: "0", label: "Missed Deadlines", description: "Proactive alerts keep projects on track" },
  ],
  comparisonSubtitle: "See why construction PMOs choose FridayReport.AI over generic project management tools.",
  ctaTitle: "Ready to Modernize Your Construction PMO?",
  ctaSubtitle: "Join construction and engineering firms that have already streamlined their project management with AI-powered tools designed for the unique demands of capital program delivery.",
  ctaItems: [
    { icon: Zap, text: "Set up in minutes, not months" },
    { icon: Shield, text: "Enterprise-grade security" },
    { icon: Clock, text: "Free forever plan — no strings attached" },
    { icon: Target, text: "Import existing projects from MS Project, Planner, and more" },
  ],
  signupSubtitle: "Get your construction PMO up and running in minutes",
  emailPlaceholder: "you@construction-firm.com",
  footerLabel: "Construction Project Management",
  images: { hero: heroImage, clientLogo3, clientLogo4 },
};

export default function ConstructionLandingPage() {
  return <IndustryLandingPage config={config} />;
}
