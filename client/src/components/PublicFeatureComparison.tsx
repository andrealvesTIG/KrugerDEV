import { useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { SiOracle, SiAsana, SiJira } from "react-icons/si";
import fridayLogo from "../assets/logo-icon.png";
import plannerLogo from "@/assets/planner-logo.png";
import smartsheetLogo from "@assets/image_1771603681527.png";
import mondayLogo from "@assets/image_1771691018717.png";

type Status = "yes" | "partial" | "no";

const TOOLS = [
  "FridayReport.AI",
  "Oracle Primavera P6",
  "MS Planner",
  "Smartsheet",
  "Monday.com",
  "Asana",
  "Jira",
];

function ToolLogoPublic({ tool, variant = "default" }: { tool: string; variant?: "default" | "slate" }) {
  const dim = "h-8 w-8 md:h-10 md:w-10";
  const iconSize = "h-4 w-4 md:h-5 md:w-5";
  const textSize = "text-[9px] md:text-[11px]";
  const blend = variant === "slate" ? "mix-blend-screen" : "";

  const brandIcon: Record<string, JSX.Element> = {
    "FridayReport.AI": (
      <img src={fridayLogo} alt="FridayReport.AI" className={`${dim} rounded-lg object-contain`} />
    ),
    "Oracle Primavera P6": (
      <div className={`${dim} rounded-lg bg-red-600 flex items-center justify-center text-white`}>
        <SiOracle className={iconSize} />
      </div>
    ),
    "MS Planner": (
      <img src={plannerLogo} alt="MS Planner" className={`${dim} rounded-lg object-contain ${blend}`} />
    ),
    "Smartsheet": (
      <img src={smartsheetLogo} alt="Smartsheet" className={`${dim} rounded-lg object-contain`} />
    ),
    "Monday.com": (
      <img src={mondayLogo} alt="Monday.com" className={`${dim} rounded-lg object-contain ${blend}`} />
    ),
    "Asana": (
      <div className={`${dim} rounded-lg bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white`}>
        <SiAsana className={iconSize} />
      </div>
    ),
    "Jira": (
      <div className={`${dim} rounded-lg bg-blue-500 flex items-center justify-center text-white`}>
        <SiJira className={iconSize} />
      </div>
    ),
  };

  return brandIcon[tool] || <div className={`${dim} rounded-lg bg-gray-400 flex items-center justify-center text-white font-bold ${textSize}`}>?</div>;
}

function StatusCell({ status }: { status: Status }) {
  if (status === "yes") return <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />;
  if (status === "partial") return <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto" />;
  return <XCircle className="h-5 w-5 text-red-400/40 mx-auto" />;
}

interface FeatureRow {
  name: string;
  values: Status[];
}

const highlightFeatures: FeatureRow[] = [
  { name: "Portfolio creation & grouping", values: ["yes","yes","no","yes","yes","yes","no"] },
  { name: "Portfolio health scoring (RAG)", values: ["yes","yes","no","partial","yes","yes","no"] },
  { name: "AI-powered risk assessment", values: ["yes","no","no","no","no","no","no"] },
  { name: "Project health status & history", values: ["yes","partial","no","no","no","no","no"] },
  { name: "Gantt chart / visual scheduling", values: ["yes","yes","no","yes","yes","yes","partial"] },
  { name: "Resource skills & capacity planning", values: ["yes","yes","no","no","no","no","no"] },
  { name: "Timesheet entries & approval", values: ["yes","yes","no","no","no","no","no"] },
  { name: "Risk register & issue tracking", values: ["yes","yes","no","partial","yes","yes","yes"] },
  { name: "Change request management", values: ["yes","no","no","no","no","no","partial"] },
  { name: "Project invoicing module", values: ["yes","no","no","no","no","no","no"] },
  { name: "MS Project file import (.mpp)", values: ["yes","yes","no","yes","no","no","no"] },
  { name: "Microsoft Planner sync", values: ["yes","no","yes","no","no","no","no"] },
  { name: "Dashboard & custom reports", values: ["yes","yes","partial","yes","yes","yes","yes"] },
  { name: "Role-based access control", values: ["yes","yes","partial","yes","yes","yes","yes"] },
  { name: "Dark mode", values: ["yes","no","no","no","yes","yes","yes"] },
];

const extendedFeatures: FeatureRow[] = [
  { name: "Custom portfolios (cross-portfolio)", values: ["yes","no","no","no","no","no","no"] },
  { name: "Portfolio-level KPIs & metrics", values: ["yes","yes","no","partial","yes","yes","no"] },
  { name: "Project scoring / prioritization", values: ["yes","yes","no","partial","partial","yes","no"] },
  { name: "Billable status tracking", values: ["yes","no","no","no","no","no","no"] },
  { name: "Task dependencies & WBS", values: ["yes","yes","no","yes","yes","yes","yes"] },
  { name: "Kanban board view", values: ["yes","no","yes","yes","yes","yes","yes"] },
  { name: "Workload dashboard", values: ["yes","yes","no","yes","yes","yes","no"] },
  { name: "Demand vs. supply forecast", values: ["yes","yes","no","no","no","no","no"] },
  { name: "Shareable risk assessment links", values: ["yes","no","no","no","no","no","no"] },
  { name: "Project intake workflow", values: ["yes","no","no","partial","no","no","no"] },
  { name: "Milestone tracking", values: ["yes","yes","no","yes","yes","yes","yes"] },
  { name: "Lessons learned module", values: ["yes","no","no","no","no","no","no"] },
  { name: "Report subscriptions (email)", values: ["yes","yes","no","yes","no","yes","no"] },
  { name: "Analytics API (Power BI)", values: ["yes","yes","no","yes","no","no","no"] },
  { name: "Microsoft Dynamics 365 import", values: ["yes","no","no","no","no","no","no"] },
  { name: "Multi-tenant organizations", values: ["yes","yes","yes","yes","yes","yes","yes"] },
  { name: "Soft delete / data protection", values: ["yes","partial","no","no","yes","yes","no"] },
  { name: "Bot protection (honeypot)", values: ["yes","no","no","no","no","no","no"] },
  { name: "In-app help ticket system", values: ["yes","no","no","no","no","no","no"] },
  { name: "Notification engine", values: ["yes","yes","yes","yes","yes","yes","yes"] },
  { name: "User onboarding flow", values: ["yes","partial","no","yes","yes","yes","yes"] },
  { name: "Demo data generation", values: ["yes","no","no","yes","yes","no","no"] },
  { name: "Magic link / passwordless sign-in", values: ["yes","no","no","no","yes","no","no"] },
];

interface PublicFeatureComparisonProps {
  variant?: "default" | "slate";
}

export function PublicFeatureComparison({ variant = "default" }: PublicFeatureComparisonProps) {
  const [showAll, setShowAll] = useState(false);

  const displayFeatures = showAll ? [...highlightFeatures, ...extendedFeatures] : highlightFeatures;

  const fridayTotal = [...highlightFeatures, ...extendedFeatures].filter(f => f.values[0] === "yes").length;
  const totalFeatures = highlightFeatures.length + extendedFeatures.length;

  const isSlate = variant === "slate";

  const headlineClass = isSlate
    ? "text-3xl md:text-4xl font-bold tracking-tight text-white"
    : "text-3xl md:text-4xl font-bold tracking-tight text-foreground";

  const subtitleClass = isSlate
    ? "mt-3 text-base text-slate-300 max-w-2xl mx-auto"
    : "mt-3 text-base text-muted-foreground max-w-2xl mx-auto";

  const strongClass = isSlate ? "text-white" : "text-foreground";

  const tableWrapperClass = isSlate
    ? "overflow-x-auto rounded-xl border border-slate-600 bg-slate-800/50 shadow-lg"
    : "overflow-x-auto rounded-xl border border-border bg-card shadow-lg";

  const theadBg = isSlate ? "bg-slate-700/60" : "bg-muted/50";
  const theadStickyBg = isSlate ? "bg-slate-700" : "bg-muted/50";
  const thTextClass = isSlate ? "text-white" : "text-foreground";

  const evenRowBg = isSlate ? "bg-slate-800/50" : "bg-background";
  const oddRowBg = isSlate ? "bg-slate-700/30" : "bg-muted/20";
  const stickyTdBg = isSlate ? "bg-inherit" : "bg-inherit";
  const featureTextClass = isSlate ? "text-slate-100" : "text-foreground";

  const fridayColBg = isSlate ? "bg-orange-500/10" : "bg-blue-50/50 dark:bg-blue-950/20";

  const btnClass = isSlate
    ? "border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white"
    : "";

  return (
    <div data-testid="public-feature-comparison">
      <div className="text-center mb-10">
        <h2
          className={headlineClass}
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="text-comparison-headline"
        >
          See how we compare
        </h2>
        <p className={subtitleClass} data-testid="text-comparison-subtitle">
          FridayReport.AI delivers <strong className={strongClass}>{fridayTotal} out of {totalFeatures}</strong> features across portfolio, project, and resource management — more than any competitor.
        </p>
      </div>

      <div className={tableWrapperClass}>
        <table className="w-full text-sm" data-testid="table-public-comparison">
          <thead>
            <tr className={`border-b ${isSlate ? "border-slate-600" : ""} ${theadBg}`}>
              <th className={`text-left px-4 py-4 font-semibold ${thTextClass} min-w-[220px] sticky left-0 ${theadStickyBg} z-10`}>Feature</th>
              {TOOLS.map((tool) => (
                <th key={tool} className="text-center px-2 py-4 min-w-[56px]">
                  <Tooltip>
                    <TooltipTrigger data-testid={`logo-${tool.replace(/[\s.]/g, "-").toLowerCase()}`}>
                      <div className="flex items-center justify-center">
                        <ToolLogoPublic tool={tool} variant={variant} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{tool}</TooltipContent>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayFeatures.map((feat, idx) => (
              <tr
                key={feat.name}
                className={`border-b ${isSlate ? "border-slate-700" : ""} transition-colors ${idx % 2 === 0 ? evenRowBg : oddRowBg}`}
                data-testid={`row-feature-${idx}`}
              >
                <td className={`px-4 py-3 font-medium ${featureTextClass} sticky left-0 z-10 ${stickyTdBg}`} data-testid={`text-feature-name-${idx}`}>{feat.name}</td>
                {feat.values.map((v, i) => (
                  <td key={TOOLS[i]} className={`text-center px-2 py-3 ${i === 0 ? fridayColBg : ""}`} data-testid={`cell-status-${idx}-${i}`}>
                    <StatusCell status={v} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center mt-6">
        <Button
          variant="outline"
          className={btnClass}
          onClick={() => setShowAll(!showAll)}
          data-testid="button-toggle-all-features"
        >
          {showAll ? (
            <>Show fewer features <ChevronUp className="h-4 w-4 ml-2" /></>
          ) : (
            <>Show all {totalFeatures} features <ChevronDown className="h-4 w-4 ml-2" /></>
          )}
        </Button>
      </div>
    </div>
  );
}
