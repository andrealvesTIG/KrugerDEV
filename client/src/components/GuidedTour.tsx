import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUserJourney } from "@/hooks/use-user-journey";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

interface ConsentStatus {
  currentTermsVersion: string;
  currentPrivacyVersion: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  needsConsent: boolean;
}

interface TourStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar-projects"]',
    title: "Your Projects",
    description: "View and manage all your projects here. Click to see the full project list.",
    position: "right",
  },
  {
    target: '[data-tour="sidebar-portfolios"]',
    title: "Portfolios",
    description: "Group related projects into portfolios for high-level oversight and tracking.",
    position: "right",
  },
  {
    target: '[data-tour="sidebar-dashboard"]',
    title: "Dashboards",
    description: "Get a bird's eye view of your project health, risks, and key metrics.",
    position: "right",
  },
  {
    target: '[data-tour="sidebar-resources"]',
    title: "Team Resources",
    description: "Manage your team members, their skills, availability, and workload.",
    position: "right",
  },
  {
    target: '[data-testid="button-ai-create"]',
    title: "AI-Powered Creation",
    description: "Use AI to quickly create projects, tasks, risks, and more from natural language descriptions.",
    position: "bottom",
  },
];

export function GuidedTour() {
  const { shouldShowTour, completeTour } = useUserJourney();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const { data: consentStatus, isLoading: consentLoading } = useQuery<ConsentStatus>({
    queryKey: ["/api/consents/status"],
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  const consentBlocking = !!user && (consentLoading || consentStatus?.needsConsent === true);

  const positionTooltip = useCallback(() => {
    if (!shouldShowTour || currentStep >= TOUR_STEPS.length) return;
    const step = TOUR_STEPS[currentStep];
    const el = document.querySelector(step.target);
    if (!el) {
      setTooltipPos({ top: window.innerHeight / 2 - 60, left: window.innerWidth / 2 - 160 });
      return;
    }

    const rect = el.getBoundingClientRect();
    let top = 0, left = 0;

    switch (step.position) {
      case "right":
        top = rect.top + rect.height / 2 - 60;
        left = rect.right + 16;
        break;
      case "bottom":
        top = rect.bottom + 16;
        left = rect.left + rect.width / 2 - 160;
        break;
      case "left":
        top = rect.top + rect.height / 2 - 60;
        left = rect.left - 336;
        break;
      case "top":
        top = rect.top - 140;
        left = rect.left + rect.width / 2 - 160;
        break;
    }

    setTooltipPos({
      top: Math.max(8, Math.min(top, window.innerHeight - 180)),
      left: Math.max(8, Math.min(left, window.innerWidth - 340)),
    });
  }, [currentStep, shouldShowTour]);

  useEffect(() => {
    if (!shouldShowTour || consentBlocking) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(timer);
  }, [shouldShowTour, consentBlocking]);

  useEffect(() => {
    if (!visible) return;
    positionTooltip();
    window.addEventListener("resize", positionTooltip);
    return () => window.removeEventListener("resize", positionTooltip);
  }, [visible, positionTooltip]);

  if (!shouldShowTour || consentBlocking || !visible) return null;

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      completeTour();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  const handleSkip = () => {
    completeTour();
  };

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[100]" onClick={handleSkip}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="absolute bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border p-5 w-[320px] animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h3 className="font-semibold text-sm">{step.title}</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-1" onClick={handleSkip}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{step.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {currentStep + 1} of {TOUR_STEPS.length}
          </span>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="ghost" size="sm" onClick={handlePrev}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={handleNext}>
              {isLast ? "Finish" : "Next"}
              {!isLast && <ChevronRight className="h-3.5 w-3.5 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
