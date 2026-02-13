import { useEffect } from "react";
import { useLocation } from "wouter";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  { bold: "Save money.", rest: "All Projects, AI, Integrations + 20 more." },
  { bold: "Save time.", rest: "All teams working together with perfect context." },
  { bold: "Create infinite productivity.", rest: "AI Agents & Workflows." },
];

export default function LandingPageNew() {
  const [, setLocation] = useLocation();

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
      <header className="flex items-center justify-between gap-4 flex-wrap px-6 py-4 md:px-12 lg:px-20 border-b border-border">
        <img
          src={logoBlack}
          alt="FridayReport.AI"
          className="h-8 object-contain dark:invert"
          data-testid="img-logo"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            onClick={() => setLocation("/signin")}
            data-testid="button-login"
          >
            Log in
          </Button>
          <Button
            onClick={() => setLocation("/auth")}
            data-testid="button-signup"
          >
            Sign Up
          </Button>
        </div>
      </header>

      <main className="px-6 md:px-12 lg:px-20">
        <section className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16 py-16 lg:py-24 max-w-[1400px] mx-auto">
          <div className="flex-1 max-w-xl">
            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-headline"
            >
              AI software to
              <br />
              replace all project
              <br />
              tools
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
                onClick={() => setLocation("/auth")}
                data-testid="button-cta"
              >
                Start free. Keep it free forever
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground" data-testid="text-no-credit-card">
              Free forever. No credit card.
            </p>
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
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-8 text-center">
            Our Clients
          </p>
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
      </main>

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
