import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { useSidebarState } from "@/components/layout/Sidebar";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useProjects } from "@/hooks/use-projects";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Play, 
  Pause, 
  RotateCcw,
  FastForward, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Calendar,
  Target,
  Users,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
  LineChart,
  Truck,
  Shield,
  Cpu,
  Cloud,
  Sparkles,
  Globe,
  Newspaper,
  Maximize2,
  Minimize2,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { Portfolio, Project, SimulationRun, SimulationEvent, SimulationSnapshot, ProjectSimState } from "@shared/schema";

interface SimulationState {
  isRunning: boolean;
  isPaused: boolean;
  currentStep: number;
  totalSteps: number;
  speed: number;
  currentDate: Date;
  portfolioHealth: "Green" | "Yellow" | "Red";
  totalBudget: number;
  totalSpent: number;
  totalForecast: number;
  budgetVariance: number;
  scheduleVarianceDays: number;
  projectsOnTrack: number;
  projectsAtRisk: number;
  projectsOffTrack: number;
  openRisks: number;
  triggeredRisks: number;
  openIssues: number;
  completedTasks: number;
  totalTasks: number;
  resourceUtilization: number;
  projectStates: ProjectSimState[];
  events: SimulationEventDisplay[];
}

interface SimulationEventDisplay {
  id: number;
  stepNumber: number;
  eventDate: string;
  eventType: string;
  severity: string;
  sourceName: string;
  projectName: string;
  title: string;
  description: string;
  impactBudget?: number;
  impactScheduleDays?: number;
  impactHealth?: string;
  isNew?: boolean;
}

interface RiskForSim {
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  probability: string;
  impact: string;
  riskScore: number;
  status: string;
}

interface ProjectForSim {
  id: number;
  name: string;
  budget: number;
  actualCost: number;
  forecastCost: number;
  health: string;
  completionPercentage: number;
  startDate: string;
  endDate: string;
  status: string;
}

const PROBABILITY_MAP: Record<string, number> = {
  "Very Low": 0.1,
  "Low": 0.25,
  "Medium": 0.5,
  "High": 0.75,
  "Very High": 0.9
};

const IMPACT_MAP: Record<string, { budget: number; schedule: number }> = {
  "Very Low": { budget: 0.02, schedule: 3 },
  "Low": { budget: 0.05, schedule: 7 },
  "Medium": { budget: 0.1, schedule: 14 },
  "High": { budget: 0.2, schedule: 30 },
  "Very High": { budget: 0.35, schedule: 60 }
};

const TIME_HORIZONS = [
  { value: "1month", label: "1 Month", days: 30, steps: 4 },
  { value: "3months", label: "3 Months (Quarter)", days: 90, steps: 12 },
  { value: "6months", label: "6 Months", days: 180, steps: 24 },
  { value: "1year", label: "1 Year", days: 365, steps: 52 }
];

const SCENARIOS = [
  { value: "optimistic", label: "Optimistic", riskMultiplier: 0.5, varianceRange: 0.05 },
  { value: "baseline", label: "Baseline", riskMultiplier: 1.0, varianceRange: 0.1 },
  { value: "pessimistic", label: "Pessimistic", riskMultiplier: 1.5, varianceRange: 0.2 }
];

