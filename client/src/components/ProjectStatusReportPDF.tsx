import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format, differenceInDays } from "date-fns";
import type { Project, Risk, Issue, Milestone, ProjectFinancial, Task, ChangeRequest, ProjectDocument } from "@shared/schema";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: "Helvetica",
    fontSize: 10,
  },
  header: {
    backgroundColor: "#2563eb",
    padding: 20,
    marginBottom: 20,
    marginHorizontal: -30,
    marginTop: -30,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
  },
  headerSubtitle: {
    color: "#ffffff",
    fontSize: 14,
    marginTop: 4,
    opacity: 0.9,
  },
  headerDate: {
    color: "#ffffff",
    fontSize: 10,
    opacity: 0.8,
  },
  headerBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  headerBadgeText: {
    color: "#ffffff",
    fontSize: 9,
  },
  twoColumn: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  threeColumn: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  column: {
    flex: 1,
  },
  section: {
    marginBottom: 14,
  },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    color: "#1f2937",
    flexDirection: "row",
    alignItems: "center",
  },
  sectionIcon: {
    fontSize: 10,
    marginRight: 6,
    color: "#2563eb",
  },
  text: {
    fontSize: 9,
    color: "#4b5563",
    lineHeight: 1.4,
  },
  progressContainer: {
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 8,
    marginBottom: 2,
    color: "#374151",
  },
  progressBar: {
    height: 8,
    backgroundColor: "#e5e7eb",
    borderRadius: 4,
  },
  progressFill: {
    height: 8,
    backgroundColor: "#3b82f6",
    borderRadius: 4,
  },
  progressFillGreen: {
    backgroundColor: "#22c55e",
  },
  progressFillYellow: {
    backgroundColor: "#f59e0b",
  },
  progressFillRed: {
    backgroundColor: "#ef4444",
  },
  healthContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 8,
  },
  healthItem: {
    alignItems: "center",
  },
  healthCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  healthGreen: {
    backgroundColor: "#22c55e",
  },
  healthYellow: {
    backgroundColor: "#eab308",
  },
  healthRed: {
    backgroundColor: "#ef4444",
  },
  healthLabel: {
    fontSize: 7,
    color: "#6b7280",
  },
  healthIcon: {
    color: "#ffffff",
    fontSize: 12,
  },
  timelineContainer: {
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  timelineDates: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  timelineDateText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
  },
  timelineDaysText: {
    fontSize: 8,
    color: "#6b7280",
  },
  timelineTrack: {
    height: 20,
    backgroundColor: "#d1d5db",
    borderRadius: 4,
    position: "relative",
    marginBottom: 8,
  },
  timelineElapsed: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 20,
    backgroundColor: "#93c5fd",
    borderRadius: 4,
  },
  timelineProgress: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 20,
    backgroundColor: "#2563eb",
    borderRadius: 4,
  },
  timelineLegend: {
    flexDirection: "row",
    gap: 12,
  },
  timelineLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timelineLegendBox: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  timelineLegendText: {
    fontSize: 7,
    color: "#6b7280",
  },
  milestoneDots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  milestoneDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  milestoneDotCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  milestoneDotText: {
    fontSize: 7,
    color: "#374151",
  },
  pieChartContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  pieChart: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#e5e7eb",
    position: "relative",
    overflow: "hidden",
  },
  pieCenter: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  pieCenterText: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1f2937",
  },
  pieCenterLabel: {
    fontSize: 6,
    color: "#6b7280",
  },
  pieLegend: {
    flex: 1,
  },
  pieLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  pieLegendColor: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginRight: 6,
  },
  pieLegendText: {
    fontSize: 8,
    color: "#374151",
    flex: 1,
  },
  pieLegendValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#1f2937",
  },
  barChartContainer: {
    marginBottom: 8,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  barLabel: {
    width: 50,
    fontSize: 8,
    color: "#374151",
  },
  barTrack: {
    flex: 1,
    height: 14,
    backgroundColor: "#e5e7eb",
    borderRadius: 3,
    marginHorizontal: 8,
  },
  barFill: {
    height: 14,
    borderRadius: 3,
  },
  barValue: {
    width: 60,
    fontSize: 8,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    color: "#1f2937",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  statBox: {
    flex: 1,
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    padding: 10,
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#2563eb",
  },
  statValueGreen: {
    color: "#22c55e",
  },
  statValueOrange: {
    color: "#f59e0b",
  },
  statLabel: {
    fontSize: 7,
    color: "#6b7280",
    marginTop: 2,
  },
  riskItem: {
    flexDirection: "row",
    marginBottom: 4,
    paddingLeft: 4,
  },
  riskBadge: {
    fontSize: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
    marginRight: 6,
  },
  riskBadgeRisk: {
    backgroundColor: "#fef3c7",
    color: "#d97706",
  },
  riskBadgeIssue: {
    backgroundColor: "#fee2e2",
    color: "#dc2626",
  },
  riskText: {
    fontSize: 8,
    color: "#374151",
    flex: 1,
  },
  riskPriority: {
    fontSize: 7,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  priorityHigh: {
    backgroundColor: "#fee2e2",
    color: "#dc2626",
  },
  priorityMedium: {
    backgroundColor: "#fef3c7",
    color: "#d97706",
  },
  priorityLow: {
    backgroundColor: "#f3f4f6",
    color: "#6b7280",
  },
  milestoneRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 4,
  },
  milestoneTitle: {
    flex: 2,
    fontSize: 8,
  },
  milestoneDate: {
    flex: 1,
    fontSize: 8,
    color: "#6b7280",
  },
  milestoneStatus: {
    flex: 1,
    fontSize: 8,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },
  statusComplete: {
    color: "#16a34a",
  },
  statusAtRisk: {
    color: "#dc2626",
  },
  statusOnTrack: {
    color: "#6b7280",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    textAlign: "center",
    fontSize: 8,
    color: "#9ca3af",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
  },
});

