import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Loader2, Shield, Download, AlertTriangle, DollarSign,
  Calendar, CheckCircle2, Clock
} from "lucide-react";

function getRiskScoreColor(score: number) {
  if (score <= 25) return "text-emerald-600 dark:text-emerald-400";
  if (score <= 50) return "text-amber-500 dark:text-amber-400";
  if (score <= 75) return "text-orange-500 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
}

function getRiskScoreBg(score: number) {
  if (score <= 25) return "bg-emerald-100 dark:bg-emerald-900/50";
  if (score <= 50) return "bg-amber-100 dark:bg-amber-900/50";
  if (score <= 75) return "bg-orange-100 dark:bg-orange-900/50";
  return "bg-rose-100 dark:bg-rose-900/50";
}

function getRiskScoreLabel(score: number) {
  if (score <= 25) return "Low Risk";
  if (score <= 50) return "Moderate Risk";
  if (score <= 75) return "High Risk";
  return "Critical Risk";
}

export default function SharedRiskAssessment() {
  const [, params] = useRoute("/risk-assessment/share/:token");
  const token = params?.token;

  const { data, isLoading, error } = useQuery<{
    id: number;
    portfolioId: number;
    portfolioName: string;
    riskScore: number;
    summary: string;
    shareToken: string;
    generatedAt: string;
    report: any;
  }>({
    queryKey: ["/api/portfolio-risk-assessments/share", token],
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Report Not Found</h2>
        <p className="text-muted-foreground">This risk assessment report could not be found or the link is invalid.</p>
      </div>
    );
  }

  if (!data) return null;

  const report = data.report;
  const generatedDate = new Date(data.generatedAt);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-shared-portfolio-name">
            <Shield className="h-6 w-6" />
            {data.portfolioName} — Risk Assessment
          </h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground" data-testid="text-shared-timestamp">
            <Clock className="h-4 w-4" />
            Generated {generatedDate.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            window.open(`/api/portfolio-risk-assessments/share/${token}/pdf`, "_blank");
          }}
          data-testid="button-shared-download-pdf"
        >
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className={cn("flex items-center justify-center h-20 w-20 rounded-md text-3xl font-bold", getRiskScoreBg(data.riskScore), getRiskScoreColor(data.riskScore))} data-testid="display-shared-risk-score">
              {data.riskScore}
            </div>
            <div className="flex-1 min-w-0">
              <Badge className={cn("mb-2", getRiskScoreBg(data.riskScore), getRiskScoreColor(data.riskScore))} data-testid="badge-shared-risk-label">
                {getRiskScoreLabel(data.riskScore)}
              </Badge>
              <p className="text-sm text-muted-foreground" data-testid="text-shared-risk-summary">{data.summary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {report && (
        <div className="space-y-4">
          {report.categories && report.categories.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Risk Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3" data-testid="display-shared-risk-categories">
                  {report.categories.map((cat: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between gap-4" data-testid={`shared-risk-category-${idx}`}>
                      <span className="text-sm font-medium flex-1">{cat.name}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={cat.score} className="w-24 h-2" />
                        <span className={cn("text-sm font-semibold w-8 text-right", getRiskScoreColor(cat.score))}>
                          {cat.score}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {report.topRisks && report.topRisks.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Risks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3" data-testid="display-shared-top-risks">
                  {report.topRisks.map((risk: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid={`shared-top-risk-${idx}`}>
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{risk.title || risk.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{risk.description || risk.detail}</p>
                        {risk.impact && (
                          <Badge className="mt-2 text-xs">{risk.impact}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(report.financialRisk || report.scheduleRisk) && (
            <div className="grid gap-4 md:grid-cols-2">
              {report.financialRisk && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Financial Risk
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div data-testid="display-shared-financial-risk">
                      {typeof report.financialRisk === "string" ? (
                        <p className="text-sm text-muted-foreground">{report.financialRisk}</p>
                      ) : (
                        <>
                          {report.financialRisk.score !== undefined && (
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm text-muted-foreground">Score:</span>
                              <span className={cn("text-sm font-semibold", getRiskScoreColor(report.financialRisk.score))}>
                                {report.financialRisk.score}
                              </span>
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground">{report.financialRisk.analysis || report.financialRisk.description}</p>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
              {report.scheduleRisk && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Schedule Risk
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div data-testid="display-shared-schedule-risk">
                      {typeof report.scheduleRisk === "string" ? (
                        <p className="text-sm text-muted-foreground">{report.scheduleRisk}</p>
                      ) : (
                        <>
                          {report.scheduleRisk.score !== undefined && (
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm text-muted-foreground">Score:</span>
                              <span className={cn("text-sm font-semibold", getRiskScoreColor(report.scheduleRisk.score))}>
                                {report.scheduleRisk.score}
                              </span>
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground">{report.scheduleRisk.analysis || report.scheduleRisk.description}</p>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {report.recommendations && report.recommendations.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2" data-testid="display-shared-recommendations">
                  {report.recommendations.map((rec: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid={`shared-recommendation-${idx}`}>
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                      <p className="text-sm">{typeof rec === "string" ? rec : rec.text || rec.description || rec.title}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