const MARKET_NEWS_EVENTS = [
  { 
    category: "economic", 
    title: "Federal Reserve Raises Interest Rates",
    description: "Interest rates increased by 25 basis points, affecting borrowing costs and project financing.",
    severity: "high",
    budgetImpactPercent: 0.03,
    scheduleDays: 0,
    probability: 0.15
  },
  { 
    category: "economic", 
    title: "Inflation Exceeds Expectations",
    description: "Consumer price index rose 0.4% month-over-month, increasing material and labor costs.",
    severity: "medium",
    budgetImpactPercent: 0.025,
    scheduleDays: 0,
    probability: 0.2
  },
  { 
    category: "supply_chain", 
    title: "Global Semiconductor Shortage Worsens",
    description: "Chip delivery times extended by 8-12 weeks affecting technology projects.",
    severity: "critical",
    budgetImpactPercent: 0.08,
    scheduleDays: 21,
    probability: 0.1
  },
  { 
    category: "supply_chain", 
    title: "Major Port Congestion Delays Shipments",
    description: "Container backlog at key ports causing 2-3 week delays in equipment delivery.",
    severity: "high",
    budgetImpactPercent: 0.02,
    scheduleDays: 14,
    probability: 0.12
  },
  { 
    category: "supply_chain", 
    title: "Raw Material Prices Surge",
    description: "Steel and aluminum prices up 15% due to supply constraints.",
    severity: "medium",
    budgetImpactPercent: 0.04,
    scheduleDays: 0,
    probability: 0.18
  },
  { 
    category: "regulatory", 
    title: "New Compliance Requirements Announced",
    description: "Updated industry regulations require additional documentation and review processes.",
    severity: "medium",
    budgetImpactPercent: 0.015,
    scheduleDays: 10,
    probability: 0.08
  },
  { 
    category: "regulatory", 
    title: "Data Privacy Law Takes Effect",
    description: "New privacy regulations require system updates and security audits.",
    severity: "high",
    budgetImpactPercent: 0.035,
    scheduleDays: 14,
    probability: 0.06
  },
  { 
    category: "labor", 
    title: "Tech Talent Market Tightens",
    description: "Industry-wide hiring competition driving up contractor rates by 12%.",
    severity: "medium",
    budgetImpactPercent: 0.05,
    scheduleDays: 7,
    probability: 0.15
  },
  { 
    category: "labor", 
    title: "Key Vendor Announces Layoffs",
    description: "Strategic partner reducing workforce, potential impact on delivery commitments.",
    severity: "high",
    budgetImpactPercent: 0.02,
    scheduleDays: 21,
    probability: 0.07
  },
  { 
    category: "market", 
    title: "Competitor Launches Similar Product",
    description: "Market pressure to accelerate timeline and add features.",
    severity: "high",
    budgetImpactPercent: 0.06,
    scheduleDays: -14,
    probability: 0.1
  },
  { 
    category: "market", 
    title: "Customer Demand Exceeds Forecast",
    description: "Positive market response requiring capacity expansion.",
    severity: "low",
    budgetImpactPercent: 0.04,
    scheduleDays: 7,
    probability: 0.12
  },
  { 
    category: "technology", 
    title: "Critical Security Vulnerability Discovered",
    description: "Industry-wide CVE requires immediate patching and security review.",
    severity: "critical",
    budgetImpactPercent: 0.025,
    scheduleDays: 7,
    probability: 0.08
  },
  { 
    category: "technology", 
    title: "Cloud Provider Outage Impacts Services",
    description: "Major cloud platform experiencing degraded performance in multiple regions.",
    severity: "high",
    budgetImpactPercent: 0.01,
    scheduleDays: 3,
    probability: 0.05
  },
  { 
    category: "weather", 
    title: "Severe Weather Disrupts Operations",
    description: "Hurricane/winter storm affecting key facilities and team availability.",
    severity: "high",
    budgetImpactPercent: 0.015,
    scheduleDays: 5,
    probability: 0.06
  },
  { 
    category: "economic", 
    title: "Currency Exchange Rate Volatility",
    description: "USD strengthening against international currencies affecting global contracts.",
    severity: "medium",
    budgetImpactPercent: 0.03,
    scheduleDays: 0,
    probability: 0.1
  },
  { 
    category: "positive", 
    title: "Government Incentive Program Announced",
    description: "New tax credits available for qualifying technology investments.",
    severity: "low",
    budgetImpactPercent: -0.05,
    scheduleDays: 0,
    probability: 0.05
  },
  { 
    category: "positive", 
    title: "Strategic Partnership Opportunity",
    description: "Potential collaboration could accelerate delivery and reduce costs.",
    severity: "low",
    budgetImpactPercent: -0.03,
    scheduleDays: -7,
    probability: 0.08
  },
  { 
    category: "positive", 
    title: "Breakthrough Technology Available",
    description: "New tool/framework can significantly improve team productivity.",
    severity: "low",
    budgetImpactPercent: -0.02,
    scheduleDays: -5,
    probability: 0.1
  }
];

const EVENT_CATEGORY_ICONS: Record<string, string> = {
  economic: "TrendingUp",
  supply_chain: "Truck",
  regulatory: "Shield",
  labor: "Users",
  market: "BarChart",
  technology: "Cpu",
  weather: "Cloud",
  positive: "Sparkles",
  risk: "AlertTriangle"
};

function getEventCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    economic: "Economic News",
    supply_chain: "Supply Chain",
    regulatory: "Regulatory",
    labor: "Labor Market",
    market: "Market News",
    technology: "Technology",
    weather: "Weather Event",
    positive: "Opportunity",
    risk: "Risk Triggered"
  };
  return labels[category] || category;
}

function EventCategoryIcon({ category, className }: { category: string; className?: string }) {
  switch (category) {
    case "economic": return <TrendingUp className={className} />;
    case "supply_chain": return <Truck className={className} />;
    case "regulatory": return <Shield className={className} />;
    case "labor": return <Users className={className} />;
    case "market": return <Globe className={className} />;
    case "technology": return <Cpu className={className} />;
    case "weather": return <Cloud className={className} />;
    case "positive": return <Sparkles className={className} />;
    case "risk": return <AlertTriangle className={className} />;
    default: return <Newspaper className={className} />;
  }
}

function getHealthColor(health: string) {
  switch (health) {
    case "Green": return "bg-green-500 dark:bg-green-400";
    case "Yellow": return "bg-yellow-500 dark:bg-yellow-400";
    case "Red": return "bg-red-500 dark:bg-red-400";
    default: return "bg-gray-500 dark:bg-gray-400";
  }
}

function getHealthBadgeVariant(health: string): "default" | "secondary" | "destructive" | "outline" {
  switch (health) {
    case "Green": return "default";
    case "Yellow": return "secondary";
    case "Red": return "destructive";
    default: return "outline";
  }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case "critical": return "text-red-600 dark:text-red-400 bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800";
    case "high": return "text-orange-600 dark:text-orange-400 bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800";
    case "medium": return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800";
    case "low": return "text-blue-600 dark:text-blue-400 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800";
    default: return "text-gray-600 dark:text-gray-400 bg-gray-50 border-gray-200 dark:bg-gray-950 dark:border-gray-800";
  }
}