interface ProjectStatusReportPDFProps {
  project: Project;
  risks: Risk[];
  issues: Issue[];
  milestones: Milestone[];
  financials: ProjectFinancial[];
  tasks: Task[];
  changeRequests?: ChangeRequest[];
  documents?: ProjectDocument[];
  executiveSummary?: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const safePercent = (value: number, total: number) => {
  if (total <= 0 || isNaN(value) || isNaN(total)) return 0;
  return Math.min((value / total) * 100, 100);
};

export function ProjectStatusReportPDF({
  project,
  risks,
  issues,
  milestones,
  financials,
  tasks,
  changeRequests = [],
  documents = [],
  executiveSummary,
}: ProjectStatusReportPDFProps) {
  const leafTasks = tasks.filter((t) => !t.isSummary);
  const completed = leafTasks.filter((t) => t.status === "Completed" || t.progress === 100).length;
  const inProgress = leafTasks.filter((t) => t.status === "In Progress").length;
  const notStarted = leafTasks.filter((t) => t.status === "Not Started" || (!t.status && t.progress === 0)).length;
  const totalTasks = leafTasks.length || 1;

  const budget = financials.reduce((sum, f) => sum + parseFloat(f.budgetAmount || "0"), 0);
  const actual = financials.reduce((sum, f) => sum + parseFloat(f.actualAmount || "0"), 0);
  const planned = financials.reduce((sum, f) => sum + parseFloat(f.plannedAmount || "0"), 0);
  const projectBudget = parseFloat(project.budget?.toString() || "0");
  const totalBudget = budget > 0 ? budget : (projectBudget > 0 ? projectBudget : 1);
  const forecast = planned > 0 ? planned : totalBudget;
  const variance = totalBudget - actual;

  const openRisks = risks.filter((r) => r.status === "Open" && !r.deletedAt);
  const riskHigh = openRisks.filter((r) => r.impact === "High" || r.probability === "High").length;
  
  const openIssues = issues.filter((i) => (i.status === "Open" || i.status === "In Progress") && !i.deletedAt);
  const issueCritical = openIssues.filter((i) => i.priority === "Critical" || i.priority === "High").length;

  const topRisksAndIssues = [
    ...openRisks.slice(0, 3).map((r) => ({ type: "risk" as const, title: r.title, priority: r.impact })),
    ...openIssues.slice(0, 2).map((i) => ({ type: "issue" as const, title: i.title, priority: i.priority })),
  ].slice(0, 5);

  const majorMilestones = milestones
    .filter((m) => !m.deletedAt)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 6);

  const getMilestoneStatus = (milestone: Milestone) => {
    if (milestone.completed || milestone.status === "Done") return "Complete";
    const dueDate = new Date(milestone.dueDate);
    const today = new Date();
    if (dueDate < today) return "At Risk";
    return "On Track";
  };

