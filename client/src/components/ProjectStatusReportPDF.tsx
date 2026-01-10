import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format } from "date-fns";
import type { Project, Risk, Issue, Milestone, ProjectFinancial, Task } from "@shared/schema";

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
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
  },
  headerDate: {
    color: "#ffffff",
    fontSize: 12,
    marginTop: 4,
    opacity: 0.9,
  },
  twoColumn: {
    flexDirection: "row",
    gap: 20,
  },
  column: {
    flex: 1,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    color: "#1f2937",
  },
  text: {
    fontSize: 9,
    color: "#4b5563",
    lineHeight: 1.4,
  },
  progressContainer: {
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 9,
    marginBottom: 3,
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
  healthContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 8,
  },
  healthItem: {
    alignItems: "center",
  },
  healthCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontSize: 8,
    color: "#6b7280",
  },
  healthIcon: {
    color: "#ffffff",
    fontSize: 14,
  },
  riskItem: {
    flexDirection: "row",
    marginBottom: 4,
    paddingLeft: 4,
  },
  riskIcon: {
    fontSize: 8,
    marginRight: 6,
    color: "#f59e0b",
  },
  riskText: {
    fontSize: 9,
    color: "#374151",
    flex: 1,
  },
  milestoneRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 4,
  },
  milestoneTitle: {
    flex: 2,
    fontSize: 9,
  },
  milestoneDate: {
    flex: 1,
    fontSize: 9,
    color: "#6b7280",
  },
  milestoneStatus: {
    flex: 1,
    fontSize: 9,
    textAlign: "right",
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
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  financialLabel: {
    fontSize: 9,
    color: "#374151",
  },
  financialValue: {
    fontSize: 9,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: "#1f2937",
  },
  badge: {
    backgroundColor: "#e5e7eb",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 8,
    color: "#374151",
  },
  badgeRow: {
    flexDirection: "row",
    marginTop: 4,
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

export function ProjectStatusReportPDF({
  project,
  risks,
  issues,
  milestones,
  financials,
  tasks,
  executiveSummary,
}: ProjectStatusReportPDFProps) {
  const completed = tasks.filter((t) => t.status === "Completed" || t.progress === 100).length;
  const inProgress = tasks.filter((t) => t.status === "In Progress").length;
  const notStarted = tasks.filter((t) => t.status === "Not Started" || (!t.status && t.progress === 0)).length;
  const total = tasks.length || 1;

  const budget = financials.reduce((sum, f) => sum + parseFloat(f.budgetAmount || "0"), 0);
  const actual = financials.reduce((sum, f) => sum + parseFloat(f.actualAmount || "0"), 0);
  const planned = financials.reduce((sum, f) => sum + parseFloat(f.plannedAmount || "0"), 0);
  const projectBudget = parseFloat(project.budget?.toString() || "0");
  const totalBudget = budget > 0 ? budget : (projectBudget > 0 ? projectBudget : 1);
  const forecast = planned > 0 ? planned : totalBudget;
  
  // Safe percentage calculation to avoid NaN
  const safePercent = (value: number, total: number) => {
    if (total <= 0 || isNaN(value) || isNaN(total)) return 0;
    return Math.min((value / total) * 100, 100);
  };

  const topRisks = risks
    .filter((r) => r.status === "Open" && !r.deletedAt)
    .slice(0, 3);
  const topIssues = issues
    .filter((i) => (i.status === "Open" || i.status === "In Progress") && !i.deletedAt)
    .slice(0, 2);

  const majorMilestones = milestones
    .filter((m) => !m.deletedAt)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 4);

  const getMilestoneStatus = (milestone: Milestone) => {
    if (milestone.completed || milestone.status === "Done") return "Complete";
    const dueDate = new Date(milestone.dueDate);
    const today = new Date();
    if (dueDate < today) return "At Risk";
    return "On Track";
  };

  const getHealthColor = (value: string | null | undefined) => {
    switch (value) {
      case "Green":
        return styles.healthGreen;
      case "Yellow":
        return styles.healthYellow;
      case "Red":
        return styles.healthRed;
      default:
        return styles.healthGreen;
    }
  };

  const budgetHealth = actual > totalBudget ? "Red" : actual > totalBudget * 0.9 ? "Yellow" : "Green";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>PROJECT STATUS REPORT</Text>
          <Text style={styles.headerDate}>{format(new Date(), "MMMM d, yyyy")}</Text>
        </View>

        <View style={styles.twoColumn}>
          <View style={styles.column}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Executive Summary</Text>
              <Text style={styles.text}>
                {executiveSummary || project.description || "No executive summary provided for this project."}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Project Schedule</Text>
              <View style={styles.progressContainer}>
                <Text style={styles.progressLabel}>Complete ({Math.round((completed / total) * 100)}%)</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${(completed / total) * 100}%` }]} />
                </View>
              </View>
              <View style={styles.progressContainer}>
                <Text style={styles.progressLabel}>In Progress ({Math.round((inProgress / total) * 100)}%)</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${(inProgress / total) * 100}%` }]} />
                </View>
              </View>
              <View style={styles.progressContainer}>
                <Text style={styles.progressLabel}>Not Started ({Math.round((notStarted / total) * 100)}%)</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${(notStarted / total) * 100}%` }]} />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Financials</Text>
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Budget</Text>
                <Text style={styles.financialValue}>{formatCurrency(totalBudget)}</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: "100%" }]} />
              </View>

              <View style={[styles.financialRow, { marginTop: 8 }]}>
                <Text style={styles.financialLabel}>Actual</Text>
                <Text style={styles.financialValue}>{formatCurrency(actual)}</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${safePercent(actual, totalBudget)}%` }]} />
              </View>

              <View style={[styles.financialRow, { marginTop: 8 }]}>
                <Text style={styles.financialLabel}>Forecast</Text>
                <Text style={styles.financialValue}>{formatCurrency(forecast)}</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${safePercent(forecast, totalBudget)}%` }]} />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Project Timeline</Text>
              <Text style={styles.text}>
                {project.startDate ? format(new Date(project.startDate), "MMM d, yyyy") : "Not set"} →{" "}
                {project.endDate ? format(new Date(project.endDate), "MMM d, yyyy") : "Not set"}
              </Text>
              <View style={[styles.progressBar, { marginTop: 6 }]}>
                <View style={[styles.progressFill, { width: `${project.completionPercentage || 0}%` }]} />
              </View>
              <Text style={[styles.text, { marginTop: 4 }]}>{project.completionPercentage || 0}% Complete</Text>
            </View>
          </View>

          <View style={styles.column}>
            <View style={styles.section}>
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
                    <Text style={styles.healthIcon}>✓</Text>
                  </View>
                  <Text style={styles.healthLabel}>Budget</Text>
                </View>
                <View style={styles.healthItem}>
                  <View style={[styles.healthCircle, styles.healthGreen]}>
                    <Text style={styles.healthIcon}>✓</Text>
                  </View>
                  <Text style={styles.healthLabel}>Resources</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Key Risks & Issues</Text>
              {topRisks.length === 0 && topIssues.length === 0 ? (
                <Text style={styles.text}>No open risks or issues</Text>
              ) : (
                <>
                  {topRisks.map((risk) => (
                    <View key={risk.id} style={styles.riskItem}>
                      <Text style={styles.riskIcon}>▲</Text>
                      <Text style={styles.riskText}>{risk.title}</Text>
                    </View>
                  ))}
                  {topIssues.map((issue) => (
                    <View key={issue.id} style={styles.riskItem}>
                      <Text style={styles.riskIcon}>▲</Text>
                      <Text style={styles.riskText}>{issue.title}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>

            <View style={styles.section}>
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
                          status === "Complete"
                            ? styles.statusComplete
                            : status === "At Risk"
                            ? styles.statusAtRisk
                            : styles.statusOnTrack,
                        ]}
                      >
                        {status}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Status</Text>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{project.status}</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{project.priority}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          Generated by FridayReport.AI on {format(new Date(), "MMMM d, yyyy 'at' h:mm a")}
        </Text>
      </Page>
    </Document>
  );
}