function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0, className }: { 
  value: number; 
  prefix?: string; 
  suffix?: string; 
  decimals?: number;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  
  useEffect(() => {
    const diff = value - previousValue.current;
    if (Math.abs(diff) > 0.01) {
      const steps = 20;
      const stepValue = diff / steps;
      let current = previousValue.current;
      let step = 0;
      
      const interval = setInterval(() => {
        step++;
        current += stepValue;
        setDisplayValue(current);
        if (step >= steps) {
          setDisplayValue(value);
          clearInterval(interval);
        }
      }, 25);
      
      previousValue.current = value;
      return () => clearInterval(interval);
    } else {
      setDisplayValue(value);
      previousValue.current = value;
    }
  }, [value]);
  
  const isIncreasing = value > previousValue.current;
  
  return (
    <span className={cn("transition-colors duration-300", className)}>
      {prefix}{displayValue.toFixed(decimals)}{suffix}
    </span>
  );
}

function KPICard({ 
  title, 
  value, 
  prefix = "", 
  suffix = "",
  formatValue,
  icon: Icon, 
  trend,
  trendValue,
  className,
  pulse,
  testId
}: { 
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  formatValue?: (value: number) => string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  className?: string;
  pulse?: boolean;
  testId?: string;
}) {
  return (
    <Card className={cn("relative overflow-visible", pulse && "ring-2 ring-primary ring-offset-2 animate-pulse", className)} data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-md bg-muted">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">{title}</span>
          </div>
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs",
              trend === "up" ? "text-green-600 dark:text-green-400" : trend === "down" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
            )}>
              {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : trend === "down" ? <ArrowDownRight className="h-3 w-3" /> : null}
              {trendValue}
            </div>
          )}
        </div>
        <div className="mt-2" data-testid={testId ? `${testId}-value` : undefined}>
          {formatValue ? (
            <span className="text-2xl font-bold">{formatValue(value)}</span>
          ) : (
            <AnimatedNumber 
              value={value} 
              prefix={prefix} 
              suffix={suffix}
              decimals={suffix === "%" ? 1 : 0}
              className="text-2xl font-bold"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EventNotification({ event, onDismiss }: { event: SimulationEventDisplay; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div 
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border animate-in slide-in-from-right duration-300",
        getSeverityColor(event.severity)
      )}
      data-testid={`notification-event-${event.id}`}
    >
      <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm" data-testid={`text-event-title-${event.id}`}>{event.title}</span>
          <Badge variant="outline" className="text-xs">
            {event.projectName}
          </Badge>
        </div>
        <p className="text-xs mt-1 opacity-80">{event.description}</p>
        <div className="flex items-center gap-3 mt-2 text-xs opacity-70">
          {event.impactBudget && (
            <span className="flex items-center gap-1" data-testid={`text-impact-budget-${event.id}`}>
              <DollarSign className="h-3 w-3" />
              +{formatCurrency(event.impactBudget, { compact: true })}
            </span>
          )}
          {event.impactScheduleDays && (
            <span className="flex items-center gap-1" data-testid={`text-impact-schedule-${event.id}`}>
              <Clock className="h-3 w-3" />
              +{event.impactScheduleDays} days
            </span>
          )}
        </div>
      </div>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={onDismiss} 
        className="flex-shrink-0"
        data-testid={`button-dismiss-event-${event.id}`}
      >
        <XCircle className="h-4 w-4" />
      </Button>
    </div>
  );
}