  const getHealthColor = (value: string | null | undefined) => {
    switch (value) {
      case "Green": return styles.healthGreen;
      case "Yellow": return styles.healthYellow;
      case "Red": return styles.healthRed;
      default: return styles.healthGreen;
    }
  };

  const budgetHealth = actual > totalBudget ? "Red" : actual > totalBudget * 0.9 ? "Yellow" : "Green";
  const riskHealth = riskHigh > 2 ? "Red" : riskHigh > 0 ? "Yellow" : "Green";

  const hasTimeline = project.startDate && project.endDate;
  let timelineData = null;
  if (hasTimeline) {
    const start = new Date(project.startDate!);
    const end = new Date(project.endDate!);
    const today = new Date();
    const totalDays = differenceInDays(end, start) || 1;
    const elapsedDays = Math.max(0, differenceInDays(today, start));
    const progressPercent = Math.min((elapsedDays / totalDays) * 100, 100);
    const daysRemaining = Math.max(0, differenceInDays(end, today));
    
    timelineData = {
      start,
      end,
      progressPercent,
      daysRemaining,
      completionPercent: project.completionPercentage || 0,
    };
  }

  const maxBudgetValue = Math.max(totalBudget, actual, forecast) || 1;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>PROJECT STATUS REPORT</Text>
            <Text style={styles.headerSubtitle}>{project.name}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerDate}>{format(new Date(), "MMMM d, yyyy")}</Text>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{project.status} | {project.priority}</Text>
            </View>
          </View>
        </View>

        <View style={styles.twoColumn}>
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            <Text style={styles.text}>
              {executiveSummary || project.description || "No executive summary provided for this project."}
            </Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>Project Health</Text>
            <View style={styles.healthContainer}>
              <View style={styles.healthItem}>
                <View style={[styles.healthCircle, getHealthColor(project.health)]}>
                  <Text style={styles.healthIcon}>✓</Text>
                </View>
                <Text style={styles.healthLabel}>Overall</Text>
              </View>
              <View style={styles.healthItem}>
                <View style={[styles.healthCircle, getHealthColor(project.health)]}>
                  <Text style={styles.healthIcon}>✓</Text>
                </View>
                <Text style={styles.healthLabel}>Schedule</Text>
              </View>
              <View style={styles.healthItem}>
                <View style={[styles.healthCircle, getHealthColor(budgetHealth)]}>
                  <Text style={styles.healthIcon}>$</Text>
                </View>
                <Text style={styles.healthLabel}>Budget</Text>
              </View>
              <View style={styles.healthItem}>
                <View style={[styles.healthCircle, getHealthColor(riskHealth)]}>
                  <Text style={styles.healthIcon}>!</Text>
                </View>
                <Text style={styles.healthLabel}>Risk</Text>
              </View>
            </View>
          </View>
        </View>

        {timelineData && (
          <View style={styles.timelineContainer}>
            <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>Project Timeline</Text>
            <View style={styles.timelineDates}>
              <Text style={styles.timelineDateText}>{format(timelineData.start, "MMM d, yyyy")}</Text>
              <Text style={styles.timelineDaysText}>{timelineData.daysRemaining} days remaining</Text>
              <Text style={styles.timelineDateText}>{format(timelineData.end, "MMM d, yyyy")}</Text>
            </View>
            <View style={styles.timelineTrack}>
              <View style={[styles.timelineElapsed, { width: `${timelineData.progressPercent}%` }]} />
              <View style={[styles.timelineProgress, { width: `${timelineData.completionPercent}%` }]} />
            </View>
            <View style={styles.timelineLegend}>
              <View style={styles.timelineLegendItem}>
                <View style={[styles.timelineLegendBox, { backgroundColor: "#2563eb" }]} />
                <Text style={styles.timelineLegendText}>Completed ({timelineData.completionPercent}%)</Text>
              </View>
              <View style={styles.timelineLegendItem}>
                <View style={[styles.timelineLegendBox, { backgroundColor: "#93c5fd" }]} />
                <Text style={styles.timelineLegendText}>Time Passed</Text>
              </View>
              <View style={styles.timelineLegendItem}>
                <View style={[styles.timelineLegendBox, { backgroundColor: "#f59e0b", width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 10, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#f59e0b" }]} />
                <Text style={styles.timelineLegendText}>Milestone</Text>
              </View>
            </View>
            {majorMilestones.length > 0 && (
              <View style={styles.milestoneDots}>
                {majorMilestones.slice(0, 4).map((m) => {
                  const status = getMilestoneStatus(m);
                  const color = status === "Complete" ? "#22c55e" : status === "At Risk" ? "#ef4444" : "#f59e0b";
                  return (
                    <View key={m.id} style={styles.milestoneDot}>
                      <View style={{ width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 8, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: color }} />
                      <Text style={styles.milestoneDotText}>{m.title.substring(0, 20)}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View style={styles.threeColumn}>
          <View style={[styles.column, styles.card]}>
            <Text style={styles.sectionTitle}>Task Progress</Text>
            <View style={styles.pieChartContainer}>
              <View style={styles.pieChart}>
                <View style={styles.pieCenter}>
                  <Text style={styles.pieCenterText}>{leafTasks.length}</Text>
                  <Text style={styles.pieCenterLabel}>Tasks</Text>
                </View>
              </View>
              <View style={styles.pieLegend}>
                <View style={styles.pieLegendItem}>
                  <View style={[styles.pieLegendColor, { backgroundColor: "#22c55e" }]} />
                  <Text style={styles.pieLegendText}>Completed</Text>
                  <Text style={styles.pieLegendValue}>{completed}</Text>
                </View>
                <View style={styles.pieLegendItem}>
                  <View style={[styles.pieLegendColor, { backgroundColor: "#3b82f6" }]} />
                  <Text style={styles.pieLegendText}>In Progress</Text>
                  <Text style={styles.pieLegendValue}>{inProgress}</Text>
                </View>
                <View style={styles.pieLegendItem}>
                  <View style={[styles.pieLegendColor, { backgroundColor: "#94a3b8" }]} />
                  <Text style={styles.pieLegendText}>Not Started</Text>
                  <Text style={styles.pieLegendValue}>{notStarted}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.column, styles.card]}>
            <Text style={styles.sectionTitle}>Budget Overview</Text>
            <View style={styles.barChartContainer}>
              <View style={styles.barRow}>
                <Text style={styles.barLabel}>Budget</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${safePercent(totalBudget, maxBudgetValue)}%`, backgroundColor: "#3b82f6" }]} />
                </View>
                <Text style={styles.barValue}>{formatCurrency(totalBudget)}</Text>
              </View>
              <View style={styles.barRow}>
                <Text style={styles.barLabel}>Actual</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${safePercent(actual, maxBudgetValue)}%`, backgroundColor: actual > totalBudget ? "#ef4444" : "#22c55e" }]} />
                </View>
                <Text style={styles.barValue}>{formatCurrency(actual)}</Text>
              </View>
              <View style={styles.barRow}>
                <Text style={styles.barLabel}>Forecast</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${safePercent(forecast, maxBudgetValue)}%`, backgroundColor: "#f59e0b" }]} />
                </View>
                <Text style={styles.barValue}>{formatCurrency(forecast)}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 6 }}>
              <Text style={{ fontSize: 8, color: "#6b7280" }}>Variance</Text>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: variance < 0 ? "#ef4444" : "#22c55e" }}>
                {formatCurrency(variance)}
              </Text>
            </View>
          </View>

          <View style={[styles.column, styles.card]}>
            <Text style={styles.sectionTitle}>Risks & Issues</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 1, backgroundColor: "#fef3c7", borderRadius: 4, padding: 8, alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: "#d97706" }}>{openRisks.length}</Text>
                <Text style={{ fontSize: 7, color: "#92400e" }}>Open Risks</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: "#fee2e2", borderRadius: 4, padding: 8, alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: "#dc2626" }}>{openIssues.length}</Text>
                <Text style={{ fontSize: 7, color: "#991b1b" }}>Open Issues</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", fontSize: 7 }}>
              <Text style={{ fontSize: 7, color: "#6b7280" }}>High/Critical: <Text style={{ color: "#dc2626", fontFamily: "Helvetica-Bold" }}>{riskHigh + issueCritical}</Text></Text>
            </View>
          </View>
        </View>

        <View style={styles.twoColumn}>
          <View style={[styles.column, styles.card]}>
            <Text style={styles.sectionTitle}>Major Milestones</Text>
            {majorMilestones.length === 0 ? (
              <Text style={styles.text}>No milestones defined</Text>
            ) : (
              majorMilestones.map((milestone) => {
                const status = getMilestoneStatus(milestone);
                return (
                  <View key={milestone.id} style={styles.milestoneRow}>
                    <Text style={styles.milestoneTitle}>{milestone.title}</Text>
                    <Text style={styles.milestoneDate}>
                      {format(new Date(milestone.dueDate), "MMM d, yyyy")}
                    </Text>
                    <Text
                      style={[
                        styles.milestoneStatus,
                        status === "Complete" ? styles.statusComplete :
                        status === "At Risk" ? styles.statusAtRisk : styles.statusOnTrack,
                      ]}
                    >
                      {status}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          <View style={[styles.column, styles.card]}>
            <Text style={styles.sectionTitle}>Key Risks & Issues</Text>
            {topRisksAndIssues.length === 0 ? (
              <Text style={styles.text}>No open risks or issues</Text>
            ) : (
              topRisksAndIssues.map((item, index) => (
                <View key={index} style={[styles.riskItem, { paddingVertical: 3 }]}>
                  <Text style={[styles.riskBadge, item.type === "risk" ? styles.riskBadgeRisk : styles.riskBadgeIssue]}>
                    {item.type === "risk" ? "RISK" : "ISSUE"}
                  </Text>
                  <Text style={styles.riskText}>{item.title}</Text>
                  <Text style={[
                    styles.riskPriority,
                    item.priority === "High" || item.priority === "Critical" ? styles.priorityHigh :
                    item.priority === "Medium" ? styles.priorityMedium : styles.priorityLow
                  ]}>
                    {item.priority}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Change Requests Section */}
        {changeRequests.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Change Requests ({changeRequests.length})</Text>
            {changeRequests.slice(0, 5).map((cr) => (
              <View key={cr.id} style={styles.milestoneRow}>
                <Text style={[styles.milestoneTitle, { flex: 2 }]}>{cr.title || 'Untitled change request'}</Text>
                <Text style={[styles.milestoneDate, { flex: 1, textTransform: "capitalize" }]}>
                  {cr.type?.replace('_', ' ') || 'Scope'}
                </Text>
                <Text style={[
                  styles.milestoneStatus,
                  cr.status === "approved" ? styles.statusComplete :
                  cr.status === "rejected" ? styles.statusAtRisk : styles.statusOnTrack
                ]}>
                  {cr.status?.replace('_', ' ') || 'pending'}
                </Text>
              </View>
            ))}
            {changeRequests.length > 5 && (
              <Text style={[styles.text, { marginTop: 4, fontStyle: "italic" }]}>
                + {changeRequests.length - 5} more change requests
              </Text>
            )}
          </View>
        )}

        {/* Documents Section */}
        {documents.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Project Documents ({documents.length})</Text>
            {documents.slice(0, 5).map((doc) => (
              <View key={doc.id} style={styles.milestoneRow}>
                <Text style={[styles.milestoneTitle, { flex: 2 }]}>{doc.title || 'Untitled document'}</Text>
                <Text style={[styles.milestoneDate, { flex: 1, textTransform: "capitalize" }]}>
                  {doc.category?.replace('_', ' ') || 'General'}
                </Text>
                <Text style={styles.milestoneStatus}>v{doc.version || '1.0'}</Text>
              </View>
            ))}
            {documents.length > 5 && (
              <Text style={[styles.text, { marginTop: 4, fontStyle: "italic" }]}>
                + {documents.length - 5} more documents
              </Text>
            )}
          </View>
        )}

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{leafTasks.length}</Text>
            <Text style={styles.statLabel}>Total Tasks</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, styles.statValueGreen]}>{Math.round(safePercent(completed, totalTasks))}%</Text>
            <Text style={styles.statLabel}>Complete</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{milestones.filter((m) => !m.deletedAt).length}</Text>
            <Text style={styles.statLabel}>Milestones</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, styles.statValueOrange]}>{openRisks.length + openIssues.length}</Text>
            <Text style={styles.statLabel}>Open Items</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Generated by FridayReport.AI on {format(new Date(), "MMMM d, yyyy 'at' h:mm a")}
        </Text>
      </Page>
    </Document>
  );
}
