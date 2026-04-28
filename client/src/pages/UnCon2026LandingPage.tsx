import { useEffect, useState, useCallback, useRef, useLayoutEffect } from "react";
import { useLocation, Link } from "wouter";
import { Menu, X, Mail, Loader2, CheckCircle, ChevronRight, Shield, Users, BarChart3, Clock, Target, ArrowRight, Zap, TrendingUp, Eye, Brain, FileText, LayoutDashboard, Lightbulb, Award, Sparkles, CalendarDays, Camera, ExternalLink, MapPin, Calendar } from "lucide-react";
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
import { motion, useInView } from "framer-motion";
import { EventsMenu, EventsMobileLinks } from "@/components/EventsMenu";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";

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

const benefits = [
  {
    icon: Eye,
    title: "Real-Time Visibility",
    description: "See the health of every project and portfolio at a glance. No more chasing status updates or compiling spreadsheets before Monday morning.",
  },
  {
    icon: Brain,
    title: "AI-Driven Insight",
    description: "Surface risks before they escalate. Our AI analyzes your portfolio continuously, flagging schedule slips, budget overruns, and resource conflicts automatically.",
  },
  {
    icon: FileText,
    title: "Flexible Reporting",
    description: "Generate executive-ready reports in seconds, not hours. Customize views by portfolio, project, or stakeholder audience with a single click.",
  },
  {
    icon: LayoutDashboard,
    title: "Executive-Ready Dashboards",
    description: "Dashboards your leadership team will actually use. Clean, data-rich views that communicate portfolio health without requiring a training session.",
  },
  {
    icon: Lightbulb,
    title: "Smarter Portfolio Decisions",
    description: "Prioritize the right initiatives with data-driven portfolio scoring. Align resources, budgets, and timelines to strategic objectives across your PMO.",
  },
  {
    icon: TrendingUp,
    title: "Better PMO Outcomes",
    description: "Reduce reporting overhead by 60%, catch risks 3x faster, and give your PMO the credibility it deserves with consistent, transparent delivery data.",
  },
];

const stats = [
  { value: "60%", label: "Faster Reporting", description: "AI-generated status reports in seconds" },
  { value: "3x", label: "Faster Risk Detection", description: "Catch issues before they escalate" },
  { value: "100%", label: "Portfolio Visibility", description: "Every project, every metric, one view" },
  { value: "5 min", label: "Setup Time", description: "Import existing projects instantly" },
];

const whyAttendeesCare = [
  {
    title: "You manage complex portfolios",
    description: "PMO unCON attendees oversee multi-project environments where visibility gaps cost time and money. FridayReport.ai was built for exactly this challenge.",
    icon: BarChart3,
  },
  {
    title: "You need AI that works today",
    description: "Not a roadmap promise. Our AI features are live and production-ready. Risk detection, automated reporting, and intelligent insights are available from day one.",
    icon: Sparkles,
  },
  {
    title: "You want to elevate PMO credibility",
    description: "The best PMOs earn strategic influence through consistent delivery and transparent data. FridayReport.ai gives you the tools to demonstrate measurable impact.",
    icon: Award,
  },
  {
    title: "You value speed over complexity",
    description: "Import your projects from MS Project, Planner, or CSV in minutes. No six-month implementation. No consultants required. Start delivering value this week.",
    icon: Zap,
  },
];

