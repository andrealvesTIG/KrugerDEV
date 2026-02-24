import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Check, Menu, X, Mail, Loader2, CheckCircle, ChevronRight, Shield, Building2, Users, BarChart3, Clock, Target, Landmark, Activity, FileCheck, Layers, ArrowRight, Zap, TrendingUp, AlertTriangle, DollarSign, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { HoneypotField } from "@/components/HoneypotField";
import { PublicFeatureComparison } from "@/components/PublicFeatureComparison";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";
import heroImage from "@/assets/financial-services/hero-financial-ops.png";
import networkImage from "@/assets/financial-services/financial-network.png";
import complianceImage from "@/assets/financial-services/compliance-dashboard.png";
import iconVault from "@/assets/financial-services/icon-vault-shield.png";
import clientLogo3 from "@assets/client-logo-3.png";
import clientLogo4 from "@assets/client-logo-4.png";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
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

const painPoints = [
  {
    icon: Shield,
    title: "Regulatory Compliance (SOX, Basel III, Dodd-Frank)",
    description: "Stay ahead of regulatory audits with built-in compliance milestone tracking and automated alerts before deadlines slip. Map every initiative to SOX controls, Basel III requirements, and Dodd-Frank mandates.",
    color: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-400",
  },
  {
    icon: Building2,
    title: "Core Banking Migrations",
    description: "Manage complex multi-phase core banking platform migrations with full dependency mapping, vendor coordination, and real-time risk detection across workstreams.",
    color: "text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400",
  },
  {
    icon: TrendingUp,
    title: "Digital Transformation Programs",
    description: "Coordinate digital banking, fintech integration, and customer experience initiatives across business lines with portfolio-level visibility and executive dashboards.",
    color: "text-violet-600 bg-violet-100 dark:bg-violet-900/40 dark:text-violet-400",
  },
  {
    icon: Scale,
    title: "Risk & Audit Management",
    description: "Balance risk management, internal audit, and compliance programs across departments with capacity planning and workload dashboards that keep your teams aligned.",
    color: "text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400",
  },
];

const features = [
  {
    icon: Layers,
    title: "Portfolio Oversight for Banking Initiatives",
    description: "See every initiative across your financial institution in one view — from core banking migrations to digital transformation to regulatory compliance programs.",
    image: networkImage,
  },
  {
    icon: AlertTriangle,
    title: "AI-Powered Risk Detection for Financial Programs",
    description: "Our AI continuously monitors your project portfolio for schedule risks, budget overruns, and resource conflicts — alerting you before small issues become costly regulatory findings.",
    image: complianceImage,
  },
  {
    icon: FileCheck,
    title: "Compliance-Ready Tracking",
    description: "Track regulatory milestones, audit preparation tasks, and compliance requirements alongside your regular projects. Map initiatives to SOX controls and Basel III requirements automatically.",
    image: heroImage,
  },
];

const useCases = [
  {
    title: "Core Banking Modernization",
    description: "Plan multi-phase core platform migrations with task dependencies, go-live checklists, and automated status reporting to leadership and regulators.",
    icon: Building2,
  },
  {
    title: "Regulatory Compliance Programs",
    description: "Manage SOX attestation cycles, Basel III capital adequacy programs, and Dodd-Frank compliance with milestone-driven tracking and audit-ready documentation.",
    icon: Shield,
  },
  {
    title: "Digital Transformation",
    description: "Coordinate mobile banking launches, API platform builds, and fintech partnerships across business lines with real-time portfolio visibility.",
    icon: TrendingUp,
  },
  {
    title: "M&A Integration Projects",
    description: "Track merger integration workstreams across technology, operations, compliance, and HR with cross-functional resource planning and executive dashboards.",
    icon: Scale,
  },
];

const stats = [
  { value: "60%", label: "Faster Status Reporting", description: "AI generates weekly reports automatically" },
  { value: "100%", label: "Portfolio Visibility", description: "Real-time health across all initiatives" },
  { value: "3x", label: "Faster Risk Detection", description: "AI spots issues before they escalate" },
  { value: "0", label: "Missed Deadlines", description: "Proactive alerts keep projects on track" },
];

