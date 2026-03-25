import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search, ChevronDown, ChevronRight, Download, CheckCircle2, XCircle, AlertTriangle,
  Trophy, Target, Shield, BarChart3, Briefcase, Clock, AlertOctagon, GitBranch,
  LineChart, DollarSign, Plug, Settings, Monitor, Layers, Star
} from "lucide-react";
import { SiOracle, SiAsana, SiJira } from "react-icons/si";
import fridayLogo from "../assets/logo-icon.png";
import plannerLogo from "@/assets/planner-logo.png";
import smartsheetLogo from "@assets/image_1771603681527.png";
import mondayLogo from "@assets/image_1771691018717.png";

type Status = "yes" | "partial" | "no";

interface Feature {
  name: string;
  values: Status[];
}

interface Category {
  name: string;
  icon: typeof Trophy;
  features: Feature[];
}

const TOOLS = [
  "FridayReport.AI",
  "Oracle Primavera P6",
  "MS Planner",
  "Smartsheet",
  "Monday.com",
  "Asana",
  "Jira",
];

const TOOL_COLORS: Record<string, string> = {
  "FridayReport.AI": "bg-blue-600",
  "Oracle Primavera P6": "bg-red-600",
  "MS Planner": "bg-sky-500",
  "Smartsheet": "bg-indigo-600",
  "Monday.com": "bg-pink-500",
  "Asana": "bg-orange-500",
  "Jira": "bg-blue-500",
};

