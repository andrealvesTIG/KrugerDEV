import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { IndustrySolutionsMenu, IndustrySolutionsMobileLinks } from "@/components/IndustrySolutionsMenu";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  Mail, 
  Loader2, 
  CheckCircle, 
  ArrowRight, 
  Building2, 
  BarChart3, 
  Users, 
  Target, 
  Shield, 
  Zap, 
  TrendingUp,
  Calendar,
  FileCheck,
  Briefcase,
  ChevronRight,
  Play,
  ChevronDown,
  Plug,
  FileSpreadsheet,
  Cloud,
  Rocket,
  LayoutGrid,
  Square,
  BookOpen,
  Volume2,
  VolumeX,
  Menu,
  X
} from "lucide-react";
import {
  SiJira, SiAsana, SiTrello, SiNotion, SiClickup,
  SiSap, SiOracle, SiSalesforce,
  SiTableau, SiGoogleanalytics
} from "react-icons/si";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { HoneypotField } from "@/components/HoneypotField";
import { LandingFooter } from "@/components/layout/LandingFooter";
import { PublicFeatureComparison } from "@/components/PublicFeatureComparison";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";
import logoWhite from "@assets/FridayReportAI_logo_white_1770231063709.png";
import logoIcon from "@assets/FridayReportAI_logo_F-symbol_1770231051194.png";
// Video served from public folder for production compatibility
import demoVideo from "@assets/30_sec_video_1771015821657.mp4";

const features = [
  {
    icon: Briefcase,
    title: "Portfolio Management",
    description: "Organize and track multiple projects across strategic portfolios with real-time health monitoring."
  },
  {
    icon: BarChart3,
    title: "Executive Dashboards",
    description: "Beautiful, real-time dashboards that give stakeholders instant visibility into project status."
  },
  {
    icon: Users,
    title: "Resource Optimization",
    description: "Efficiently allocate team members across projects with capacity planning and workload balancing."
  },
  {
    icon: Target,
    title: "Risk & Issue Tracking",
    description: "Proactively identify, assess, and mitigate project risks before they become problems."
  },
  {
    icon: Calendar,
    title: "Gantt & Timeline Views",
    description: "Visualize project schedules with interactive Gantt charts and milestone tracking."
  },
  {
    icon: FileCheck,
    title: "Status Reporting",
    description: "Generate professional status reports in seconds with AI-powered insights and recommendations."
  }
];

const benefits = [
  { metric: "40%", label: "Faster Reporting", description: "Reduce time spent on status updates" },
  { metric: "100%", label: "Visibility", description: "Real-time portfolio insights" },
  { metric: "25%", label: "Risk Reduction", description: "Early issue detection" },
];

// Integrations for landing page display
const landingIntegrations = [
  // Project Management
  { id: "jira", name: "Jira", icon: <SiJira className="h-5 w-5" />, category: "Project Management", bgColor: "bg-blue-100 dark:bg-blue-900/50", url: "https://www.atlassian.com/software/jira" },
  { id: "asana", name: "Asana", icon: <SiAsana className="h-5 w-5" />, category: "Project Management", bgColor: "bg-pink-100 dark:bg-pink-900/50", url: "https://asana.com" },
  { id: "monday", name: "Monday.com", icon: <LayoutGrid className="h-5 w-5" />, category: "Project Management", bgColor: "bg-red-100 dark:bg-red-900/50", url: "https://monday.com" },
  { id: "trello", name: "Trello", icon: <SiTrello className="h-5 w-5" />, category: "Project Management", bgColor: "bg-sky-100 dark:bg-sky-900/50", url: "https://trello.com" },
  { id: "ms-project", name: "MS Project", icon: <FileSpreadsheet className="h-5 w-5" />, category: "Project Management", bgColor: "bg-blue-100 dark:bg-blue-900/50", url: "https://www.microsoft.com/en-us/microsoft-365/project/project-management-software" },
  { id: "planner", name: "Microsoft Planner", icon: <Calendar className="h-5 w-5" />, category: "Project Management", bgColor: "bg-indigo-100 dark:bg-indigo-900/50", url: "https://www.microsoft.com/en-us/microsoft-365/business/task-management-software" },
  { id: "planner-premium", name: "Planner Premium", icon: <Rocket className="h-5 w-5" />, category: "Project Management", bgColor: "bg-purple-100 dark:bg-purple-900/50", url: "https://www.microsoft.com/en-us/microsoft-365/planner/microsoft-planner" },
  { id: "project-online", name: "Project Online", icon: <Cloud className="h-5 w-5" />, category: "Project Management", bgColor: "bg-blue-100 dark:bg-blue-900/50", url: "https://www.microsoft.com/en-us/microsoft-365/project/compare-microsoft-project-management-software" },
  { id: "notion", name: "Notion", icon: <SiNotion className="h-5 w-5" />, category: "Project Management", bgColor: "bg-stone-100 dark:bg-stone-900/50", url: "https://www.notion.so" },
  { id: "clickup", name: "ClickUp", icon: <SiClickup className="h-5 w-5" />, category: "Project Management", bgColor: "bg-violet-100 dark:bg-violet-900/50", url: "https://clickup.com" },
  { id: "basecamp", name: "Basecamp", icon: <Briefcase className="h-5 w-5" />, category: "Project Management", bgColor: "bg-emerald-100 dark:bg-emerald-900/50", url: "https://basecamp.com" },
  // ERP
  { id: "sap", name: "SAP", icon: <SiSap className="h-5 w-5" />, category: "ERP Systems", bgColor: "bg-blue-100 dark:bg-blue-900/50", url: "https://www.sap.com" },
  { id: "oracle", name: "Oracle", icon: <SiOracle className="h-5 w-5" />, category: "ERP Systems", bgColor: "bg-red-100 dark:bg-red-900/50", url: "https://www.oracle.com" },
  { id: "netsuite", name: "NetSuite", icon: <Building2 className="h-5 w-5" />, category: "ERP Systems", bgColor: "bg-orange-100 dark:bg-orange-900/50", url: "https://www.netsuite.com" },
  { id: "dynamics", name: "Dynamics 365", icon: <Square className="h-5 w-5" />, category: "ERP Systems", bgColor: "bg-cyan-100 dark:bg-cyan-900/50", url: "https://dynamics.microsoft.com" },
  { id: "workday", name: "Workday", icon: <Rocket className="h-5 w-5" />, category: "ERP Systems", bgColor: "bg-amber-100 dark:bg-amber-900/50", url: "https://www.workday.com" },
  { id: "salesforce", name: "Salesforce", icon: <SiSalesforce className="h-5 w-5" />, category: "ERP Systems", bgColor: "bg-blue-100 dark:bg-blue-900/50", url: "https://www.salesforce.com" },
  // Analytics
  { id: "power-bi", name: "Power BI", icon: <BarChart3 className="h-5 w-5" />, category: "Analytics & BI", bgColor: "bg-amber-100 dark:bg-amber-900/50", url: "https://powerbi.microsoft.com" },
  { id: "tableau", name: "Tableau", icon: <SiTableau className="h-5 w-5" />, category: "Analytics & BI", bgColor: "bg-blue-100 dark:bg-blue-900/50", url: "https://www.tableau.com" },
  { id: "google-analytics", name: "Google Analytics", icon: <SiGoogleanalytics className="h-5 w-5" />, category: "Analytics & BI", bgColor: "bg-orange-100 dark:bg-orange-900/50", url: "https://analytics.google.com" },
  { id: "looker", name: "Looker", icon: <BarChart3 className="h-5 w-5" />, category: "Analytics & BI", bgColor: "bg-purple-100 dark:bg-purple-900/50", url: "https://cloud.google.com/looker" },
  // Identity & Directory
  { id: "entra-id", name: "Microsoft Entra ID", icon: <Users className="h-5 w-5" />, category: "Identity", bgColor: "bg-sky-100 dark:bg-sky-900/50", url: "https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-id" },
  { id: "business-central", name: "Business Central", icon: <Briefcase className="h-5 w-5" />, category: "Identity", bgColor: "bg-green-100 dark:bg-green-900/50", url: "https://dynamics.microsoft.com/en-us/business-central/overview/" },
];

