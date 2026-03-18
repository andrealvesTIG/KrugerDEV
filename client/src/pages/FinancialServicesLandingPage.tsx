import { Shield, Building2, TrendingUp, Layers, AlertTriangle, FileCheck, Landmark, DollarSign, Zap, Clock, Target } from "lucide-react";
import { Scale } from "lucide-react";
import IndustryLandingPage from "@/components/landing/IndustryLandingPage";
import type { IndustryConfig } from "@/components/landing/types";
import heroImage from "@/assets/financial-services/hero-financial-ops.png";
import networkImage from "@/assets/financial-services/financial-network.png";
import complianceImage from "@/assets/financial-services/compliance-dashboard.png";
import clientLogo3 from "@assets/client-logo-3.png";
import clientLogo4 from "@assets/client-logo-4.png";

const config: IndustryConfig = {
  slug: "financial-services",
  routePath: "/financial-services",
  seo: {
    title: "Financial Services Project Management Software | FridayReport.AI",
    description: "AI-powered project portfolio management built for banks and financial institutions. Track core banking migrations, regulatory compliance, digital transformation, and more. Free forever.",
    ogTitle: "Financial Services Project Management Software | FridayReport.AI",
    ogDescription: "AI-powered PMO software for banks and financial institutions. Free forever.",
  },
  colors: {
    primary: "indigo",
    secondary: "blue",
    heroGradient: "bg-gradient-to-br from-indigo-50 via-blue-50 to-background dark:from-indigo-950/30 dark:via-blue-950/20 dark:to-background",
    patternFillColor: "4338ca",
    darkSectionGradient: "bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900",
    ctaSectionGradient: "bg-gradient-to-br from-indigo-50 via-blue-50 to-background dark:from-indigo-950/20 dark:via-blue-950/10 dark:to-background",
    badgeClasses: "bg-indigo-100 text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-900/50 dark:text-indigo-300",
    checkIconClasses: "text-indigo-600 dark:text-indigo-400",
    heroGlowClasses: "bg-gradient-to-r from-indigo-500/20 to-blue-500/20",
    featureIconBg: "bg-indigo-100 dark:bg-indigo-900/40",
    featureIconText: "text-indigo-600 dark:text-indigo-400",
    useCaseIconBg: "bg-indigo-500/20",
    useCaseIconText: "text-indigo-400",
    useCaseBadgeBg: "bg-indigo-500/20",
    useCaseBadgeText: "text-indigo-300",
    useCaseBadgeBorder: "border-indigo-500/30",
    ctaIconBg: "bg-indigo-100 dark:bg-indigo-900/40",
    ctaIconText: "text-indigo-600 dark:text-indigo-400",
    signupIconBg: "bg-indigo-100 dark:bg-indigo-900/40",
    signupIconText: "text-indigo-600 dark:text-indigo-400",
    statGradient: "from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400",
  },
  heroIcon: Landmark,
  heroBadgeText: "Built for Financial Services",
  heroTitle: "Project Portfolio Management",
  heroTitleHighlight: "Built for Financial Services",
  heroSubtitle: "From core banking migrations and regulatory compliance to digital transformation — manage your entire financial services PMO with AI-powered oversight that catches risks before they become audit findings.",
  heroChecklist: [
    "Track regulatory programs, banking migrations, and digital initiatives in one place",
    "AI-powered risk detection alerts you before issues escalate",
    "Executive dashboards your C-suite and regulators will trust",
  ],
  heroImageAlt: "Financial services project management dashboard",
  trustedByText: "Trusted by teams at leading financial institutions",
  trustedByOrgs: [
    { icon: Landmark, label: "Global Banks" },
    { icon: DollarSign, label: "Investment Firms" },
  ],
  painPointsBadge: "Financial Services PMO Challenges",
  painPointsTitle: "Your Financial Services PMO Deserves Better Tools",
  painPointsSubtitle: "Financial institutions manage hundreds of concurrent initiatives under intense regulatory scrutiny. Generic project tools were not designed for the complexity of banking operations.",
  painPoints: [
    { icon: Shield, title: "Regulatory Compliance (SOX, Basel III, Dodd-Frank)", description: "Stay ahead of regulatory audits with built-in compliance milestone tracking and automated alerts before deadlines slip. Map every initiative to SOX controls, Basel III requirements, and Dodd-Frank mandates.", color: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-400" },
    { icon: Building2, title: "Core Banking Migrations", description: "Manage complex multi-phase core banking platform migrations with full dependency mapping, vendor coordination, and real-time risk detection across workstreams.", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400" },
    { icon: TrendingUp, title: "Digital Transformation Programs", description: "Coordinate digital banking, fintech integration, and customer experience initiatives across business lines with portfolio-level visibility and executive dashboards.", color: "text-violet-600 bg-violet-100 dark:bg-violet-900/40 dark:text-violet-400" },
    { icon: Scale, title: "Risk & Audit Management", description: "Balance risk management, internal audit, and compliance programs across departments with capacity planning and workload dashboards that keep your teams aligned.", color: "text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400" },
  ],
  featuresBadge: "The Solution",
  featuresTitle: "One Platform for Your Entire Financial Institution",
  featuresSubtitle: "FridayReport.AI brings AI-powered portfolio management to financial services, giving you the visibility and control your leadership team and regulators demand.",
  features: [
    { icon: Layers, title: "Portfolio Oversight for Banking Initiatives", description: "See every initiative across your financial institution in one view — from core banking migrations to digital transformation to regulatory compliance programs.", image: networkImage },
    { icon: AlertTriangle, title: "AI-Powered Risk Detection for Financial Programs", description: "Our AI continuously monitors your project portfolio for schedule risks, budget overruns, and resource conflicts — alerting you before small issues become costly regulatory findings.", image: complianceImage },
    { icon: FileCheck, title: "Compliance-Ready Tracking", description: "Track regulatory milestones, audit preparation tasks, and compliance requirements alongside your regular projects. Map initiatives to SOX controls and Basel III requirements automatically.", image: heroImage },
  ],
  useCasesBadge: "Use Cases",
  useCasesTitle: "Built for the Way Financial Services Delivers Projects",
  useCasesSubtitle: "Whether you are modernizing core banking, managing compliance, or driving digital transformation — FridayReport.AI adapts to your workflow.",
  useCases: [
    { title: "Core Banking Modernization", description: "Plan multi-phase core platform migrations with task dependencies, go-live checklists, and automated status reporting to leadership and regulators.", icon: Building2 },
    { title: "Regulatory Compliance Programs", description: "Manage SOX attestation cycles, Basel III capital adequacy programs, and Dodd-Frank compliance with milestone-driven tracking and audit-ready documentation.", icon: Shield },
    { title: "Digital Transformation", description: "Coordinate mobile banking launches, API platform builds, and fintech partnerships across business lines with real-time portfolio visibility.", icon: TrendingUp },
    { title: "M&A Integration Projects", description: "Track merger integration workstreams across technology, operations, compliance, and HR with cross-functional resource planning and executive dashboards.", icon: Scale },
  ],
  stats: [
    { value: "60%", label: "Faster Status Reporting", description: "AI generates weekly reports automatically" },
    { value: "100%", label: "Portfolio Visibility", description: "Real-time health across all initiatives" },
    { value: "3x", label: "Faster Risk Detection", description: "AI spots issues before they escalate" },
    { value: "0", label: "Missed Deadlines", description: "Proactive alerts keep projects on track" },
  ],
  comparisonSubtitle: "See why financial services PMOs choose FridayReport.AI over generic project management tools.",
  ctaTitle: "Ready to Modernize Your Financial Services PMO?",
  ctaSubtitle: "Join financial institutions that have already streamlined their project management with AI-powered tools designed for the unique demands of banking and financial services.",
  ctaItems: [
    { icon: Zap, text: "Set up in minutes, not months" },
    { icon: Shield, text: "Enterprise-grade security" },
    { icon: Clock, text: "Free forever plan — no strings attached" },
    { icon: Target, text: "Import existing projects from MS Project, Planner, and more" },
  ],
  signupSubtitle: "Get your financial services PMO up and running in minutes",
  emailPlaceholder: "you@bank.com",
  footerLabel: "Financial Services Project Management",
  images: { hero: heroImage, clientLogo3, clientLogo4 },
};

export default function FinancialServicesLandingPage() {
  return <IndustryLandingPage config={config} />;
}