export default function FinancialServicesLandingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [honeypotData, setHoneypotData] = useState<{ honeypot1: string; honeypot2: string; formLoadTime: number } | null>(null);

  const handleHoneypotChange = useCallback((data: { honeypot1: string; honeypot2: string; formLoadTime: number }) => {
    setHoneypotData(data);
  }, []);

  const { data: msStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/auth/microsoft/status"],
  });

  const { data: googleStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/auth/google/status"],
  });

  const handleGoogleSignIn = () => {
    window.location.href = "/api/auth/google/login";
  };

  const handleMicrosoftSignIn = () => {
    window.location.href = "/api/auth/microsoft/login";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (!termsAccepted) return;

    const honeypotPayload = honeypotData ? {
      honeypot1: honeypotData.honeypot1,
      honeypot2: honeypotData.honeypot2,
      formLoadTime: honeypotData.formLoadTime,
    } : {};

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/passwordless/request", {
        email: email.trim(),
        termsAccepted,
        ...honeypotPayload
      });
      const data = await response.json();

      if (data.success) {
        if (data.userExists) {
          setLocation(`/signin/waiting?email=${encodeURIComponent(email.trim())}`);
        } else {
          setEmailSent(true);
        }
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
    document.getElementById('financial-services-signup')?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Financial Services Project Management Software | FridayReport.AI";

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

    const descContent = "AI-powered project portfolio management built for banks and financial institutions. Track core banking migrations, regulatory compliance, digital transformation, and more. Free forever.";
    upsertMeta("name", "description", descContent);
    upsertMeta("property", "og:title", "Financial Services Project Management Software | FridayReport.AI");
    upsertMeta("property", "og:description", "AI-powered PMO software for banks and financial institutions. Free forever.");
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", window.location.href);

    return () => {
      document.title = prevTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
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
            <Badge variant="outline" className="text-xs font-medium border-indigo-300 text-indigo-700 dark:text-indigo-400 dark:border-indigo-700">
              <Landmark className="h-3 w-3 mr-1" />
              Financial Services
            </Badge>
            <Button
              variant="ghost"
              onClick={() => setLocation("/auth")}
            >
              Log in
            </Button>
            <Button
              onClick={scrollToSignUp}
              className="bg-[#F37021] hover:bg-[#e0621a] text-white"
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
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => { setLocation("/auth"); setMobileMenuOpen(false); }}
          >
            Log in
          </Button>
          <Button
            className="w-full bg-[#F37021] hover:bg-[#e0621a] text-white"
            onClick={() => { scrollToSignUp(); setMobileMenuOpen(false); }}
          >
            Get Started Free
          </Button>
        </div>
      )}

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-blue-50 to-background dark:from-indigo-950/30 dark:via-blue-950/20 dark:to-background" />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%234338ca\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
          <div className="relative px-6 md:px-12 lg:px-20 py-16 lg:py-28 max-w-[1400px] mx-auto">
            <AnimatedSection className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
              <motion.div variants={fadeUp} className="flex-1 max-w-2xl">
                <Badge className="mb-6 bg-indigo-100 text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-900/50 dark:text-indigo-300 border-0 text-sm px-4 py-1.5">
                  <Landmark className="h-3.5 w-3.5 mr-1.5" />
                  Built for Financial Services
                </Badge>
                <h1
                  className="text-4xl md:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-foreground leading-[1.1]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Project Portfolio Management{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400">
                    Built for Financial Services
                  </span>
                </h1>
                <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-xl">
                  From core banking migrations and regulatory compliance to digital transformation — manage your entire financial services PMO with AI-powered oversight that catches risks before they become audit findings.
                </p>
                <ul className="mt-8 space-y-3">
                  {[
                    "Track regulatory programs, banking migrations, and digital initiatives in one place",
                    "AI-powered risk detection alerts you before issues escalate",
                    "Executive dashboards your C-suite and regulators will trust",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                      <span className="text-base text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <Button
                    size="lg"
                    className="bg-[#F37021] hover:bg-[#e0621a] text-white text-lg min-h-14 px-8"
                    onClick={scrollToSignUp}
                  >
                    Start Free Today
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <p className="text-sm text-muted-foreground">No credit card required. Free forever plan available.</p>
                </div>
              </motion.div>
              <motion.div variants={fadeUp} className="flex-1 max-w-2xl w-full">
                <div className="relative">
                  <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/20 to-blue-500/20 rounded-2xl blur-xl" />
                  <img
                    src={heroImage}
                    alt="Financial services project management dashboard"
                    className="relative rounded-xl shadow-2xl border border-border w-full"
                  />
                </div>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        <section className="border-y border-border bg-muted/30">
          <div className="px-6 md:px-12 lg:px-20 py-10 max-w-[1400px] mx-auto">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-6 text-center">
              Trusted by teams at leading financial institutions
            </p>
            <div className="flex flex-wrap items-center justify-center gap-12 md:gap-20">
              <img src={clientLogo3} alt="Client" className="h-8 md:h-10 w-auto object-contain grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-300 dark:invert" />
              <img src={clientLogo4} alt="Client" className="h-8 md:h-10 w-auto object-contain grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-300 dark:invert" />
              <div className="flex items-center gap-2 opacity-60">
                <Landmark className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Global Banks</span>
              </div>
              <div className="flex items-center gap-2 opacity-60">
                <DollarSign className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Investment Firms</span>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeUp}>
              <Badge variant="outline" className="mb-4 text-sm">Financial Services PMO Challenges</Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                Your Financial Services PMO Deserves Better Tools
              </h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
                Financial institutions manage hundreds of concurrent initiatives under intense regulatory scrutiny. Generic project tools were not designed for the complexity of banking operations.
              </p>
            </motion.div>
          </AnimatedSection>
          <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {painPoints.map((point, i) => (
              <motion.div key={i} variants={fadeUp}>
                <Card className="h-full hover:shadow-lg transition-shadow duration-300 border-border">
                  <CardContent className="p-8">
                    <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center mb-5", point.color)}>
                      <point.icon className="h-7 w-7" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-3">{point.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{point.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatedSection>
        </section>

        <section className="bg-muted/30 border-y border-border">
          <div className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto">
            <AnimatedSection className="text-center mb-16">
              <motion.div variants={fadeUp}>
                <Badge variant="outline" className="mb-4 text-sm">The Solution</Badge>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                  One Platform for Your Entire Financial Institution
                </h2>
                <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
                  FridayReport.AI brings AI-powered portfolio management to financial services, giving you the visibility and control your leadership team and regulators demand.
                </p>
              </motion.div>
            </AnimatedSection>
            <div className="space-y-20">
              {features.map((feature, i) => (
                <AnimatedSection key={i} className={cn("flex flex-col gap-10 lg:gap-16 items-center", i % 2 === 1 ? "lg:flex-row-reverse" : "lg:flex-row")}>
                  <motion.div variants={fadeUp} className="flex-1 max-w-xl">
                    <div className="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center mb-5">
                      <feature.icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-4">{feature.title}</h3>
                    <p className="text-lg text-muted-foreground leading-relaxed">{feature.description}</p>
                    <Button
                      variant="ghost"
                      className="mt-4 px-0 text-[#F37021] hover:text-[#e0621a] hover:bg-transparent font-semibold"
                      onClick={scrollToSignUp}
                    >
                      See it in action <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </motion.div>
                  <motion.div variants={fadeUp} className="flex-1 max-w-2xl w-full">
                    <img
                      src={feature.image}
                      alt={feature.title}
                      className="rounded-xl shadow-xl border border-border w-full"
                    />
                  </motion.div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto">
          <AnimatedSection className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {stats.map((stat, i) => (
              <motion.div key={i} variants={fadeUp} className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-400 dark:to-blue-400 mb-2">
                  {stat.value}
                </div>
                <div className="font-semibold text-foreground mb-1">{stat.label}</div>
                <div className="text-sm text-muted-foreground">{stat.description}</div>
              </motion.div>
            ))}
          </AnimatedSection>
        </section>

        <section className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto">
            <AnimatedSection className="text-center mb-16">
              <motion.div variants={fadeUp}>
                <Badge className="mb-4 bg-indigo-500/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20">
                  Use Cases
                </Badge>
                <h2 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  Built for the Way Financial Services Delivers Projects
                </h2>
                <p className="mt-4 text-lg text-slate-300 max-w-2xl mx-auto">
                  Whether you are migrating core banking systems, preparing for regulatory audits, or integrating an acquisition — FridayReport.AI adapts to your workflow.
                </p>
              </motion.div>
            </AnimatedSection>
            <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {useCases.map((useCase, i) => (
                <motion.div key={i} variants={fadeUp}>
                  <Card className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors duration-300 h-full">
                    <CardContent className="p-8">
                      <div className="w-12 h-12 rounded-lg bg-indigo-500/20 flex items-center justify-center mb-5">
                        <useCase.icon className="h-6 w-6 text-indigo-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-3">{useCase.title}</h3>
                      <p className="text-slate-300 leading-relaxed">{useCase.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatedSection>
          </div>
        </section>

        <section className="px-6 md:px-12 lg:px-20 py-20 max-w-[1400px] mx-auto">
          <AnimatedSection className="text-center mb-12">
            <motion.div variants={fadeUp}>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4" style={{ fontFamily: "var(--font-display)" }}>
                How We Compare
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                See why financial services PMOs choose FridayReport.AI over generic project management tools.
              </p>
            </motion.div>
          </AnimatedSection>
          <PublicFeatureComparison />
        </section>

        <section className="bg-gradient-to-br from-indigo-50 via-blue-50 to-background dark:from-indigo-950/20 dark:via-blue-950/10 dark:to-background border-t border-border">
          <div className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto">
            <AnimatedSection className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
              <motion.div variants={fadeUp} className="flex-1 max-w-xl">
                <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6" style={{ fontFamily: "var(--font-display)" }}>
                  Ready to Modernize Your Financial Services PMO?
                </h2>
                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                  Join financial institutions that have already streamlined their project management with AI-powered tools designed for the unique demands of banking and financial services.
                </p>
                <ul className="space-y-4">
                  {[
                    { icon: Zap, text: "Set up in minutes, not months" },
                    { icon: Shield, text: "Enterprise-grade security" },
                    { icon: Clock, text: "Free forever plan — no strings attached" },
                    { icon: Target, text: "Import existing projects from MS Project, Planner, and more" },
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                        <item.icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <span className="text-foreground font-medium">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
              <motion.div variants={fadeUp} className="flex-1 max-w-md w-full" id="financial-services-signup">
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
                        <div className="mx-auto w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center mb-4">
                          <Landmark className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <CardTitle className="text-2xl font-bold">Start Free Today</CardTitle>
                        <CardDescription>
                          Get your financial services PMO up and running in minutes
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <form onSubmit={handleSubmit} className="space-y-4">
                          <HoneypotField onDataChange={handleHoneypotChange} />
                          <div className="space-y-2">
                            <Label htmlFor="financial-email" className="font-medium">Work Email</Label>
                            <Input
                              id="financial-email"
                              type="email"
                              placeholder="you@bank.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                            />
                          </div>
                          <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border border-border">
                            <Checkbox
                              id="financial-terms"
                              checked={termsAccepted}
                              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                              className="mt-0.5"
                            />
                            <Label htmlFor="financial-terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                              I agree to the{" "}
                              <a href="/terms" target="_blank" className="text-primary font-medium hover:underline">
                                Terms of Service
                              </a>{" "}
                              and{" "}
                              <a href="/privacy" target="_blank" className="text-primary font-medium hover:underline">
                                Privacy Policy
                              </a>
                            </Label>
                          </div>
                          <Button
                            type="submit"
                            size="lg"
                            className="w-full text-base font-semibold bg-[#F37021] hover:bg-[#e0621a] text-white"
                            disabled={isLoading || !email.trim() || !termsAccepted}
                          >
                            {isLoading ? (
                              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            ) : (
                              <Mail className="h-5 w-5 mr-2" />
                            )}
                            Get Started Free
                            <ChevronRight className="h-5 w-5 ml-2" />
                          </Button>
                        </form>

                        {(msStatus?.configured || googleStatus?.configured) && (
                          <>
                            <div className="relative py-2">
                              <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-border" />
                              </div>
                              <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-card px-3 text-muted-foreground font-medium">Or continue with</span>
                              </div>
                            </div>
                            <div className="space-y-3">
                              {msStatus?.configured && (
                                <Button
                                  variant="outline"
                                  size="lg"
                                  className="w-full font-medium"
                                  onClick={handleMicrosoftSignIn}
                                >
                                  <svg className="mr-2 h-5 w-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                                  </svg>
                                  Continue with Microsoft 365
                                </Button>
                              )}
                              {googleStatus?.configured && (
                                <Button
                                  variant="outline"
                                  size="lg"
                                  className="w-full font-medium"
                                  onClick={handleGoogleSignIn}
                                >
                                  <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                  </svg>
                                  Continue with Google
                                </Button>
                              )}
                            </div>
                          </>
                        )}

                        <p className="text-center text-sm text-muted-foreground pt-2">
                          Already have an account?{" "}
                          <Link href="/signin" className="text-primary font-semibold hover:underline">
                            Sign in
                          </Link>
                        </p>
                      </CardContent>
                    </>
                  )}
                </Card>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 bg-muted/20">
        <div className="px-6 md:px-12 lg:px-20 max-w-[1400px] mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src={logoBlack} alt="FridayReport.AI" className="h-6 object-contain dark:invert" />
              <span className="text-sm text-muted-foreground">Financial Services Project Management</span>
            </div>
            <div className="flex flex-wrap justify-center items-center gap-4">
              <a href="/terms" className="text-sm text-muted-foreground hover:text-foreground hover:underline">Terms of Service</a>
              <span className="text-muted-foreground">|</span>
              <a href="/privacy" className="text-sm text-muted-foreground hover:text-foreground hover:underline">Privacy Statement</a>
              <span className="text-muted-foreground">|</span>
              <a href="/guide" className="text-sm text-muted-foreground hover:text-foreground hover:underline">User Guide</a>
              <span className="text-muted-foreground">|</span>
              <a href="/signup" className="text-sm text-muted-foreground hover:text-foreground hover:underline">General Sign Up</a>
            </div>
          </div>
          <p className="text-sm text-muted-foreground text-center mt-6">
            &copy; {new Date().getFullYear()} Built by{" "}
            <a
              href="https://trusteditgroup.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium hover:underline"
            >
              Trusted IT Group
            </a>
            . All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