export default function UnCon2026LandingPage() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains("dark");
    if (had) {
      root.classList.remove("dark");
      root.classList.add("light");
    }
    return () => {
      if (had) {
        root.classList.remove("light");
        root.classList.add("dark");
      }
    };
  }, []);

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
    window.location.href = "/api/auth/google/login?source=uncon2026";
  };

  const handleMicrosoftSignIn = () => {
    window.location.href = "/api/auth/microsoft/login?source=uncon2026";
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
        signupSource: "uncon2026",
        ...honeypotPayload
      });
      const data = await response.json();

      if (data.success) {
        // The server intentionally no longer reveals whether the email maps to
        // an existing account (prevents enumeration). Always show the
        // "check your email" state.
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
    document.getElementById('uncon-signup')?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "PMO unCON 2026 | FridayReport.AI - Gold Sponsor";

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

    const descContent = "FridayReport.AI is a proud Gold Sponsor of PMO unCON North America 2026. Discover how our AI-first PMO platform helps modern PMO leaders gain visibility, improve reporting, and make better decisions faster.";
    upsertMeta("name", "description", descContent);
    upsertMeta("property", "og:title", "PMO unCON 2026 | FridayReport.AI - Gold Sponsor");
    upsertMeta("property", "og:description", descContent);
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
            <EventsMenu currentPath="/uncon2026" />
            <Button
              variant="ghost"
              className="text-sm font-medium"
              onClick={() => setLocation("/partners")}
            >
              Partners
            </Button>
            <Button
              variant="ghost"
              onClick={() => setLocation("/auth?source=uncon2026")}
            >
              Log in
            </Button>
            <Button
              onClick={() => window.open("https://bit.ly/unCON2026v", "_blank")}
              className="bg-[#F37021] hover:bg-[#e0621a] text-white"
            >
              Book Your Demo
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
          <EventsMobileLinks onNavigate={() => setMobileMenuOpen(false)} />
          <div className="border-t border-border pt-3 flex flex-col gap-3">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => { setLocation("/partners"); setMobileMenuOpen(false); }}
            >
              Partners
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => { setLocation("/auth?source=uncon2026"); setMobileMenuOpen(false); }}
            >
              Log in
            </Button>
            <Button
              className="w-full bg-[#F37021] hover:bg-[#e0621a] text-white"
              onClick={() => { window.open("https://bit.ly/unCON2026v", "_blank"); setMobileMenuOpen(false); }}
            >
              Book Your Demo
            </Button>
          </div>
        </div>
      )}

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-yellow-50/80 to-background dark:from-amber-950/40 dark:via-yellow-950/20 dark:to-background" />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23D97706\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
          <div className="relative px-6 md:px-12 lg:px-20 py-16 lg:py-28 max-w-[1400px] mx-auto">
            <AnimatedSection className="flex flex-col items-center text-center max-w-4xl mx-auto">
              <motion.div variants={fadeUp} className="w-full">
                <a
                  href="https://pmoga.pmi.org/events/pmo-uncon/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mb-8 px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-900/50 dark:to-yellow-900/50 border border-amber-200/60 dark:border-amber-700/40 hover:shadow-md hover:scale-[1.01] transition-all duration-200"
                >
                  <Award className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-semibold text-amber-800 dark:text-amber-300 tracking-wide uppercase">Gold Sponsor</span>
                  <span className="text-sm text-amber-700 dark:text-amber-400">PMI's PMO unCON North America 2026</span>
                  <ExternalLink className="h-3 w-3 text-amber-500 dark:text-amber-400" />
                </a>
                <h1
                  className="text-4xl md:text-5xl lg:text-[3.75rem] font-bold tracking-tight text-foreground leading-[1.1]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Welcome, PMO unCON{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-yellow-600 dark:from-amber-400 dark:to-yellow-400">
                    Attendees
                  </span>
                </h1>
                <p className="mt-6 text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">
                  Thank you for visiting FridayReport.AI — a proud Gold Sponsor of{" "}
                  <a href="https://pmoga.pmi.org/events/pmo-uncon/overview" target="_blank" rel="noopener noreferrer" className="text-amber-600 dark:text-amber-400 font-semibold hover:underline">
                    PMI's PMO unCON North America 2026
                  </a>.
                </p>
                <p className="mt-4 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                  Discover how an AI-first PMO platform can help your organization improve visibility, reporting, and decision-making across portfolios and projects.
                </p>
                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button
                    size="lg"
                    className="bg-[#F37021] hover:bg-[#e0621a] text-white text-lg min-h-14 px-8"
                    onClick={() => window.open("https://bit.ly/unCON2026v", "_blank")}
                  >
                    Book Your Demo
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-lg min-h-14 px-8"
                    onClick={scrollToSignUp}
                  >
                    Start Free
                  </Button>
                </div>
                <div className="mt-8">
                  <Link href="/uncon2026/selfie">
                    <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-900/50 dark:to-yellow-900/50 border border-amber-200/60 dark:border-amber-700/40 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer group">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center shadow-md">
                        <Camera className="h-4 w-4 text-white" />
                      </div>
                      <div className="text-left">
                        <span className="text-sm font-semibold text-amber-800 dark:text-amber-300 block">PMO unCON Selfie Experience</span>
                        <span className="text-xs text-amber-600 dark:text-amber-400">Take your conference selfie and share your badge</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                </div>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        <section className="border-y border-border bg-gradient-to-r from-amber-50/50 via-yellow-50/30 to-amber-50/50 dark:from-amber-950/20 dark:via-yellow-950/10 dark:to-amber-950/20">
          <div className="px-6 md:px-12 lg:px-20 py-16 max-w-[1400px] mx-auto">
            <AnimatedSection className="text-center max-w-3xl mx-auto">
              <motion.div variants={fadeUp}>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-500 mb-6 shadow-lg shadow-amber-500/20">
                  <CalendarDays className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4" style={{ fontFamily: "var(--font-display)" }}>
                  Great Connecting with You at PMO unCON
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Whether we met at the booth, during a session, or at a networking event — we are glad you are here.{" "}
                  <a href="https://pmoga.pmi.org/events/pmo-uncon/overview" target="_blank" rel="noopener noreferrer" className="text-amber-600 dark:text-amber-400 font-semibold hover:underline">
                    PMI's PMO unCON
                  </a>{" "}
                  brings together the people who are shaping the future of project management, and we are honored to be part of that conversation as a Gold Sponsor.
                </p>
                <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
                  We built FridayReport.AI because we believe PMO leaders deserve better tools — tools that use AI to reduce overhead, surface insights, and help you deliver more strategic value to your organization.
                </p>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        <section className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeUp}>
              <Badge variant="outline" className="mb-4 text-sm">Why PMO unCON Attendees Choose Us</Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                Built for the Challenges You Discussed This Week
              </h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
                Every conversation at PMO unCON circles back to the same themes: visibility, speed, credibility, and AI. Here is how FridayReport.AI addresses each one.
              </p>
            </motion.div>
          </AnimatedSection>
          <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {whyAttendeesCare.map((item, i) => (
              <motion.div key={i} variants={fadeUp}>
                <Card className="h-full hover:shadow-lg transition-shadow duration-300 border-border">
                  <CardContent className="p-8">
                    <div className="w-14 h-14 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mb-5">
                      <item.icon className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-3">{item.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{item.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatedSection>
        </section>

        <section className="bg-gradient-to-br from-slate-900 via-amber-950 to-slate-900 text-white">
          <div className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto">
            <AnimatedSection className="text-center mb-16">
              <motion.div variants={fadeUp}>
                <Badge className="mb-4 bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/20">
                  What FridayReport.AI Does
                </Badge>
                <h2 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  An AI-First Platform for Modern PMOs
                </h2>
                <p className="mt-4 text-lg text-slate-300 max-w-2xl mx-auto">
                  FridayReport.AI combines portfolio management, AI-powered reporting, and real-time analytics into one platform purpose-built for PMO leaders.
                </p>
              </motion.div>
            </AnimatedSection>
            <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {benefits.map((benefit, i) => (
                <motion.div key={i} variants={fadeUp}>
                  <Card className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors duration-300 h-full">
                    <CardContent className="p-8">
                      <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center mb-5">
                        <benefit.icon className="h-6 w-6 text-amber-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-3">{benefit.title}</h3>
                      <p className="text-slate-300 leading-relaxed">{benefit.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatedSection>
          </div>
        </section>

        <section className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto">
          <AnimatedSection className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {stats.map((stat, i) => (
              <motion.div key={i} variants={fadeUp} className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-yellow-600 dark:from-amber-400 dark:to-yellow-400 mb-2">
                  {stat.value}
                </div>
                <div className="font-semibold text-foreground mb-1">{stat.label}</div>
                <div className="text-sm text-muted-foreground">{stat.description}</div>
              </motion.div>
            ))}
          </AnimatedSection>
        </section>

        <section className="border-y border-border bg-gradient-to-b from-slate-50 to-white dark:from-slate-900/50 dark:to-background">
          <div className="px-6 md:px-12 lg:px-20 py-16 lg:py-20 max-w-[1400px] mx-auto">
            <AnimatedSection className="text-center mb-12">
              <motion.div variants={fadeUp}>
                <Badge variant="outline" className="mb-4 text-sm">Presented by PMI</Badge>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                  About PMO unCON North America
                </h2>
                <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto">
                  PMO unCON is the premier unconference for PMO leaders, presented by the Project Management Institute (PMI). It brings together hundreds of portfolio, program, and project management professionals for interactive sessions, peer learning, and real-world insights.
                </p>
              </motion.div>
            </AnimatedSection>
            <AnimatedSection className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <motion.div variants={fadeUp}>
                <Card className="h-full text-center border-border hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mx-auto mb-4">
                      <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="font-bold text-foreground mb-2">Peer-Driven Learning</h3>
                    <p className="text-sm text-muted-foreground">Interactive sessions led by PMO practitioners sharing real challenges and solutions</p>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={fadeUp}>
                <Card className="h-full text-center border-border hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-4">
                      <MapPin className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="font-bold text-foreground mb-2">In-Person Networking</h3>
                    <p className="text-sm text-muted-foreground">Connect with PMO leaders from across industries in an intimate, collaborative setting</p>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div variants={fadeUp}>
                <Card className="h-full text-center border-border hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center mx-auto mb-4">
                      <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h3 className="font-bold text-foreground mb-2">PMI-Backed Content</h3>
                    <p className="text-sm text-muted-foreground">Curated by the Project Management Institute with PDU-eligible sessions</p>
                  </CardContent>
                </Card>
              </motion.div>
            </AnimatedSection>
            <AnimatedSection className="text-center mt-10">
              <motion.div variants={fadeUp}>
                <a
                  href="https://pmoga.pmi.org/events/pmo-uncon/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="lg" className="text-base gap-2">
                    Visit the Official PMO unCON Page at PMI.org
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        <section className="border-y border-border bg-gradient-to-r from-amber-50/60 via-yellow-50/40 to-amber-50/60 dark:from-amber-950/20 dark:via-yellow-950/10 dark:to-amber-950/20">
          <div className="px-6 md:px-12 lg:px-20 py-16 max-w-[1400px] mx-auto">
            <AnimatedSection className="flex flex-col md:flex-row items-center justify-center gap-8 text-center md:text-left">
              <motion.div variants={fadeUp} className="flex-shrink-0">
                <div className="relative">
                  <div className="w-28 h-28 md:w-36 md:h-36 rounded-2xl bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 flex items-center justify-center shadow-xl shadow-amber-500/30">
                    <div className="text-center">
                      <Award className="h-10 w-10 md:h-12 md:w-12 text-white mx-auto mb-1" />
                      <span className="text-white font-bold text-xs md:text-sm uppercase tracking-wider">Gold</span>
                      <span className="text-white/80 text-[10px] md:text-xs block">Sponsor</span>
                    </div>
                  </div>
                  <div className="absolute -inset-2 bg-gradient-to-br from-amber-400/20 to-yellow-500/20 rounded-2xl blur-xl -z-10" />
                </div>
              </motion.div>
              <motion.div variants={fadeUp} className="max-w-2xl">
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3" style={{ fontFamily: "var(--font-display)" }}>
                  Proud Gold Sponsor of PMI's PMO unCON 2026
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  We are committed to advancing the PMO profession. Our sponsorship of PMI's PMO unCON North America reflects our belief that great project leadership deserves great tools. We are here to support the community — not just with software, but with thought leadership, resources, and genuine partnership.
                </p>
                <a
                  href="https://pmoga.pmi.org/events/pmo-uncon/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 text-amber-600 dark:text-amber-400 font-semibold hover:underline"
                >
                  Learn more about PMO unCON at PMI.org
                  <ExternalLink className="h-4 w-4" />
                </a>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        <section className="bg-gradient-to-br from-amber-50 via-yellow-50 to-background dark:from-amber-950/20 dark:via-yellow-950/10 dark:to-background">
          <div className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto">
            <AnimatedSection className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
              <motion.div variants={fadeUp} className="flex-1 max-w-xl">
                <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6" style={{ fontFamily: "var(--font-display)" }}>
                  Continue the Conversation
                </h2>
                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                  The best conversations at PMO unCON do not end when the event does. Let us show you how FridayReport.AI can transform the way your PMO operates — with a personalized demo or a free account to explore on your own.
                </p>
                <ul className="space-y-4">
                  {[
                    { icon: Zap, text: "Set up in minutes, not months" },
                    { icon: Shield, text: "Enterprise-grade security and compliance" },
                    { icon: Clock, text: "Free forever plan — no credit card required" },
                    { icon: Target, text: "Import from MS Project, Planner, CSV, and more" },
                    { icon: Users, text: "Built for teams of 1 to 1,000+" },
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                        <item.icon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <span className="text-foreground font-medium">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
              <motion.div variants={fadeUp} className="flex-1 max-w-md w-full" id="uncon-signup">
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
                        <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/20">
                          <Sparkles className="h-7 w-7 text-white" />
                        </div>
                        <CardTitle className="text-2xl font-bold">Start Free Today</CardTitle>
                        <CardDescription>
                          No credit card required. Get your PMO up and running in minutes.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <form onSubmit={handleSubmit} className="space-y-4">
                          <HoneypotField onDataChange={handleHoneypotChange} />
                          <div className="space-y-2">
                            <Label htmlFor="uncon-email" className="font-medium">Work Email</Label>
                            <Input
                              id="uncon-email"
                              type="email"
                              placeholder="you@company.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                            />
                          </div>
                          <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border border-border">
                            <Checkbox
                              id="uncon-terms"
                              checked={termsAccepted}
                              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                              className="mt-0.5"
                            />
                            <Label htmlFor="uncon-terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
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
                            Start Free
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
                          <Link href="/signin?source=uncon2026" className="text-primary font-semibold hover:underline">
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
              <span className="text-sm text-muted-foreground">Gold Sponsor — PMI's PMO unCON 2026</span>
            </div>
            <div className="flex flex-wrap justify-center items-center gap-4">
              <a href="https://pmoga.pmi.org/events/pmo-uncon/overview" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground hover:underline">PMO unCON at PMI.org</a>
              <span className="text-muted-foreground">|</span>
              <a href="/terms" className="text-sm text-muted-foreground hover:text-foreground hover:underline">Terms of Service</a>
              <span className="text-muted-foreground">|</span>
              <a href="/privacy" className="text-sm text-muted-foreground hover:text-foreground hover:underline">Privacy Statement</a>
              <span className="text-muted-foreground">|</span>
              <a href="/guide" className="text-sm text-muted-foreground hover:text-foreground hover:underline">User Guide</a>
              <span className="text-muted-foreground">|</span>
              <a href="/signup?source=uncon2026" className="text-sm text-muted-foreground hover:text-foreground hover:underline">General Sign Up</a>
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