const trustedBy = [
  "Enterprise PMOs",
  "Technology Teams",
  "Consulting Firms",
  "Government Agencies"
];

const faqs = [
  {
    question: "How is FridayReport.AI different from spreadsheets and manual reporting?",
    answer: "Unlike spreadsheets, FridayReport.AI provides real-time portfolio visibility, automated status reporting, and AI-powered insights. You'll spend 40% less time on status updates while getting 100% visibility into project health across your entire portfolio."
  },
  {
    question: "Can I import my existing projects from Microsoft Project or Excel?",
    answer: "Yes! FridayReport.AI supports direct import from Microsoft Project (.mpp files), Excel spreadsheets, and CSV files. We also integrate with Microsoft Planner for seamless project synchronization."
  },
  {
    question: "How does the risk and issue tracking help my projects?",
    answer: "Our proactive risk management system helps you identify potential issues before they become problems. With automated risk scoring, mitigation tracking, and early warning alerts, teams typically see a 25% reduction in project risks."
  },
  {
    question: "Is my data secure?",
    answer: "Absolutely. FridayReport.AI uses enterprise-grade security with encrypted data storage, role-based access controls, and multi-tenant isolation. Your project data is protected with the same security standards used by Fortune 500 companies."
  },
  {
    question: "How does the AI-powered reporting work?",
    answer: "Our AI analyzes your project data to generate professional status reports in seconds. It identifies trends, highlights risks, and provides actionable recommendations - saving hours of manual report writing each week."
  },
  {
    question: "Can different team members have different access levels?",
    answer: "Yes. FridayReport.AI offers flexible role-based access control with roles including Owner, Admin, Member, and Team Member. Team members can be restricted to only see projects and tasks they're assigned to."
  },
  {
    question: "What happens if I need to track timesheets?",
    answer: "Built-in timesheet tracking lets team members log time against tasks and projects. Managers get visibility into resource utilization, and the data integrates directly with project progress tracking."
  },
  {
    question: "Is there a free trial?",
    answer: "Yes! You can start with our free plan which includes 1 seat and core project management features. Upgrade to Professional or Business plans as your team grows to unlock additional seats, integrations, and advanced features."
  }
];

