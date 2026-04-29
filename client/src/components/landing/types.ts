import type { LucideIcon } from "lucide-react";

export interface IndustryPainPoint {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
}

export interface IndustryFeature {
  icon: LucideIcon;
  title: string;
  description: string;
  image: string;
}

export interface IndustryUseCase {
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface IndustryStat {
  value: string;
  label: string;
  description: string;
}

export interface IndustryCtaItem {
  icon: LucideIcon;
  text: string;
}

export interface IndustryCapability {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface IndustryCapabilitySection {
  badge: string;
  title: string;
  subtitle: string;
  capabilities: IndustryCapability[];
  highlights?: string[];
}

export interface IndustryConfig {
  slug: string;
  routePath: string;

  seo: {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
  };

  colors: {
    primary: string;
    secondary: string;
    heroGradient: string;
    patternFillColor: string;
    darkSectionGradient: string;
    ctaSectionGradient: string;
    badgeClasses: string;
    checkIconClasses: string;
    heroGlowClasses: string;
    featureIconBg: string;
    featureIconText: string;
    useCaseIconBg: string;
    useCaseIconText: string;
    useCaseBadgeBg: string;
    useCaseBadgeText: string;
    useCaseBadgeBorder: string;
    ctaIconBg: string;
    ctaIconText: string;
    signupIconBg: string;
    signupIconText: string;
    statGradient: string;
  };

  heroIcon: LucideIcon;
  heroBadgeText: string;
  heroTitle: string;
  heroTitleHighlight: string;
  heroSubtitle: string;
  heroChecklist: string[];
  heroImageAlt: string;

  trustedByText: string;
  trustedByOrgs: { icon: LucideIcon; label: string }[];

  painPointsBadge: string;
  painPointsTitle: string;
  painPointsSubtitle: string;
  painPoints: IndustryPainPoint[];

  featuresBadge: string;
  featuresTitle: string;
  featuresSubtitle: string;
  features: IndustryFeature[];

  useCasesBadge: string;
  useCasesTitle: string;
  useCasesSubtitle: string;
  useCases: IndustryUseCase[];

  stats: IndustryStat[];

  comparisonSubtitle: string;

  ctaTitle: string;
  ctaSubtitle: string;
  ctaItems: IndustryCtaItem[];

  projectControls?: IndustryCapabilitySection;
  fieldExecution?: IndustryCapabilitySection;

  signupSubtitle: string;
  emailPlaceholder: string;
  footerLabel: string;

  images: {
    hero: string;
    clientLogo3: string;
    clientLogo4: string;
  };
}
