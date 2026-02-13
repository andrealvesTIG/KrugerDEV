import { useLocation } from "wouter";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";
import integrationScreenshot from "@assets/b2a9c320-d3a0-40ac-9170-4a10f0a62df0_1771015486477.png";
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

  return (
    <div className="min-h-screen bg-white" data-testid="landing-page">
      <header className="flex items-center justify-between gap-4 flex-wrap px-6 py-4 md:px-12 lg:px-20 border-b border-gray-100">
        <img
          src={logoBlack}
          alt="FridayReport.AI"
          className="h-8 object-contain"
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
              className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-tight"
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
                  <span className="text-base text-gray-700">
                    <strong className="text-gray-900">{prop.bold}</strong>{" "}
                    {prop.rest}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex items-center gap-4 flex-wrap">
              <Button
                size="lg"
                className="text-base px-8 rounded-full"
                onClick={() => setLocation("/auth")}
                data-testid="button-cta"
              >
                Start free. Keep it free forever
              </Button>
            </div>
            <p className="mt-3 text-sm text-gray-500" data-testid="text-no-credit-card">
              Free forever. No credit card.
            </p>
          </div>

          <div className="flex-1 max-w-2xl w-full">
            <div className="rounded-lg shadow-2xl overflow-hidden border border-gray-200">
              <img
                src={integrationScreenshot}
                alt="FridayReport.AI Integration Dashboard - Connect Jira, Asana, Monday.com, Trello, MS Project, and more"
                className="w-full h-auto"
                data-testid="img-integration-screenshot"
              />
            </div>
          </div>
        </section>

        <section className="py-12 border-t border-gray-100 max-w-[1400px] mx-auto">
          <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-8 text-center">
            Our Clients
          </p>
          <div className="relative overflow-hidden" data-testid="logo-belt">
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white to-transparent z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white to-transparent z-10" />
            <div className="logo-scroll-track flex items-center gap-20">
              {[...Array(6)].map((_, setIndex) =>
                clientLogos.map((logo, logoIndex) => (
                  <img
                    key={`${setIndex}-${logoIndex}`}
                    src={logo.src}
                    alt={logo.alt}
                    className="h-8 md:h-10 w-auto object-contain shrink-0 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
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