export default function SignInPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = 1;
      videoRef.current.play().catch(() => {
        // Browser blocked autoplay with sound, try muted first then unmute
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play();
        }
      });
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      videoRef.current.volume = newMuted ? 0 : 1;
      setIsMuted(newMuted);
    }
  }, [isMuted]);
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

  const handleMicrosoftSignIn = () => {
    window.location.href = "/api/auth/microsoft/login";
  };

  const scrollToSignIn = () => {
    document.getElementById('signin-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
            <CardTitle className="text-2xl text-white">Check Your Email</CardTitle>
            <CardDescription className="text-slate-300">
              We sent a link to <strong className="text-white">{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-400 text-center">
              Click the link in your email to continue. The link will expire in 15 minutes.
            </p>
            <Button 
              variant="outline" 
              className="w-full border-slate-600 text-slate-300 hover:bg-slate-700" 
              onClick={() => setEmailSent(false)}
              data-testid="button-try-another-email"
            >
              Try a different email
            </Button>
            <div className="text-center">
              <Link href="/auth" className="text-sm text-primary hover:underline" data-testid="link-back-to-login">
                Back to login page
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-800 via-slate-700 to-slate-800">
      <Helmet>
        <title>FridayReport.AI - Project Portfolio Management Software | PMO Tools</title>
        <meta name="description" content="FridayReport.AI is enterprise project portfolio management software. Track projects, manage resources, monitor risks, and create executive dashboards. Free forever - no credit card required." />
        <meta property="og:title" content="FridayReport.AI - Project Portfolio Management Software" />
        <meta property="og:description" content="Enterprise project portfolio management for modern teams. Track projects, manage resources, and generate AI-powered insights." />
        <link rel="canonical" href="https://fridayreport.ai/" />
      </Helmet>
      {/* Sticky Header Container - Banner + Navigation */}
      <div className="sticky top-0 left-0 right-0 z-50">
        {/* Pricing Banner */}
        <div className="bg-gradient-to-r from-primary via-orange-500 to-primary py-2 sm:py-2.5 text-center px-3">
          <p className="text-white text-xs sm:text-sm font-medium">
            <span className="font-bold">Free Forever</span> — No credit card required.
            <button onClick={scrollToSignIn} className="ml-1 sm:ml-2 underline hover:no-underline font-semibold" data-testid="link-pricing-banner">
              Get Started
            </button>
          </p>
        </div>
        
        {/* Navigation */}
        <nav className="bg-slate-800/90 backdrop-blur-md border-b border-slate-600">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <img src={logoWhite} alt="FridayReport.AI" className="h-6 sm:h-7 flex-shrink-0" />
              </div>
              <div className="hidden md:flex items-center gap-6">
                <IndustrySolutionsMenu currentPath="/" variant="dark" />
                <button onClick={() => scrollToSection('features-section')} className="text-slate-200 hover:text-orange-400 text-sm font-medium transition-colors" data-testid="link-nav-features">
                  Features
                </button>
                <button onClick={() => scrollToSection('integrations-section')} className="text-slate-200 hover:text-orange-400 text-sm font-medium transition-colors" data-testid="link-nav-integrations">
                  Integrations
                </button>
                <button onClick={() => scrollToSection('pricing-section')} className="text-slate-200 hover:text-orange-400 text-sm font-medium transition-colors" data-testid="link-nav-pricing">
                  Pricing
                </button>
                <button onClick={() => scrollToSection('faq-section')} className="text-slate-200 hover:text-orange-400 text-sm font-medium transition-colors" data-testid="link-nav-faq">
                  FAQ
                </button>
                <Link href="/guide" className="text-slate-200 hover:text-orange-400 text-sm font-medium transition-colors" data-testid="link-nav-guide">
                  User Guide
                </Link>
              </div>
              <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                <Link href="/auth" className="text-slate-200 hover:text-white text-xs sm:text-sm font-medium transition-colors" data-testid="link-nav-login">
                  Login
                </Link>
                <Button onClick={scrollToSignIn} size="sm" className="bg-orange-500 hover:bg-orange-400 text-white font-semibold text-xs sm:text-sm px-3 sm:px-4 shadow-lg shadow-orange-500/30" data-testid="button-nav-get-started">
                  <span className="hidden sm:inline">Get Started Free</span>
                  <span className="sm:hidden">Start Free</span>
                </Button>
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden text-slate-200 hover:text-white p-1"
                  aria-label="Toggle menu"
                >
                  {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
          {mobileMenuOpen && (
            <div className="md:hidden bg-slate-800/95 backdrop-blur-md border-t border-slate-700 px-4 py-3 flex flex-col gap-1">
              <IndustrySolutionsMobileLinks onNavigate={() => setMobileMenuOpen(false)} variant="dark" />
              <button onClick={() => { scrollToSection('features-section'); setMobileMenuOpen(false); }} className="text-slate-200 hover:text-orange-400 text-sm font-medium text-left transition-colors py-2">
                Features
              </button>
              <button onClick={() => { scrollToSection('integrations-section'); setMobileMenuOpen(false); }} className="text-slate-200 hover:text-orange-400 text-sm font-medium text-left transition-colors py-2">
                Integrations
              </button>
              <button onClick={() => { scrollToSection('pricing-section'); setMobileMenuOpen(false); }} className="text-slate-200 hover:text-orange-400 text-sm font-medium text-left transition-colors py-2">
                Pricing
              </button>
              <button onClick={() => { scrollToSection('faq-section'); setMobileMenuOpen(false); }} className="text-slate-200 hover:text-orange-400 text-sm font-medium text-left transition-colors py-2">
                FAQ
              </button>
              <Link href="/guide" className="text-slate-200 hover:text-orange-400 text-sm font-medium transition-colors py-2">
                User Guide
              </Link>
            </div>
          )}
        </nav>
      </div>
      {/* Hero Section with Video */}
      <section className="relative pt-8 pb-8 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/30 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-orange-500/20 rounded-full blur-3xl" />
        </div>
        
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center max-w-3xl mx-auto mb-6">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2 leading-tight">
              The Most Flexible,
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300"> AI-First PMO Platform</span>
            </h1>
            <p className="text-lg sm:text-xl font-medium text-slate-100 mb-2">
              Built to adapt. Designed to predict.
            </p>
            <p className="text-sm sm:text-base text-slate-300 mb-4 max-w-xl mx-auto">
              FridayReport.ai brings AI-native intelligence to portfolio and project management—without forcing you into a rigid framework.
            </p>
            
            <Button 
              size="lg" 
              onClick={scrollToSignIn}
              className="bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-orange-300 text-white font-semibold px-8 shadow-xl shadow-orange-500/40"
              data-testid="button-hero-start-trial"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
          
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute -inset-2 bg-gradient-to-r from-primary/30 via-orange-500/20 to-primary/30 rounded-xl blur-lg opacity-50" />
            <div className="relative rounded-lg border border-slate-700 shadow-2xl shadow-black/50 bg-slate-900">
              <video
                ref={videoRef}
                autoPlay
                loop
                muted
                playsInline
                controls
                className="w-full h-auto block rounded-lg"
                style={{ aspectRatio: '16/9', objectFit: 'contain' }}
                data-testid="video-demo"
              >
                <source src={demoVideo} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 sm:py-20 px-4 sm:px-6 lg:px-8 bg-slate-700/30" data-testid="section-feature-comparison-signin">
        <div className="max-w-7xl mx-auto">
          <PublicFeatureComparison variant="slate" />
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8 border-y border-slate-600 bg-slate-700/50">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-xs sm:text-sm text-slate-300 mb-6 sm:mb-8 uppercase tracking-wider font-medium">
            Trusted by professional PMO organizations worldwide
          </p>
          <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-8 md:gap-12">
            {trustedBy.map((org, index) => (
              <div key={index} className="flex items-center gap-1.5 sm:gap-2 text-slate-300">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="font-medium text-sm sm:text-base">{org}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Benefits Stats */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="text-center p-5 sm:p-8 rounded-2xl bg-slate-700/50 border border-slate-600 hover:border-orange-400/50 transition-colors">
                <div className="text-3xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-300 mb-2">
                  {benefit.metric}
                </div>
                <div className="text-lg sm:text-xl font-semibold text-white mb-1 sm:mb-2">{benefit.label}</div>
                <div className="text-slate-300 text-sm sm:text-base">{benefit.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Features Grid */}
      <section id="features-section" className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-slate-700/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4">
              Everything Your PMO Needs
            </h2>
            <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto">
              A complete suite of tools designed for enterprise project portfolio management
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="p-4 sm:p-6 rounded-xl bg-slate-800/50 border border-slate-600 hover:border-orange-400/50 hover:bg-slate-800/80 transition-all group"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-orange-500/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-orange-500/20 transition-colors">
                  <feature.icon className="h-5 w-5 sm:h-6 sm:w-6 text-orange-400" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-1.5 sm:mb-2">{feature.title}</h3>
                <p className="text-slate-300 leading-relaxed text-sm sm:text-base">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Integrations Section */}
      <section id="integrations-section" className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-16">
            <Badge variant="secondary" className="mb-4 bg-orange-500/10 text-orange-400 border-orange-500/20">
              <Plug className="h-3 w-3 mr-1" />
              Seamless Integrations
            </Badge>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4">
              Connect Your Favorite Tools
            </h2>
            <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto">
              Integrate with the project management, ERP, and analytics tools your organization already uses
            </p>
          </div>
          
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4">
            {landingIntegrations.map((integration) => (
              <a
                key={integration.id}
                href={integration.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`Learn more about ${integration.name}`}
                data-testid={`integration-link-${integration.id}`}
              >
                <Card 
                  className="flex flex-col items-center p-4 bg-slate-700/50 border-slate-600 hover-elevate group h-full"
                  data-testid={`integration-card-${integration.id}`}
                >
                  <div className={`w-12 h-12 rounded-lg ${integration.bgColor} flex items-center justify-center mb-2 group-hover:scale-105 transition-transform`}>
                    {integration.icon}
                  </div>
                  <span className="text-xs text-slate-300 text-center font-medium" data-testid={`integration-name-${integration.id}`}>{integration.name}</span>
                </Card>
              </a>
            ))}
          </div>
          
          <div className="mt-8 text-center">
            <Link 
              href="/guide#integrations" 
              className="inline-flex items-center text-orange-400 hover:underline"
              data-testid="link-view-all-integrations"
            >
              View all integrations in User Guide
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 items-center">
            <div>
              <Badge variant="secondary" className="mb-4 bg-orange-500/10 text-orange-400 border-orange-500/20">
                <TrendingUp className="h-3 w-3 mr-1" />
                Why Choose FridayReport.AI
              </Badge>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6">
                Built for Modern PMO Teams
              </h2>
              <div className="space-y-4">
                {[
                  { icon: Shield, text: "Enterprise-grade security with SSO and role-based access control" },
                  { icon: Zap, text: "AI-powered insights and automated status reporting" },
                  { icon: Users, text: "Seamless Microsoft 365 integration for your entire team" },
                  { icon: BarChart3, text: "Power BI ready with built-in analytics API" }
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-4 w-4 text-orange-400" />
                    </div>
                    <p className="text-slate-200 leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-slate-700 rounded-2xl border border-slate-600 p-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Project Alpha</div>
                      <div className="text-sm text-slate-300">On track - 85% complete</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                      <Target className="h-5 w-5 text-yellow-400" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Project Beta</div>
                      <div className="text-sm text-slate-300">At risk - 2 open issues</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                      <Briefcase className="h-5 w-5 text-orange-400" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Project Gamma</div>
                      <div className="text-sm text-slate-300">Planning phase - Q2 launch</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Pricing Section */}
      <PricingSection scrollToSignIn={scrollToSignIn} />
      {/* CTA / Sign In Section */}
      <section id="signin-section" className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-700/50 to-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4">
                Ready to Transform Your PMO?
              </h2>
              <p className="text-base sm:text-lg text-slate-200 mb-4 sm:mb-6">
                Join thousands of project professionals who deliver better outcomes with FridayReport.AI. 
                Get started in minutes with passwordless sign-in.
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span>Free forever for small teams</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <span>Setup in 5 minutes</span>
                </div>
              </div>
            </div>
            
            <Card className="bg-white/95 dark:bg-slate-800/95 border-slate-200 dark:border-slate-600 backdrop-blur-md shadow-2xl">
              {emailSent ? (
                <>
                  <CardHeader className="text-center pb-4">
                    <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center mb-4">
                      <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <CardTitle className="text-2xl text-slate-900 dark:text-white">Check Your Email</CardTitle>
                    <CardDescription className="text-slate-600 dark:text-slate-300">
                      We sent a link to <strong className="text-slate-900 dark:text-white">{email}</strong>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                      Click the link in your email to continue. The link expires in 15 minutes.
                    </p>
                    <Button 
                      variant="outline" 
                      className="w-full border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" 
                      onClick={() => setEmailSent(false)}
                      data-testid="button-try-another-email"
                    >
                      Try a different email
                    </Button>
                  </CardContent>
                </>
              ) : (
                <>
                  <CardHeader className="text-center pb-4">
                    <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Mail className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">Get Started Free</CardTitle>
                    <CardDescription className="text-slate-600 dark:text-slate-300">
                      Enter your work email to sign in or create an account
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <HoneypotField onDataChange={handleHoneypotChange} />
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-slate-700 dark:text-slate-200 font-medium">Work Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="h-11 bg-white dark:bg-slate-900/50 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20"
                          data-testid="input-signin-email"
                        />
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700">
                        <Checkbox
                          id="terms"
                          checked={termsAccepted}
                          onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                          className="mt-0.5 border-slate-400 dark:border-slate-500 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          data-testid="checkbox-terms-accept"
                        />
                        <Label htmlFor="terms" className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed cursor-pointer">
                          I agree to the{" "}
                          <a 
                            href="/terms" 
                            target="_blank" 
                            className="text-primary font-medium hover:underline"
                            data-testid="link-terms-of-service"
                          >
                            Terms of Service
                          </a>{" "}
                          and{" "}
                          <a 
                            href="/privacy" 
                            target="_blank" 
                            className="text-primary font-medium hover:underline"
                            data-testid="link-privacy-policy"
                          >
                            Privacy Policy
                          </a>
                        </Label>
                      </div>
                      <Button 
                        type="submit" 
                        size="lg"
                        className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25" 
                        disabled={isLoading || !email.trim() || !termsAccepted}
                        data-testid="button-send-signin-link"
                      >
                        {isLoading ? (
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        ) : (
                          <Mail className="h-5 w-5 mr-2" />
                        )}
                        Continue with Email
                        <ChevronRight className="h-5 w-5 ml-2" />
                      </Button>
                    </form>

                    {(msStatus?.configured || googleStatus?.configured) && (
                      <>
                        <div className="relative py-2">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-200 dark:border-slate-700" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white dark:bg-slate-800 px-3 text-slate-400 dark:text-slate-500 font-medium">Or continue with</span>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {msStatus?.configured && (
                            <Button 
                              variant="outline" 
                              size="lg"
                              className="w-full h-11 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium" 
                              onClick={handleMicrosoftSignIn}
                              data-testid="button-microsoft-signin"
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
                              className="w-full h-11 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium" 
                              onClick={handleGoogleSignIn}
                              data-testid="button-google-signin"
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

                    <p className="text-center text-sm text-slate-500 dark:text-slate-400 pt-2">
                      Already have an account?{" "}
                      <Link href="/auth" className="text-primary font-semibold hover:underline" data-testid="link-signin">
                        Sign in
                      </Link>
                    </p>
                  </CardContent>
                </>
              )}
            </Card>
          </div>
        </div>
      </section>
      {/* Security, Compliance & Trust Section */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <Badge variant="secondary" className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">
              Enterprise-Grade Security
            </Badge>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4">
              Security, Compliance & Trust
            </h2>
            <p className="text-base sm:text-lg text-slate-400 max-w-3xl mx-auto">
              Your data security is our highest priority. FridayReport.AI is built on Microsoft Azure with enterprise-grade 
              security controls, comprehensive compliance certifications, and industry best practices to protect your projects 
              and sensitive information.
            </p>
          </div>

          {/* Security Badges Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-8 sm:mb-16">
            {[
              { name: "SOC 2 Type II", desc: "Audited security controls", icon: Shield },
              { name: "ISO 27001", desc: "Information security certified", icon: Shield },
              { name: "GDPR", desc: "EU data protection aligned", icon: Shield },
              { name: "CCPA", desc: "California privacy compliant", icon: Shield },
              { name: "NIST CSF", desc: "Framework aligned", icon: Shield },
            ].map((badge, i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-center hover:border-green-500/30 transition-colors">
                <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-green-500/10 flex items-center justify-center">
                  <badge.icon className="h-5 w-5 text-green-400" />
                </div>
                <p className="text-white font-semibold text-sm">{badge.name}</p>
                <p className="text-slate-400 text-xs mt-1">{badge.desc}</p>
              </div>
            ))}
          </div>

          {/* Security Subsections Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
            {/* Azure Cloud Security */}
            <div className="p-4 sm:p-6 rounded-2xl bg-slate-800/30 border border-slate-700">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.483 21.3H24L14.025 4.013l-3.038 8.347 5.836 6.938L5.483 21.3zM13.23 2.7L6.105 8.677 0 19.253h5.505l7.725-16.553z"/>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Microsoft Azure Infrastructure</h3>
              <ul className="space-y-2">
                {[
                  "Microsoft Defender for Cloud protection",
                  "Azure Active Directory (Entra ID)",
                  "Role-Based Access Control (RBAC)",
                  "Zero Trust security model",
                  "Network isolation & DDoS protection"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
                    <CheckCircle className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Data Protection */}
            <div className="p-4 sm:p-6 rounded-2xl bg-slate-800/30 border border-slate-700">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Data Protection & Encryption</h3>
              <ul className="space-y-2">
                {[
                  "AES-256 encryption at rest",
                  "TLS 1.2+ encryption in transit",
                  "Azure Key Vault for key management",
                  "Secrets management & credential isolation",
                  "Secure data handling protocols"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
                    <CheckCircle className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Backup & Resilience */}
            <div className="p-4 sm:p-6 rounded-2xl bg-slate-800/30 border border-slate-700">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-teal-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Backup & Business Continuity</h3>
              <ul className="space-y-2">
                {[
                  "Automated Azure backups",
                  "Geo-redundant storage (GRS)",
                  "Multi-region redundancy & failover",
                  "Disaster recovery planning",
                  "99.9%+ uptime design goal"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
                    <CheckCircle className="h-4 w-4 text-teal-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Access Controls */}
            <div className="p-4 sm:p-6 rounded-2xl bg-slate-800/30 border border-slate-700">
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-orange-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Access Controls & Permissions</h3>
              <ul className="space-y-2">
                {[
                  "Principle of least privilege",
                  "Multi-factor authentication (MFA)",
                  "Comprehensive audit logging",
                  "Security monitoring & alerting",
                  "Tenant isolation per organization"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
                    <CheckCircle className="h-4 w-4 text-orange-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Compliance Certifications */}
            <div className="p-4 sm:p-6 rounded-2xl bg-slate-800/30 border border-slate-700">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4">
                <FileCheck className="h-6 w-6 text-indigo-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Compliance & Certifications</h3>
              <ul className="space-y-2">
                {[
                  "SOC 2 Type II certified",
                  "ISO/IEC 27001, 27017 & 27018 aligned",
                  "GDPR & CCPA compliant",
                  "NIST Cybersecurity Framework",
                  "CSA STAR (Cloud Security Alliance)"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
                    <CheckCircle className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Security Practices */}
            <div className="p-4 sm:p-6 rounded-2xl bg-slate-800/30 border border-slate-700">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-red-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Continuous Security</h3>
              <ul className="space-y-2">
                {[
                  "Regular security assessments",
                  "Penetration testing",
                  "Vulnerability scanning",
                  "Security awareness training",
                  "Incident response procedures"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
                    <CheckCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Trust Statement */}
          <div className="mt-8 sm:mt-12 text-center p-5 sm:p-8 rounded-2xl bg-gradient-to-r from-green-500/5 via-blue-500/5 to-purple-500/5 border border-slate-700">
            <p className="text-slate-300 text-sm sm:text-lg max-w-3xl mx-auto">
              <span className="text-white font-semibold">Your trust is our foundation.</span>{" "}
              We continuously invest in security, compliance, and privacy to ensure your project data 
              is protected with the same rigor used by Fortune 500 companies.
            </p>
          </div>
        </div>
      </section>
      {/* Methodologies Section */}
      <section id="methodologies-section" className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-slate-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <Badge variant="secondary" className="mb-4 bg-blue-500/10 text-blue-400 border-blue-500/20">
              Industry Standards
            </Badge>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4">
              Based on Proven Methodologies
            </h2>
            <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto">
              Our platform incorporates best practices from globally recognized project management frameworks and methodologies
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-8">
            {/* PMI PMBOK */}
            <a 
              href="https://www.pmi.org/pmbok-guide-standards" 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-6 rounded-xl bg-slate-700/50 border border-slate-600 hover:border-blue-400/50 hover:bg-slate-700/80 transition-all group"
              data-testid="link-methodology-pmi"
            >
              <div className="w-14 h-14 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                <BookOpen className="h-7 w-7 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
                PMI PMBOK Guide
              </h3>
              <p className="text-slate-300 text-sm mb-4">
                The global standard for project management, providing guidelines for managing individual projects and defining key concepts.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs border-slate-500 text-slate-400">Earned Value</Badge>
                <Badge variant="outline" className="text-xs border-slate-500 text-slate-400">Cost Management</Badge>
                <Badge variant="outline" className="text-xs border-slate-500 text-slate-400">Risk Management</Badge>
              </div>
            </a>

            {/* PRINCE2 */}
            <a 
              href="https://www.prince2.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-6 rounded-xl bg-slate-700/50 border border-slate-600 hover:border-purple-400/50 hover:bg-slate-700/80 transition-all group"
              data-testid="link-methodology-prince2"
            >
              <div className="w-14 h-14 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
                <Shield className="h-7 w-7 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-purple-400 transition-colors">
                PRINCE2
              </h3>
              <p className="text-slate-300 text-sm mb-4">
                A structured project management method focusing on organization, control, and quality to deliver projects successfully.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs border-slate-500 text-slate-400">Stage Gates</Badge>
                <Badge variant="outline" className="text-xs border-slate-500 text-slate-400">Health Checks</Badge>
                <Badge variant="outline" className="text-xs border-slate-500 text-slate-400">Governance</Badge>
              </div>
            </a>

            {/* Gartner */}
            <a 
              href="https://www.gartner.com/en/information-technology/role/strategic-portfolio-management" 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-6 rounded-xl bg-slate-700/50 border border-slate-600 hover:border-teal-400/50 hover:bg-slate-700/80 transition-all group"
              data-testid="link-methodology-gartner"
            >
              <div className="w-14 h-14 rounded-lg bg-teal-500/10 flex items-center justify-center mb-4 group-hover:bg-teal-500/20 transition-colors">
                <TrendingUp className="h-7 w-7 text-teal-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-teal-400 transition-colors">
                Gartner PPM Framework
              </h3>
              <p className="text-slate-300 text-sm mb-4">
                Strategic portfolio management insights and best practices for aligning projects with business objectives.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs border-slate-500 text-slate-400">Portfolio Health</Badge>
                <Badge variant="outline" className="text-xs border-slate-500 text-slate-400">Capacity Planning</Badge>
                <Badge variant="outline" className="text-xs border-slate-500 text-slate-400">Strategy Alignment</Badge>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq-section" className="py-12 sm:py-20 px-4 bg-slate-700/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <Badge variant="secondary" className="mb-4 bg-orange-500/10 text-orange-400 border-orange-500/20">
              Questions & Answers
            </Badge>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto">
              Everything you need to know about managing your project portfolio with FridayReport.AI
            </p>
          </div>
          
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`faq-${index}`}
                className="bg-slate-700/50 border border-slate-600 rounded-lg px-6 data-[state=open]:bg-slate-700/70"
                data-testid={`accordion-faq-${index}`}
              >
                <AccordionTrigger className="text-left text-white hover:text-orange-400 hover:no-underline py-5">
                  <span className="text-base font-medium">{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-300 pb-5 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-12 text-center">
            <p className="text-slate-300 mb-4">Still have questions?</p>
            <Button 
              variant="outline" 
              className="border-slate-500 text-slate-200 hover:bg-slate-600"
              onClick={scrollToSignIn}
              data-testid="button-faq-get-started"
            >
              Get started and explore
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
      {/* Footer */}
      <LandingFooter />
    </div>
  );
}

interface CreditCostData {
  resourceType: string;
  creditCost: number;
  displayName: string;
  description: string | null;
}

interface PlanData {
  id: number;
  code: string;
  name: string;
  monthlyPriceCents: number | null;
  maxSeats: number | null;
  extraSeatPriceCents: number | null;
  displayOrder: number | null;
  meterRules: {
    meterCode: string;
    meterName: string;
    ruleType: string;
    includedUnitsMonthly: number | null;
    hardCapUnits: number | null;
  }[];
}

interface PlansResponse {
  plans: PlanData[];
  creditCosts: CreditCostData[];
}

function getMeterValue(rules: PlanData['meterRules'], meterCode: string): { quota: number | null; hasOverage: boolean } {
  const quota = rules.find(r => r.meterCode === meterCode && r.ruleType === 'INCLUDED_QUOTA');
  const hasOverage = rules.some(r => r.meterCode === meterCode && r.ruleType === 'METERED_OVERAGE');
  return { quota: quota?.includedUnitsMonthly ?? null, hasOverage };
}

function getHardCap(rules: PlanData['meterRules'], meterCode: string): number | null {
  const cap = rules.find(r => r.meterCode === meterCode && r.ruleType === 'HARD_CAP');
  return cap?.hardCapUnits ?? null;
}

function getCreditCostForType(creditCosts: CreditCostData[], resourceType: string): number {
  const cost = creditCosts.find(c => c.resourceType === resourceType);
  return cost ? cost.creditCost / 100 : 1;
}

function getPlanFeatures(plan: PlanData, creditCosts: CreditCostData[]): string[] {
  const features: string[] = [];
  const rules = plan.meterRules;
  const isCustom = plan.code === 'CUSTOM';

  if (plan.maxSeats) {
    features.push(plan.maxSeats === 1 ? `1 seat included` : `Up to ${plan.maxSeats} seats`);
  } else {
    features.push("Unlimited seats");
  }

  if (plan.extraSeatPriceCents) {
    features.push(`$${plan.extraSeatPriceCents / 100}/extra seat`);
  }

  const projectsCap = getHardCap(rules, 'projects');
  if (projectsCap && !isCustom) {
    features.push(`Up to ${projectsCap.toLocaleString()} projects`);
  } else if (isCustom) {
    features.push("Unlimited projects");
  }

  const tasksCap = getHardCap(rules, 'tasks');
  if (tasksCap && !isCustom) {
    features.push(`Up to ${tasksCap.toLocaleString()} tasks`);
  } else if (isCustom) {
    features.push("Unlimited tasks");
  }

  const credits = getMeterValue(rules, 'credits');
  if (credits.quota && !isCustom) {
    const creditsVal = credits.quota;
    const portfolioCost = getCreditCostForType(creditCosts, 'portfolio');
    const resourceCost = getCreditCostForType(creditCosts, 'resource');
    const portfolios = Math.floor(creditsVal / portfolioCost);
    const resources = Math.floor(creditsVal / resourceCost);
    features.push(`${creditsVal.toLocaleString()} credits/month`);
    features.push(`~${portfolios} portfolios, ~${resources} resources`);
  } else if (isCustom) {
    features.push("Custom credit allocation");
  }

  const aiRuns = getMeterValue(rules, 'ai_runs');
  if (aiRuns.quota && !isCustom) {
    features.push(`${aiRuns.quota.toLocaleString()} AI runs/month`);
  } else if (isCustom) {
    features.push("Unlimited AI runs");
  }

  const docs = getMeterValue(rules, 'documents');
  if (docs.quota && !isCustom) {
    features.push(`${docs.quota.toLocaleString()} documents`);
  } else if (isCustom) {
    features.push("Unlimited documents");
  }

  if (credits.hasOverage && !isCustom) {
    features.push("Pay-as-you-go overage");
  }

  return features;
}

function PricingSection({ scrollToSignIn }: { scrollToSignIn: () => void }) {
  const [contactOpen, setContactOpen] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const { toast } = useToast();

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactEmail) return;
    setContactSending(true);
    try {
      await apiRequest('POST', '/api/contact-sales', {
        email: contactEmail,
        name: contactName,
        message: contactMessage,
      });
      setContactSent(true);
      toast({ title: 'Request sent', description: 'Our sales team will be in touch shortly.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to send request. Please try again.', variant: 'destructive' });
    } finally {
      setContactSending(false);
    }
  };

  const { data: plansResponse, isLoading } = useQuery<PlansResponse>({
    queryKey: ['/api/billing/plans'],
  });

  const plans = plansResponse?.plans;
  const creditCosts = plansResponse?.creditCosts ?? [];

  const sortedPlans = plans ? [...plans].sort((a, b) => {
    return (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
  }) : [];

  const mostPopularCode = 'TEAM';

  return (
    <section id="pricing-section" className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-slate-700/30">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8 sm:mb-16">
          <Badge variant="secondary" className="mb-4 bg-orange-500/10 text-orange-400 border-orange-500/20">
            Simple Pricing
          </Badge>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4">
            Free Forever, Scale When Ready
          </h2>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto">
            Start for free with unlimited projects. Upgrade only when you need advanced features.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-4 max-w-7xl mx-auto">
            {sortedPlans?.map((plan) => {
              const isPopular = plan.code === mostPopularCode;
              const isCustom = plan.code === 'CUSTOM';
              const isFree = plan.code === 'FREE';
              const features = getPlanFeatures(plan, creditCosts);
              const priceDisplay = isCustom
                ? 'Contact'
                : plan.monthlyPriceCents != null
                  ? `$${plan.monthlyPriceCents / 100}`
                  : '$0';
              const subtitle = isFree ? 'Forever free' : isCustom ? 'Custom pricing' : 'per month';

              return (
                <div
                  key={plan.id}
                  className={
                    isPopular
                      ? "p-5 rounded-2xl bg-gradient-to-b from-orange-500/15 to-slate-800/50 border-2 border-orange-500 relative w-full sm:w-[calc(50%-0.5rem)] lg:w-[220px]"
                      : isFree
                      ? "p-5 rounded-2xl bg-gradient-to-b from-green-500/15 to-slate-800/50 border-2 border-green-500 relative w-full sm:w-[calc(50%-0.5rem)] lg:w-[220px]"
                      : "p-5 rounded-2xl bg-slate-800/50 border border-slate-600 w-full sm:w-[calc(50%-0.5rem)] lg:w-[220px]"
                  }
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-orange-500 text-white text-xs">Most Popular</Badge>
                    </div>
                  )}
                  {isFree && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-green-500 text-white text-xs">Free Forever</Badge>
                    </div>
                  )}
                  <div className="text-center mb-5">
                    <h3 className="text-lg font-semibold text-white mb-2">{plan.name}</h3>
                    <div className="text-3xl font-bold text-white mb-1">{priceDisplay}</div>
                    <p className="text-slate-300 text-xs">{subtitle}</p>
                  </div>
                  <ul className="space-y-2 mb-5">
                    {features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-slate-200 text-xs">
                        <CheckCircle className={`h-3.5 w-3.5 flex-shrink-0 ${isPopular ? 'text-orange-400' : isFree ? 'text-green-400' : 'text-green-400'}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {isPopular ? (
                    <Button
                      size="sm"
                      className="w-full bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-orange-300 font-semibold"
                      onClick={scrollToSignIn}
                      data-testid={`button-pricing-${plan.code.toLowerCase()}`}
                    >
                      Start Free
                    </Button>
                  ) : isFree ? (
                    <Button
                      size="sm"
                      className="w-full bg-gradient-to-r from-green-500 to-green-400 hover:from-green-400 hover:to-green-300 text-white font-semibold"
                      onClick={scrollToSignIn}
                      data-testid={`button-pricing-${plan.code.toLowerCase()}`}
                    >
                      Get Started Free
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-slate-500 text-slate-200 hover:bg-slate-600"
                      onClick={isCustom ? () => { setContactSent(false); setContactEmail(''); setContactName(''); setContactMessage(''); setContactOpen(true); } : scrollToSignIn}
                      data-testid={`button-pricing-${plan.code.toLowerCase()}`}
                    >
                      {isCustom ? 'Contact Sales' : 'Start Free'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-center mt-8">
          <Button
            size="lg"
            variant="outline"
            className="border-slate-500 text-slate-200 hover:bg-slate-600 px-8"
            onClick={() => { setContactSent(false); setContactEmail(''); setContactName(''); setContactMessage(''); setContactOpen(true); }}
            data-testid="button-contact-sales-bottom"
          >
            Need a custom plan? Contact Sales
          </Button>
        </div>
      </div>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Contact Sales</DialogTitle>
            <DialogDescription className="text-slate-300">
              Tell us about your needs and we'll get back to you shortly.
            </DialogDescription>
          </DialogHeader>
          {contactSent ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle className="h-12 w-12 text-green-400" />
              <p className="text-slate-200 text-center">Thanks! Our sales team will reach out to you soon.</p>
              <Button variant="outline" size="sm" className="mt-2 border-slate-500 text-slate-200 hover:bg-slate-600" onClick={() => setContactOpen(false)} data-testid="button-contact-close">
                Close
              </Button>
            </div>
          ) : (
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact-name" className="text-slate-200">Name</Label>
                <Input id="contact-name" placeholder="Your name" value={contactName} onChange={(e) => setContactName(e.target.value)} className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400" data-testid="input-contact-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-email" className="text-slate-200">Email <span className="text-red-400">*</span></Label>
                <Input id="contact-email" type="email" required placeholder="you@company.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400" data-testid="input-contact-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-message" className="text-slate-200">Message</Label>
                <Textarea id="contact-message" placeholder="Tell us about your project management needs..." value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 min-h-[80px]" data-testid="input-contact-message" />
              </div>
              <Button type="submit" disabled={contactSending || !contactEmail} className="w-full bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-orange-300 font-semibold" data-testid="button-contact-submit">
                {contactSending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...</> : 'Send Request'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