function TimelineScrubber({ 
  currentStep, 
  totalSteps, 
  startDate, 
  endDate, 
  onSeek,
  events 
}: { 
  currentStep: number;
  totalSteps: number;
  startDate: Date;
  endDate: Date;
  onSeek: (step: number) => void;
  events: SimulationEventDisplay[];
}) {
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
  const currentDate = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) * (currentStep / totalSteps));
  
  const eventPositions = events.map(e => ({
    position: (e.stepNumber / totalSteps) * 100,
    severity: e.severity
  }));

  return (
    <div className="space-y-2" data-testid="timeline-scrubber">
      <div className="flex items-center justify-between text-sm text-muted-foreground gap-2 flex-wrap">
        <span data-testid="text-start-date">{startDate.toLocaleDateString()}</span>
        <span className="font-medium text-foreground" data-testid="text-current-date">
          {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <span data-testid="text-end-date">{endDate.toLocaleDateString()}</span>
      </div>
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${progress}%` }}
            data-testid="progress-bar"
          />
        </div>
        {eventPositions.map((ep, i) => (
          <div
            key={i}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background",
              ep.severity === "critical" ? "bg-destructive" :
              ep.severity === "high" ? "bg-orange-500 dark:bg-orange-400" :
              ep.severity === "medium" ? "bg-yellow-500 dark:bg-yellow-400" : "bg-blue-500 dark:bg-blue-400"
            )}
            style={{ left: `${ep.position}%`, marginLeft: "-6px" }}
            data-testid={`timeline-event-marker-${i}`}
          />
        ))}
        <Slider
          value={[currentStep]}
          max={totalSteps}
          step={1}
          onValueChange={([v]) => onSeek(v)}
          className="absolute inset-0"
          data-testid="slider-timeline"
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
        <span data-testid="text-current-step">Step {currentStep} of {totalSteps}</span>
        <span data-testid="text-progress-percent">{Math.round(progress)}% complete</span>
      </div>
    </div>
  );
}

function ProjectHealthChart({ projectStates }: { projectStates: ProjectSimState[] }) {
  const healthCounts = {
    Green: projectStates.filter(p => p.health === "Green").length,
    Yellow: projectStates.filter(p => p.health === "Yellow").length,
    Red: projectStates.filter(p => p.health === "Red").length
  };
  const total = projectStates.length || 1;

  return (
    <div className="space-y-3" data-testid="chart-health-distribution">
      <div className="flex gap-1 h-6 rounded-md overflow-hidden">
        {healthCounts.Green > 0 && (
          <div 
            className="bg-green-500 dark:bg-green-400 transition-all duration-500"
            style={{ width: `${(healthCounts.Green / total) * 100}%` }}
            data-testid="health-bar-green"
          />
        )}
        {healthCounts.Yellow > 0 && (
          <div 
            className="bg-yellow-500 dark:bg-yellow-400 transition-all duration-500"
            style={{ width: `${(healthCounts.Yellow / total) * 100}%` }}
            data-testid="health-bar-yellow"
          />
        )}
        {healthCounts.Red > 0 && (
          <div 
            className="bg-red-500 dark:bg-red-400 transition-all duration-500"
            style={{ width: `${(healthCounts.Red / total) * 100}%` }}
            data-testid="health-bar-red"
          />
        )}
      </div>
      <div className="flex items-center justify-center gap-4 flex-wrap text-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500 dark:bg-green-400" />
          <span data-testid="text-count-on-track">{healthCounts.Green} On Track</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-500 dark:bg-yellow-400" />
          <span data-testid="text-count-at-risk">{healthCounts.Yellow} At Risk</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500 dark:bg-red-400" />
          <span data-testid="text-count-off-track">{healthCounts.Red} Off Track</span>
        </div>
      </div>
    </div>
  );
}

export default function Simulation() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const runStepRef = useRef<() => void>(() => {});
  
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("all");
  const [timeHorizon, setTimeHorizon] = useState("3months");
  const [scenario, setScenario] = useState("baseline");
  const [activeNotifications, setActiveNotifications] = useState<SimulationEventDisplay[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { isCollapsed: sidebarCollapsed, setIsCollapsed: setSidebarCollapsed } = useSidebarState();
  const sidebarWasCollapsed = useRef(false);
  
  const [simState, setSimState] = useState<SimulationState>({
    isRunning: false,
    isPaused: false,
    currentStep: 0,
    totalSteps: 0,
    speed: 1,
    currentDate: new Date(),
    portfolioHealth: "Green",
    totalBudget: 0,
    totalSpent: 0,
    totalForecast: 0,
    budgetVariance: 0,
    scheduleVarianceDays: 0,
    projectsOnTrack: 0,
    projectsAtRisk: 0,
    projectsOffTrack: 0,
    openRisks: 0,
    triggeredRisks: 0,
    openIssues: 0,
    completedTasks: 0,
    totalTasks: 0,
    resourceUtilization: 0,
    projectStates: [],
    events: []
  });

  const [initialProjectStates, setInitialProjectStates] = useState<ProjectSimState[]>([]);
  const [risks, setRisks] = useState<RiskForSim[]>([]);

  const { data: portfoliosData } = usePortfolios(currentOrganization?.id);
  const portfolios = portfoliosData || [];

  const { data: projectsDataRaw } = useProjects(currentOrganization?.id);
  const projectsData = projectsDataRaw || [];

  const { data: risksData = [] } = useQuery<any[]>({
    queryKey: ["/api/issues", { itemType: "risk", organizationId: currentOrganization?.id }],
    enabled: !!currentOrganization?.id
  });

  const filteredProjects = selectedPortfolioId === "all" 
    ? projectsData.filter(p => p.status !== "Closing" && !p.deletedAt)
    : projectsData.filter(p => p.portfolioId === parseInt(selectedPortfolioId) && p.status !== "Closing" && !p.deletedAt);

  const initializeSimulation = useCallback(() => {
    const horizon = TIME_HORIZONS.find(h => h.value === timeHorizon)!;
    const scenarioConfig = SCENARIOS.find(s => s.value === scenario)!;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + horizon.days * 24 * 60 * 60 * 1000);

    const projectStates: ProjectSimState[] = filteredProjects.map(p => ({
      projectId: p.id,
      projectName: p.name,
      health: p.health || "Green",
      budget: parseFloat(String(p.budget)) || 0,
      spent: parseFloat(String(p.actualCost)) || 0,
      forecast: parseFloat(String(p.forecastCost || p.budget)) || 0,
      completionPercentage: p.completionPercentage || 0,
      scheduleVarianceDays: p.scheduleVariance || 0,
      costVariance: parseFloat(String(p.costVariance)) || 0
    }));

    const projectRisks: RiskForSim[] = risksData
      .filter(r => r.itemType === "risk" && r.status !== "Closed" && r.status !== "Mitigated")
      .filter(r => {
        const project = filteredProjects.find(p => p.id === r.projectId);
        return !!project;
      })
      .map(r => {
        const project = filteredProjects.find(p => p.id === r.projectId);
        return {
          id: r.id,
          projectId: r.projectId,
          projectName: project?.name || "Unknown",
          title: r.title,
          probability: r.probability || "Medium",
          impact: r.impact || "Medium",
          riskScore: r.riskScore || 5,
          status: r.status
        };
      });

    setRisks(projectRisks);
    setInitialProjectStates(projectStates);

    const totalBudget = projectStates.reduce((sum, p) => sum + p.budget, 0);
    const totalSpent = projectStates.reduce((sum, p) => sum + p.spent, 0);
    const totalForecast = projectStates.reduce((sum, p) => sum + p.forecast, 0);

    setSimState({
      isRunning: false,
      isPaused: false,
      currentStep: 0,
      totalSteps: horizon.steps,
      speed: 1,
      currentDate: startDate,
      portfolioHealth: "Green",
      totalBudget,
      totalSpent,
      totalForecast,
      budgetVariance: 0,
      scheduleVarianceDays: 0,
      projectsOnTrack: projectStates.filter(p => p.health === "Green").length,
      projectsAtRisk: projectStates.filter(p => p.health === "Yellow").length,
      projectsOffTrack: projectStates.filter(p => p.health === "Red").length,
      openRisks: projectRisks.length,
      triggeredRisks: 0,
      openIssues: 0,
      completedTasks: 0,
      totalTasks: 100,
      resourceUtilization: 75,
      projectStates,
      events: []
    });
  }, [filteredProjects, risksData, timeHorizon, scenario]);

  useEffect(() => {
    if (filteredProjects.length > 0 && !simState.isRunning) {
      initializeSimulation();
    }
  }, [selectedPortfolioId, timeHorizon, scenario, filteredProjects.length]);

  const runSimulationStep = useCallback(() => {
    setSimState(prev => {
      if (prev.currentStep >= prev.totalSteps) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return { ...prev, isRunning: false };
      }

      const scenarioConfig = SCENARIOS.find(s => s.value === scenario)!;
      const horizon = TIME_HORIZONS.find(h => h.value === timeHorizon)!;
      const stepDays = horizon.days / horizon.steps;
      const newStep = prev.currentStep + 1;
      const stepProgress = newStep / prev.totalSteps;
      
      const newDate = new Date(prev.currentDate.getTime() + stepDays * 24 * 60 * 60 * 1000);
      const newEvents: SimulationEventDisplay[] = [...prev.events];
      let newTriggeredRisks = prev.triggeredRisks;
      let newOpenIssues = prev.openIssues;

      // Check for market/news events (portfolio-wide impacts)
      let marketBudgetImpact = 0;
      let marketScheduleImpact = 0;
      
      MARKET_NEWS_EVENTS.forEach(marketEvent => {
        const adjustedProbability = marketEvent.probability * scenarioConfig.riskMultiplier * 0.15;
        
        if (Math.random() < adjustedProbability) {
          const portfolioBudget = prev.totalBudget;
          const budgetImpact = portfolioBudget * marketEvent.budgetImpactPercent;
          const scheduleImpact = marketEvent.scheduleDays;
          
          marketBudgetImpact += budgetImpact;
          marketScheduleImpact += scheduleImpact;
          
          if (budgetImpact > 0) {
            newTriggeredRisks++;
          }
          
          const newEvent: SimulationEventDisplay = {
            id: Date.now() + Math.random(),
            stepNumber: newStep,
            eventDate: newDate.toISOString(),
            eventType: marketEvent.category,
            severity: marketEvent.severity,
            sourceName: getEventCategoryLabel(marketEvent.category),
            projectName: "All Projects",
            title: marketEvent.title,
            description: marketEvent.description,
            impactBudget: Math.abs(budgetImpact) > 0 ? budgetImpact : undefined,
            impactScheduleDays: scheduleImpact !== 0 ? scheduleImpact : undefined,
            isNew: true
          };
          
          newEvents.push(newEvent);
          setActiveNotifications(n => [...n, newEvent]);
        }
      });

      const newProjectStates = prev.projectStates.map(ps => {
        let newPs = { ...ps };
        
        // Apply market-wide impacts proportionally to each project
        if (marketBudgetImpact !== 0) {
          const projectShare = ps.budget / prev.totalBudget;
          newPs.spent += marketBudgetImpact * projectShare;
          newPs.forecast += marketBudgetImpact * projectShare * 0.9;
        }
        if (marketScheduleImpact !== 0) {
          newPs.scheduleVarianceDays += Math.round(marketScheduleImpact * (0.7 + Math.random() * 0.3));
        }
        
        const projectRisks = risks.filter(r => r.projectId === ps.projectId);
        projectRisks.forEach(risk => {
          const baseProbability = PROBABILITY_MAP[risk.probability] || 0.5;
          const adjustedProbability = baseProbability * scenarioConfig.riskMultiplier * 0.1;
          
          if (Math.random() < adjustedProbability) {
            const impact = IMPACT_MAP[risk.impact] || IMPACT_MAP["Medium"];
            const budgetImpact = ps.budget * impact.budget * (0.5 + Math.random() * 0.5);
            const scheduleImpact = Math.round(impact.schedule * (0.5 + Math.random() * 0.5));

            newPs.spent += budgetImpact;
            newPs.forecast += budgetImpact * 0.8;
            newPs.scheduleVarianceDays += scheduleImpact;
            newPs.costVariance = newPs.spent - newPs.budget * stepProgress;

            if (newPs.scheduleVarianceDays > 14 || newPs.costVariance > newPs.budget * 0.1) {
              newPs.health = newPs.scheduleVarianceDays > 30 || newPs.costVariance > newPs.budget * 0.2 ? "Red" : "Yellow";
            }

            newTriggeredRisks++;
            
            const eventSeverity = risk.impact === "Very High" || risk.impact === "High" ? "critical" :
                                  risk.impact === "Medium" ? "high" : "medium";

            const newEvent: SimulationEventDisplay = {
              id: Date.now() + Math.random(),
              stepNumber: newStep,
              eventDate: newDate.toISOString(),
              eventType: "risk",
              severity: eventSeverity,
              sourceName: risk.title,
              projectName: ps.projectName,
              title: `Risk Triggered: ${risk.title}`,
              description: `Risk "${risk.title}" has materialized on project "${ps.projectName}", causing budget and schedule impacts.`,
              impactBudget: budgetImpact,
              impactScheduleDays: scheduleImpact,
              impactHealth: newPs.health,
              isNew: true
            };
            
            newEvents.push(newEvent);
            
            setActiveNotifications(n => [...n, newEvent]);
          }
        });

        // Update health based on cumulative impacts
        newPs.costVariance = newPs.spent - newPs.budget * stepProgress;
        if (newPs.scheduleVarianceDays > 14 || newPs.costVariance > newPs.budget * 0.1) {
          newPs.health = newPs.scheduleVarianceDays > 30 || newPs.costVariance > newPs.budget * 0.2 ? "Red" : "Yellow";
        } else if (newPs.scheduleVarianceDays < 0 && newPs.costVariance < 0) {
          newPs.health = "Green";
        }

        const burnRate = (newPs.budget / prev.totalSteps) * (1 + (Math.random() - 0.5) * scenarioConfig.varianceRange);
        newPs.spent += burnRate * 0.3;
        newPs.completionPercentage = Math.min(100, Math.round(stepProgress * 100 + (Math.random() - 0.5) * 10));

        return newPs;
      });

      const newTotalSpent = newProjectStates.reduce((sum, p) => sum + p.spent, 0);
      const newTotalForecast = newProjectStates.reduce((sum, p) => sum + p.forecast, 0);
      const budgetVariance = ((newTotalForecast - prev.totalBudget) / prev.totalBudget) * 100;
      const scheduleVarianceDays = Math.round(newProjectStates.reduce((sum, p) => sum + p.scheduleVarianceDays, 0) / newProjectStates.length);

      const redCount = newProjectStates.filter(p => p.health === "Red").length;
      const yellowCount = newProjectStates.filter(p => p.health === "Yellow").length;
      const portfolioHealth: "Green" | "Yellow" | "Red" = 
        redCount > newProjectStates.length * 0.3 ? "Red" :
        redCount > 0 || yellowCount > newProjectStates.length * 0.3 ? "Yellow" : "Green";

      return {
        ...prev,
        currentStep: newStep,
        currentDate: newDate,
        portfolioHealth,
        totalSpent: newTotalSpent,
        totalForecast: newTotalForecast,
        budgetVariance,
        scheduleVarianceDays,
        projectsOnTrack: newProjectStates.filter(p => p.health === "Green").length,
        projectsAtRisk: newProjectStates.filter(p => p.health === "Yellow").length,
        projectsOffTrack: newProjectStates.filter(p => p.health === "Red").length,
        triggeredRisks: newTriggeredRisks,
        openIssues: newOpenIssues,
        completedTasks: Math.round(100 * stepProgress),
        resourceUtilization: 75 + (Math.random() - 0.5) * 20,
        projectStates: newProjectStates,
        events: newEvents
      };
    });
  }, [risks, scenario, timeHorizon]);

  runStepRef.current = runSimulationStep;

  const startSimulation = useCallback(() => {
    if (simState.currentStep === 0) {
      initializeSimulation();
    }
    
    setSimState(prev => ({ ...prev, isRunning: true, isPaused: false }));
    
    const intervalMs = 1000 / simState.speed;
    intervalRef.current = setInterval(() => runStepRef.current(), intervalMs);
  }, [initializeSimulation, simState.speed, simState.currentStep]);

  const pauseSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSimState(prev => ({ ...prev, isPaused: true, isRunning: false }));
  }, []);

  const resetSimulation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setActiveNotifications([]);
    initializeSimulation();
  }, [initializeSimulation]);

  const seekToStep = useCallback((step: number) => {
    if (simState.isRunning) {
      pauseSimulation();
    }
    resetSimulation();
    for (let i = 0; i < step; i++) {
      runSimulationStep();
    }
  }, [simState.isRunning, pauseSimulation, resetSimulation, runSimulationStep]);

  const setSpeed = useCallback((newSpeed: number) => {
    setSimState(prev => ({ ...prev, speed: newSpeed }));
    if (simState.isRunning && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => runStepRef.current(), 1000 / newSpeed);
    }
  }, [simState.isRunning]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const dismissNotification = useCallback((id: number) => {
    setActiveNotifications(n => n.filter(e => e.id !== id));
  }, []);

  const horizon = TIME_HORIZONS.find(h => h.value === timeHorizon)!;
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + horizon.days * 24 * 60 * 60 * 1000);

  const simulationContent = (
    <>
      <div className={cn(
        "flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur sticky top-0 z-10 gap-4 flex-wrap",
        isFullscreen && "bg-background"
      )}>
        <div className="flex items-center gap-4">
          {isFullscreen && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => {
                setSidebarCollapsed(sidebarWasCollapsed.current);
                setIsFullscreen(false);
              }}
              data-testid="button-exit-fullscreen"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Portfolio Simulation</h1>
            <p className="text-sm text-muted-foreground">Run what-if scenarios to forecast project outcomes</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedPortfolioId} onValueChange={setSelectedPortfolioId}>
            <SelectTrigger className="w-[200px]" data-testid="select-portfolio">
              <SelectValue placeholder="Select Portfolio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="option-portfolio-all">All Projects</SelectItem>
              {portfolios.map(p => (
                <SelectItem key={p.id} value={String(p.id)} data-testid={`option-portfolio-${p.id}`}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={timeHorizon} onValueChange={setTimeHorizon}>
            <SelectTrigger className="w-[160px]" data-testid="select-horizon">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_HORIZONS.map(h => (
                <SelectItem key={h.value} value={h.value} data-testid={`option-horizon-${h.value}`}>{h.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={scenario} onValueChange={setScenario}>
            <SelectTrigger className="w-[140px]" data-testid="select-scenario">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCENARIOS.map(s => (
                <SelectItem key={s.value} value={s.value} data-testid={`option-scenario-${s.value}`}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (isFullscreen) {
                setSidebarCollapsed(sidebarWasCollapsed.current);
                setIsFullscreen(false);
              } else {
                sidebarWasCollapsed.current = sidebarCollapsed;
                setSidebarCollapsed(true);
                setIsFullscreen(true);
              }
            }}
            data-testid="button-fullscreen-toggle"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {!simState.isRunning ? (
                  <Button onClick={startSimulation} data-testid="button-play">
                    <Play className="h-4 w-4 mr-2" />
                    {simState.currentStep > 0 ? "Resume" : "Start Simulation"}
                  </Button>
                ) : (
                  <Button onClick={pauseSimulation} variant="secondary" data-testid="button-pause">
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </Button>
                )}
                <Button onClick={resetSimulation} variant="outline" data-testid="button-reset">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Speed:</span>
                <div className="flex items-center gap-1">
                  {[0.5, 1, 2, 4].map(s => (
                    <Button 
                      key={s}
                      variant={simState.speed === s ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSpeed(s)}
                      data-testid={`button-speed-${s}`}
                    >
                      {s}x
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <div 
                  className={cn(
                    "px-3 py-1.5 rounded-full flex items-center gap-2 text-sm font-medium",
                    simState.isRunning ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                    simState.isPaused ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                    "bg-muted text-muted-foreground"
                  )}
                  data-testid="status-simulation"
                >
                  <Activity className={cn("h-4 w-4", simState.isRunning && "animate-pulse")} />
                  {simState.isRunning ? "Running" : simState.isPaused ? "Paused" : "Ready"}
                </div>
                <Badge variant={getHealthBadgeVariant(simState.portfolioHealth)} className="px-3 py-1" data-testid="badge-portfolio-health">
                  Portfolio: {simState.portfolioHealth}
                </Badge>
              </div>
            </div>

            <TimelineScrubber
              currentStep={simState.currentStep}
              totalSteps={simState.totalSteps}
              startDate={startDate}
              endDate={endDate}
              onSeek={seekToStep}
              events={simState.events}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <KPICard
            title="Total Budget"
            value={simState.totalBudget}
            formatValue={(v) => formatCurrency(v, { compact: true })}
            icon={DollarSign}
            testId="card-kpi-budget"
          />
          <KPICard
            title="Spent to Date"
            value={simState.totalSpent}
            formatValue={(v) => formatCurrency(v, { compact: true })}
            icon={TrendingUp}
            trend={simState.totalSpent > simState.totalBudget * (simState.currentStep / simState.totalSteps) ? "down" : "up"}
            pulse={simState.totalSpent > simState.totalBudget * 0.9}
            testId="card-kpi-spent"
          />
          <KPICard
            title="Forecast"
            value={simState.totalForecast}
            formatValue={(v) => formatCurrency(v, { compact: true })}
            icon={Target}
            trend={simState.budgetVariance > 5 ? "down" : simState.budgetVariance < -5 ? "up" : "neutral"}
            trendValue={formatPercent(simState.budgetVariance, { showSign: true })}
            testId="card-kpi-forecast"
          />
          <KPICard
            title="Schedule Variance"
            value={simState.scheduleVarianceDays}
            suffix=" days"
            icon={Calendar}
            trend={simState.scheduleVarianceDays > 7 ? "down" : simState.scheduleVarianceDays < 0 ? "up" : "neutral"}
            testId="card-kpi-schedule"
          />
          <KPICard
            title="Risks Triggered"
            value={simState.triggeredRisks}
            icon={AlertTriangle}
            pulse={simState.triggeredRisks > 0 && simState.events.some(e => e.isNew)}
            testId="card-kpi-risks"
          />
          <KPICard
            title="Resource Util."
            value={simState.resourceUtilization}
            suffix="%"
            icon={Users}
            trend={simState.resourceUtilization > 90 ? "down" : "neutral"}
            testId="card-kpi-resources"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Project Health Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectHealthChart projectStates={simState.projectStates} />
              <div className="mt-4 max-h-[300px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Project</th>
                      <th className="text-center py-2 font-medium">Health</th>
                      <th className="text-right py-2 font-medium">Budget</th>
                      <th className="text-right py-2 font-medium">Spent</th>
                      <th className="text-right py-2 font-medium">Variance</th>
                      <th className="text-right py-2 font-medium">Schedule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simState.projectStates.map(ps => (
                      <tr key={ps.projectId} className="border-b last:border-0" data-testid={`row-project-${ps.projectId}`}>
                        <td className="py-2 font-medium">{ps.projectName}</td>
                        <td className="py-2 text-center">
                          <Badge variant={getHealthBadgeVariant(ps.health)} className="text-xs">
                            {ps.health}
                          </Badge>
                        </td>
                        <td className="py-2 text-right">{formatCurrency(ps.budget, { compact: true })}</td>
                        <td className="py-2 text-right">{formatCurrency(ps.spent, { compact: true })}</td>
                        <td className={cn(
                          "py-2 text-right",
                          ps.costVariance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                        )}>
                          {formatPercent((ps.costVariance / ps.budget) * 100, { showSign: true })}
                        </td>
                        <td className={cn(
                          "py-2 text-right",
                          ps.scheduleVarianceDays > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                        )}>
                          {ps.scheduleVarianceDays > 0 ? "+" : ""}{ps.scheduleVarianceDays}d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-event-log">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Event Log
                {simState.events.length > 0 && (
                  <Badge variant="secondary" className="ml-2" data-testid="badge-event-count">{simState.events.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]" data-testid="scrollarea-events">
                {simState.events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground" data-testid="text-empty-events">
                    <AlertCircle className="h-8 w-8 mb-2" />
                    <p className="text-sm">No events yet. Start the simulation.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...simState.events].reverse().map(event => (
                      <div
                        key={event.id}
                        className={cn(
                          "p-3 rounded-lg border text-sm",
                          getSeverityColor(event.severity),
                          event.isNew && "animate-in fade-in slide-in-from-top-2"
                        )}
                        data-testid={`card-event-${event.id}`}
                      >
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <EventCategoryIcon category={event.eventType} className="h-4 w-4 flex-shrink-0" />
                            <span className="font-medium">{event.title}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {getEventCategoryLabel(event.eventType)}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              Step {event.stepNumber}
                            </Badge>
                          </div>
                        </div>
                        <p className="mt-1 text-xs opacity-80">{event.description}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs opacity-70 flex-wrap">
                          <span className="font-medium">{event.projectName}</span>
                          {event.impactBudget !== undefined && (
                            <span className={cn(
                              "flex items-center gap-1",
                              event.impactBudget < 0 ? "text-green-600 dark:text-green-400" : ""
                            )}>
                              <DollarSign className="h-3 w-3" />
                              {event.impactBudget > 0 ? "+" : ""}{formatCurrency(event.impactBudget, { compact: true })}
                            </span>
                          )}
                          {event.impactScheduleDays !== undefined && event.impactScheduleDays !== 0 && (
                            <span className={cn(
                              "flex items-center gap-1",
                              event.impactScheduleDays < 0 ? "text-green-600 dark:text-green-400" : ""
                            )}>
                              <Clock className="h-3 w-3" />
                              {event.impactScheduleDays > 0 ? "+" : ""}{event.impactScheduleDays}d
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {simState.currentStep >= simState.totalSteps && simState.totalSteps > 0 && (
          <Card className="border-primary" data-testid="card-simulation-complete">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Simulation Complete - {SCENARIOS.find(s => s.value === scenario)?.label} Scenario
              </CardTitle>
              <CardDescription>
                {horizon.label} simulation finished with {simState.events.length} events triggered
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted" data-testid="summary-on-track">
                  <div className="text-2xl font-bold">{simState.projectsOnTrack}</div>
                  <div className="text-sm text-muted-foreground">Projects On Track</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted" data-testid="summary-at-risk">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{simState.projectsAtRisk}</div>
                  <div className="text-sm text-muted-foreground">Projects At Risk</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted" data-testid="summary-off-track">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">{simState.projectsOffTrack}</div>
                  <div className="text-sm text-muted-foreground">Projects Off Track</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted" data-testid="summary-risks">
                  <div className="text-2xl font-bold">{simState.triggeredRisks}</div>
                  <div className="text-sm text-muted-foreground">Risks Materialized</div>
                </div>
              </div>
              <div className="mt-4 p-4 rounded-lg bg-muted">
                <h4 className="font-medium mb-2">Summary</h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>Budget variance: <span className={simState.budgetVariance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"} data-testid="text-final-budget-variance">
                    {simState.budgetVariance > 0 ? "+" : ""}{simState.budgetVariance.toFixed(1)}%
                  </span></li>
                  <li>Average schedule slippage: <span className={simState.scheduleVarianceDays > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"} data-testid="text-final-schedule-variance">
                    {simState.scheduleVarianceDays} days
                  </span></li>
                  <li>Final portfolio health: <Badge variant={getHealthBadgeVariant(simState.portfolioHealth)} data-testid="badge-final-health">
                    {simState.portfolioHealth}
                  </Badge></li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="fixed bottom-4 right-4 space-y-2 max-w-sm z-50">
        {activeNotifications.slice(-3).map(event => (
          <EventNotification 
            key={event.id} 
            event={event}
            onDismiss={() => dismissNotification(event.id)}
          />
        ))}
      </div>
    </>
  );

  if (isFullscreen) {
    return (
      <div 
        className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden"
        data-testid="simulation-fullscreen"
      >
        {simulationContent}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {simulationContent}
    </div>
  );
}