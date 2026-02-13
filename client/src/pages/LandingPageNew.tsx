import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { Check, Menu, X, Mail, Loader2, CheckCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { TurnstileWidget, type TurnstileWidgetRef } from "@/components/TurnstileWidget";
import { HoneypotField } from "@/components/HoneypotField";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";
import demoVideo from "@assets/30_sec_video_1771015821657.mp4";
import clientLogo1 from "@assets/client-logo-1.png";
import clientLogo2 from "@assets/client-logo-2.png";
import clientLogo3 from "@assets/client-logo-3.png";
import clientLogo4 from "@assets/client-logo-4.png";

const clientLogos = [
  { src: clientLogo1, alt: "Verizon" },
  { src: clientLogo2, alt: "eBay" },
  { src: clientLogo3, alt: "Roche" },
  { src: clientLogo4, alt: "Pfizer" },
];

const valueProps = [
  { bold: "Any size team.", rest: "Works for a few people or the whole organization." },
  { bold: "Save Money.", rest: "Use AI to catch issues early and avoid costly delays." },
  { bold: "Work Faster.", rest: "Focus on what matters instead of chasing updates." },
];

export default function LandingPageNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);
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
        turnstileToken: turnstileToken || undefined,
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

  const scrollToSignUp = () => {
    document.getElementById('signup-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    document.title = "FridayReport.AI - AI Project Portfolio Management Software";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", "Replace all your project tools with one AI-powered platform. Free forever. Trusted by Verizon, eBay, Roche, and Pfizer.");
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = "Replace all your project tools with one AI-powered platform. Free forever. Trusted by Verizon, eBay, Roche, and Pfizer.";
      document.head.appendChild(meta);
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      const og = document.createElement("meta");
      og.setAttribute("property", "og:title");
      og.content = "FridayReport.AI - AI Project Portfolio Management";
      document.head.appendChild(og);
    }
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      const og = document.createElement("meta");
      og.setAttribute("property", "og:description");
      og.content = "Replace all your project tools with one AI-powered platform. Free forever.";
      document.head.appendChild(og);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background" data-testid="landing-page">
      <header className="relative flex items-center justify-center sm:justify-between gap-4 flex-wrap px-6 py-4 md:px-12 lg:px-20 border-b border-border">
        <a href="https://fridayreport.ai" target="_blank" rel="noopener noreferrer" data-testid="link-logo">
          <img
            src={logoBlack}
            alt="FridayReport.AI"
            className="h-8 object-contain dark:invert"
            data-testid="img-logo"
          />
        </a>
        <div className="hidden sm:flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            onClick={() => setLocation("/signin")}
            data-testid="button-login"
          >
            Log in
          </Button>
          <Button
            onClick={scrollToSignUp}
            data-testid="button-signup"
          >
            Sign Up
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden absolute right-6"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          data-testid="button-mobile-menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>
      {mobileMenuOpen && (
        <div className="sm:hidden border-b border-border bg-background px-6 py-4 flex flex-col gap-3" data-testid="mobile-menu">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => { setLocation("/signin"); setMobileMenuOpen(false); }}
            data-testid="button-login-mobile"
          >
            Log in
          </Button>
          <Button
            className="w-full"
            onClick={() => { scrollToSignUp(); setMobileMenuOpen(false); }}
            data-testid="button-signup-mobile"
          >
            Sign Up
          </Button>
        </div>
      )}
      <main className="px-6 md:px-12 lg:px-20">
        <section className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16 py-16 lg:py-24 max-w-[1400px] mx-auto">
          <div className="flex-1 max-w-xl">
            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-headline"
            >
              Project Management software to keep your business organized
            </h1>

            <ul className="mt-8 space-y-3">
              {valueProps.map((prop, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-base text-muted-foreground">
                    <strong className="text-foreground">{prop.bold}</strong>{" "}
                    {prop.rest}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex items-center gap-4 flex-wrap">
              <Button
                size="lg"
                className="bg-[#F37021] border-[#F37021] text-white text-lg min-h-14"
                onClick={scrollToSignUp}
                data-testid="button-cta"
              >
                Start free. Keep it free forever
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground" data-testid="text-no-credit-card">No credit card required.</p>
          </div>

          <div className="flex-1 max-w-2xl w-full">
            <div className="rounded-md shadow-2xl overflow-hidden border border-border">
              <video
                autoPlay
                loop
                muted
                playsInline
                controls
                className="w-full h-auto block rounded-md"
                style={{ aspectRatio: '16/9', objectFit: 'contain' }}
                data-testid="video-demo"
              >
                <source src={demoVideo} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </section>

        <section className="py-8 border-t border-border max-w-[1400px] mx-auto -mt-4">
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-8 text-center">Trusted IT Group Clients</p>
          <div className="relative overflow-hidden" data-testid="logo-belt">
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10" />
            <div className="logo-scroll-track flex items-center gap-20">
              {[...Array(6)].map((_, setIndex) =>
                clientLogos.map((logo, logoIndex) => (
                  <img
                    key={`${setIndex}-${logoIndex}`}
                    src={logo.src}
                    alt={logo.alt}
                    className="h-8 md:h-10 w-auto object-contain shrink-0 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-300 dark:invert"
                    data-testid={`img-client-logo-${logo.alt.toLowerCase()}-${setIndex}`}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        <section id="signup-section" className="py-16 max-w-[1400px] mx-auto">
          <div className="max-w-md mx-auto">
            <Card className="shadow-xl border-border" data-testid="card-signup">
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
                    <CardTitle className="text-2xl font-bold">Get Started Free</CardTitle>
                    <CardDescription>
                      Enter your work email to sign in or create an account
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <HoneypotField onDataChange={handleHoneypotChange} />
                      <div className="space-y-2">
                        <Label htmlFor="landing-email" className="font-medium">Work Email</Label>
                        <Input
                          id="landing-email"
                          type="email"
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          data-testid="input-landing-email"
                        />
                      </div>
                      <TurnstileWidget
                        ref={turnstileRef}
                        onSuccess={setTurnstileToken}
                        onExpire={() => setTurnstileToken(null)}
                        className="flex justify-center"
                      />
                      <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 border border-border">
                        <Checkbox
                          id="landing-terms"
                          checked={termsAccepted}
                          onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                          className="mt-0.5"
                          data-testid="checkbox-landing-terms"
                        />
                        <Label htmlFor="landing-terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                          I agree to the{" "}
                          <a href="/terms" target="_blank" className="text-primary font-medium hover:underline" data-testid="link-landing-terms">
                            Terms of Service
                          </a>{" "}
                          and{" "}
                          <a href="/privacy" target="_blank" className="text-primary font-medium hover:underline" data-testid="link-landing-privacy">
                            Privacy Policy
                          </a>
                        </Label>
                      </div>
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full text-base font-semibold"
                        disabled={isLoading || !email.trim() || !termsAccepted}
                        data-testid="button-landing-submit"
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
                              data-testid="button-landing-microsoft"
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
                              data-testid="button-landing-google"
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
                      <Link href="/signin" className="text-primary font-semibold hover:underline" data-testid="link-landing-signin">
                        Sign in
                      </Link>
                    </p>
                  </CardContent>
                </>
              )}
            </Card>
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-6">
        <div className="flex flex-wrap justify-center items-center gap-4 mb-3">
          <a href="/terms" className="text-sm text-muted-foreground hover:text-foreground hover:underline" data-testid="link-footer-terms">Terms of Service</a>
          <span className="text-muted-foreground">|</span>
          <a href="/privacy" className="text-sm text-muted-foreground hover:text-foreground hover:underline" data-testid="link-footer-privacy">Privacy Statement</a>
          <span className="text-muted-foreground">|</span>
          <a href="/guide" className="text-sm text-muted-foreground hover:text-foreground hover:underline" data-testid="link-footer-guide">User Guide</a>
        </div>
        <p className="text-sm text-muted-foreground text-center" data-testid="text-footer">
          &copy; {new Date().getFullYear()} Built by{" "}
          <a
            href="https://trusteditgroup.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium hover:underline"
            data-testid="link-trusted-it-group"
          >
            Trusted IT Group
          </a>
          . All rights reserved.
        </p>
      </footer>
      <style>{`
        @keyframes logoScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-25% - 5rem)); }
        }
        .logo-scroll-track {
          animation: logoScroll 20s linear infinite;
          width: max-content;
        }
        .logo-scroll-track:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