function ToolLogo({ tool, size = "md" }: { tool: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const textSize = size === "sm" ? "text-[8px]" : "text-[10px]";

  const brandIcon: Record<string, JSX.Element> = {
    "FridayReport.AI": (
      <img src={fridayLogo} alt="FridayReport.AI" className={`${dim} rounded-lg object-contain shadow-sm`} />
    ),
    "Oracle Primavera P6": (
      <div className={`${dim} rounded-lg bg-red-600 flex items-center justify-center text-white shadow-sm`}>
        <SiOracle className={iconSize} />
      </div>
    ),
    "MS Planner": (
      <img src={plannerLogo} alt="MS Planner" className={`${dim} rounded-lg object-contain shadow-sm`} />
    ),
    "Smartsheet": (
      <img src={smartsheetLogo} alt="Smartsheet" className={`${dim} rounded-lg object-contain shadow-sm`} />
    ),
    "Monday.com": (
      <img src={mondayLogo} alt="Monday.com" className={`${dim} rounded-lg object-contain shadow-sm`} />
    ),
    "Asana": (
      <div className={`${dim} rounded-lg bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white shadow-sm`}>
        <SiAsana className={iconSize} />
      </div>
    ),
    "Jira": (
      <div className={`${dim} rounded-lg bg-blue-500 flex items-center justify-center text-white shadow-sm`}>
        <SiJira className={iconSize} />
      </div>
    ),
  };

  return brandIcon[tool] || <div className={`${dim} rounded-lg bg-gray-400 flex items-center justify-center text-white font-bold ${textSize}`}>?</div>;
}

const categories: Category[] = [
  {
    name: "Portfolio Management",
    icon: Layers,
    features: [
      { name: "Portfolio creation & grouping", values: ["yes","yes","no","yes","yes","yes","no"] },
      { name: "Custom portfolios (cross-portfolio projects)", values: ["yes","no","no","no","no","no","no"] },
      { name: "Portfolio health scoring (RAG)", values: ["yes","yes","no","partial","yes","yes","no"] },
      { name: "Portfolio budget tracking", values: ["yes","yes","no","yes","partial","no","no"] },
      { name: "Strategic alignment / objectives", values: ["yes","yes","no","no","no","yes","no"] },
      { name: "Portfolio risk tolerance setting", values: ["yes","yes","no","no","no","no","no"] },
      { name: "Portfolio-level KPIs / performance metrics", values: ["yes","yes","no","partial","yes","yes","no"] },
      { name: "AI-powered portfolio risk assessment", values: ["yes","no","no","no","no","no","no"] },
      { name: "Portfolio manager & business owner roles", values: ["yes","yes","no","no","no","partial","no"] },
      { name: "Portfolio department assignment", values: ["yes","yes","no","no","no","no","no"] },
    ],
  },
  {
    name: "Project Management",
    icon: Briefcase,
    features: [
      { name: "Project creation & tracking", values: ["yes","yes","yes","yes","yes","yes","yes"] },
      { name: "Project health status (RAG)", values: ["yes","yes","no","yes","yes","yes","no"] },
      { name: "Health status history tracking", values: ["yes","partial","no","no","no","no","no"] },
      { name: "Project change logs / audit trail", values: ["yes","yes","no","yes","no","no","yes"] },
      { name: "Project financials (budget / actual cost)", values: ["yes","yes","no","yes","partial","no","no"] },
      { name: "Cost items breakdown", values: ["yes","yes","no","yes","no","no","no"] },
      { name: "Billable status tracking", values: ["yes","no","no","no","no","no","no"] },
      { name: "Project scoring / prioritization", values: ["yes","yes","no","partial","partial","yes","no"] },
      { name: "Project benefits tracking", values: ["yes","partial","no","no","no","yes","no"] },
      { name: "Project decisions log", values: ["yes","no","no","no","no","no","no"] },
      { name: "Custom fields per project", values: ["yes","yes","no","yes","yes","yes","yes"] },
      { name: "Custom project tabs / sections", values: ["yes","no","no","no","no","no","no"] },
      { name: "Saved project views / filters", values: ["yes","yes","no","yes","yes","yes","yes"] },
      { name: "Gantt chart / visual scheduling", values: ["yes","yes","no","yes","yes","yes","partial"] },
      { name: "Critical path analysis", values: ["no","yes","no","yes","no","no","no"] },
    ],
  },
  {
    name: "Task Management",
    icon: Target,
    features: [
      { name: "Task creation & assignment", values: ["yes","yes","yes","yes","yes","yes","yes"] },
      { name: "Task dependencies", values: ["yes","yes","no","yes","yes","yes","yes"] },
      { name: "Hierarchical tasks / WBS roll-up", values: ["yes","yes","no","yes","yes","yes","yes"] },
      { name: "Task change logs / audit trail", values: ["yes","yes","no","yes","no","no","yes"] },
      { name: "Task resource assignments", values: ["yes","yes","yes","yes","yes","yes","yes"] },
      { name: "Kanban board view", values: ["yes","no","yes","yes","yes","yes","yes"] },
      { name: "Recurring tasks", values: ["no","no","yes","yes","yes","yes","no"] },
    ],
  },
  {
    name: "Resource Management",
    icon: Shield,
    features: [
      { name: "Resource pool / directory", values: ["yes","yes","no","yes","yes","yes","no"] },
      { name: "Resource skills & proficiency levels", values: ["yes","yes","no","no","no","no","no"] },
      { name: "Resource availability / time-off", values: ["yes","yes","no","partial","partial","no","no"] },
      { name: "Capacity planning view", values: ["yes","yes","no","yes","yes","yes","no"] },
      { name: "Workload dashboard", values: ["yes","yes","no","yes","yes","yes","no"] },
      { name: "Demand vs. supply forecast", values: ["yes","yes","no","no","no","no","no"] },
      { name: "Resource credit / cost rates", values: ["yes","yes","no","yes","no","no","no"] },
      { name: "Resource invitation workflow", values: ["yes","no","no","no","yes","yes","yes"] },
    ],
  },
  {
    name: "Time Management",
    icon: Clock,
    features: [
      { name: "Timesheet entries (per task)", values: ["yes","yes","no","yes","yes","no","partial"] },
      { name: "Timesheet approval periods", values: ["yes","yes","no","no","no","no","no"] },
      { name: "Non-project time tracking", values: ["yes","yes","no","no","no","no","no"] },
      { name: "Time categories (customizable)", values: ["yes","yes","no","no","no","no","no"] },
      { name: "Calendar view", values: ["yes","partial","yes","yes","yes","yes","no"] },
    ],
  },
  {
    name: "Risk & Issue Management",
    icon: AlertOctagon,
    features: [
      { name: "Risk register", values: ["yes","yes","no","partial","no","no","no"] },
      { name: "AI-powered risk assessment (project)", values: ["yes","no","no","no","no","no","no"] },
      { name: "AI-powered risk assessment (portfolio)", values: ["yes","no","no","no","no","no","no"] },
      { name: "Risk change logs / history", values: ["yes","partial","no","no","no","no","no"] },
      { name: "Risk resource assignments", values: ["yes","no","no","no","no","no","no"] },
      { name: "Shareable public risk assessment links", values: ["yes","no","no","no","no","no","no"] },
      { name: "Issue tracking", values: ["yes","partial","no","yes","yes","yes","yes"] },
      { name: "Issue resource assignments", values: ["yes","no","no","no","no","yes","yes"] },
      { name: "Issue change logs / history", values: ["yes","no","no","no","no","no","yes"] },
    ],
  },
  {
    name: "Change & Governance",
    icon: GitBranch,
    features: [
      { name: "Change request management", values: ["yes","no","no","no","no","no","partial"] },
      { name: "Project intake / demand management", values: ["yes","no","no","partial","no","no","no"] },
      { name: "Intake workflow steps (configurable)", values: ["yes","no","no","no","no","no","no"] },
      { name: "Portfolio key date tracking", values: ["yes","yes","no","yes","yes","yes","yes"] },
      { name: "Lessons learned module", values: ["yes","no","no","no","no","no","no"] },
      { name: "Project comments / collaboration", values: ["yes","partial","yes","yes","yes","yes","yes"] },
      { name: "Project documents management", values: ["yes","partial","no","yes","yes","yes","yes"] },
    ],
  },
  {
    name: "Reporting & Analytics",
    icon: LineChart,
    features: [
      { name: "Dashboard with charts & visualizations", values: ["yes","yes","partial","yes","yes","yes","yes"] },
      { name: "Customizable dashboard tab order", values: ["yes","yes","no","yes","yes","yes","yes"] },
      { name: "Custom dashboards (user-defined)", values: ["yes","yes","no","yes","yes","yes","yes"] },
      { name: "Status report history", values: ["yes","yes","no","yes","no","no","no"] },
      { name: "Report subscriptions (scheduled email)", values: ["yes","yes","no","yes","no","yes","no"] },
      { name: "Analytics API for Power BI / external tools", values: ["yes","yes","no","yes","no","no","no"] },
      { name: "Simulation / what-if analysis", values: ["yes","yes","no","no","no","no","no"] },
    ],
  },
  {
    name: "Financial Management",
    icon: DollarSign,
    features: [
      { name: "Project invoicing module", values: ["yes","no","no","no","no","no","no"] },
      { name: "Invoice notes & tracking", values: ["yes","no","no","no","no","no","no"] },
      { name: "Microsoft Dynamics 365 invoice import", values: ["yes","no","no","no","no","no","no"] },
      { name: "Project financials (budget vs. actual)", values: ["yes","yes","no","partial","no","no","no"] },
      { name: "Cost items breakdown", values: ["yes","yes","no","yes","no","no","no"] },
      { name: "Billable status with comments", values: ["yes","no","no","no","no","no","no"] },
    ],
  },
  {
    name: "Integrations & Import/Export",
    icon: Plug,
    features: [
      { name: "MS Project file import (.mpp, XML, CSV)", values: ["yes","yes","no","yes","no","no","no"] },
      { name: "Microsoft Planner sync", values: ["yes","no","yes","no","no","no","no"] },
      { name: "Microsoft Dynamics 365 integration", values: ["yes","no","no","no","no","no","no"] },
      { name: "REST API for external tools", values: ["yes","yes","partial","yes","yes","yes","yes"] },
      { name: "Swagger / OpenAPI documentation", values: ["yes","no","no","yes","yes","yes","yes"] },
      { name: "Google Analytics integration", values: ["yes","no","no","no","no","no","no"] },
      { name: "Zapier / Power Automate", values: ["no","partial","yes","yes","yes","yes","yes"] },
      { name: "Slack / Teams integration", values: ["no","no","yes","yes","yes","yes","yes"] },
    ],
  },
  {
    name: "Administration & Security",
    icon: Settings,
    features: [
      { name: "Multi-tenant organizations", values: ["yes","yes","yes","yes","yes","yes","yes"] },
      { name: "Role-based access control (RBAC)", values: ["yes","yes","partial","yes","yes","yes","yes"] },
      { name: "Team member scoped access", values: ["yes","yes","no","yes","partial","partial","yes"] },
      { name: "External sharing (read-only viewers)", values: ["yes","no","no","yes","yes","yes","no"] },
      { name: "Soft delete / data protection", values: ["yes","partial","no","no","yes","yes","no"] },
      { name: "Seat-based billing & plan management", values: ["yes","yes","yes","yes","yes","yes","yes"] },
      { name: "Super admin console", values: ["yes","yes","no","yes","yes","yes","yes"] },
      { name: "User consent tracking (GDPR)", values: ["yes","partial","yes","no","yes","yes","yes"] },
      { name: "Email verification", values: ["yes","yes","yes","no","yes","yes","yes"] },
      { name: "Bot protection (honeypot + time-based)", values: ["yes","no","no","no","no","no","no"] },
      { name: "In-app help ticket system", values: ["yes","no","no","no","no","no","no"] },
      { name: "Notification engine (multi-type, severity)", values: ["yes","yes","yes","yes","yes","yes","yes"] },
      { name: "Customizable sidebar navigation", values: ["yes","no","no","no","yes","yes","yes"] },
      { name: "Organization-scoped integration settings", values: ["yes","yes","no","yes","yes","yes","yes"] },
    ],
  },
  {
    name: "User Experience & Platform",
    icon: Monitor,
    features: [
      { name: "Modern web-based UI", values: ["yes","partial","yes","yes","yes","yes","yes"] },
      { name: "Mobile application", values: ["no","yes","yes","yes","yes","yes","yes"] },
      { name: "Dark mode", values: ["yes","no","no","no","yes","yes","yes"] },
      { name: "User onboarding flow", values: ["yes","partial","no","yes","yes","yes","yes"] },
      { name: "In-app user guide", values: ["yes","yes","no","yes","yes","yes","yes"] },
      { name: "Demo data generation", values: ["yes","no","no","yes","yes","no","no"] },
      { name: "Landing page / public website", values: ["yes","no","no","no","no","no","no"] },
      { name: "Magic link / passwordless sign-in", values: ["yes","no","no","no","yes","no","no"] },
    ],
  },
];

function StatusIcon({ status }: { status: Status }) {
  if (status === "yes") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "partial") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-red-400/60" />;
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "yes")
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 text-xs px-2" data-testid="badge-yes">Yes</Badge>;
  if (status === "partial")
    return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 text-xs px-2" data-testid="badge-partial">Partial</Badge>;
  return <Badge variant="outline" className="bg-red-50 text-red-500 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800 text-xs px-2" data-testid="badge-no">No</Badge>;
}

