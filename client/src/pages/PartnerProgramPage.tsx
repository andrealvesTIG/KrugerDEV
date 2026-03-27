import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  Menu, X, CheckCircle, ArrowRight, Handshake,
  Building2, UserCheck, GraduationCap, TrendingUp,
  Award, Users, Globe, Megaphone, BookOpen, HeadphonesIcon,
  BadgePercent, BarChart3, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { HoneypotField } from "@/components/HoneypotField";
import { IndustrySolutionsMenu, IndustrySolutionsMobileLinks } from "@/components/IndustrySolutionsMenu";
import { EventsMenu, EventsMobileLinks } from "@/components/EventsMenu";
import { LandingFooter } from "@/components/layout/LandingFooter";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";
import pmiLogo from "@assets/pmi-logo-DQ-6QQ___1773339567528.png";
import pmogaLogo from "@assets/pmoga-logo.png";
import ipmaLogo from "@assets/ipma-logo.png";
import apmLogo from "@assets/apm-logo.svg";
import aipmLogo from "@assets/aipm-logo.png";

function useForceLightTheme() {
  useEffect(() => {
    const root = window.document.documentElement;
    const hadDark = root.classList.contains("dark");
    const hadLight = root.classList.contains("light");
    root.classList.remove("dark");
    root.classList.add("light");
    return () => {
      root.classList.remove("light");
      if (hadDark) root.classList.add("dark");
      else if (hadLight) root.classList.add("light");
    };
  }, []);
}

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

const partnerTypes = [
  {
    id: "consulting" as const,
    title: "PMO Consulting Firms",
    description: "Expand your service offerings with an enterprise-grade PPM platform. Deliver more value to your clients with integrated project, portfolio, and resource management.",
    icon: Building2,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
    benefits: [
      { icon: BadgePercent, text: "Referral revenue sharing" },
      { icon: Megaphone, text: "Co-marketing opportunities" },
      { icon: HeadphonesIcon, text: "Priority partner support" },
      { icon: Users, text: "Client onboarding assistance" },
    ],
  },
  {
    id: "independent" as const,
    title: "Independent Consultants",
    description: "Differentiate your practice with a modern PMO toolset. Recommend a platform that makes your clients' project delivery measurably better.",
    icon: UserCheck,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
    benefits: [
      { icon: TrendingUp, text: "Commission on referrals" },
      { icon: Award, text: "Certified Partner badge" },
      { icon: BookOpen, text: "Training resources & playbooks" },
      { icon: Shield, text: "Free professional license" },
    ],
  },
  {
    id: "trainer" as const,
    title: "Trainers & Educators",
    description: "Enhance your PMO and project management training programs with hands-on platform experience. Give your students real-world PPM tool proficiency.",
    icon: GraduationCap,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-950/40",
    benefits: [
      { icon: BookOpen, text: "Academic licensing program" },
      { icon: Users, text: "Classroom seat bundles" },
      { icon: Award, text: "Curriculum integration support" },
      { icon: Globe, text: "Guest speaker opportunities" },
    ],
  },
];

const communityOrgs = [
  { name: "PMI", description: "Project Management Institute", logo: pmiLogo },
  { name: "PMO GA", description: "PMO Global Alliance", logo: pmogaLogo },
  { name: "IPMA", description: "International Project Management Association", logo: ipmaLogo },
  { name: "APM", description: "Association for Project Management", logo: apmLogo },
  { name: "AIPM", description: "Australian Institute of Project Management", logo: aipmLogo },
];

const stats = [
  { value: "500+", label: "Organizations", description: "Trust FridayReport.AI" },
  { value: "50K+", label: "Projects Managed", description: "Across industries" },
  { value: "30%", label: "Partner Revenue", description: "Average referral earnings" },
  { value: "24hr", label: "Partner Support", description: "Response time guarantee" },
];

