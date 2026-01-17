import { useState, useRef, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Play
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { TurnstileWidget, type TurnstileWidgetRef } from "@/components/TurnstileWidget";
import { HoneypotField } from "@/components/HoneypotField";
import { Footer } from "@/components/layout/Footer";
import logoIcon from "@assets/icon_orange_bright@16x_1767637282986.png";

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

const trustedBy = [
  "Enterprise PMOs",
  "Technology Teams",
  "Consulting Firms",
  "Government Agencies"
];

export default function SignInPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);
  const [honeypotData, setHoneypotData] = useState<{ honeypot1: string; honeypot2: string; formLoadTime: number } | null>(null);
  const handleHoneypotChange = useCallback((data: { honeypot1: string; honeypot2: string; formLoadTime: number }) => {
    setHoneypotData(data);
  }, []);

  const { data: msStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/auth/microsoft/status"],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    const honeypotPayload = honeypotData ? {
      honeypot1: honeypotData.honeypot1,
      honeypot2: honeypotData.honeypot2,
      formLoadTime: honeypotData.formLoadTime,
    } : {};

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/passwordless/request", { 
        email: email.trim(),
        turnstileToken: turnstileToken || undefined,
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
        turnstileRef.current?.reset();
        setTurnstileToken(null);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send sign-in link",
        variant: "destructive",
      });
      turnstileRef.current?.reset();
      setTurnstileToken(null);
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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <img src={logoIcon} alt="FridayReport.AI" className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0" />
              <span className="text-base sm:text-xl font-bold text-white truncate">FridayReport.AI</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <Link href="/auth" className="text-slate-300 hover:text-white text-xs sm:text-sm font-medium transition-colors" data-testid="link-nav-login">
                Login
              </Link>
              <Button onClick={scrollToSignIn} size="sm" className="bg-primary hover:bg-primary/90 text-xs sm:text-sm px-2 sm:px-3" data-testid="button-nav-get-started">
                <span className="hidden sm:inline">Get Started Free</span>
                <span className="sm:hidden">Start Free</span>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        </div>
        
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center max-w-4xl mx-auto">
            <Badge variant="secondary" className="mb-6 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
              <Zap className="h-3 w-3 mr-1" />
              Enterprise-Grade Project Portfolio Management
            </Badge>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Deliver Projects with
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400"> Confidence</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-slate-300 mb-8 max-w-2xl mx-auto leading-relaxed">
              The modern PPM platform trusted by enterprise teams to manage portfolios, 
              track progress, and deliver strategic initiatives on time and within budget.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                size="lg" 
                onClick={scrollToSignIn}
                className="bg-primary hover:bg-primary/90 text-white px-8 py-6 text-lg shadow-lg shadow-primary/25"
                data-testid="button-hero-start-trial"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                className="border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white px-8 py-6 text-lg"
                data-testid="button-hero-watch-demo"
              >
                <Play className="mr-2 h-5 w-5" />
                Watch Demo
              </Button>
            </div>
            
            <p className="mt-6 text-sm text-slate-400">
              Free forever for small teams. No credit card required.
            </p>
          </div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 border-y border-slate-800 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-sm text-slate-400 mb-8 uppercase tracking-wider font-medium">
            Trusted by professional PMO organizations worldwide
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-12">
            {trustedBy.map((org, index) => (
              <div key={index} className="flex items-center gap-2 text-slate-400">
                <Building2 className="h-5 w-5" />
                <span className="font-medium">{org}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Stats */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="text-center p-8 rounded-2xl bg-slate-800/50 border border-slate-700 hover:border-primary/50 transition-colors">
                <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400 mb-2">
                  {benefit.metric}
                </div>
                <div className="text-xl font-semibold text-white mb-2">{benefit.label}</div>
                <div className="text-slate-400">{benefit.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Everything Your PMO Needs
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              A complete suite of tools designed for enterprise project portfolio management
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="p-6 rounded-xl bg-slate-900/50 border border-slate-700 hover:border-primary/50 hover:bg-slate-900/80 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-slate-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="secondary" className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">
                <TrendingUp className="h-3 w-3 mr-1" />
                Why Choose FridayReport.AI
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
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
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-slate-300 leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-orange-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-slate-800 rounded-2xl border border-slate-700 p-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Project Alpha</div>
                      <div className="text-sm text-slate-400">On track - 85% complete</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                      <Target className="h-5 w-5 text-yellow-400" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Project Beta</div>
                      <div className="text-sm text-slate-400">At risk - 2 open issues</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <Briefcase className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium text-white">Project Gamma</div>
                      <div className="text-sm text-slate-400">Planning phase - Q2 launch</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 bg-primary/10 text-primary border-primary/20">
              Simple Pricing
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Free Forever, Scale When Ready
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Start for free with unlimited projects. Upgrade only when you need advanced features.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {/* Free Plan */}
            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-700">
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold text-white mb-2">Free</h3>
                <div className="text-4xl font-bold text-white mb-1">$0</div>
                <p className="text-slate-400 text-sm">Forever free</p>
              </div>
              <ul className="space-y-3 mb-6">
                {["200 AI credits/month", "Up to 40 projects", "200 tasks, 200 issues", "1 seat included", "Basic dashboards"].map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-300 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full border-slate-600 text-slate-300 hover:bg-slate-700" onClick={scrollToSignIn} data-testid="button-pricing-free">
                Get Started
              </Button>
            </div>
            
            {/* Professional Plan */}
            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-700">
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold text-white mb-2">Professional</h3>
                <div className="text-4xl font-bold text-white mb-1">$12</div>
                <p className="text-slate-400 text-sm">per month</p>
              </div>
              <ul className="space-y-3 mb-6">
                {["500 AI credits/month", "Up to 100 projects", "500 tasks, 500 issues", "Up to 3 seats", "Advanced reporting"].map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-300 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full border-slate-600 text-slate-300 hover:bg-slate-700" onClick={scrollToSignIn} data-testid="button-pricing-professional">
                Start Free
              </Button>
            </div>
            
            {/* Business Plan */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-primary/10 to-slate-900/50 border-2 border-primary relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-white">Most Popular</Badge>
              </div>
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold text-white mb-2">Business</h3>
                <div className="text-4xl font-bold text-white mb-1">$28</div>
                <p className="text-slate-400 text-sm">per month</p>
              </div>
              <ul className="space-y-3 mb-6">
                {["1,000 AI credits/month", "Up to 200 projects", "1,000 tasks, 1,000 issues", "Up to 25 seats", "Priority support", "Power BI integration"].map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-300 text-sm">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button className="w-full bg-primary hover:bg-primary/90" onClick={scrollToSignIn} data-testid="button-pricing-business">
                Start Free
              </Button>
            </div>
            
            {/* Enterprise Plan */}
            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-700">
              <div className="text-center mb-6">
                <h3 className="text-xl font-semibold text-white mb-2">Enterprise</h3>
                <div className="text-4xl font-bold text-white mb-1">Custom</div>
                <p className="text-slate-400 text-sm">Contact for pricing</p>
              </div>
              <ul className="space-y-3 mb-6">
                {["Unlimited AI credits", "Unlimited projects", "Unlimited tasks & issues", "Unlimited seats", "SSO / SAML", "Dedicated support"].map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-300 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full border-slate-600 text-slate-300 hover:bg-slate-700" onClick={scrollToSignIn} data-testid="button-pricing-enterprise">
                Contact Sales
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA / Sign In Section */}
      <section id="signin-section" className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-800/50 to-slate-900">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to Transform Your PMO?
              </h2>
              <p className="text-lg text-slate-300 mb-6">
                Join thousands of project professionals who deliver better outcomes with FridayReport.AI. 
                Get started in minutes with passwordless sign-in.
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
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
            
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
              {emailSent ? (
                <>
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
                      Click the link in your email to continue. The link expires in 15 minutes.
                    </p>
                    <Button 
                      variant="outline" 
                      className="w-full border-slate-600 text-slate-300 hover:bg-slate-700" 
                      onClick={() => setEmailSent(false)}
                      data-testid="button-try-another-email"
                    >
                      Try a different email
                    </Button>
                  </CardContent>
                </>
              ) : (
                <>
                  <CardHeader className="text-center">
                    <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Mail className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl text-white">Get Started Free</CardTitle>
                    <CardDescription className="text-slate-300">
                      Enter your work email to sign in or create an account
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <HoneypotField onDataChange={handleHoneypotChange} />
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-slate-300">Work Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-primary"
                          data-testid="input-signin-email"
                        />
                      </div>
                      <TurnstileWidget
                        ref={turnstileRef}
                        onSuccess={setTurnstileToken}
                        onExpire={() => setTurnstileToken(null)}
                        className="flex justify-center"
                      />
                      <Button 
                        type="submit" 
                        className="w-full bg-primary hover:bg-primary/90" 
                        disabled={isLoading || !email.trim()}
                        data-testid="button-send-signin-link"
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4 mr-2" />
                        )}
                        Continue with Email
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </form>

                    {msStatus?.configured && (
                      <>
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-700" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-slate-800/50 px-2 text-slate-500">Or</span>
                          </div>
                        </div>

                        <Button 
                          variant="outline" 
                          className="w-full border-slate-600 text-slate-300 hover:bg-slate-700" 
                          onClick={handleMicrosoftSignIn}
                          data-testid="button-microsoft-signin"
                        >
                          <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                            <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                            <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                            <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                          </svg>
                          Continue with Microsoft 365
                        </Button>
                      </>
                    )}

                    <p className="text-center text-sm text-slate-500">
                      Already have an account?{" "}
                      <Link href="/auth" className="text-primary hover:underline" data-testid="link-signin">
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

      {/* Footer */}
      <Footer />
    </div>
  );
}
