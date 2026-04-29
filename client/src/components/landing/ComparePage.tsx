import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, Link } from "wouter";
import {
  Menu,
  X,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  Loader2,
  CheckCircle,
  Building2,
  Mail,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { HoneypotField } from "@/components/HoneypotField";
import { IndustrySolutionsMenu, IndustrySolutionsMobileLinks } from "@/components/IndustrySolutionsMenu";
import { LandingFooter } from "@/components/layout/LandingFooter";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";
import fridayLogo from "@/assets/logo-icon.png";
import { SiOracle } from "react-icons/si";
import msProjectLogo from "@/assets/msproject-logo.png";
import type { CompareConfig, CompareStatus } from "@/data/landing/compareConfigs";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

function AnimatedSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StatusCell({ status, note }: { status: CompareStatus; note?: string }) {
  const icon =
    status === "yes" ? (
      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    ) : status === "partial" ? (
      <AlertTriangle className="h-5 w-5 text-amber-500" />
    ) : (
      <XCircle className="h-5 w-5 text-red-400/60" />
    );

  if (!note) {
    return <div className="flex items-center justify-center">{icon}</div>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center cursor-help">{icon}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-xs leading-relaxed">{note}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function CompetitorLogo({ slug, bg, text }: { slug: string; bg: string; text: string }) {
  if (slug === "primavera-p6") {
    return (
      <div className={cn("h-12 w-12 md:h-14 md:w-14 rounded-xl flex items-center justify-center shadow-md", bg, text)}>
        <SiOracle className="h-6 w-6 md:h-7 md:w-7" />
      </div>
    );
  }
  if (slug === "ms-project") {
    return (
      <img
        src={msProjectLogo}
        alt="Microsoft Project"
        className="h-12 w-12 md:h-14 md:w-14 rounded-xl object-contain shadow-md bg-white p-1"
      />
    );
  }
  return (
    <div className={cn("h-12 w-12 md:h-14 md:w-14 rounded-xl flex items-center justify-center font-bold shadow-md", bg, text)}>
      ?
    </div>
  );
}

export default function ComparePage({ config }: { config: CompareConfig }) {
  const [currentLocation, setLocation] = useLocation();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [honeypotData, setHoneypotData] = useState<{ honeypot1: string; honeypot2: string; formLoadTime: number } | null>(null);

  const handleHoneypotChange = useCallback(
    (data: { honeypot1: string; honeypot2: string; formLoadTime: number }) => {
      setHoneypotData(data);
    },
    [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (!termsAccepted) return;

    const honeypotPayload = honeypotData
      ? {
          honeypot1: honeypotData.honeypot1,
          honeypot2: honeypotData.honeypot2,
          formLoadTime: honeypotData.formLoadTime,
        }
      : {};

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/passwordless/request", {
        email: email.trim(),
        termsAccepted,
        signupSource: `compare-${config.slug}`,
        ...honeypotPayload,
      });
      const data = await response.json();

      if (data.success) {
        setEmailSent(true);
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to send sign-in link",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send sign-in link",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToSignUp = () => {
    document.getElementById(`compare-${config.slug}-signup`)?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const prevTitle = document.title;
    document.title = config.seo.title;

    function upsertMeta(attr: string, key: string, content: string) {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (el) {
        el.setAttribute("content", content);
      } else {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        el.setAttribute("content", content);
        document.head.appendChild(el);
      }
    }

    upsertMeta("name", "description", config.seo.description);
    upsertMeta("property", "og:title", config.seo.ogTitle);
    upsertMeta("property", "og:description", config.seo.ogDescription);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", window.location.href);

    return () => {
      document.title = prevTitle;
    };
  }, [config.seo]);

  const totalFeatures = config.comparison.categories.reduce(
    (sum, cat) => sum + cat.features.length,
    0,
  );
  const fridayYes = config.comparison.categories.reduce(
    (sum, cat) => sum + cat.features.filter((f) => f.friday === "yes").length,
    0,
  );
  const competitorYes = config.comparison.categories.reduce(
    (sum, cat) => sum + cat.features.filter((f) => f.competitor === "yes").length,
    0,
  );

  return (
    <div className="min-h-screen bg-background" data-testid={`compare-page-${config.slug}`}>
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between gap-4 flex-wrap px-6 py-4 md:px-12 lg:px-20 max-w-[1400px] mx-auto">
          <a href="https://fridayreport.ai" target="_blank" rel="noopener noreferrer">
            <img
              src={logoBlack}
              alt="FridayReport.AI"
              className="h-8 object-contain dark:invert"
            />
          </a>
          <div className="hidden sm:flex items-center gap-3">
            <IndustrySolutionsMenu currentPath={currentLocation} />
            <Button
              variant="ghost"
              className="text-sm font-medium"
              onClick={() => setLocation("/capital-projects")}
              data-testid="header-link-capital-projects"
            >
              Capital Projects
            </Button>
            <Button
              variant="ghost"
              onClick={() => setLocation(`/auth?source=compare-${config.slug}`)}
            >
              Log in
            </Button>
            <Button
              onClick={scrollToSignUp}
              className="bg-[#F37021] hover:bg-[#e0621a] text-white"
              data-testid="header-cta-get-started"
            >
              Get Started Free
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="sm:hidden border-b border-border bg-background px-6 py-4 flex flex-col gap-3 sticky top-[65px] z-40">
          <IndustrySolutionsMobileLinks onNavigate={() => setMobileMenuOpen(false)} />
          <div className="border-t border-border pt-3 flex flex-col gap-3">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setLocation("/capital-projects");
                setMobileMenuOpen(false);
              }}
            >
              Capital Projects
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setLocation(`/auth?source=compare-${config.slug}`);
                setMobileMenuOpen(false);
              }}
            >
              Log in
            </Button>
            <Button
              className="w-full bg-[#F37021] hover:bg-[#e0621a] text-white"
              onClick={() => {
                scrollToSignUp();
                setMobileMenuOpen(false);
              }}
            >
              Get Started Free
            </Button>
          </div>
        </div>
      )}

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-yellow-50 via-amber-50 to-background dark:from-yellow-950/30 dark:via-amber-950/20 dark:to-background">
          <div className="relative px-6 md:px-12 lg:px-20 py-16 lg:py-24 max-w-[1400px] mx-auto">
            <AnimatedSection>
              <motion.div variants={fadeUp} className="max-w-3xl mx-auto text-center">
                <Badge className="mb-6 border-0 text-sm px-4 py-1.5 bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/50 dark:text-yellow-300">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  {config.hero.badge}
                </Badge>
                <h1
                  className="text-4xl md:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-foreground leading-[1.1]"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-compare-title"
                >
                  {config.hero.title}{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 to-amber-600 dark:from-yellow-400 dark:to-amber-400">
                    {config.hero.titleHighlight}
                  </span>
                </h1>
                <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                  {config.hero.subtitle}
                </p>
              </motion.div>

              <motion.div
                variants={fadeUp}
                className="mt-12 flex flex-col md:flex-row items-stretch justify-center gap-4 md:gap-6 max-w-3xl mx-auto"
              >
                <Card className="flex-1 border-2 border-blue-300 dark:border-blue-700 shadow-lg bg-blue-50/50 dark:bg-blue-950/30">
                  <CardContent className="p-6 flex items-center gap-4">
                    <img
                      src={fridayLogo}
                      alt="FridayReport.AI"
                      className="h-12 w-12 md:h-14 md:w-14 rounded-xl object-contain shadow-md"
                    />
                    <div>
                      <div className="text-xs text-blue-700 dark:text-blue-300 font-semibold uppercase tracking-wider">
                        FridayReport.AI
                      </div>
                      <div className="text-base font-bold text-foreground">
                        Project Controls + EVM + Field
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="flex items-center justify-center">
                  <span className="text-2xl font-bold text-muted-foreground">vs</span>
                </div>
                <Card className="flex-1 border-2 border-border shadow-lg">
                  <CardContent className="p-6 flex items-center gap-4">
                    <CompetitorLogo
                      slug={config.slug}
                      bg={config.competitor.logoBg}
                      text={config.competitor.logoText}
                    />
                    <div>
                      <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                        {config.competitor.shortName}
                      </div>
                      <div className="text-base font-bold text-foreground">
                        {config.competitor.tagline}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.ul variants={fadeUp} className="mt-10 max-w-3xl mx-auto space-y-3">
                {config.hero.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3"
                    data-testid={`hero-bullet-${i}`}
                  >
                    <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-base text-muted-foreground">{b}</span>
                  </li>
                ))}
              </motion.ul>

              <motion.div
                variants={fadeUp}
                className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <Button
                  size="lg"
                  className="bg-[#F37021] hover:bg-[#e0621a] text-white text-base min-h-12 px-8"
                  onClick={scrollToSignUp}
                  data-testid="hero-cta-start-free"
                >
                  Start Free Today
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="text-base min-h-12 px-8"
                  onClick={() => {
                    document.getElementById("comparison-table")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  data-testid="hero-cta-see-comparison"
                >
                  See full comparison
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        {/* Summary Stats */}
        <section className="px-6 md:px-12 lg:px-20 py-16 max-w-[1400px] mx-auto">
          <AnimatedSection className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {config.summaryStats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div key={i} variants={fadeUp}>
                  <Card className="h-full border-border hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-4 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="text-2xl font-bold text-foreground" data-testid={`stat-value-${i}`}>
                        {stat.value}
                      </div>
                      <div className="text-sm font-semibold text-foreground mt-0.5">
                        {stat.label}
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                        {stat.description}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatedSection>
        </section>

        {/* Advantages */}
        <section className="bg-muted/30 border-y border-border">
          <div className="px-6 md:px-12 lg:px-20 py-20 max-w-[1400px] mx-auto">
            <AnimatedSection className="text-center mb-12">
              <motion.div variants={fadeUp}>
                <Badge variant="outline" className="mb-4 text-sm">
                  {config.advantages.badge}
                </Badge>
                <h2
                  className="text-3xl md:text-4xl font-bold text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {config.advantages.title}
                </h2>
                <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto">
                  {config.advantages.subtitle}
                </p>
              </motion.div>
            </AnimatedSection>
            <AnimatedSection className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {config.advantages.items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.div key={i} variants={fadeUp}>
                    <Card className="h-full border-border bg-background hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-4 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400">
                          <Icon className="h-5 w-5" />
                        </div>
                        <h3 className="text-base font-bold text-foreground mb-2">{item.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {item.description}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatedSection>
          </div>
        </section>

        {/* Comparison Table */}
        <section
          id="comparison-table"
          className="px-6 md:px-12 lg:px-20 py-20 max-w-[1400px] mx-auto scroll-mt-24"
        >
          <AnimatedSection className="text-center mb-12">
            <motion.div variants={fadeUp}>
              <Badge variant="outline" className="mb-4 text-sm">
                {config.comparison.badge}
              </Badge>
              <h2
                className="text-3xl md:text-4xl font-bold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {config.comparison.title}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto">
                {config.comparison.subtitle}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-muted-foreground">Yes</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-muted-foreground">Partial / Add-on</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-400/60" />
                  <span className="text-muted-foreground">No</span>
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-3 rounded-full bg-muted/60 border border-border px-4 py-1.5 text-xs text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">FridayReport.AI:</span>{" "}
                  {fridayYes}/{totalFeatures}
                </span>
                <span className="opacity-50">·</span>
                <span>
                  <span className="font-semibold text-foreground">{config.competitor.shortName}:</span>{" "}
                  {competitorYes}/{totalFeatures}
                </span>
              </div>
            </motion.div>
          </AnimatedSection>

          <div className="space-y-8">
            {config.comparison.categories.map((cat, ci) => {
              const Icon = cat.icon;
              return (
                <motion.div
                  key={cat.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.4 }}
                  data-testid={`compare-category-${ci}`}
                >
                  <Card className="border-border overflow-hidden">
                    <CardHeader className="bg-muted/40 border-b border-border">
                      <CardTitle className="flex items-center gap-3 text-lg">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400">
                          <Icon className="h-5 w-5" />
                        </div>
                        {cat.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-background">
                              <th className="text-left px-4 py-3 font-semibold text-foreground min-w-[260px]">
                                Capability
                              </th>
                              <th className="text-center px-4 py-3 font-semibold text-foreground min-w-[140px] bg-blue-50/50 dark:bg-blue-950/20">
                                <div className="flex flex-col items-center gap-1">
                                  <img
                                    src={fridayLogo}
                                    alt="FridayReport.AI"
                                    className="h-7 w-7 rounded-md object-contain"
                                  />
                                  <span className="text-xs">FridayReport.AI</span>
                                </div>
                              </th>
                              <th className="text-center px-4 py-3 font-semibold text-foreground min-w-[140px]">
                                <div className="flex flex-col items-center gap-1">
                                  <CompetitorLogo
                                    slug={config.slug}
                                    bg={config.competitor.logoBg}
                                    text={config.competitor.logoText}
                                  />
                                  <span className="text-xs mt-1">{config.competitor.shortName}</span>
                                </div>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {cat.features.map((feat, fi) => (
                              <tr
                                key={feat.name}
                                className={cn(
                                  "border-b border-border last:border-0 transition-colors",
                                  fi % 2 === 0 ? "bg-background" : "bg-muted/20",
                                )}
                                data-testid={`compare-row-${ci}-${fi}`}
                              >
                                <td className="px-4 py-3 text-foreground">{feat.name}</td>
                                <td className="px-4 py-3 bg-blue-50/30 dark:bg-blue-950/10">
                                  <StatusCell status={feat.friday} note={feat.fridayNote} />
                                </td>
                                <td className="px-4 py-3">
                                  <StatusCell
                                    status={feat.competitor}
                                    note={feat.competitorNote}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* FAQ */}
        {config.faq && config.faq.length > 0 && (
          <section className="bg-muted/30 border-y border-border">
            <div className="px-6 md:px-12 lg:px-20 py-20 max-w-[1100px] mx-auto">
              <AnimatedSection className="text-center mb-10">
                <motion.div variants={fadeUp}>
                  <Badge variant="outline" className="mb-4 text-sm">
                    Common Questions
                  </Badge>
                  <h2
                    className="text-3xl md:text-4xl font-bold text-foreground"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Frequently Asked
                  </h2>
                </motion.div>
              </AnimatedSection>
              <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {config.faq.map((item, i) => (
                  <motion.div key={i} variants={fadeUp}>
                    <Card className="h-full border-border bg-background">
                      <CardContent className="p-6">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400">
                            <HelpCircle className="h-5 w-5" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-base font-bold text-foreground mb-2">
                              {item.question}
                            </h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {item.answer}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatedSection>
            </div>
          </section>
        )}

        {/* CTA + signup */}
        <section className="bg-gradient-to-br from-yellow-50 via-amber-50 to-background dark:from-yellow-950/20 dark:via-amber-950/10 dark:to-background border-t border-border">
          <div className="px-6 md:px-12 lg:px-20 py-20 lg:py-24 max-w-[1400px] mx-auto">
            <AnimatedSection className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
              <motion.div variants={fadeUp} className="flex-1 max-w-xl">
                <h2
                  className="text-3xl md:text-4xl font-bold text-foreground mb-6"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {config.cta.title}
                </h2>
                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                  {config.cta.subtitle}
                </p>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-foreground">
                      Built for capital program owners, controls leads, and EPC firms
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-foreground">
                      AI variance detection on CPI / SPI, change-orders, and RFI aging
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <span className="text-foreground">
                      Free forever plan — no credit card required
                    </span>
                  </li>
                </ul>
              </motion.div>

              <motion.div
                variants={fadeUp}
                className="flex-1 max-w-md w-full"
                id={`compare-${config.slug}-signup`}
              >
                <Card className="shadow-2xl border-border">
                  {emailSent ? (
                    <>
                      <CardHeader className="text-center pb-4">
                        <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center mb-4">
                          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                        </div>
                        <CardTitle className="text-2xl">Check Your Email</CardTitle>
                        <CardDescription>
                          We sent a link to <strong className="text-foreground">{email}</strong>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                          Click the link in your email to continue. The link expires in 15 minutes.
                        </p>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setEmailSent(false)}
                        >
                          Try a different email
                        </Button>
                      </CardContent>
                    </>
                  ) : (
                    <>
                      <CardHeader className="text-center pb-4">
                        <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400">
                          <Sparkles className="h-7 w-7" />
                        </div>
                        <CardTitle className="text-2xl font-bold">Start Free Today</CardTitle>
                        <CardDescription>
                          Replace one-off comparison spreadsheets with a live capital program platform.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <form onSubmit={handleSubmit} className="space-y-4">
                          <HoneypotField onDataChange={handleHoneypotChange} />
                          <div className="space-y-2">
                            <Label htmlFor={`compare-${config.slug}-email`} className="font-medium">
                              Work Email
                            </Label>
                            <Input
                              id={`compare-${config.slug}-email`}
                              type="email"
                              placeholder="you@your-firm.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                              data-testid="input-compare-email"
                            />
                          </div>
                          <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border border-border">
                            <Checkbox
                              id={`compare-${config.slug}-terms`}
                              checked={termsAccepted}
                              onCheckedChange={(c) => setTermsAccepted(c === true)}
                              required
                              data-testid="checkbox-compare-terms"
                            />
                            <Label
                              htmlFor={`compare-${config.slug}-terms`}
                              className="text-xs text-muted-foreground leading-relaxed cursor-pointer"
                            >
                              I agree to the{" "}
                              <Link href="/terms" className="text-primary underline">
                                Terms of Service
                              </Link>{" "}
                              and{" "}
                              <Link href="/privacy" className="text-primary underline">
                                Privacy Statement
                              </Link>
                              .
                            </Label>
                          </div>
                          <Button
                            type="submit"
                            disabled={isLoading || !termsAccepted || !email.trim()}
                            className="w-full bg-[#F37021] hover:bg-[#e0621a] text-white"
                            data-testid="button-compare-signup"
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Sending magic link…
                              </>
                            ) : (
                              <>
                                <Mail className="h-4 w-4 mr-2" />
                                Send sign-in link
                              </>
                            )}
                          </Button>
                        </form>
                      </CardContent>
                    </>
                  )}
                </Card>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