export default function PartnerProgramPage() {
  useForceLightTheme();
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    partnerType: "" as "" | "consulting" | "independent" | "trainer",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [honeypotData, setHoneypotData] = useState<{ honeypot1: string; honeypot2: string; formLoadTime: number } | null>(null);
  const { toast } = useToast();

  const handleHoneypotChange = useCallback((data: { honeypot1: string; honeypot2: string; formLoadTime: number }) => {
    setHoneypotData(data);
  }, []);

  const scrollToForm = () => {
    document.getElementById("partner-apply")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.partnerType) return;

    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/partner-applications", {
        ...formData,
        company: formData.company || undefined,
        message: formData.message || undefined,
        ...(honeypotData ? {
          honeypot1: honeypotData.honeypot1,
          honeypot2: honeypotData.honeypot2,
          formLoadTime: honeypotData.formLoadTime,
        } : {}),
      });
      setSubmitted(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit application. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <IndustrySolutionsMenu currentPath="/partners" />
            <EventsMenu currentPath="/partners" />
            <Link href="/partners">
              <Button variant="ghost" className="text-sm font-medium text-primary">
                Partners
              </Button>
            </Link>
            <Button
              variant="ghost"
              onClick={() => setLocation("/auth?source=partners")}
            >
              Log in
            </Button>
            <Button
              onClick={scrollToForm}
              className="bg-[#F37021] hover:bg-[#e0621a] text-white"
            >
              Become a Partner
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
          <EventsMobileLinks onNavigate={() => setMobileMenuOpen(false)} />
          <div className="border-t border-border pt-3 flex flex-col gap-3">
            <Button
              variant="ghost"
              className="w-full justify-start text-primary"
              onClick={() => { setMobileMenuOpen(false); }}
            >
              Partners
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => { setLocation("/auth?source=partners"); setMobileMenuOpen(false); }}
            >
              Log in
            </Button>
            <Button
              className="w-full bg-[#F37021] hover:bg-[#e0621a] text-white"
              onClick={() => { scrollToForm(); setMobileMenuOpen(false); }}
            >
              Become a Partner
            </Button>
          </div>
        </div>
      )}

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-background to-violet-50/60 dark:from-blue-950/30 dark:via-background dark:to-violet-950/20" />
          <div className="relative px-6 md:px-12 lg:px-20 py-20 lg:py-32 max-w-[1400px] mx-auto">
            <AnimatedSection className="text-center max-w-3xl mx-auto">
              <motion.div variants={fadeUp}>
                <Badge className="mb-6 border-0 text-sm px-4 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  <Handshake className="h-3.5 w-3.5 mr-1.5" />
                  Partner Program
                </Badge>
                <h1
                  className="text-4xl md:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-foreground leading-[1.1]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Grow Your PMO Practice{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400">
                    With Us
                  </span>
                </h1>
                <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                  Join our partner ecosystem and deliver enterprise-grade project portfolio management 
                  to your clients. Whether you're a consulting firm, independent consultant, or trainer 
                  — we have a partnership model for you.
                </p>
                <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button
                    size="lg"
                    className="bg-[#F37021] hover:bg-[#e0621a] text-white text-lg min-h-14 px-8"
                    onClick={scrollToForm}
                  >
                    Apply Now
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <p className="text-sm text-muted-foreground">Free to join. No commitments.</p>
                </div>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        <section className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeUp}>
              <Badge variant="outline" className="mb-4 text-sm">Partner Types</Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                A Partnership Built for You
              </h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
                Choose the partnership tier that fits your business. Every partner gets access to our 
                platform, resources, and dedicated support.
              </p>
            </motion.div>
          </AnimatedSection>
          <AnimatedSection className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {partnerTypes.map((type) => (
              <motion.div key={type.id} variants={fadeUp}>
                <Card className="h-full hover:shadow-lg transition-shadow duration-300 border-border relative overflow-hidden">
                  <CardHeader className="pb-4">
                    <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center mb-4", type.bgColor)}>
                      <type.icon className={cn("h-7 w-7", type.color)} />
                    </div>
                    <CardTitle className="text-xl font-bold">{type.title}</CardTitle>
                    <p className="text-muted-foreground mt-2 leading-relaxed">{type.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {type.benefits.map((benefit, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", type.bgColor)}>
                            <benefit.icon className={cn("h-4 w-4", type.color)} />
                          </div>
                          <span className="text-sm font-medium text-foreground">{benefit.text}</span>
                        </div>
                      ))}
                    </div>
                    <Button
                      className="w-full mt-6 bg-[#F37021] hover:bg-[#e0621a] text-white"
                      onClick={scrollToForm}
                    >
                      Apply as {type.title.split(" ")[0]}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatedSection>
        </section>

        <section className="border-y border-border bg-muted/30">
          <div className="px-6 md:px-12 lg:px-20 py-16 max-w-[1400px] mx-auto">
            <AnimatedSection className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
              {stats.map((stat, i) => (
                <motion.div key={i} variants={fadeUp} className="text-center">
                  <div className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400 mb-2">
                    {stat.value}
                  </div>
                  <div className="font-semibold text-foreground mb-1">{stat.label}</div>
                  <div className="text-sm text-muted-foreground">{stat.description}</div>
                </motion.div>
              ))}
            </AnimatedSection>
          </div>
        </section>

        <section className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeUp}>
              <Badge variant="outline" className="mb-4 text-sm">Why Partner With Us</Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                Everything You Need to Succeed
              </h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
                Our partner program is designed to help you grow your business while delivering 
                exceptional value to your clients.
              </p>
            </motion.div>
          </AnimatedSection>
          <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: BadgePercent, title: "Revenue Sharing", description: "Earn competitive commissions on every client referral. Our transparent model ensures you're rewarded for every deal." },
              { icon: BookOpen, title: "Sales & Marketing Resources", description: "Access co-branded materials, case studies, and demo environments to help you close deals faster." },
              { icon: HeadphonesIcon, title: "Dedicated Partner Support", description: "Get priority access to our support team, plus a dedicated partner manager for strategic accounts." },
              { icon: Award, title: "Certification Program", description: "Become a certified FridayReport.AI partner. Stand out with credentials that demonstrate your expertise." },
              { icon: BarChart3, title: "Transparent Tracking", description: "Stay informed on referrals, commissions, and client engagement with regular partner reports." },
              { icon: Globe, title: "Community & Events", description: "Join our partner community, attend exclusive events, and connect with PMO leaders worldwide." },
            ].map((item, i) => (
              <motion.div key={i} variants={fadeUp}>
                <Card className="h-full hover:shadow-lg transition-shadow duration-300 border-border">
                  <CardContent className="p-8">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center mb-5">
                      <item.icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-2">{item.title}</h3>
                    <p className="text-muted-foreground leading-relaxed text-sm">{item.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatedSection>
        </section>

        <section className="border-y border-border bg-gradient-to-r from-slate-900 to-slate-800 text-white">
          <div className="px-6 md:px-12 lg:px-20 py-16 max-w-[1400px] mx-auto">
            <AnimatedSection className="text-center mb-10">
              <motion.div variants={fadeUp}>
                <h2 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                  Trusted by the PMO Community
                </h2>
                <p className="mt-3 text-slate-300 max-w-xl mx-auto">
                  We partner with and support organizations across the global project management ecosystem.
                </p>
              </motion.div>
            </AnimatedSection>
            <AnimatedSection className="flex flex-wrap items-center justify-center gap-10 md:gap-16">
              {communityOrgs.map((org, i) => (
                <motion.div key={i} variants={fadeUp} className="flex flex-col items-center gap-2">
                  <img
                    src={org.logo}
                    alt={`${org.name} - ${org.description}`}
                    className="h-10 md:h-12 w-auto object-contain brightness-0 invert opacity-80 hover:opacity-100 transition-opacity duration-300"
                  />
                  <div className="text-[11px] text-slate-400 mt-1">{org.description}</div>
                </motion.div>
              ))}
            </AnimatedSection>
          </div>
        </section>

        <section className="px-6 md:px-12 lg:px-20 py-20 lg:py-28 max-w-[1400px] mx-auto" id="partner-apply">
          <AnimatedSection className="flex flex-col lg:flex-row items-start gap-12 lg:gap-20">
            <motion.div variants={fadeUp} className="flex-1 max-w-xl">
              <Badge variant="outline" className="mb-4 text-sm">Get Started</Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6" style={{ fontFamily: "var(--font-display)" }}>
                Become a Partner Today
              </h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Joining our partner program is simple and free. Fill out the application and 
                our partnerships team will be in touch within 24 hours.
              </p>
              <ul className="space-y-4">
                {[
                  { icon: CheckCircle, text: "Free to join — no upfront costs" },
                  { icon: CheckCircle, text: "Onboarding support from day one" },
                  { icon: CheckCircle, text: "Flexible terms — no long-term contracts" },
                  { icon: CheckCircle, text: "Immediate access to partner resources" },
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <item.icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span className="text-foreground font-medium">{item.text}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div variants={fadeUp} className="flex-1 max-w-md w-full">
              <Card className="shadow-2xl border-border">
                {submitted ? (
                  <CardContent className="p-8 text-center">
                    <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center mb-4">
                      <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-foreground mb-2">Application Received!</h3>
                    <p className="text-muted-foreground">
                      Thank you for your interest. Our partnerships team will review your application 
                      and reach out within 24 hours.
                    </p>
                  </CardContent>
                ) : (
                  <>
                    <CardHeader className="text-center pb-4">
                      <div className="mx-auto w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center mb-4">
                        <Handshake className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                      </div>
                      <CardTitle className="text-2xl font-bold">Partner Application</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">Takes less than 2 minutes</p>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <HoneypotField onDataChange={handleHoneypotChange} />
                        <div className="space-y-2">
                          <Label htmlFor="partner-name" className="font-medium">Full Name *</Label>
                          <Input
                            id="partner-name"
                            placeholder="John Smith"
                            value={formData.name}
                            onChange={(e) => setFormData(d => ({ ...d, name: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="partner-email" className="font-medium">Work Email *</Label>
                          <Input
                            id="partner-email"
                            type="email"
                            placeholder="john@company.com"
                            value={formData.email}
                            onChange={(e) => setFormData(d => ({ ...d, email: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="partner-company" className="font-medium">Company</Label>
                          <Input
                            id="partner-company"
                            placeholder="Your company name"
                            value={formData.company}
                            onChange={(e) => setFormData(d => ({ ...d, company: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-medium">Partner Type *</Label>
                          <div className="grid grid-cols-1 gap-2">
                            {partnerTypes.map((type) => (
                              <label
                                key={type.id}
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                                  formData.partnerType === type.id
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:bg-muted/50"
                                )}
                              >
                                <input
                                  type="radio"
                                  name="partnerType"
                                  value={type.id}
                                  checked={formData.partnerType === type.id}
                                  onChange={(e) => setFormData(d => ({ ...d, partnerType: e.target.value as typeof d.partnerType }))}
                                  className="sr-only"
                                />
                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", type.bgColor)}>
                                  <type.icon className={cn("h-4 w-4", type.color)} />
                                </div>
                                <span className="text-sm font-medium">{type.title}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="partner-message" className="font-medium">Tell us about your practice</Label>
                          <Textarea
                            id="partner-message"
                            placeholder="Brief description of your business and how you'd like to partner with us..."
                            value={formData.message}
                            onChange={(e) => setFormData(d => ({ ...d, message: e.target.value }))}
                            rows={3}
                          />
                        </div>
                        <Button
                          type="submit"
                          className="w-full bg-[#F37021] hover:bg-[#e0621a] text-white min-h-12 text-base"
                          disabled={isSubmitting || !formData.name || !formData.email || !formData.partnerType}
                        >
                          {isSubmitting ? "Submitting..." : "Submit Application"}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                          By submitting, you agree to our{" "}
                          <Link href="/terms" className="underline hover:text-foreground">Terms of Service</Link>{" "}
                          and{" "}
                          <Link href="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
                        </p>
                      </form>
                    </CardContent>
                  </>
                )}
              </Card>
            </motion.div>
          </AnimatedSection>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