function countYes(toolIdx: number, cats: Category[]): number {
  let count = 0;
  for (const cat of cats) {
    for (const feat of cat.features) {
      if (feat.values[toolIdx] === "yes") count++;
    }
  }
  return count;
}

function countCategoryYes(toolIdx: number, cat: Category): number {
  return cat.features.filter(f => f.values[toolIdx] === "yes").length;
}

export function FeatureComparisonTab() {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(categories.map(c => c.name)));
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);

  const totalFeatures = useMemo(() => categories.reduce((sum, c) => sum + c.features.length, 0), []);

  const toolTotals = useMemo(() => TOOLS.map((_, i) => countYes(i, categories)), []);

  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return categories.map(cat => ({
      ...cat,
      features: cat.features.filter(f => {
        const matchesSearch = !q || f.name.toLowerCase().includes(q);
        const statusRank = (s: Status) => s === "yes" ? 2 : s === "partial" ? 1 : 0;
        const fridayRank = statusRank(f.values[0]);
        const matchesDiff = !showOnlyDifferences || (fridayRank > 0 && f.values.slice(1).some(v => statusRank(v) < fridayRank));
        return matchesSearch && matchesDiff;
      }),
    })).filter(cat => cat.features.length > 0);
  }, [searchQuery, showOnlyDifferences]);

  const toggleCategory = (name: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const expandAll = () => setExpandedCategories(new Set(categories.map(c => c.name)));
  const collapseAll = () => setExpandedCategories(new Set());

  const uniqueFeatures = useMemo(() => {
    const result: string[] = [];
    for (const cat of categories) {
      for (const feat of cat.features) {
        if (feat.values[0] === "yes" && feat.values.slice(1).every(v => v === "no")) {
          result.push(feat.name);
        }
      }
    }
    return result;
  }, []);

  const handleDownloadCsv = () => {
    const sanitize = (v: string) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return s;
    };
    const escape = (v: string) => `"${sanitize(v).replace(/"/g, '""')}"`;
    const headers = ["Category", "Feature", ...TOOLS];
    const rows: string[][] = [];
    for (const cat of categories) {
      for (const feat of cat.features) {
        rows.push([
          cat.name,
          feat.name,
          ...feat.values.map(v => v === "yes" ? "Yes" : v === "partial" ? "Partial" : "No"),
        ]);
      }
    }
    const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "FridayReport_Feature_Comparison.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6" data-testid="feature-comparison-tab">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40">
          <CardContent className="pt-6 text-center">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-blue-600 text-white mb-3">
              <Trophy className="h-7 w-7" />
            </div>
            <div className="text-3xl font-bold text-blue-700 dark:text-blue-300" data-testid="text-friday-score">{toolTotals[0]}/{totalFeatures}</div>
            <div className="text-sm text-blue-600 dark:text-blue-400 font-medium mt-1">FridayReport.AI</div>
            <div className="text-xs text-muted-foreground mt-1">Features implemented</div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardContent className="pt-6 text-center">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 mb-3">
              <Star className="h-7 w-7" />
            </div>
            <div className="text-3xl font-bold text-foreground" data-testid="text-unique-count">{uniqueFeatures.length}</div>
            <div className="text-sm text-muted-foreground font-medium mt-1">Unique Features</div>
            <div className="text-xs text-muted-foreground mt-1">Not in any competitor</div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardContent className="pt-6 text-center">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 mb-3">
              <BarChart3 className="h-7 w-7" />
            </div>
            <div className="text-3xl font-bold text-foreground" data-testid="text-closest-competitor">{Math.max(...toolTotals.slice(1))}/{totalFeatures}</div>
            <div className="text-sm text-muted-foreground font-medium mt-1">Closest Competitor</div>
            <div className="text-xs text-muted-foreground mt-1">
              {TOOLS[toolTotals.indexOf(Math.max(...toolTotals.slice(1)))]}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardContent className="pt-6 text-center">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 mb-3">
              <Layers className="h-7 w-7" />
            </div>
            <div className="text-3xl font-bold text-foreground" data-testid="text-categories-count">{categories.length}</div>
            <div className="text-sm text-muted-foreground font-medium mt-1">Categories</div>
            <div className="text-xs text-muted-foreground mt-1">{totalFeatures} total features</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="text-lg font-semibold">Detailed Feature Comparison</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search features..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-56"
                  data-testid="input-search-features"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowOnlyDifferences(!showOnlyDifferences)} data-testid="button-toggle-differences">
                {showOnlyDifferences ? "Show All" : "Show Advantages"}
              </Button>
              <Button variant="outline" size="sm" onClick={expandedCategories.size === categories.length ? collapseAll : expandAll} data-testid="button-toggle-expand">
                {expandedCategories.size === categories.length ? "Collapse All" : "Expand All"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadCsv} data-testid="button-download-csv">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold text-foreground min-w-[280px] sticky left-0 bg-muted/50 z-10">Feature</th>
                  {TOOLS.map((tool) => (
                    <th key={tool} className="text-center px-2 py-3 min-w-[60px]">
                      <Tooltip>
                        <TooltipTrigger>
                          <div className="flex items-center justify-center">
                            <ToolLogo tool={tool} size="md" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{tool}</TooltipContent>
                      </Tooltip>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCategories.map(cat => {
                  const isExpanded = expandedCategories.has(cat.name);
                  const Icon = categories.find(c => c.name === cat.name)?.icon || Target;
                  const catTotal = cat.features.length;
                  return (
                    <CatBlock
                      key={cat.name}
                      cat={cat}
                      icon={Icon}
                      isExpanded={isExpanded}
                      onToggle={() => toggleCategory(cat.name)}
                      catTotal={catTotal}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Star className="h-5 w-5 text-emerald-500" />
              Unique to FridayReport.AI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uniqueFeatures.map(f => (
                <div key={f} className="flex items-center gap-2 text-sm" data-testid={`text-unique-${f.slice(0, 20)}`}>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-foreground">{f}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

    </div>
  );
}

function CatBlock({
  cat,
  icon: Icon,
  isExpanded,
  onToggle,
  catTotal,
}: {
  cat: Category;
  icon: typeof Target;
  isExpanded: boolean;
  onToggle: () => void;
  catTotal: number;
}) {
  return (
    <>
      <tr
        className="border-b bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
        data-testid={`row-category-${cat.name}`}
      >
        <td className="px-4 py-3 font-semibold text-foreground sticky left-0 bg-muted/30 z-10">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <Icon className="h-4 w-4 text-primary" />
            <span>{cat.name}</span>
            <Badge variant="secondary" className="ml-2 text-xs">{catTotal}</Badge>
          </div>
        </td>
        {TOOLS.map((tool, i) => {
          const count = countCategoryYes(i, cat);
          return (
            <td key={tool} className="text-center px-2 py-3">
              <span className={`text-xs font-semibold ${count === catTotal ? "text-emerald-600 dark:text-emerald-400" : count === 0 ? "text-red-400" : "text-muted-foreground"}`}>
                {count}/{catTotal}
              </span>
            </td>
          );
        })}
      </tr>
      {isExpanded &&
        cat.features.map(feat => (
          <tr key={feat.name} className="border-b hover:bg-muted/20 transition-colors" data-testid={`row-feature-${feat.name.slice(0, 30)}`}>
            <td className="px-4 py-2.5 pl-12 text-muted-foreground sticky left-0 bg-card z-10">{feat.name}</td>
            {feat.values.map((v, i) => (
              <td key={TOOLS[i]} className="text-center px-2 py-2.5">
                <div className="flex items-center justify-center">
                  <StatusIcon status={v} />
                </div>
              </td>
            ))}
          </tr>
        ))}
    </>
  );
}
