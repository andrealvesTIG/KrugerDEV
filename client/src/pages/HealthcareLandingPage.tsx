import { Shield, Building2, TrendingUp, Layers, AlertTriangle, FileCheck, Activity, Users, Heart, Zap, Clock, Target } from "lucide-react";
import IndustryLandingPage from "@/components/landing/IndustryLandingPage";
import type { IndustryConfig } from "@/components/landing/types";
import heroImage from "@/assets/healthcare/hero-hospital-ops.png";
import networkImage from "@/assets/healthcare/healthcare-network.png";
import hospitalImage from "@/assets/healthcare/hospital-building.png";
import complianceImage from "@/assets/healthcare/compliance-dashboard.png";
import clientLogo3 from "@assets/client-logo-3.png";
import clientLogo4 from "@assets/client-logo-4.png";

const config: IndustryConfig = {
  slug: "healthcare",
  routePath: "/healthcare",
  seo: {
    title: "Healthcare Project Management Software | FridayReport.AI",
    description: "AI-powered project portfolio management built for hospitals and health systems. Track capital projects, IT rollouts, compliance programs, and more. Free forever.",
    ogTitle: "Healthcare Project Management Software | FridayReport.AI",
    ogDescription: "AI-powered PMO software for hospitals and health systems. Free forever.",
  },
  colors: {
    primary: "teal",
    secondary: "blue",
    heroGradient: "bg-gradient-to-br from-teal-50 via-blue-50 to-background dark:from-teal-950/30 dark:via-blue-950/20 dark:to-background",
    patternFillColor: "009688",
    darkSectionGradient: "bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900",
    ctaSectionGradient: "bg-gradient-to-br from-teal-50 via-blue-50 to-background dark:from-teal-950/20 dark:via-blue-950/10 dark:to-background",
    badgeClasses: "bg-teal-100 text-teal-800 hover:bg-teal-100 dark:bg-teal-900/50 dark:text-teal-300",
    checkIconClasses: "text-teal-600 dark:text-teal-400",
    heroGlowClasses: "bg-gradient-to-r from-teal-500/20 to-blue-500/20",
    featureIconBg: "bg-teal-100 dark:bg-teal-900/40",
    featureIconText: "text-teal-600 dark:text-teal-400",
    useCaseIconBg: "bg-teal-500/20",
    useCaseIconText: "text-teal-400",
    useCaseBadgeBg: "bg-teal-500/20",
    useCaseBadgeText: "text-teal-300",
    useCaseBadgeBorder: "border-teal-500/30",
    ctaIconBg: "bg-teal-100 dark:bg-teal-900/40",
    ctaIconText: "text-teal-600 dark:text-teal-400",
    signupIconBg: "bg-teal-100 dark:bg-teal-900/40",
    signupIconText: "text-teal-600 dark:text-teal-400",
    statGradient: "from-teal-600 to-blue-600 dark:from-teal-400 dark:to-blue-400",
  },
  heroIcon: Heart,
  heroBadgeText: "Built for Health Systems",
  heroTitle: "Project Portfolio Management",
  heroTitleHighlight: "Built for Health Systems",
  heroSubtitle: "From capital projects and IT modernization to regulatory compliance — manage your entire healthcare PMO with AI-powered oversight that catches risks before they become crises.",
  heroChecklist: [
    "Track capital projects, IT rollouts, and compliance programs in one place",
    "AI-powered risk detection alerts you before issues escalate",
    "Executive dashboards your C-suite will actually use",
  ],
  heroImageAlt: "Healthcare project management dashboard",
  trustedByText: "Trusted by teams at leading healthcare organizations",
  trustedByOrgs: [
    { icon: Building2, label: "Leading Health Systems" },
    { icon: Heart, label: "Regional Hospitals" },
  ],
  painPointsBadge: "Healthcare PMO Challenges",
  painPointsTitle: "Your Healthcare PMO Deserves Better Tools",
  painPointsSubtitle: "Health systems manage complex multi-year programs under intense regulatory scrutiny. Generic project tools were not designed for the demands of healthcare delivery.",
  painPoints: [
    { icon: Shield, title: "Regulatory & Compliance Tracking", description: "Stay ahead of Joint Commission, CMS, and HIPAA audits with built-in compliance milestone tracking and automated alerts before deadlines slip.", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400" },
    { icon: Building2, title: "Capital Project Oversight", description: "Manage facility expansions, renovations, and equipment installations across multiple sites with full portfolio visibility and budget tracking.", color: "text-teal-600 bg-teal-100 dark:bg-teal-900/40 dark:text-teal-400" },
    { icon: Activity, title: "Clinical IT Rollouts", description: "Coordinate EHR migrations, telehealth expansions, and medical device integrations with real-time dependency mapping and risk detection.", color: "text-rose-600 bg-rose-100 dark:bg-rose-900/40 dark:text-rose-400" },
    { icon: Users, title: "Cross-Department Resource Allocation", description: "Balance clinical, IT, and administrative staff across competing initiatives with capacity planning and workload dashboards.", color: "text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400" },
  ],
  featuresBadge: "The Solution",
  featuresTitle: "One Platform for Your Entire Health System",
  featuresSubtitle: "FridayReport.AI brings AI-powered portfolio management to healthcare, giving you the visibility and control your leadership team needs.",
  features: [
    { icon: Layers, title: "Portfolio Oversight for Health Systems", description: "See every initiative across your health system in one view — from capital projects to IT modernization to quality improvement programs.", image: networkImage },
    { icon: AlertTriangle, title: "AI-Powered Risk Detection", description: "Our AI continuously monitors your project portfolio for schedule risks, budget overruns, and resource conflicts — alerting you before small issues become costly problems.", image: complianceImage },
    { icon: FileCheck, title: "Compliance-Ready Project Tracking", description: "Track regulatory milestones, audit preparation tasks, and accreditation requirements alongside your regular projects. Never miss a compliance deadline again.", image: hospitalImage },
  ],
  useCasesBadge: "Use Cases",
  useCasesTitle: "Built for the Way Healthcare Delivers Projects",
  useCasesSubtitle: "Whether you are implementing EHR systems, expanding facilities, or managing compliance — FridayReport.AI adapts to your workflow.",
  useCases: [
    { title: "EHR Implementations", description: "Plan multi-phase EHR rollouts with task dependencies, go-live checklists, and automated status reporting to leadership.", icon: Activity },
    { title: "Facility Expansions", description: "Track construction timelines, vendor deliverables, and equipment procurement across multiple building projects simultaneously.", icon: Building2 },
    { title: "Regulatory Compliance Programs", description: "Manage Joint Commission preparation, HIPAA security assessments, and CMS Conditions of Participation with milestone-driven tracking.", icon: Shield },
    { title: "Clinical Workflow Optimization", description: "Coordinate process improvement initiatives across departments with resource planning, outcome tracking, and executive dashboards.", icon: TrendingUp },
  ],
  stats: [
    { value: "60%", label: "Faster Status Reporting", description: "AI generates weekly reports automatically" },
    { value: "100%", label: "Portfolio Visibility", description: "Real-time health across all initiatives" },
    { value: "3x", label: "Faster Risk Detection", description: "AI spots issues before they escalate" },
    { value: "0", label: "Missed Deadlines", description: "Proactive alerts keep projects on track" },
  ],
  comparisonSubtitle: "See why healthcare PMOs choose FridayReport.AI over generic project management tools.",
  ctaTitle: "Ready to Modernize Your Healthcare PMO?",
  ctaSubtitle: "Join healthcare organizations that have already streamlined their project management with AI-powered tools designed for the unique demands of health systems.",
  ctaItems: [
    { icon: Zap, text: "Set up in minutes, not months" },
    { icon: Shield, text: "Enterprise-grade security" },
    { icon: Clock, text: "Free forever plan — no strings attached" },
    { icon: Target, text: "Import existing projects from MS Project, Planner, and more" },
  ],
  signupSubtitle: "Get your healthcare PMO up and running in minutes",
  emailPlaceholder: "you@hospital.org",
  footerLabel: "Healthcare Project Management",
  images: { hero: heroImage, clientLogo3, clientLogo4 },
};

export default function HealthcareLandingPage() {
  return <IndustryLandingPage config={config} />;
}
