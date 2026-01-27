import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, Shield, Target, TrendingUp, BarChart3, 
  AlertCircle, CheckCircle2, Activity
} from "lucide-react";
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ZAxis, Cell, BarChart, Bar, PieChart, Pie, Legend, RadarChart, PolarGrid, 
  PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";
import type { Risk } from "@shared/schema";

const SEVERITY_COLORS = {
  Critical: '#dc2626',
  High: '#f59e0b',
  Medium: '#3b82f6',
  Low: '#10b981',
};

const PROBABILITY_MAP: Record<string, number> = {
  'Very High': 5,
  'High': 4,
  'Medium': 3,
  'Low': 2,
  'Very Low': 1,
};

const IMPACT_MAP: Record<string, number> = {
  'Critical': 5,
  'High': 4,
  'Medium': 3,
  'Low': 2,
  'Very Low': 1,
};

export function RiskMatrixDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: projectsData } = useProjects(currentOrganization?.id);

  const { data: allRisks = [] } = useQuery<Risk[]>({
    queryKey: ['/api/risks', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/risks?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const projects = projectsData || [];
  const openRisks = allRisks.filter(r => r.status === 'Open' || r.status === 'Identified');

  const riskMetrics = useMemo(() => {
    const total = allRisks.length;
    const open = openRisks.length;
    const critical = openRisks.filter(r => r.severity === 'High' || r.severity === 'Critical').length;
    const mitigated = allRisks.filter(r => r.status === 'Mitigated' || r.status === 'Closed').length;
    
    const avgRiskScore = openRisks.length > 0
      ? Math.round(openRisks.reduce((sum, r) => {
          const prob = PROBABILITY_MAP[r.probability || 'Medium'] || 3;
          const impact = IMPACT_MAP[r.severity || 'Medium'] || 3;
          return sum + (prob * impact);
        }, 0) / openRisks.length)
      : 0;

    const riskExposure = avgRiskScore * open;

    return {
      total,
      open,
      critical,
      mitigated,
      avgRiskScore,
      riskExposure,
      mitigationRate: total > 0 ? Math.round((mitigated / total) * 100) : 0,
    };
  }, [allRisks, openRisks]);

  const matrixData = useMemo(() => {
    return openRisks.map(r => ({
      name: r.title?.substring(0, 20) || 'Risk',
      probability: PROBABILITY_MAP[r.probability || 'Medium'] || 3,
      impact: IMPACT_MAP[r.severity || 'Medium'] || 3,
      score: (PROBABILITY_MAP[r.probability || 'Medium'] || 3) * (IMPACT_MAP[r.severity || 'Medium'] || 3),
      severity: r.severity || 'Medium',
      z: 200,
    }));
  }, [openRisks]);

  const severityDistribution = useMemo(() => {
    const groups: Record<string, number> = {};
    openRisks.forEach(r => {
      const severity = r.severity || 'Medium';
      groups[severity] = (groups[severity] || 0) + 1;
    });
    
    return Object.entries(groups).map(([name, value]) => ({
      name,
      value,
      color: SEVERITY_COLORS[name as keyof typeof SEVERITY_COLORS] || '#94a3b8',
    }));
  }, [openRisks]);

  const categoryDistribution = useMemo(() => {
    const groups: Record<string, number> = {};
    openRisks.forEach(r => {
      const category = r.category || 'Other';
      groups[category] = (groups[category] || 0) + 1;
    });
    
    return Object.entries(groups).map(([name, value]) => ({
      name,
      value,
    })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [openRisks]);

  const riskDimensions = [
    { dimension: 'Technical', score: 65, fullMark: 100 },
    { dimension: 'Schedule', score: 75, fullMark: 100 },
    { dimension: 'Cost', score: 55, fullMark: 100 },
    { dimension: 'Resource', score: 70, fullMark: 100 },
    { dimension: 'External', score: 45, fullMark: 100 },
    { dimension: 'Scope', score: 60, fullMark: 100 },
  ];

  const getMatrixCellColor = (probability: number, impact: number) => {
    const score = probability * impact;
    if (score >= 16) return '#dc2626';
    if (score >= 10) return '#f59e0b';
    if (score >= 5) return '#eab308';
    return '#10b981';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-primary" />
            Risk Matrix Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            PMI PMBOK & PRINCE2 risk assessment matrix
          </p>
        </div>
        <Badge variant={riskMetrics.critical > 3 ? 'destructive' : 'outline'} className="text-xs">
          {riskMetrics.critical} Critical Risks
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4" data-testid="kpi-total-risks">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Shield className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Risks</span>
          </div>
          <div className="text-2xl font-bold">{riskMetrics.total}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Identified to date</p>
        </Card>

        <Card className="p-4" data-testid="kpi-open-risks">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Open Risks</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{riskMetrics.open}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Active monitoring</p>
        </Card>

        <Card className="p-4" data-testid="kpi-critical-risks">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-red-500/10">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <span className="text-xs text-muted-foreground">High/Critical</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{riskMetrics.critical}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Urgent attention</p>
        </Card>

        <Card className="p-4" data-testid="kpi-avg-score">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Target className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg Risk Score</span>
          </div>
          <div className="text-2xl font-bold">{riskMetrics.avgRiskScore}</div>
          <p className="text-[10px] text-muted-foreground mt-1">P x I matrix</p>
        </Card>

        <Card className="p-4" data-testid="kpi-exposure">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-pink-500/10">
              <Activity className="h-4 w-4 text-pink-500" />
            </div>
            <span className="text-xs text-muted-foreground">Risk Exposure</span>
          </div>
          <div className="text-2xl font-bold">{riskMetrics.riskExposure}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Aggregate score</p>
        </Card>

        <Card className="p-4" data-testid="kpi-mitigation-rate">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Mitigation Rate</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{riskMetrics.mitigationRate}%</div>
          <p className="text-[10px] text-muted-foreground mt-1">Resolved/closed</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-risk-matrix">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Probability-Impact Matrix
            </CardTitle>
            <CardDescription className="text-xs">
              PMI risk assessment visualization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    dataKey="probability" 
                    domain={[0, 6]} 
                    fontSize={10}
                    label={{ value: 'Probability', position: 'bottom', fontSize: 10 }}
                    tickFormatter={(v) => ['', 'Very Low', 'Low', 'Medium', 'High', 'Very High'][v] || ''}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="impact" 
                    domain={[0, 6]} 
                    fontSize={10}
                    label={{ value: 'Impact', angle: -90, position: 'left', fontSize: 10 }}
                    tickFormatter={(v) => ['', 'V.Low', 'Low', 'Med', 'High', 'Crit'][v] || ''}
                  />
                  <ZAxis type="number" dataKey="z" range={[100, 400]} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px' }}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  <Scatter data={matrixData}>
                    {matrixData.map((entry, i) => (
                      <Cell 
                        key={i} 
                        fill={getMatrixCellColor(entry.probability, entry.impact)}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 mt-2 text-xs">
              <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500" /> Low</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-500" /> Medium</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-500" /> High</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-600" /> Critical</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-risk-radar">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Risk Dimension Analysis
            </CardTitle>
            <CardDescription className="text-xs">
              PRINCE2 risk category assessment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={riskDimensions}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="Risk Score" dataKey="score" stroke="#ef4444" fill="#ef4444" fillOpacity={0.4} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-severity-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Severity Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Open risks by severity level
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {severityDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-category-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Risk Categories
            </CardTitle>
            <CardDescription className="text-xs">
              Distribution by risk category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={10} />
                  <YAxis type="category" dataKey="name" width={80} fontSize={10} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Bar dataKey="value" fill="#3b82f6" name="Risks" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
