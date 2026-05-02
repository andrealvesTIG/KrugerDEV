import { useState } from "react";
import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  Briefcase, 
  FolderKanban, 
  CheckSquare, 
  CircleDot, 
  Calendar, 
  Building2, 
  Users, 
  Shield, 
  Settings,
  ChevronRight,
  BookOpen,
  Target,
  TrendingUp,
  AlertTriangle,
  Clock,
  BarChart3,
  Layers,
  FileText,
  Search,
  Filter,
  Plus,
  Edit,
  Trash2,
  Eye,
  Moon,
  Sun,
  Download,
  GanttChart,
  ListTodo,
  ArrowRight,
  Zap,
  PieChart,
  Activity,
  Flag,
  CalendarDays,
  UserCircle,
  LogOut,
  Milestone,
  UserCog,
  Inbox,
  Link2,
  ExternalLink,
  Frame,
  Plug,
  CreditCard,
  DollarSign,
  FileSpreadsheet,
  Star,
  Gift,
  Scale,
  Lightbulb,
  Sliders,
  LayoutTemplate,
  Receipt,
  HelpCircle,
  Rocket,
  RefreshCw,
  GitMerge,
  Info,
  HardHat,
  ClipboardList,
  MessageSquare,
  FileImage,
  ShieldCheck,
  Hammer,
  Truck,
  GitBranch,
  Mic,
  Mail,
  Radar,
  Bot,
  GraduationCap,
  Copy,
  ListChecks
} from "lucide-react";
import { HelpDialog } from "@/components/HelpDialog";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { pdf, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const sections = [
  { id: "overview", name: "Overview", icon: BookOpen },
  { id: "dashboard", name: "Dashboard", icon: LayoutDashboard },
  { id: "portfolios", name: "Portfolios", icon: Briefcase },
  { id: "projects", name: "Projects", icon: FolderKanban },
  { id: "intakes", name: "Project Intakes", icon: Inbox },
  { id: "scoring", name: "Project Scoring", icon: Star },
  { id: "benefits", name: "Benefits Tracking", icon: Gift },
  { id: "decisions", name: "Decision Log", icon: Scale },
  { id: "lessons", name: "Lessons Learned", icon: Lightbulb },
  { id: "tasks", name: "Tasks", icon: CheckSquare },
  { id: "gantt-timeline", name: "Gantt & Timeline", icon: GanttChart },
  { id: "issues", name: "Issues", icon: CircleDot },
  { id: "timesheets", name: "Timesheets", icon: Clock },
  { id: "resources", name: "Resources", icon: UserCog },
  { id: "calendar", name: "Calendar", icon: Calendar },
  { id: "invoices", name: "Invoices", icon: DollarSign },
  { id: "simulation", name: "Simulation", icon: Activity },
  { id: "pmo-radar", name: "PMO Radar", icon: Radar },
  { id: "powerbi-agent", name: "Power BI Agent", icon: Bot },
  { id: "construction-overview", name: "Construction Suite", icon: HardHat },
  { id: "daily-logs", name: "Daily Logs", icon: ClipboardList },
  { id: "rfis", name: "RFIs", icon: HelpCircle },
  { id: "submittals", name: "Submittals", icon: FileText },
  { id: "drawings", name: "Drawings", icon: FileImage },
  { id: "punch-list", name: "Punch List", icon: ListChecks },
  { id: "quality-safety", name: "Quality & Safety", icon: ShieldCheck },
  { id: "bidding", name: "Bidding", icon: Hammer },
  { id: "vendors", name: "Vendors", icon: Truck },
  { id: "change-orders", name: "Change Orders", icon: GitBranch },
  { id: "construction-invoices", name: "Construction Invoices", icon: Receipt },
  { id: "meetings", name: "Meetings", icon: Mic },
  { id: "correspondence", name: "Correspondence", icon: Mail },
  { id: "integrations", name: "Integrations", icon: Plug },
  { id: "custom-links", name: "Custom Links", icon: Link2 },
  { id: "custom-fields", name: "Custom Fields", icon: Sliders },
  { id: "custom-tabs", name: "Custom Tabs", icon: LayoutTemplate },
  { id: "templates", name: "Templates", icon: Copy },
  { id: "training", name: "Training (Friday Academy)", icon: GraduationCap },
  { id: "billing", name: "Billing & Credits", icon: CreditCard },
  { id: "organizations", name: "Organizations", icon: Building2 },
  { id: "users", name: "User Management", icon: Users },
  { id: "settings", name: "Settings", icon: Settings },
  { id: "themes", name: "Themes", icon: Moon },
  { id: "notifications", name: "Notifications", icon: Flag },
  { id: "reports", name: "Scheduled Reports", icon: FileText },
  { id: "super-admin", name: "Super Admin", icon: Shield },
];

const pdfStyles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 40,
  },
  coverPage: {
    flexDirection: "column",
    backgroundColor: "#1e40af",
    padding: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  coverTitle: {
    fontSize: 42,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 20,
    textAlign: "center",
  },
  coverSubtitle: {
    fontSize: 18,
    color: "#bfdbfe",
    textAlign: "center",
    marginBottom: 40,
  },
  coverVersion: {
    fontSize: 14,
    color: "#93c5fd",
    textAlign: "center",
    position: "absolute",
    bottom: 60,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1e3a8a",
    marginBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: "#3b82f6",
    paddingBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 15,
  },
  paragraph: {
    fontSize: 11,
    lineHeight: 1.6,
    color: "#374151",
    marginBottom: 12,
    textAlign: "justify",
  },
  heading: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1f2937",
    marginTop: 15,
    marginBottom: 8,
  },
  listItem: {
    fontSize: 11,
    lineHeight: 1.6,
    color: "#374151",
    marginBottom: 6,
    marginLeft: 15,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    backgroundColor: "#3b82f6",
    borderRadius: 3,
    marginRight: 10,
    marginTop: 4,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  featureBox: {
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 6,
    marginBottom: 10,
  },
  featureTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 10,
    color: "#6b7280",
  },
  featureBoxDark: {
    backgroundColor: "#1f2937",
    padding: 12,
    borderRadius: 6,
    marginBottom: 10,
  },
  featureTitleDark: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 4,
  },
  featureDescDark: {
    fontSize: 10,
    color: "#9ca3af",
  },
  helpSection: {
    marginTop: 40,
    padding: 20,
    backgroundColor: "#eff6ff",
    borderRadius: 8,
  },
  helpHeading: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e40af",
    marginBottom: 8,
  },
  badge: {
    backgroundColor: "#dbeafe",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  badgeText: {
    fontSize: 9,
    color: "#1e40af",
  },
  badgeRed: {
    backgroundColor: "#fee2e2",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  badgeTextRed: {
    fontSize: 9,
    color: "#b91c1c",
  },
  badgePurple: {
    backgroundColor: "#f3e8ff",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  badgeTextPurple: {
    fontSize: 9,
    color: "#7c3aed",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  tocPage: {
    padding: 40,
  },
  tocTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1e3a8a",
    marginBottom: 30,
    textAlign: "center",
  },
  tocItem: {
    fontSize: 12,
    color: "#374151",
    marginBottom: 12,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
  },
  pageNumber: {
    position: "absolute",
    fontSize: 10,
    bottom: 20,
    right: 40,
    color: "#9ca3af",
  },
  footer: {
    position: "absolute",
    fontSize: 9,
    bottom: 20,
    left: 40,
    color: "#9ca3af",
  },
});

const UserGuidePDF = () => (
  <Document>
    <Page size="A4" style={pdfStyles.coverPage}>
      <Text style={pdfStyles.coverTitle}>FridayReport.AI</Text>
      <Text style={pdfStyles.coverSubtitle}>Project Portfolio Management</Text>
      <Text style={pdfStyles.coverSubtitle}>Complete User Guide</Text>
      <Text style={pdfStyles.coverVersion}>Version 2.0 - May 2026</Text>
    </Page>

    <Page size="A4" style={pdfStyles.tocPage}>
      <Text style={pdfStyles.tocTitle}>Table of Contents</Text>
      {sections.map((section, index) => (
        <Text key={section.id} style={pdfStyles.tocItem}>
          {index + 1}. {section.name}
        </Text>
      ))}
      <Text style={pdfStyles.pageNumber}>2</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>1. Overview</Text>
        <Text style={pdfStyles.sectionSubtitle}>Introduction to FridayReport.AI</Text>
        <Text style={pdfStyles.paragraph}>
          FridayReport.AI is an enterprise-grade Project Portfolio Management application designed to help teams 
          track projects, portfolios, risks, portfolio key dates, and issues efficiently. The application follows 
          modern design principles inspired by tools like Linear and Asana.
        </Text>
        <Text style={pdfStyles.heading}>Key Capabilities:</Text>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Portfolio Management</Text>
          <Text style={pdfStyles.featureDesc}>Organize projects into strategic portfolios for better visibility</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Project Tracking</Text>
          <Text style={pdfStyles.featureDesc}>Monitor progress, health status, and budgets in real-time</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Risk Management</Text>
          <Text style={pdfStyles.featureDesc}>Identify, assess, and mitigate project risks proactively</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Timeline Visualization</Text>
          <Text style={pdfStyles.featureDesc}>Calendar views for milestones and project timelines</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>3</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>2. Dashboard</Text>
        <Text style={pdfStyles.sectionSubtitle}>Your command center for project insights</Text>
        <Text style={pdfStyles.paragraph}>
          The Dashboard provides a high-level overview of your organization's project portfolio. 
          It displays key metrics, recent activity, and quick access to important information.
        </Text>
        <Text style={pdfStyles.heading}>Key Features:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Summary Cards: View total projects, portfolios, active tasks, and open issues at a glance</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Budget Overview: Track total allocated budget across all projects</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Health Indicators: Quickly identify projects needing attention with color-coded status</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Clickable Cards: Navigate directly to relevant pages by clicking metric cards</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Charts: Visual representations of project status and health distribution</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>4</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>3. Portfolios</Text>
        <Text style={pdfStyles.sectionSubtitle}>Strategic groupings of related projects</Text>
        <Text style={pdfStyles.paragraph}>
          Portfolios allow you to group related projects together for strategic management. 
          Each portfolio can have its own strategy, manager, and set of projects.
        </Text>
        <Text style={pdfStyles.heading}>Managing Portfolios:</Text>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Create Portfolio</Text>
          <Text style={pdfStyles.featureDesc}>Click the "New Portfolio" button and fill in name, description, and strategy</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>View Details</Text>
          <Text style={pdfStyles.featureDesc}>Click on a portfolio card to see all associated projects and details</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Edit Portfolio</Text>
          <Text style={pdfStyles.featureDesc}>Update portfolio information, strategy, or assigned manager</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Delete Portfolio</Text>
          <Text style={pdfStyles.featureDesc}>Remove portfolios that are no longer needed (requires admin permissions)</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>5</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>4. Projects</Text>
        <Text style={pdfStyles.sectionSubtitle}>Core project tracking and management</Text>
        <Text style={pdfStyles.paragraph}>
          Projects are the heart of FridayReport.AI. Track individual initiatives with detailed information 
          including status, priority, health, budget, and completion percentage.
        </Text>
        <Text style={pdfStyles.heading}>Project Attributes:</Text>
        <View style={pdfStyles.badgeRow}>
          <View style={pdfStyles.badge}><Text style={pdfStyles.badgeText}>Status</Text></View>
          <View style={pdfStyles.badge}><Text style={pdfStyles.badgeText}>Priority</Text></View>
          <View style={pdfStyles.badge}><Text style={pdfStyles.badgeText}>Health</Text></View>
          <View style={pdfStyles.badge}><Text style={pdfStyles.badgeText}>Progress</Text></View>
          <View style={pdfStyles.badge}><Text style={pdfStyles.badgeText}>Budget</Text></View>
        </View>
        <Text style={pdfStyles.heading}>Status Values:</Text>
        <Text style={pdfStyles.listItem}>Initiation, Planning, Execution, Monitoring, Closing, Billing</Text>
        <Text style={pdfStyles.heading}>Priority Levels:</Text>
        <Text style={pdfStyles.listItem}>Low, Medium, High, Critical</Text>
        <Text style={pdfStyles.heading}>Health Indicators:</Text>
        <Text style={pdfStyles.listItem}>Green (on track), Yellow (at risk), Red (critical)</Text>
        <Text style={pdfStyles.heading}>Project Details Tabs:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Overview Tab: Project summary with key metrics and description</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Tasks Tab: Manage project-specific tasks</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Risks Tab: Track and assess project risks</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Key Dates Tab: Define portfolio key dates</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Issues Tab: Log and track project issues</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>6</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>5. Project Intakes</Text>
        <Text style={pdfStyles.sectionSubtitle}>Project request pipeline and approval workflow</Text>
        <Text style={pdfStyles.paragraph}>
          The Project Intakes feature provides a structured pipeline for new project requests.
          Submit, review, and approve project proposals before they become active projects.
        </Text>
        <Text style={pdfStyles.heading}>Intake Workflow:</Text>
        <Text style={pdfStyles.listItem}>Submitted → Under Review → Approved → Project Created</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>6. Project Scoring</Text>
        <Text style={pdfStyles.sectionSubtitle}>Evaluate projects with weighted scoring criteria</Text>
        <Text style={pdfStyles.paragraph}>
          The Project Scoring feature allows you to evaluate projects using customizable weighted criteria.
          Create scoring criteria, assign scores, and calculate weighted totals for objective project assessment.
        </Text>
        <Text style={pdfStyles.heading}>How to Use:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Navigate to project details, select 'More' dropdown, then 'Scoring'</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Add criteria with name, category, weight, and description</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Score each criterion using the slider (0-10) with justification</Text>
        </View>
        <Text style={pdfStyles.heading}>Categories:</Text>
        <Text style={pdfStyles.listItem}>Strategic, Financial, Risk, Resource, Technical</Text>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>7</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>7. Benefits Tracking</Text>
        <Text style={pdfStyles.sectionSubtitle}>Track and measure project benefits realization</Text>
        <Text style={pdfStyles.paragraph}>
          Benefits Tracking helps you define, measure, and track expected project benefits.
          Monitor target vs actual values and track benefit realization progress.
        </Text>
        <Text style={pdfStyles.heading}>How to Use:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Navigate to project details, select 'More' dropdown, then 'Benefits'</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Click 'Add Benefit' and specify name, category, and target value</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Set target date and update actual values as benefits are realized</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Track progress via status: Planned → Partially Realized → Fully Realized</Text>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>8. Decision Log</Text>
        <Text style={pdfStyles.sectionSubtitle}>Document and track project decisions</Text>
        <Text style={pdfStyles.paragraph}>
          The Decision Log captures important project decisions, their rationale, and expected impact.
          Maintain a clear audit trail of key decisions made throughout the project lifecycle.
        </Text>
        <Text style={pdfStyles.heading}>How to Use:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Navigate to project details, select 'More' dropdown, then 'Decisions'</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Click 'Add Decision' and specify title, type, and decision maker</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Document rationale, impact, and set priority level</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Update status as decision moves from Pending → Approved → Implemented</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>8</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>9. Lessons Learned</Text>
        <Text style={pdfStyles.sectionSubtitle}>Capture knowledge from project experiences</Text>
        <Text style={pdfStyles.paragraph}>
          Lessons Learned allows you to capture both positive outcomes and areas for improvement.
          Build organizational knowledge to improve future project execution.
        </Text>
        <Text style={pdfStyles.heading}>Key Features:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Types: Positive (what went well), Negative (what to improve)</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Categories: Process, Technical, Communication, Resource, Risk, etc.</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Document root cause and actionable recommendations</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Organization-wide view from dedicated Lessons Learned page</Text>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>10. Tasks</Text>
        <Text style={pdfStyles.sectionSubtitle}>Work items and to-do tracking</Text>
        <Text style={pdfStyles.paragraph}>
          Tasks represent individual work items that need to be completed. They can be associated 
          with specific projects and assigned to team members.
        </Text>
        <Text style={pdfStyles.heading}>Task Management Features:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Status Tracking: Open, In Progress, Completed, Cancelled</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Priority Levels: Set importance from Low to Critical</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Due Dates: Set deadlines for task completion</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Assignment: Assign tasks to specific team members</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Gantt View: Visualize tasks on a timeline</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Kanban Board: Organize tasks by status columns</Text>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>11. Issues</Text>
        <Text style={pdfStyles.sectionSubtitle}>Bug tracking and problem resolution</Text>
        <Text style={pdfStyles.paragraph}>
          Issues help you track bugs, problems, and enhancement requests across your projects. 
          Each issue is linked to a specific project for organized tracking.
        </Text>
        <Text style={pdfStyles.heading}>Issue Types:</Text>
        <View style={pdfStyles.badgeRow}>
          <View style={pdfStyles.badgeRed}><Text style={pdfStyles.badgeTextRed}>Bug</Text></View>
          <View style={pdfStyles.badge}><Text style={pdfStyles.badgeText}>Task</Text></View>
          <View style={pdfStyles.badgePurple}><Text style={pdfStyles.badgeTextPurple}>Enhancement</Text></View>
        </View>
        <Text style={pdfStyles.heading}>Issue Workflow:</Text>
        <Text style={pdfStyles.listItem}>Open → In Progress → Resolved → Closed</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>12. Timesheets</Text>
        <Text style={pdfStyles.sectionSubtitle}>Time tracking and project hours management</Text>
        <Text style={pdfStyles.paragraph}>
          The Timesheets module allows team members to log time spent on projects and tasks. 
          Track billable hours, monitor team productivity, and generate time reports.
        </Text>
        <Text style={pdfStyles.heading}>Time Entry Features:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Log Hours: Record time spent on specific projects and tasks</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Date Selection: Enter time for any date, past or present</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Billable Flag: Mark time entries as billable or non-billable</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Weekly View: See your time entries organized by week</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>9</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>13. Resources</Text>
        <Text style={pdfStyles.sectionSubtitle}>Team member and resource management</Text>
        <Text style={pdfStyles.paragraph}>
          The Resources page helps you manage team members and resources across your organization. 
          Resources can be assigned to tasks, issues, and risks for better workload tracking.
        </Text>
        <Text style={pdfStyles.heading}>Resource Management:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Global Resource List: View all resources in your organization</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Auto-Sync Members: Organization members are automatically added as resources</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Resource Details: Track email, title, department, and skills</Text>
        </View>
        <Text style={pdfStyles.heading}>Resource Assignments:</Text>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Tasks</Text>
          <Text style={pdfStyles.featureDesc}>Assign multiple resources to tasks from the task dialog</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Issues</Text>
          <Text style={pdfStyles.featureDesc}>Assign resources to issues for tracking ownership</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Risks</Text>
          <Text style={pdfStyles.featureDesc}>Assign resources to manage and mitigate project risks</Text>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>14. Calendar</Text>
        <Text style={pdfStyles.sectionSubtitle}>Timeline and milestone visualization</Text>
        <Text style={pdfStyles.paragraph}>
          The Calendar view provides a visual timeline of your projects, milestones, and key dates. 
          Navigate through months to see upcoming deadlines and important events.
        </Text>
        <Text style={pdfStyles.heading}>Calendar Features:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Project Timelines: View project start and end dates</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Milestone Markers: See key milestone dates on the calendar</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Task Deadlines: Track upcoming task due dates</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Month Navigation: Easily navigate between months</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Color-Coded Events: Different colors for different projects</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>10</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>15. Integrations</Text>
        <Text style={pdfStyles.sectionSubtitle}>Connect with external services</Text>
        <Text style={pdfStyles.paragraph}>
          Integrate FridayReport.AI with external services like Microsoft Planner, Planner Premium,
          and other project management tools to sync your data seamlessly.
        </Text>
        <Text style={pdfStyles.heading}>Available Integrations:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Microsoft Planner: Import plans and tasks via Microsoft Graph API. Same-day tasks are auto-detected as milestones.</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Planner Premium / Project for the Web: Full project schedule import via the Dataverse API, including tasks, durations, hierarchies, dependencies (FS/FF/SS/SF), milestones, and resource assignments.</Text>
        </View>
        <Text style={pdfStyles.heading}>Planner Premium Import Guide:</Text>
        <Text style={pdfStyles.paragraph}>
          Before you start: You need a Microsoft 365 account with Planner Premium or Project Plan 3/5, and the integration must be enabled by your organization administrator. You also need your Dataverse environment URL. To find it: (A) open Project for the Web and copy the base domain from the address bar (before /main.aspx), (B) go to admin.powerplatform.microsoft.com, click Environments, select the one with your projects, and copy the Environment URL, or (C) go to make.powerapps.com, switch to the correct environment using the picker in the top-right, click the gear icon, select Session details, and copy the Instance url. If you have multiple environments, pick the one where your Project for the Web plans are stored.
        </Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Step 1: Go to Integrations and click Planner Premium</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Step 2: Enter your Dataverse environment URL and connect via Microsoft sign-in</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Step 3: Select plans to import and choose a target portfolio</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Step 4: Click Import Selected — each plan becomes a project with all tasks, dependencies, and assignments</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>After import, use Sync with Planner on the project page to pull the latest changes. Dependencies are always refreshed from Dataverse.</Text>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>16. Custom Links</Text>
        <Text style={pdfStyles.sectionSubtitle}>Add external resources to projects</Text>
        <Text style={pdfStyles.paragraph}>
          Add custom links to external resources, documentation, or tools directly from 
          project details. Keep all relevant resources accessible in one place.
        </Text>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>11</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>17. Custom Fields</Text>
        <Text style={pdfStyles.sectionSubtitle}>Define organization-level custom data fields</Text>
        <Text style={pdfStyles.paragraph}>
          Custom Fields allow organizations to define additional data fields for projects.
          Create text, number, date, or dropdown fields to capture organization-specific information.
        </Text>
        <Text style={pdfStyles.heading}>How to Create Custom Fields:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Navigate to Organization Settings, then 'Custom Fields' tab</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Click 'Add Field' and specify name, type, and entity</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Set validation rules and default values as needed</Text>
        </View>
        <Text style={pdfStyles.heading}>Field Types:</Text>
        <Text style={pdfStyles.listItem}>Text, Number, Date, Dropdown, Boolean</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>18. Custom Tabs</Text>
        <Text style={pdfStyles.sectionSubtitle}>Design custom tab layouts for project details</Text>
        <Text style={pdfStyles.paragraph}>
          Custom Tabs allow you to create additional tabs in project details pages 
          to display custom content and organize information your way.
        </Text>
        <Text style={pdfStyles.heading}>How to Create Custom Tabs:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Navigate to Organization Settings, then 'Custom Tabs' tab</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Click 'Add Tab' and specify a name and icon</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Configure tab content using the visual designer</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>12</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>19. Billing & Credits</Text>
        <Text style={pdfStyles.sectionSubtitle}>Subscription plans and usage tracking</Text>
        <Text style={pdfStyles.paragraph}>
          FridayReport.AI uses a credit-based billing system. Credits are consumed when creating projects, 
          tasks, issues, and other items. Each subscription plan includes a monthly credit allocation.
        </Text>
        <Text style={pdfStyles.heading}>Subscription Plans:</Text>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Free (200 credits/month)</Text>
          <Text style={pdfStyles.featureDesc}>Perfect for individuals getting started</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Professional (500 credits/month)</Text>
          <Text style={pdfStyles.featureDesc}>Ideal for small teams</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Business (1,000 credits/month)</Text>
          <Text style={pdfStyles.featureDesc}>For growing organizations</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Enterprise (100,000 credits/month)</Text>
          <Text style={pdfStyles.featureDesc}>For large-scale deployments</Text>
        </View>
        <Text style={pdfStyles.heading}>Credit Costs:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Projects: 10 credits, Portfolios: 5 credits</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Tasks & Issues: 2 credits each</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Risks & Key Dates: 1 credit each</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>13</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>20. Organizations</Text>
        <Text style={pdfStyles.sectionSubtitle}>Multi-organization support and switching</Text>
        <Text style={pdfStyles.paragraph}>
          FridayReport.AI supports multiple organizations. Each organization has its own set of portfolios, 
          projects, and team members. Switch between organizations using the sidebar selector.
        </Text>
        <Text style={pdfStyles.heading}>Access Control:</Text>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Super Admin</Text>
          <Text style={pdfStyles.featureDesc}>Can access all organizations and manage system-wide settings</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Organization Members</Text>
          <Text style={pdfStyles.featureDesc}>Can only access organizations they are members of</Text>
        </View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>21. User Management</Text>
        <Text style={pdfStyles.sectionSubtitle}>Profile and user settings</Text>
        <Text style={pdfStyles.paragraph}>
          Manage your user profile and account settings through the user menu in the sidebar. 
          Click on your avatar to access profile options.
        </Text>
        <Text style={pdfStyles.heading}>User Menu Options:</Text>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Profile: View and edit your personal information</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>User Settings: Configure your account preferences</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Org Settings: Manage organization settings (if authorized)</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Log Out: Sign out of the application</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>14</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>22. Settings</Text>
        <Text style={pdfStyles.sectionSubtitle}>Application and organization configuration</Text>
        <Text style={pdfStyles.paragraph}>
          Configure application settings, organization preferences, and user-specific options 
          through the various settings pages.
        </Text>
        <Text style={pdfStyles.heading}>Settings Areas:</Text>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Organization Settings</Text>
          <Text style={pdfStyles.featureDesc}>Manage organization name, description, and member access</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>User Settings</Text>
          <Text style={pdfStyles.featureDesc}>Personal preferences, notifications, and account settings</Text>
        </View>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Super Admin Panel</Text>
          <Text style={pdfStyles.featureDesc}>System-wide settings (Super Admins only)</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>15</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>23. Themes</Text>
        <Text style={pdfStyles.sectionSubtitle}>Customize your visual experience</Text>
        <Text style={pdfStyles.paragraph}>
          FridayReport.AI supports multiple themes to customize your visual experience. 
          Toggle between light and dark modes using the theme switcher in the top bar.
        </Text>
        <Text style={pdfStyles.heading}>Available Themes:</Text>
        <View style={pdfStyles.featureBox}>
          <Text style={pdfStyles.featureTitle}>Light Mode</Text>
          <Text style={pdfStyles.featureDesc}>Bright, clean interface ideal for daytime use and well-lit environments</Text>
        </View>
        <View style={pdfStyles.featureBoxDark}>
          <Text style={pdfStyles.featureTitleDark}>Dark Mode</Text>
          <Text style={pdfStyles.featureDescDark}>Easy on the eyes, perfect for low-light conditions and extended use</Text>
        </View>
        <Text style={pdfStyles.paragraph}>
          Your theme preference is saved automatically and will persist across sessions. 
          Simply click the sun or moon icon in the header to toggle between themes instantly.
        </Text>
      </View>

      <View style={pdfStyles.helpSection}>
        <Text style={pdfStyles.helpHeading}>Need More Help?</Text>
        <Text style={pdfStyles.paragraph}>
          Contact your administrator or reach out to our support team for additional assistance 
          with FridayReport.AI. We're here to help you get the most out of your project portfolio management.
        </Text>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>16</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Gantt &amp; Timeline</Text>
        <Text style={pdfStyles.sectionSubtitle}>Visualize task schedules and dependencies</Text>
        <Text style={pdfStyles.paragraph}>
          Every project includes an interactive Gantt-style timeline. Drag bars to reschedule, link
          tasks to create dependencies, and use the critical path overlay to spot the sequence of
          work that drives the end date.
        </Text>
        <Text style={pdfStyles.heading}>Core Capabilities:</Text>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Drag-to-Reschedule with auto-recalculated durations</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Dependencies: FS, SS, FF, SF</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Critical path highlighting</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Milestones, baselines, today marker, progress overlay</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Zoom levels: day, week, month, quarter, year</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Export to PDF/PNG and print for status meetings</Text></View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>PMO Radar</Text>
        <Text style={pdfStyles.sectionSubtitle}>Early-warning system for portfolio risk and health</Text>
        <Text style={pdfStyles.paragraph}>
          PMO Radar continuously scans every project across the organization and surfaces the ones
          that need attention with severity, signal type, and one-click drill-down.
        </Text>
        <Text style={pdfStyles.heading}>Signal Categories:</Text>
        <Text style={pdfStyles.listItem}>Schedule, Budget, Quality, Engagement, Risk, Resource</Text>
        <Text style={pdfStyles.heading}>Severity:</Text>
        <Text style={pdfStyles.listItem}>Critical, High, Medium, Low</Text>
        <Text style={pdfStyles.heading}>Workflow:</Text>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Filter by portfolio, owner, severity, or signal type</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Acknowledge, snooze, or dismiss alerts with reasons</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Trend view of red/yellow project counts over time</Text></View>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Sidebar &gt; PMO Radar (path /pmo-radar)</Text>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>17</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Power BI Agent</Text>
        <Text style={pdfStyles.sectionSubtitle}>Ask questions about your portfolio in plain English</Text>
        <Text style={pdfStyles.paragraph}>
          The Power BI Agent is an AI assistant that turns natural-language questions into the right
          query against your analytics dataset and returns a chart or table you can pin or export.
        </Text>
        <Text style={pdfStyles.heading}>Example Prompts:</Text>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>"Which projects are over budget this quarter?"</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>"Show the top 10 most overdue tasks across the portfolio."</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>"Compare planned vs actual hours for Marketing last month."</Text></View>
        <Text style={pdfStyles.heading}>How It Works:</Text>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Plain-language input with auto-visualization</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Refine in place ("group by portfolio", "limit to 90 days")</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Pin to dashboards, export to Excel, copy as image</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Respects organization permissions and shows the underlying query</Text></View>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Sidebar &gt; Power BI Agent (path /powerbi-agent)</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Construction Suite</Text>
        <Text style={pdfStyles.sectionSubtitle}>Field-ready modules for general contractors and owners</Text>
        <Text style={pdfStyles.paragraph}>
          The Construction Suite layers purpose-built modules on top of every construction-flagged
          project. Each module follows the same role and permission model as the rest of the
          platform.
        </Text>
        <Text style={pdfStyles.heading}>Modules:</Text>
        <Text style={pdfStyles.listItem}>Daily Logs, RFIs, Submittals, Drawings, Punch List, Quality &amp; Safety, Bidding, Vendors, Change Orders, Construction Invoices, Meetings, Correspondence</Text>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>18</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Daily Logs</Text>
        <Text style={pdfStyles.sectionSubtitle}>Capture daily field activity</Text>
        <Text style={pdfStyles.paragraph}>
          The field journal for the project. Each log is unique per project per date and captures
          weather, labor, equipment, visitors, notes, and attachments.
        </Text>
        <Text style={pdfStyles.heading}>Key fields:</Text>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Log date, weather (condition, temperature, wind, precipitation)</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Labor entries (company, trade, headcount, hours, notes)</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Equipment entries (name, quantity, hours, status)</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Visitors, notes, photos and attachments</Text></View>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Project &gt; Construction &gt; Daily Logs (path /daily-logs)</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>RFIs (Requests for Information)</Text>
        <Text style={pdfStyles.sectionSubtitle}>Formally raise and resolve design questions</Text>
        <Text style={pdfStyles.paragraph}>
          Auto-numbered RFIs are routed to a primary reviewer with optional cc'd parties, time-stamped
          at every step, and tracked against required-by dates so SLAs are visible.
        </Text>
        <Text style={pdfStyles.heading}>Status:</Text>
        <Text style={pdfStyles.listItem}>New RFIs default to Open and are closed once a response is accepted</Text>
        <Text style={pdfStyles.heading}>Key Features:</Text>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Discussion thread with attachments and internal notes</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Required-by date, distribution list, and link to change orders</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Aging report by reviewer to surface bottlenecks</Text></View>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Project &gt; Construction &gt; RFIs (path /rfis)</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Submittals</Text>
        <Text style={pdfStyles.sectionSubtitle}>Shop drawings, product data, and samples</Text>
        <Text style={pdfStyles.paragraph}>
          Manage formal submittal exchange between subs, GC, and design team with stamps, mark-ups,
          and full revision tracking.
        </Text>
        <Text style={pdfStyles.heading}>Status &amp; type defaults:</Text>
        <Text style={pdfStyles.listItem}>Status defaults to Pending; type defaults to Product Data</Text>
        <Text style={pdfStyles.heading}>Features:</Text>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Spec section tagging for coverage audits</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Lead-time tracking feeds the procurement schedule</Text></View>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Project &gt; Construction &gt; Submittals (path /submittals)</Text>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>19</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Drawings</Text>
        <Text style={pdfStyles.sectionSubtitle}>Single source of truth for the current set</Text>
        <Text style={pdfStyles.paragraph}>
          Drawings stores every revision of every sheet so the field always works from the latest
          set. Sheets are organized by discipline and number, version controlled, and viewable in the
          browser.
        </Text>
        <Text style={pdfStyles.heading}>Capabilities:</Text>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Drawings carry number, title, discipline, and current revision</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Versioned sets (e.g. Bid Set, Issued for Construction, As-Built)</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>In-browser viewer with markups stored per revision</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Download the current revision file at any time</Text></View>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Project &gt; Construction &gt; Drawings (path /drawings)</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Punch List</Text>
        <Text style={pdfStyles.sectionSubtitle}>Track close-out items to final acceptance</Text>
        <Text style={pdfStyles.paragraph}>
          Items are tied to a location, trade, and due date and travel from open to verified with
          photo evidence at every step.
        </Text>
        <Text style={pdfStyles.heading}>Status &amp; defaults:</Text>
        <Text style={pdfStyles.listItem}>Status defaults to Open, priority defaults to Medium</Text>
        <Text style={pdfStyles.heading}>Key fields:</Text>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Number, title, description, location, category</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Assigned to, due date, closed date</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Photos with type (e.g. issue / fixed) and a status history log</Text></View>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Project &gt; Construction &gt; Punch List (path /punch-list)</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Quality &amp; Safety</Text>
        <Text style={pdfStyles.sectionSubtitle}>Inspections, observations, incidents</Text>
        <Text style={pdfStyles.paragraph}>
          Reusable inspection templates, field observations, and incident reports — each with the
          corrective actions assigned, tracked, and verified to closure.
        </Text>
        <Text style={pdfStyles.heading}>Defaults:</Text>
        <Text style={pdfStyles.listItem}>Inspection status: Scheduled. Observation: category Safety, severity Low, status Open</Text>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Project &gt; Construction &gt; Quality &amp; Safety (path /quality-safety)</Text>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>20</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Bidding</Text>
        <Text style={pdfStyles.sectionSubtitle}>Invitations to bid and award packages</Text>
        <Text style={pdfStyles.paragraph}>
          Run a bid package from invitation through award. Each package has its own scope, vendor
          invitations, bids, line items, and award decision.
        </Text>
        <Text style={pdfStyles.heading}>Defaults:</Text>
        <Text style={pdfStyles.listItem}>Package: Draft. Invitation: Invited. Bid: Submitted</Text>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Project &gt; Construction &gt; Bidding (path /bidding)</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Vendors</Text>
        <Text style={pdfStyles.sectionSubtitle}>Subcontractor and supplier directory</Text>
        <Text style={pdfStyles.paragraph}>
          Master list of vendors with contact, address, trade specialty, license number, insurance
          expiry, bonding capacity, status (defaults to Active), rating, and an optional
          prequalification record.
        </Text>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Sidebar &gt; Vendors (path /vendors)</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Change Orders</Text>
        <Text style={pdfStyles.sectionSubtitle}>Originate, price, and execute changes</Text>
        <Text style={pdfStyles.paragraph}>
          Tier defaults to PCO and can be promoted to a Change Order Request, Owner Change Order, or
          Subcontract Change Order as the change progresses. Status defaults to Draft. Each record
          carries cost impact, schedule-impact days, and line items.
        </Text>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Project &gt; Construction &gt; Change Orders (path /change-orders)</Text>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>21</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Construction Invoices</Text>
        <Text style={pdfStyles.sectionSubtitle}>Schedule-of-values billing per period</Text>
        <Text style={pdfStyles.paragraph}>
          Each invoice covers one billing period and captures contract amount, total amount with
          approved changes, previous billed, current billed, balance to finish, retainage, period
          dates, and paid amount. Status defaults to Draft.
        </Text>
        <Text style={pdfStyles.heading}>Line items:</Text>
        <Text style={pdfStyles.listItem}>Each line carries scheduled value and percent complete that drives current billing</Text>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Project &gt; Construction &gt; Construction Invoices (path /construction-invoices)</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Meetings</Text>
        <Text style={pdfStyles.sectionSubtitle}>OAC, coordination, and subcontractor meetings</Text>
        <Text style={pdfStyles.paragraph}>
          Each meeting captures number, title, type (defaults to General), status (defaults to
          Scheduled), date / time / location, attendees, minutes, agenda items, and action items.
          Action items default to status Open and priority Medium.
        </Text>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Project &gt; Construction &gt; Meetings (path /meetings)</Text>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Correspondence</Text>
        <Text style={pdfStyles.sectionSubtitle}>Letters, transmittals, notices</Text>
        <Text style={pdfStyles.paragraph}>
          Auto-numbered formal communication record per project. Type defaults to Letter, status to
          Draft, priority to Normal. Each item carries from / to name and email, date, subject, body,
          and attachments.
        </Text>
        <Text style={pdfStyles.heading}>How to access:</Text>
        <Text style={pdfStyles.listItem}>Project &gt; Construction &gt; Correspondence (path /correspondence)</Text>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>22</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Templates</Text>
        <Text style={pdfStyles.sectionSubtitle}>Reusable starting points for new work</Text>
        <Text style={pdfStyles.paragraph}>
          Define a template once — with task list, custom fields, custom tabs, scoring criteria, and
          intake form — and create new projects (or accept intake submissions) that inherit that
          structure.
        </Text>
        <Text style={pdfStyles.heading}>Template Types:</Text>
        <Text style={pdfStyles.listItem}>Project, Portfolio, Intake Form, Scoring</Text>
        <Text style={pdfStyles.heading}>Governance:</Text>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Only org admins can publish or retire templates</Text></View>
        <View style={pdfStyles.listRow}><View style={pdfStyles.bulletPoint} /><Text style={pdfStyles.listItem}>Version history protects in-flight projects</Text></View>
      </View>

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>Training (Friday Academy)</Text>
        <Text style={pdfStyles.sectionSubtitle}>Self-paced learning paths for every role</Text>
        <Text style={pdfStyles.paragraph}>
          Friday Academy groups short video lessons, quick quizzes, and in-product walkthroughs into
          role-based learning paths so new users can ramp up without leaving the product.
        </Text>
        <Text style={pdfStyles.heading}>Paths:</Text>
        <Text style={pdfStyles.listItem}>Team Member, Project Manager, Portfolio Manager, Org Admin, Construction Lead, Analyst</Text>
        <Text style={pdfStyles.heading}>Lesson Format:</Text>
        <Text style={pdfStyles.listItem}>2-5 minute videos, quick quizzes, certificates on path completion</Text>
      </View>
      <Text style={pdfStyles.footer}>FridayReport.AI User Guide</Text>
      <Text style={pdfStyles.pageNumber}>23</Text>
    </Page>
  </Document>
);

function FeatureHighlight({ icon: Icon, title, description, color = "primary" }: { 
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color?: string;
}) {
  const colorClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    green: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
    purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
    orange: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
    red: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
    yellow: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400",
  };

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", colorClasses[color])}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h4 className="font-medium text-foreground">{title}</h4>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  );
}

function ActionItem({ icon: Icon, title, description }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
      <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
      <div>
        <h5 className="font-medium text-foreground">{title}</h5>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ScreenshotImage({ src, alt, caption }: {
  src: string;
  alt: string;
  caption?: string;
}) {
  const testId = src.split('/').pop()?.replace('.png', '') || 'screenshot';
  return (
    <div 
      className="my-6 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm"
      data-testid={`screenshot-container-${testId}`}
    >
      <img 
        src={src} 
        alt={alt} 
        className="w-full h-auto"
        loading="lazy"
        data-testid={`screenshot-img-${testId}`}
      />
      {caption && (
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
          <p className="text-sm text-muted-foreground text-center" data-testid={`screenshot-caption-${testId}`}>{caption}</p>
        </div>
      )}
    </div>
  );
}

export default function UserGuide() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'marketing';
  const visibleSections = isSuperAdmin ? sections : sections.filter(s => s.id !== 'super-admin');
  const [activeSection, setActiveSection] = useState("overview");
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);

  const navigateToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentIndex = visibleSections.findIndex(s => s.id === activeSection);
  const prevSection = currentIndex > 0 ? visibleSections[currentIndex - 1] : null;
  const nextSection = currentIndex < visibleSections.length - 1 ? visibleSections[currentIndex + 1] : null;

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const blob = await pdf(<UserGuidePDF />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Friday_Report_User_Guide.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-primary" />
              User Guide
            </h1>
            <p className="mt-2 text-muted-foreground">
              Complete documentation for FridayReport.AI - Project Portfolio Management
            </p>
          </div>
          <Button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF}
            className="gap-2"
            data-testid="button-download-pdf"
          >
            <Download className="h-4 w-4" />
            {isGeneratingPDF ? "Generating PDF..." : "Download PDF"}
          </Button>
        </div>

        <div className="flex gap-8">
          <Card className="w-64 h-fit sticky top-4 hidden lg:block">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Contents</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-300px)]">
                <nav className="space-y-1 px-3 pb-4">
                  {visibleSections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => navigateToSection(section.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                        activeSection === section.id
                          ? "bg-primary text-white"
                          : "text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                      data-testid={`nav-section-${section.id}`}
                    >
                      <section.icon className="h-4 w-4" />
                      {section.name}
                    </button>
                  ))}
                </nav>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex-1 max-w-4xl">
            {activeSection === "overview" && (
            <section id="overview">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Overview</CardTitle>
                      <CardDescription>Introduction to FridayReport.AI</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    FridayReport.AI is an enterprise-grade Project Portfolio Management application designed to help teams 
                    track projects, portfolios, risks, portfolio key dates, and issues efficiently. The application follows 
                    modern design principles inspired by tools like Linear and Asana.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <FeatureHighlight 
                      icon={Target}
                      title="Portfolio Management"
                      description="Organize projects into strategic portfolios for better visibility and alignment"
                      color="purple"
                    />
                    <FeatureHighlight 
                      icon={TrendingUp}
                      title="Project Tracking"
                      description="Monitor progress, health status, and budgets in real-time"
                      color="green"
                    />
                    <FeatureHighlight 
                      icon={AlertTriangle}
                      title="Risk Management"
                      description="Identify, assess, and mitigate project risks proactively"
                      color="orange"
                    />
                    <FeatureHighlight 
                      icon={Clock}
                      title="Timeline Visualization"
                      description="Calendar and Gantt views for milestones and project timelines"
                      color="blue"
                    />
                  </div>

                  <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      Quick Navigation
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Use the sidebar on the left to quickly jump between different areas of the application. 
                      The main navigation provides access to Dashboard, Portfolios, Projects, Tasks, Issues, and Calendar.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "dashboard" && (
            <section id="dashboard">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <LayoutDashboard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle>Dashboard</CardTitle>
                      <CardDescription>Your command center for project insights</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Dashboard provides a high-level overview of your organization's project portfolio. 
                    It displays key metrics, recent activity, and quick access to important information.
                  </p>
                  
                  <ScreenshotImage 
                    src="/images/guide/dashboard.png" 
                    alt="Dashboard Overview" 
                    caption="Dashboard showing key metrics, project health charts, and recent activity"
                  />
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-center">
                      <FolderKanban className="h-6 w-6 mx-auto text-blue-600 dark:text-blue-400" />
                      <p className="text-xs text-muted-foreground mt-2">Total Projects</p>
                    </div>
                    <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-center">
                      <Briefcase className="h-6 w-6 mx-auto text-purple-600 dark:text-purple-400" />
                      <p className="text-xs text-muted-foreground mt-2">Portfolios</p>
                    </div>
                    <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 text-center">
                      <CheckSquare className="h-6 w-6 mx-auto text-green-600 dark:text-green-400" />
                      <p className="text-xs text-muted-foreground mt-2">Active Tasks</p>
                    </div>
                    <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-center">
                      <CircleDot className="h-6 w-6 mx-auto text-red-600 dark:text-red-400" />
                      <p className="text-xs text-muted-foreground mt-2">Open Issues</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-6">Key Features:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Summary Cards:</strong> View total projects, portfolios, active tasks, and open issues at a glance</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Budget Overview:</strong> Track total allocated budget across all projects</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Health Indicators:</strong> Quickly identify projects needing attention with color-coded status</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Interactive Charts:</strong> Visual representations of project status and health distribution</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-6">Dashboard Tabs:</h4>
                  <p className="text-muted-foreground">
                    The Dashboard is organized into specialized tabs, each providing a focused view of different aspects of your portfolio:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Executive Summary</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">High-level KPIs, budget vs. actual spend, portfolio health, and project status distribution</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Portfolio Overview</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Portfolio-level metrics with drill-down into individual portfolio performance</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Risks & Issues</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Active risks and issues across all projects with severity and trend analysis</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Resource Management</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Resource allocation, utilization rates, and capacity planning overview</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Timesheet Dashboards</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Five dedicated views for time tracking analysis — resource hours, weekly summary, reports, project hours, and utilization</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "portfolios" && (
            <section id="portfolios">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                      <Briefcase className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <CardTitle>Portfolios</CardTitle>
                      <CardDescription>Strategic groupings of related projects</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Portfolios allow you to group related projects together for strategic management. 
                    Each portfolio can have its own strategy, manager, and set of projects.
                  </p>
                  
                  <ScreenshotImage 
                    src="/images/guide/portfolios.png" 
                    alt="Portfolios List View" 
                    caption="Portfolio grid view showing strategy, project count, health status, and budget information"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Managing Portfolios:</h4>
                  <div className="space-y-3">
                    <ActionItem 
                      icon={Plus}
                      title="Create Portfolio"
                      description="Click the 'New Portfolio' button and fill in name, description, and strategy"
                    />
                    <ActionItem 
                      icon={Eye}
                      title="View Details"
                      description="Click on a portfolio card to see all associated projects and metrics"
                    />
                    <ActionItem 
                      icon={Edit}
                      title="Edit Portfolio"
                      description="Update portfolio information, strategy, or assigned manager"
                    />
                    <ActionItem 
                      icon={Trash2}
                      title="Delete Portfolio"
                      description="Remove portfolios that are no longer needed (requires admin permissions)"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Portfolio Scoring Rollup:</h4>
                  <p className="text-muted-foreground">
                    The Scoring tab on each portfolio automatically aggregates project-level scores into a portfolio-wide view.
                    Scores are rolled up from individual projects using configurable aggregation methods.
                  </p>
                  <div className="space-y-3">
                    <ActionItem 
                      icon={BarChart3}
                      title="Overall Weighted Score"
                      description="Each criterion's aggregated score is normalized by its max score, multiplied by its weight, and combined into a single 0-10 overall score"
                    />
                    <ActionItem 
                      icon={Sliders}
                      title="Aggregation Methods"
                      description="Choose how project scores are combined per criterion: Average, Sum, Min, Max, or Weighted Average (by project budget)"
                    />
                    <ActionItem 
                      icon={TrendingUp}
                      title="Weighted Contribution"
                      description="Each criterion card shows its weighted contribution and percentage of the overall score, making the weight impact transparent"
                    />
                    <ActionItem 
                      icon={Eye}
                      title="Project Breakdown"
                      description="Expand any criterion to see individual project scores, progress bars, and justification notes"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Key Date Compliance:</h4>
                  <p className="text-muted-foreground">
                    The Scoring tab also tracks key date compliance across all projects in the portfolio. 
                    Key dates are categorized as Completed, Overdue, At Risk, or Upcoming, with an overall compliance rate percentage.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "projects" && (
            <section id="projects">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                      <FolderKanban className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <CardTitle>Projects</CardTitle>
                      <CardDescription>Core project tracking and management</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Projects are the heart of FridayReport.AI. Track individual initiatives with detailed information 
                    including status, priority, health, budget, and completion percentage.
                  </p>
                  
                  <ScreenshotImage 
                    src="/images/guide/projects.png" 
                    alt="Projects Table View" 
                    caption="Projects list with sortable columns, status badges, health indicators, and progress tracking"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Project Attributes:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Status</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Initiation, Planning, Execution, Monitoring, Closing, Billing</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Priority</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Low, Medium, High, Critical</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Health</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Green (on track), Yellow (at risk), Red (critical)</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Progress</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">0-100% completion with visual progress bar</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-6">Project Details Tabs:</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline" className="gap-1"><BarChart3 className="h-3 w-3" /> Overview</Badge>
                    <Badge variant="outline" className="gap-1"><CheckSquare className="h-3 w-3" /> Tasks</Badge>
                    <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3" /> Risks</Badge>
                    <Badge variant="outline" className="gap-1"><Milestone className="h-3 w-3" /> Key Dates</Badge>
                    <Badge variant="outline" className="gap-1"><CircleDot className="h-3 w-3" /> Issues</Badge>
                  </div>

                  <ul className="space-y-2 text-muted-foreground mt-4">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Overview:</strong> Project summary with key metrics and description</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Tasks:</strong> Manage project-specific tasks with Gantt and Kanban views</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Risks:</strong> Track and assess project risks with probability and impact</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Key Dates:</strong> Define portfolio key dates with Scrum board</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Issues:</strong> Log and track project issues and bugs</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "intakes" && (
            <section id="intakes">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
                      <Inbox className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <CardTitle>Project Intakes</CardTitle>
                      <CardDescription>Project request pipeline and approval workflow</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Project Intakes feature provides a structured pipeline for new project requests. 
                    Submit, review, and approve project proposals before they become active projects.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">Intake Workflow:</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">Submitted</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Under Review</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Approved</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Project Created</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Key Features:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Request Submission:</strong> Submit new project proposals with detailed information</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Priority Assessment:</strong> Set business priority for project requests</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Budget Estimation:</strong> Include estimated budget and timeline</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Approval Workflow:</strong> Multi-step approval process with status tracking</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Project Conversion:</strong> Convert approved intakes directly to active projects</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Whenever someone wants the organization to start new work — capturing the request through intake gives
                    you priority, sponsor, and rough sizing before it competes for resources or budget.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Sidebar &rarr; <code>Project Intakes</code>. Submitters can also use a public intake form when one is
                    published for the organization.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Approve only what you have capacity to staff — leaving requests as Submitted
                    is a healthier signal to the business than starting work that will sit idle.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "scoring" && (
            <section id="scoring">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                      <Star className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <CardTitle>Project Scoring</CardTitle>
                      <CardDescription>Evaluate projects with weighted scoring criteria</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Project Scoring feature allows you to evaluate projects using customizable weighted criteria. 
                    Create scoring criteria, assign scores, and calculate weighted totals for objective project assessment.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">How to Use Scoring:</h4>
                  <div className="space-y-3">
                    <ActionItem 
                      icon={Plus}
                      title="Add Scoring Criterion"
                      description="Navigate to project details, select the 'More' dropdown, then choose 'Scoring'. Click 'Add Criteria' to create a new scoring category"
                    />
                    <ActionItem 
                      icon={Sliders}
                      title="Configure Criteria"
                      description="Set name, description, category (Strategic, Financial, Risk, Resource, Technical), and weight for each criterion"
                    />
                    <ActionItem 
                      icon={BarChart3}
                      title="Score Projects"
                      description="Use the slider to set scores (0-10) for each criterion and add justification notes. Click 'Save Score' to persist each score"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Inline Editing:</h4>
                  <div className="space-y-3">
                    <ActionItem 
                      icon={Edit}
                      title="Edit Category"
                      description="Click the category badge on any criterion card to change its category via a dropdown selector. The change saves immediately"
                    />
                    <ActionItem 
                      icon={Edit}
                      title="Edit Weight"
                      description="Click the weight label on any criterion card to edit its weight inline. Press Enter to save or Escape to cancel"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Unsaved Changes:</h4>
                  <p className="text-muted-foreground">
                    When you adjust the score slider or justification without saving, the criteria card highlights with an amber border 
                    and an "Unsaved changes" label appears next to the Save button. Use the Reset button to revert to the last saved values.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Scoring Categories:</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Strategic</Badge>
                    <Badge variant="secondary">Financial</Badge>
                    <Badge variant="secondary">Risk</Badge>
                    <Badge variant="secondary">Resource</Badge>
                    <Badge variant="secondary">Technical</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Weighted Total Score:</h4>
                  <p className="text-muted-foreground">
                    The system calculates a weighted total score by normalizing each criterion's score by its maximum, 
                    multiplying by its weight, and combining into a single 0-10 scale. This provides an objective 
                    overall project score for comparison and prioritization. Saved project scores automatically 
                    flow into the portfolio-level Scoring Rollup.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    During project selection or annual portfolio refresh — anywhere you need to compare candidates on
                    consistent, weighted criteria instead of subjective opinion.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Open a project &rarr; <em>More</em> dropdown &rarr; <code>Scoring</code>. Aggregate results appear on
                    the parent portfolio's Scoring Rollup.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Define criteria once at the org level and reuse them — comparing scores across
                    projects only works when the criteria and weights are identical.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "benefits" && (
            <section id="benefits">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <Gift className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle>Benefits Tracking</CardTitle>
                      <CardDescription>Track and measure project benefits realization</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Benefits Tracking helps you define, measure, and track the expected benefits from your projects. 
                    Monitor target vs actual values and track benefit realization progress.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">How to Track Benefits:</h4>
                  <div className="space-y-3">
                    <ActionItem 
                      icon={Plus}
                      title="Add Benefit"
                      description="From project details, access 'Benefits' from the 'More' dropdown. Click 'Add Benefit' to define a new project benefit"
                    />
                    <ActionItem 
                      icon={Target}
                      title="Set Targets"
                      description="Define target values and target dates for benefit realization"
                    />
                    <ActionItem 
                      icon={TrendingUp}
                      title="Track Progress"
                      description="Update actual values to see realization percentage with visual progress indicators"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Benefit Categories:</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Financial</Badge>
                    <Badge variant="secondary">Operational</Badge>
                    <Badge variant="secondary">Strategic</Badge>
                    <Badge variant="secondary">Customer</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Benefit Types & Units:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">Tangible</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Measurable benefits with quantifiable values</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">Intangible</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Qualitative benefits that are harder to measure</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Realization Status:</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">Planned</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">In Progress</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Partially Realized</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Fully Realized</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Define benefits at business case time and update actuals on a cadence (often quarterly) after
                    go-live, so the project's promised value is tracked beyond the closeout date.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Open a project &rarr; <em>More</em> dropdown &rarr; <code>Benefits</code>.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Set realistic target dates beyond go-live — most benefits realize over months,
                    not on the day the project closes.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "decisions" && (
            <section id="decisions">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Scale className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle>Decision Log</CardTitle>
                      <CardDescription>Document and track project decisions</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Decision Log captures important project decisions, their rationale, and expected impact. 
                    Maintain a clear audit trail of key decisions made throughout the project lifecycle.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">How to Log Decisions:</h4>
                  <div className="space-y-3">
                    <ActionItem 
                      icon={Plus}
                      title="Log Decision"
                      description="From project details, access 'Decisions' from the 'More' dropdown. Click 'Log Decision' to record a new decision"
                    />
                    <ActionItem 
                      icon={FileText}
                      title="Document Rationale"
                      description="Explain why the decision was made and document the reasoning"
                    />
                    <ActionItem 
                      icon={AlertTriangle}
                      title="Define Impact"
                      description="Describe the expected impact of the decision on the project"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Decision Types:</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Strategic</Badge>
                    <Badge variant="secondary">Financial</Badge>
                    <Badge variant="secondary">Resource</Badge>
                    <Badge variant="secondary">Risk</Badge>
                    <Badge variant="secondary">Scope</Badge>
                    <Badge variant="secondary">Technical</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Decision Status:</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">Pending</Badge>
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Approved</Badge>
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Rejected</Badge>
                    <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Deferred</Badge>
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">Implemented</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Priority Levels:</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-red-500 text-red-600">Critical</Badge>
                    <Badge variant="outline" className="border-orange-500 text-orange-600">High</Badge>
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600">Medium</Badge>
                    <Badge variant="outline" className="border-slate-400 text-slate-600">Low</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Any time the team makes a non-trivial choice — scope trade-off, vendor selection, schedule
                    re-baseline. Logging it in the moment beats trying to reconstruct context months later.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Open a project &rarr; <em>More</em> dropdown &rarr; <code>Decisions</code>.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Capture <em>options considered</em> alongside the chosen path — that's what
                    makes the log useful when someone asks "why didn't we just&hellip;" three months later.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "lessons" && (
            <section id="lessons">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                      <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <CardTitle>Lessons Learned</CardTitle>
                      <CardDescription>Capture knowledge from project experiences</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Lessons Learned allows you to capture both positive outcomes and areas for improvement from your projects. 
                    Build organizational knowledge to improve future project execution.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">How to Use Lessons Learned:</h4>
                  <div className="space-y-3">
                    <ActionItem 
                      icon={Plus}
                      title="Add Lesson"
                      description="From project details, access 'Lessons Learned' from the 'More' dropdown or from the dedicated Lessons Learned page in the sidebar"
                    />
                    <ActionItem 
                      icon={FileText}
                      title="Document Root Cause"
                      description="Explain what caused the positive outcome or issue"
                    />
                    <ActionItem 
                      icon={Target}
                      title="Add Recommendations"
                      description="Provide actionable recommendations for future projects"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Lesson Categories:</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Process</Badge>
                    <Badge variant="secondary">Technical</Badge>
                    <Badge variant="secondary">Communication</Badge>
                    <Badge variant="secondary">Resource</Badge>
                    <Badge variant="secondary">Risk Management</Badge>
                    <Badge variant="secondary">Stakeholder</Badge>
                    <Badge variant="secondary">Vendor</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Lesson Types:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-green-100 text-green-700">Positive</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">What went well - practices to continue</p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-red-100 text-red-700">Negative</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">What to improve - areas for change</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Lesson Status:</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">Draft</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Under Review</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Approved</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Archived</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Organization-Wide View:</h4>
                  <p className="text-muted-foreground">
                    Access the dedicated Lessons Learned page from the sidebar to view lessons across all projects 
                    in your organization. Use filters to search by project, category, type, or status.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Capture lessons in the moment they happen, then formally review them at project close — and revisit
                    the org-wide list at the start of every new initiative as part of planning.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Sidebar &rarr; <code>Lessons Learned</code> for the org view, or open a project &rarr; <em>More</em>
                    &rarr; <code>Lessons Learned</code> to scope to one project.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Move lessons through the workflow — Draft to Approved — so the cross-project
                    list shows only validated insights rather than half-formed observations.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "tasks" && (
            <section id="tasks">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                      <CheckSquare className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <CardTitle>Tasks</CardTitle>
                      <CardDescription>Work items and to-do tracking</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Tasks represent individual work items that need to be completed. They can be associated 
                    with specific projects and assigned to team members.
                  </p>
                  
                  <ScreenshotImage 
                    src="/images/guide/tasks.png" 
                    alt="Tasks Kanban Board" 
                    caption="Task management with Kanban board view showing tasks organized by status columns"
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <FeatureHighlight 
                      icon={GanttChart}
                      title="Gantt Chart View"
                      description="Visualize tasks on a timeline with start and end dates"
                      color="blue"
                    />
                    <FeatureHighlight 
                      icon={ListTodo}
                      title="List View"
                      description="Traditional list view with sorting and filtering"
                      color="green"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Task Management:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Status Tracking:</strong> Not Started, In Progress, Completed, On Hold</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Progress:</strong> Track percentage complete with visual progress bar</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Date Range:</strong> Set start and end dates for timeline planning</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Assignment:</strong> Assign tasks to specific team members</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "issues" && (
            <section id="issues">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                      <CircleDot className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <CardTitle>Issues</CardTitle>
                      <CardDescription>Bug tracking and problem resolution</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Issues help you track bugs, problems, and enhancement requests across your projects. 
                    Each issue is linked to a specific project for organized tracking.
                  </p>
                  
                  <ScreenshotImage 
                    src="/images/guide/issues.png" 
                    alt="Issues List View" 
                    caption="Issues tracking table with type badges, priority levels, and status workflow"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Issue Types:</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Bug</Badge>
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Task</Badge>
                    <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Enhancement</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Issue Workflow:</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">Open</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">In Progress</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Resolved</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Closed</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Priority Levels:</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-red-500 text-red-600">Critical</Badge>
                    <Badge variant="outline" className="border-orange-500 text-orange-600">High</Badge>
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600">Medium</Badge>
                    <Badge variant="outline" className="border-slate-400 text-slate-600">Low</Badge>
                  </div>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "timesheets" && (
            <section id="timesheets">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                      <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <CardTitle>Timesheets</CardTitle>
                      <CardDescription>Time tracking and project hours management</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Timesheets module allows team members to log time spent on projects and tasks. 
                    Track billable hours, monitor team productivity, and generate time reports.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">Time Entry:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Log Hours:</strong> Record time spent on specific projects and tasks</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Date Selection:</strong> Enter time for any date, past or present</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Descriptions:</strong> Add notes describing the work performed</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Billable Flag:</strong> Mark time entries as billable or non-billable</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Views & Reports:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Weekly View</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">See your time entries organized by week</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Project Summary</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Total hours logged per project</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Team Overview</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Manager view of team time entries</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Export</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Export time data to Excel for reporting</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-6">Approval Workflow:</h4>
                  <p className="text-muted-foreground">
                    Time entries go through a structured approval process to ensure accuracy:
                  </p>
                  <ul className="space-y-2 text-muted-foreground mt-2">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Submit:</strong> Team members submit their completed timesheets for review</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Approve:</strong> Managers review and approve submitted time entries</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Reject:</strong> Entries can be rejected with comments for team members to revise</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-6">Time Periods:</h4>
                  <p className="text-muted-foreground">
                    Admins can manage open and closed time periods to control when entries can be logged:
                  </p>
                  <ul className="space-y-2 text-muted-foreground mt-2">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Open Periods:</strong> Time entries can be created and edited for open periods</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Closed Periods:</strong> Lock past periods to prevent changes to historical time data</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-6">Time Categories & Time Off:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Categories:</strong> Classify time entries (e.g., Development, Meeting, Support) for better reporting</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Non-Project Time:</strong> Log time off, vacation, sick leave, and other non-project activities</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Auto-Save:</strong> Time entries save automatically as you type, so you never lose work</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-6">Dashboard Reports:</h4>
                  <p className="text-muted-foreground">
                    The Timesheets module includes five dashboard views for analyzing time data:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Resource Hours</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Total hours per resource across all projects</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Weekly Summary</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Week-by-week breakdown of time logged by the team</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Timesheet Report</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Detailed line-item report of all time entries</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Project Hours</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Total hours grouped by project for budget tracking</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Resource Utilization</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Compare logged hours against available capacity</p>
                    </div>
                  </div>
                  <div className="p-3 mt-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Tip:</strong> Resources marked as "Hidden from Timesheets" are automatically excluded from all five dashboard views to keep reports focused on active team members.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "resources" && (
            <section id="resources">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30">
                      <UserCog className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <CardTitle>Resources</CardTitle>
                      <CardDescription>Team member and resource management</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Resources page helps you manage team members and resources across your organization. 
                    Resources can be assigned to tasks, issues, and risks for better workload tracking.
                  </p>
                  
                  <ScreenshotImage 
                    src="/images/guide/resources.png" 
                    alt="Resources List" 
                    caption="Team member management with roles, departments, skills, and availability tracking"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Resource Management:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Global Resource List:</strong> View all resources in your organization</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Auto-Sync Members:</strong> Organization members are automatically added as resources</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Resource Details:</strong> Track email, title, department, and skills</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Active Status:</strong> Mark resources as active or inactive</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Excel Import/Export:</h4>
                  <p className="text-muted-foreground">
                    Bulk manage resources using Excel spreadsheets for easy data transfer:
                  </p>
                  <div className="space-y-3 mt-2">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Download className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Export to Excel</h5>
                        <p className="text-sm text-muted-foreground">Download all resources as an Excel file with name, email, title, department, and skills</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <FileSpreadsheet className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Import from Excel</h5>
                        <p className="text-sm text-muted-foreground">Upload an Excel file to bulk create or update resources. Use the exported template format.</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 mt-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Tip:</strong> Export first to get the correct template format, then modify the Excel file and re-import to update resources in bulk.
                    </p>
                  </div>

                  <h4 className="font-semibold text-foreground mt-6">Resource Assignments:</h4>
                  <p className="text-muted-foreground">
                    Assign resources to work items throughout the application:
                  </p>
                  <div className="space-y-3 mt-2">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <CheckSquare className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Tasks</h5>
                        <p className="text-sm text-muted-foreground">Assign multiple resources to tasks from the task dialog</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <CircleDot className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Issues</h5>
                        <p className="text-sm text-muted-foreground">Assign resources to issues for tracking ownership</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <AlertTriangle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Risks</h5>
                        <p className="text-sm text-muted-foreground">Assign resources to manage and mitigate project risks</p>
                      </div>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-6">Resource Settings:</h4>
                  <p className="text-muted-foreground">
                    Each resource has configurable settings in the Settings tab of the resource dialog:
                  </p>
                  <ul className="space-y-2 text-muted-foreground mt-2">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Hourly Rate:</strong> Set the resource's hourly billing rate for cost calculations</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Billable:</strong> Mark whether the resource's time is billable by default</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Hide from Timesheets:</strong> Exclude the resource from all timesheet dashboard views — useful for contractors, shared resources, or inactive team members you want to keep on record</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Link to User Account:</strong> Connect the resource to a platform user for login access and permissions</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-6">Utilization Dashboards:</h4>
                  <p className="text-muted-foreground">
                    Resource details pages include specialized dashboards for capacity planning and workload analysis:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Capacity Planning</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">View resource allocation against available capacity over time</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Workload Dashboard</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Monitor current workload distribution and identify over-allocated resources</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Availability Calendar</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">See resource availability, time off, and leave schedules at a glance</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Demand vs. Supply</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Forecast resource demand against available supply for planning ahead</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-6">Merge Duplicates:</h4>
                  <p className="text-muted-foreground">
                    If duplicate resources exist (e.g., from imports), you can merge them to consolidate all assignments, 
                    time entries, and history under a single record. Select the duplicate resources and choose which one to keep as the primary.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "calendar" && (
            <section id="calendar">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                      <Calendar className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div>
                      <CardTitle>Calendar</CardTitle>
                      <CardDescription>Timeline and milestone visualization</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Calendar view provides a visual timeline of your projects, milestones, and key dates. 
                    Navigate through months to see upcoming deadlines and important events.
                  </p>
                  
                  <ScreenshotImage 
                    src="/images/guide/calendar.png" 
                    alt="Calendar View" 
                    caption="Monthly calendar with color-coded project milestones and deadline markers"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Calendar Features:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Project Timelines:</strong> View project start and end dates visually</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Milestone Markers:</strong> See key milestone dates on the calendar</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Task Deadlines:</strong> Track upcoming task due dates</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Month Navigation:</strong> Easily navigate between months</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Color-Coded Events:</strong> Different colors for different projects</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Use the calendar when you need a date-based view of milestones and key dates — schedule planning,
                    weekly look-aheads, or talking the leadership team through an upcoming month.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Sidebar &rarr; <code>Calendar</code>.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Treat the calendar as an output, not an input — milestones come from the
                    project's key dates, so to change what shows up here, edit the project.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "invoices" && (
            <section id="invoices">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle>Invoices</CardTitle>
                      <CardDescription>Track and manage invoices from external systems</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Invoices module lets you track and manage invoices imported from external systems like Microsoft Dynamics 365. 
                    View invoice details, filter by status, and keep financial records aligned with your project portfolios.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Invoice Statuses:</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline">Draft</Badge>
                    <Badge variant="outline">Pending</Badge>
                    <Badge variant="outline">Paid</Badge>
                    <Badge variant="outline">Overdue</Badge>
                    <Badge variant="outline">Cancelled</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Key Features:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Import Invoices:</strong> Automatically import invoices from Microsoft Dynamics 365 or add them manually</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Invoice Details:</strong> View invoice number, amount, issue date, due date, and current status</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Filter by Status:</strong> Quickly find invoices by filtering on Draft, Pending, Paid, Overdue, or Cancelled</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Dynamics 365 Integration:</strong> Connect to Microsoft Dynamics 365 for automatic invoice synchronization</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "simulation" && (
            <section id="simulation">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                      <Activity className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <CardTitle>Simulation</CardTitle>
                      <CardDescription>Monte Carlo-style project simulations and forecasting</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Run Monte Carlo-style project simulations to forecast outcomes across your portfolio. 
                    Simulate different scenarios to understand potential risks, budget variances, and schedule impacts before they happen.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Scenario Types:</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline">Baseline</Badge>
                    <Badge variant="outline">Optimistic</Badge>
                    <Badge variant="outline">Pessimistic</Badge>
                    <Badge variant="outline">Risk-Heavy</Badge>
                    <Badge variant="outline">Resource Constrained</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Simulation Features:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Real-Time Controls:</strong> Play, pause, and step through simulations with interactive controls</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Event Notifications:</strong> Receive alerts for significant simulation events as they occur</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Budget Variance:</strong> Track projected budget overruns and underruns across scenarios</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Schedule Variance:</strong> Forecast schedule delays and acceleration for each project</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Simulation Outputs:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Portfolio Health Indicators:</strong> Aggregated health metrics across all simulated projects</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Project Risk Analysis:</strong> Identify high-risk projects based on simulation results</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Budget Forecasting:</strong> Probability-weighted budget projections for informed decision-making</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Resource Utilization:</strong> Predicted resource demand and capacity gaps under different scenarios</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "integrations" && (
            <section id="integrations">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <Plug className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle>Integrations</CardTitle>
                      <CardDescription>Connect with external tools and services</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Integrations hub allows you to connect FridayReport.AI with external tools and services. 
                    Access integrations through the sidebar to enhance your project management workflow.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">Integration Categories:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Microsoft 365</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Power BI, SharePoint, Teams integration</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Analytics</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Power BI reports and dashboards</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Import/Export</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Microsoft Project, Excel, CSV formats</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Communication</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Email notifications and alerts</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Available Integrations:</h4>
                  <div className="space-y-3 mt-2">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Plug className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Microsoft Planner</h5>
                        <p className="text-sm text-muted-foreground">Import plans and tasks from Microsoft Planner via Microsoft Graph API. Tasks imported from Planner are read-only in FridayReport.AI to prevent sync conflicts. Same-day tasks (where start and due date match) are automatically detected as milestones.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20">
                      <Rocket className="h-5 w-5 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Planner Premium / Project for the Web</h5>
                        <p className="text-sm text-muted-foreground mb-3">Import full project schedules from Planner Premium (Project for the Web) via the Dataverse API. This includes tasks with precise durations, start/end dates, task hierarchies, dependencies, and resource assignments.</p>
                        <div className="space-y-3">
                          <div className="p-3 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <h6 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                              <Info className="h-3.5 w-3.5 text-blue-500" />
                              Before You Start
                            </h6>
                            <ul className="text-xs text-muted-foreground space-y-1.5">
                              <li className="flex items-start gap-1.5">
                                <span className="text-purple-500 mt-0.5">1.</span>
                                <span>You need a <strong>Microsoft 365</strong> account with access to Planner Premium (Project for the Web) or Project Plan 3/5</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="text-purple-500 mt-0.5">2.</span>
                                <div>
                                  <span>Know your organization's <strong>Dataverse environment URL</strong> (e.g. <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs">https://yourorg.crm.dynamics.com</code>). Here's how to find it:</span>
                                  <div className="mt-2 ml-1 space-y-2">
                                    <div className="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                      <p className="font-medium text-foreground text-[11px] mb-1">Option A — From Project for the Web</p>
                                      <p className="text-[11px]">Open any project in <strong>Project for the Web</strong>. Look at the URL in your browser's address bar — copy everything before <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">/main.aspx</code>. For example, if the URL is <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">https://yourorg.crm.dynamics.com/main.aspx?...</code>, your environment URL is <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">https://yourorg.crm.dynamics.com</code></p>
                                    </div>
                                    <div className="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                      <p className="font-medium text-foreground text-[11px] mb-1">Option B — From Power Platform admin center</p>
                                      <p className="text-[11px]">Go to <strong>admin.powerplatform.microsoft.com</strong> &gt; <strong>Environments</strong>. You'll see a list of all your organization's environments. Click on the one where your projects live (usually the default or production environment) and copy the <strong>Environment URL</strong> shown in the details panel. If you have multiple environments, choose the one that contains your Project for the Web plans — this is typically named "default" or matches your organization name</p>
                                    </div>
                                    <div className="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                      <p className="font-medium text-foreground text-[11px] mb-1">Option C — From Power Apps</p>
                                      <p className="text-[11px]">Go to <strong>make.powerapps.com</strong>. If your organization has multiple environments, use the environment picker in the top-right corner to switch to the correct one. Then click the gear icon, select <strong>Session details</strong>, and copy the <strong>Instance url</strong> value</p>
                                    </div>
                                  </div>
                                  <p className="mt-2 text-[11px] italic">Not sure which environment to pick? Your Project for the Web plans are stored in a specific Dataverse environment. If you see no plans after connecting, try a different environment URL.</p>
                                </div>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="text-purple-500 mt-0.5">3.</span>
                                <span>The Planner Premium integration must be enabled by your organization's administrator. If you see an authentication error, contact your admin to confirm the integration has been set up</span>
                              </li>
                            </ul>
                          </div>

                          <div className="p-3 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <h6 className="text-sm font-medium text-foreground mb-2">Step-by-Step Import</h6>
                            <ol className="text-xs text-muted-foreground space-y-2">
                              <li className="flex items-start gap-1.5">
                                <span className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                                <span>Go to the <strong>Integrations</strong> page from the sidebar and click on <strong>Planner Premium</strong></span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                                <span>Enter your <strong>Dataverse environment URL</strong> and click Connect. You will be redirected to Microsoft to sign in and grant permissions</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                                <span>After authenticating, the wizard will display all your <strong>Project for the Web</strong> plans. Use the search bar to filter plans by name</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">4</span>
                                <span>Select one or more plans to import. Choose a <strong>target portfolio</strong> or leave unassigned</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">5</span>
                                <span>Click <strong>Import Selected</strong> and wait for the import to complete. Each plan is imported as a separate project</span>
                              </li>
                            </ol>
                          </div>

                          <div className="p-3 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <h6 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                              <CheckSquare className="h-3.5 w-3.5 text-green-500" />
                              What Gets Imported
                            </h6>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                <span>Tasks with start/end dates and durations</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                <span>Task hierarchy (parent/child structure)</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                <span>WBS codes and outline levels</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                <span>Progress percentage and status</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                <span>Task dependencies (FS, FF, SS, SF)</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                <span>Milestones (zero-duration tasks)</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                <span>Resource/team member assignments</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                <span>Task descriptions and priorities</span>
                              </div>
                            </div>
                          </div>

                          <div className="p-3 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <h6 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                              <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
                              Syncing After Import
                            </h6>
                            <ul className="text-xs text-muted-foreground space-y-1.5">
                              <li className="flex items-start gap-1.5">
                                <ChevronRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                                <span>After importing, go to the project's details page and click <strong>Sync with Planner</strong> to pull the latest changes from Planner Premium</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <ChevronRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                                <span>Sync refreshes all tasks, durations, dependencies, and progress from the Dataverse source</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <ChevronRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                                <span>Your existing timesheet entries, change logs, and locally-created data are preserved during sync</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <ChevronRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                                <span>When Dataverse is reachable, dependencies are refreshed from the source of truth during sync, replacing any local changes</span>
                              </li>
                            </ul>
                          </div>

                          <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                            <h6 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Troubleshooting
                            </h6>
                            <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1.5">
                              <li className="flex items-start gap-1.5">
                                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                                <span><strong>No plans found:</strong> Make sure your Microsoft account has access to Project for the Web plans in the Dataverse environment you specified. Double-check the environment URL</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                                <span><strong>Authentication error:</strong> The integration may not be configured yet. Contact your organization administrator to confirm the Planner Premium connection has been set up</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                                <span><strong>Session expired:</strong> Click the Reconnect button in the wizard to sign in with Microsoft again</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                                <span><strong>Missing dependencies:</strong> Make sure your Planner Premium plan has task dependencies (links between tasks) set up in the original plan — only existing links will be imported</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <DollarSign className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Microsoft Dynamics 365</h5>
                        <p className="text-sm text-muted-foreground">Import invoices from Dynamics 365 Sales Hub using OAuth 2.0 authentication. Connect your organization to automatically sync invoice data.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <BarChart3 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Analytics API (Power BI)</h5>
                        <p className="text-sm text-muted-foreground">REST API endpoints secured with API keys for connecting Power BI or other analytics tools. Access projects, portfolios, risks, issues, key dates, and summary data programmatically.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <FileSpreadsheet className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Microsoft Project Import</h5>
                        <p className="text-sm text-muted-foreground">Import project plans from Microsoft Project (.mpp), XML, and CSV files using the MPXJ library for seamless data migration.</p>
                      </div>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-6">Setting Up Integrations:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Navigate:</strong> Go to the Integrations page from the sidebar</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Connect:</strong> Click on an integration to configure credentials and permissions</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Manage:</strong> View connection status, test connections, and manage OAuth tokens per organization</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "custom-links" && (
            <section id="custom-links">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                      <Link2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <CardTitle>Custom Links</CardTitle>
                      <CardDescription>Add custom navigation links to the sidebar</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Administrators can add custom links to the sidebar for quick access to external resources, 
                    documentation, or frequently used tools.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">Link Open Modes:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <ExternalLink className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">New Tab</h5>
                        <p className="text-sm text-muted-foreground">Opens the link in a new browser tab</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Frame className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Embedded</h5>
                        <p className="text-sm text-muted-foreground">Opens the link within FridayReport.AI using an embedded frame</p>
                      </div>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Managing Custom Links:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Add Links:</strong> Go to Organization Settings to add new custom links</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Organize:</strong> Drag and drop to reorder links in the sidebar</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Choose Mode:</strong> Select whether links open in new tab or embedded</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Remove:</strong> Delete links that are no longer needed</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    To make non-FridayReport.AI tools — internal wikis, BI portals, intranet pages — reachable without
                    asking people to remember a URL.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Org Settings &rarr; <em>Custom Links</em>. Configured links appear at the bottom of the sidebar for
                    everyone in the organization.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Use the embedded mode for tools that already render well in an iframe; use
                    new-tab for anything that breaks under X-Frame-Options or needs SSO redirects.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "custom-fields" && (
            <section id="custom-fields">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                      <Sliders className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <CardTitle>Custom Fields</CardTitle>
                      <CardDescription>Define custom data fields for projects</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Custom Fields allow you to capture additional project information specific to your organization's needs. 
                    Define custom data fields that appear on project detail pages and can be used in custom tabs.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">How to Create Custom Fields:</h4>
                  <div className="space-y-3">
                    <ActionItem 
                      icon={Settings}
                      title="Access Organization Settings"
                      description="Navigate to Organization Settings from the sidebar user menu"
                    />
                    <ActionItem 
                      icon={Plus}
                      title="Add Custom Field"
                      description="Go to the 'Custom Fields' tab and click 'Add Field' to create a new field"
                    />
                    <ActionItem 
                      icon={Edit}
                      title="Configure Field Properties"
                      description="Set the field name, type, description, and whether it's required"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Field Types:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Badge variant="secondary">Text</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Single line text input</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Badge variant="secondary">Textarea</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Multi-line text input</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Badge variant="secondary">Number</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Numeric values</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Badge variant="secondary">Date</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Date picker field</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Badge variant="secondary">Single Select</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Dropdown with custom options</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Badge variant="secondary">Multi Select</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Multiple selection from options</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Badge variant="secondary">Checkbox</Badge>
                      <p className="text-sm text-muted-foreground mt-1">True/false toggle</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Badge variant="secondary">URL</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Web link input</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Using Custom Fields:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Project Details:</strong> Custom fields appear on project detail pages where values can be entered</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Custom Tabs:</strong> Include custom fields in custom tab layouts for organized data display</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Required Fields:</strong> Mark fields as required to ensure data is always captured</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    When the standard project record is missing something your organization tracks — strategic theme,
                    cost center, business owner — define it once as a custom field and it's available on every project.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Org Settings &rarr; <em>Custom Fields</em>.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Avoid making fields required until the team is in the habit of filling them —
                    required fields on a half-adopted form just produce throwaway values.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "custom-tabs" && (
            <section id="custom-tabs">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
                      <LayoutTemplate className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <CardTitle>Custom Tabs</CardTitle>
                      <CardDescription>Design custom tab layouts for project details</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Custom Tabs allow you to design additional tabs on project detail pages with custom layouts. 
                    Create sections, add project fields and custom fields, and organize information the way your team needs it.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">How to Create Custom Tabs:</h4>
                  <div className="space-y-3">
                    <ActionItem 
                      icon={Settings}
                      title="Access Organization Settings"
                      description="Navigate to Organization Settings from the sidebar user menu"
                    />
                    <ActionItem 
                      icon={Plus}
                      title="Create New Tab"
                      description="Go to the 'Custom Tabs' section and click 'New Tab' to create a custom tab"
                    />
                    <ActionItem 
                      icon={LayoutTemplate}
                      title="Add Sections"
                      description="Click 'Add Section' to create layout sections within your tab"
                    />
                    <ActionItem 
                      icon={Sliders}
                      title="Add Fields"
                      description="Add project fields or custom fields to each section"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Tab Designer Features:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Sections:</strong> Organize fields into logical groups with customizable column layouts (1-4 columns)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Project Fields:</strong> Include standard project fields like name, status, dates, budget, etc.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Custom Fields:</strong> Add any custom fields you've defined for your organization</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Tab Icons:</strong> Choose an icon to represent your tab in the project detail navigation</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Available Project Fields:</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Name</Badge>
                    <Badge variant="outline">Description</Badge>
                    <Badge variant="outline">Status</Badge>
                    <Badge variant="outline">Priority</Badge>
                    <Badge variant="outline">Health</Badge>
                    <Badge variant="outline">Progress</Badge>
                    <Badge variant="outline">Start Date</Badge>
                    <Badge variant="outline">End Date</Badge>
                    <Badge variant="outline">Budget</Badge>
                    <Badge variant="outline">Portfolio</Badge>
                    <Badge variant="outline">Project Manager</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Accessing Custom Tabs:</h4>
                  <p className="text-muted-foreground">
                    Once created, custom tabs appear in the "More" dropdown menu on project detail pages alongside 
                    other features like Scoring, Benefits, and Decisions. Click on a custom tab to view its designed layout 
                    with the configured fields and sections.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Once you've added several custom fields, group them into a tab so the project page stays readable
                    instead of becoming a long scroll of inputs.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Org Settings &rarr; <em>Custom Tabs</em>. Configured tabs appear in each project's <em>More</em>
                    dropdown.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Keep tab names short — they show up in a dropdown and overflow becomes
                    unreadable quickly.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "billing" && (
            <section id="billing">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle>Billing & Credits</CardTitle>
                      <CardDescription>Subscription plans and usage tracking</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    FridayReport.AI uses a credit-based billing system. Credits are consumed when creating projects, 
                    tasks, issues, and other items. Each subscription plan includes a monthly credit allocation.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">Subscription Plans:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border-l-4 border-slate-400">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Free</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">200 credits/month - Perfect for individuals getting started</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border-l-4 border-blue-500">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Professional</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">500 credits/month - Ideal for small teams</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border-l-4 border-purple-500">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Business</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">1,000 credits/month - For growing organizations</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border-l-4 border-amber-500">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Enterprise</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">100,000 credits/month - For large-scale deployments</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Credit Costs:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Projects:</strong> 10 credits each</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Portfolios:</strong> 5 credits each</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Tasks:</strong> 2 credits each</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Issues:</strong> 2 credits each</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Risks & Key Dates:</strong> 1 credit each</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Managing Your Subscription:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <BarChart3 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Usage Dashboard</h5>
                        <p className="text-sm text-muted-foreground">View your current credit balance and usage history in the Billing page</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <TrendingUp className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Upgrade Plan</h5>
                        <p className="text-sm text-muted-foreground">Upgrade to a higher tier for more credits and features</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <CreditCard className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Payment Methods</h5>
                        <p className="text-sm text-muted-foreground">Pay securely with PayPal for subscription billing</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "organizations" && (
            <section id="organizations">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                      <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <CardTitle>Organizations</CardTitle>
                      <CardDescription>Multi-organization support and switching</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    FridayReport.AI supports multiple organizations. Each organization has its own set of portfolios, 
                    projects, and team members. Switch between organizations using the sidebar selector.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">Access Control:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Super Admin</h5>
                        <p className="text-sm text-muted-foreground">Can access all organizations and manage system-wide settings</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Users className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <h5 className="font-medium text-foreground">Organization Members</h5>
                        <p className="text-sm text-muted-foreground">Can only access organizations they are members of</p>
                      </div>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Organization Switcher:</h4>
                  <p className="text-muted-foreground">
                    Use the organization dropdown in the sidebar to switch between organizations. 
                    The current organization determines which data is displayed throughout the application.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Anyone who works across multiple organizations (consultants, super-admins, multi-tenant operators)
                    will use the switcher daily; everyone else can ignore it.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Top of the sidebar &mdash; the organization name doubles as a dropdown when you're a member of more
                    than one.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Re-read the sidebar after switching — portfolios, projects, vendors, and
                    custom links all change with the active organization.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "users" && (
            <section id="users">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-100 dark:bg-pink-900/30">
                      <Users className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                    </div>
                    <div>
                      <CardTitle>User Management</CardTitle>
                      <CardDescription>Profile and user settings</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Manage your user profile and account settings through the user menu in the sidebar. 
                    Click on your avatar to access profile options.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">User Menu Options:</h4>
                  <div className="space-y-3">
                    <ActionItem 
                      icon={UserCircle}
                      title="Profile"
                      description="View and edit your personal information"
                    />
                    <ActionItem 
                      icon={Settings}
                      title="User Settings"
                      description="Configure your account preferences"
                    />
                    <ActionItem 
                      icon={Building2}
                      title="Org Settings"
                      description="Manage organization settings (if authorized)"
                    />
                    <ActionItem 
                      icon={LogOut}
                      title="Log Out"
                      description="Sign out of the application"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Update your display name, email, and notification preferences here. Org admins also use this menu
                    to jump into Org Settings without leaving their current page.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Sidebar &rarr; click your avatar at the bottom of the sidebar.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Set your timezone correctly on the profile screen — it drives when scheduled
                    reports arrive in your inbox.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "settings" && (
            <section id="settings">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-900/30">
                      <Settings className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <CardTitle>Settings</CardTitle>
                      <CardDescription>Application and organization configuration</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Configure application settings, organization preferences, and user-specific options 
                    through the various settings pages.
                  </p>
                  
                  <ScreenshotImage 
                    src="/images/guide/settings.png" 
                    alt="Settings Page" 
                    caption="Settings page with navigation sidebar and configuration options"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Settings Areas:</h4>
                  <div className="space-y-3">
                    <ActionItem 
                      icon={Building2}
                      title="Organization Settings"
                      description="Manage organization name, description, and member access"
                    />
                    <ActionItem 
                      icon={Users}
                      title="User Settings"
                      description="Personal preferences, notifications, and account settings"
                    />
                    <ActionItem 
                      icon={Shield}
                      title="Super Admin Panel"
                      description="System-wide settings (Super Admins only)"
                    />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    The Settings hub is the entry point for organization-wide configuration: members, custom fields,
                    custom tabs, custom links, integrations, and branding.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Sidebar &rarr; user menu &rarr; <code>Org Settings</code>. Settings pages are scoped to the active
                    organization.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Decide on custom fields and tabs <em>before</em> rolling the workspace out —
                    retrofitting a structure on top of dozens of existing projects is much harder than getting it right
                    on day one.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "themes" && (
            <section id="themes">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                      <Moon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <CardTitle>Themes</CardTitle>
                      <CardDescription>Customize your visual experience</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    FridayReport.AI supports multiple themes to customize your visual experience. 
                    Toggle between light and dark modes using the theme switcher in the top bar.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">Available Themes:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <Sun className="h-6 w-6 text-amber-500" />
                      <div>
                        <h5 className="font-medium text-foreground">Light Mode</h5>
                        <p className="text-sm text-muted-foreground">Bright, clean interface for daytime use</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-800 dark:bg-slate-900 border border-slate-600 dark:border-slate-700">
                      <Moon className="h-6 w-6 text-blue-400" />
                      <div>
                        <h5 className="font-medium text-white">Dark Mode</h5>
                        <p className="text-sm text-slate-300">Easy on the eyes for extended use</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mt-4">
                    Your theme preference is saved automatically and will persist across sessions. 
                    Simply click the sun or moon icon in the header to toggle between themes instantly.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Switch to dark mode for long evening sessions or bright office lighting; light mode is generally
                    easier when projecting onto a screen for a meeting.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Header &rarr; sun / moon icon. Your choice is remembered per browser.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Hit the toggle once during onboarding — the dark theme lands well with
                    technical users and is easier to live in all day.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "notifications" && (
            <section id="notifications">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                      <Flag className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <CardTitle>Notifications</CardTitle>
                      <CardDescription>Stay informed with real-time project activity alerts</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Stay informed with real-time notifications about project activity. The notification bell in the header 
                    displays your unread count and provides quick access to recent alerts across all your projects.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Notification Types:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Mentions:</strong> Get notified when someone mentions you in a comment or discussion</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Task Assignments:</strong> Receive alerts when tasks are assigned to you</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Task Overdue:</strong> Get warnings when tasks pass their due date</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Health Alerts:</strong> Be alerted when project health status changes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Status Changes:</strong> Track when projects or tasks change status</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Severity Levels:</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Info</Badge>
                    <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Warning</Badge>
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Critical</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Notification Bell:</h4>
                  <p className="text-muted-foreground">
                    The notification bell icon in the header shows your unread notification count. Click it to view 
                    recent notifications, mark them as read, and navigate directly to the related project or task.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Check the bell once or twice a day to clear your queue — it's the digest of mentions, assignments,
                    and status changes that affect projects you're on.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Header &rarr; bell icon. Each notification deep-links to the related record.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Mark items as read as you act on them — a constantly red badge stops being a
                    useful signal.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "reports" && (
            <section id="reports">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30">
                      <FileText className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <CardTitle>Scheduled Reports</CardTitle>
                      <CardDescription>Automate delivery of dashboard reports via email</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Automate the delivery of dashboard reports via email to keep stakeholders informed without manual effort. 
                    Configure report subscriptions with your preferred dashboards, frequency, and recipient list.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Report Configuration:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Choose Dashboards:</strong> Select which dashboards to include in the scheduled report</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Set Frequency:</strong> Schedule reports to be sent daily, weekly, or monthly</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Specify Recipients:</strong> Add email addresses for report delivery</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Timezone Support:</strong> Configure the delivery timezone to match your team's location</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Managing Subscriptions:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Enable/Disable:</strong> Toggle report subscriptions on or off without deleting them</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Last Sent Date:</strong> View when each report was last delivered</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Edit Schedule:</strong> Update frequency, recipients, or included dashboards at any time</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Use scheduled reports to push status to people who don't log in — sponsors, finance partners,
                    leadership — instead of asking them to come to you for the latest numbers.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Sidebar &rarr; <code>Scheduled Reports</code>.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Match frequency to the audience's decision cadence — weekly for delivery
                    teams, monthly for steering committees. Daily reports usually get muted within a week.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {isSuperAdmin && activeSection === "super-admin" && (
            <section id="super-admin">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-900/30">
                      <Shield className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                    </div>
                    <div>
                      <CardTitle>Super Admin Console</CardTitle>
                      <CardDescription>System-wide administration and monitoring</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Super Admin Console provides system-wide oversight and management capabilities. 
                    Only users with the Super Admin role can access this area.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">All Users:</h4>
                  <p className="text-muted-foreground">
                    View and manage all registered users across all organizations. The table shows key user details 
                    with the ability to search and filter. Sensitive details are shown only on demand to reduce clutter.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Organization Management:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>All Organizations:</strong> View every organization, their plans, member counts, and creation dates</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Plan Management:</strong> Adjust organization subscription plans and grant bonus seats</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Credit Consumption:</strong> Monitor credit usage per organization to track platform adoption and identify billing needs</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Deactivation:</strong> Deactivate organizations using soft-delete to preserve data while restricting access</span>
                    </li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Engagement Scores:</h4>
                  <p className="text-muted-foreground">
                    Engagement scores reflect actual platform usage rather than just login frequency. 
                    Scores are calculated based on meaningful actions like creating projects, logging time, 
                    managing tasks, and using integrations — giving Super Admins a clear picture of how 
                    actively each user or organization is using the platform.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Additional Tools:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Help Tickets</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">View and manage user-submitted help tickets and feedback with screenshots</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">User Consents</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Track Terms of Service and Privacy Policy acceptance records with version history</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Day-to-day platform operations: investigating support tickets, adjusting an org's plan, deactivating
                    abandoned tenants, and reviewing engagement to spot organizations that need outreach.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Sidebar &rarr; user menu &rarr; <code>Super Admin</code>. Visible only to accounts with the Super
                    Admin role.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Prefer deactivation over hard delete — soft-delete keeps the audit trail and
                    lets you reactivate a customer without restoring from backup.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "gantt-timeline" && (
            <section id="gantt-timeline">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <GanttChart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle>Gantt & Timeline</CardTitle>
                      <CardDescription>Visualize task schedules and dependencies on an interactive timeline</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Every project includes a Gantt-style timeline that visualizes tasks across days, weeks, months, or quarters.
                    Drag bars to reschedule, link tasks to create dependencies, and use the critical path overlay to spot the
                    sequence of work that drives your end date.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Core Capabilities:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <FeatureHighlight icon={GanttChart} title="Drag-to-Reschedule" description="Move task bars to change start/end dates; durations recalculate automatically" color="blue" />
                    <FeatureHighlight icon={GitMerge} title="Dependencies" description="Link tasks with finish-to-start, start-to-start, finish-to-finish, or start-to-finish relationships" color="purple" />
                    <FeatureHighlight icon={Activity} title="Critical Path" description="Highlight the longest chain of dependent tasks that determines project completion" color="red" />
                    <FeatureHighlight icon={Milestone} title="Milestones" description="Zero-duration markers stand out on the timeline as diamond shapes for major checkpoints" color="orange" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Zoom Levels:</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline">Day</Badge>
                    <Badge variant="outline">Week</Badge>
                    <Badge variant="outline">Month</Badge>
                    <Badge variant="outline">Quarter</Badge>
                    <Badge variant="outline">Year</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Working with the Timeline:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Today Marker:</strong> A vertical line shows the current date so you can quickly compare planned vs. actual progress</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Progress Overlay:</strong> Each bar fills proportionally with the task's percent-complete value</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Group by Phase:</strong> Tasks can be grouped into phases or summary tasks that roll up dates and progress</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Baselines:</strong> Save a snapshot of the planned schedule, then compare it against the live plan to track slippage</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Print &amp; Export:</strong> Export the timeline as PDF or PNG for status meetings and stakeholder reports</span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Imported Schedules:</h4>
                  <p className="text-muted-foreground">
                    Plans imported from Microsoft Planner Premium / Project for the Web, Microsoft Project (.mpp), or
                    Excel/CSV files appear in the Gantt with their original durations, hierarchy, and dependencies preserved.
                    Imported tasks are read-only by default to keep them in sync with the source system.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "pmo-radar" && (
            <section id="pmo-radar">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                      <Radar className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div>
                      <CardTitle>PMO Radar</CardTitle>
                      <CardDescription>Early-warning system for portfolio-level risk and health</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    PMO Radar continuously scans every project across your organization and surfaces the ones that need
                    attention. Instead of clicking through dozens of dashboards, you see a single ranked list of issues
                    with the underlying signals that triggered each alert.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Signal Categories:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <Badge className="bg-red-100 text-red-700">Schedule</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Tasks past their due date, milestones at risk, slipping critical path</p>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                      <Badge className="bg-orange-100 text-orange-700">Budget</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Burn rate exceeding plan, forecast over budget, unapproved variances</p>
                    </div>
                    <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                      <Badge className="bg-yellow-100 text-yellow-700">Quality</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Open critical issues, overdue defects, declining test pass rates</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <Badge className="bg-blue-100 text-blue-700">Engagement</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Stale status reports, missing weekly updates, low team activity</p>
                    </div>
                    <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                      <Badge className="bg-purple-100 text-purple-700">Risk</Badge>
                      <p className="text-sm text-muted-foreground mt-1">High-severity risks without mitigation, expired risk reviews</p>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                      <Badge className="bg-emerald-100 text-emerald-700">Resource</Badge>
                      <p className="text-sm text-muted-foreground mt-1">Over-allocated team members, missing assignments, capacity gaps</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Severity Levels:</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-red-100 text-red-700">Critical</Badge>
                    <Badge className="bg-orange-100 text-orange-700">High</Badge>
                    <Badge className="bg-yellow-100 text-yellow-700">Medium</Badge>
                    <Badge variant="outline">Low</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Working the Radar:</h4>
                  <div className="space-y-3">
                    <ActionItem icon={Filter} title="Filter & Group" description="Filter by portfolio, owner, severity, or signal type to focus on what's yours to act on" />
                    <ActionItem icon={Eye} title="Drill Down" description="Click any item to jump to the underlying project, task, risk, or issue with one click" />
                    <ActionItem icon={CheckSquare} title="Acknowledge or Snooze" description="Mark items as acknowledged, snooze them for a defined period, or dismiss with a reason" />
                    <ActionItem icon={Activity} title="Trend View" description="See how the count of red/yellow projects has changed over the last 30/60/90 days" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Open PMO Radar at the start of each day or week to triage what's slipping across your portfolios — it's
                    much faster than opening every project status report individually.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Sidebar &rarr; <code>PMO Radar</code> (path <code>/pmo-radar</code>). Available to anyone with access to at
                    least one portfolio.
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Filter to portfolios you own first — the unfiltered view often spans more work
                    than is yours to act on.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "powerbi-agent" && (
            <section id="powerbi-agent">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                      <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <CardTitle>Power BI Agent</CardTitle>
                      <CardDescription>Ask questions about your portfolio in plain English</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Power BI Agent is an AI assistant that answers natural-language questions about your projects,
                    portfolios, finances, and resources. It generates the right query against the analytics dataset and
                    returns a chart or table you can drop straight into a status report.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Example Prompts:</h4>
                  <div className="space-y-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm">"Which projects are over budget this quarter?"</div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm">"Show me the top 10 most overdue tasks across the portfolio."</div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm">"Compare planned vs actual hours for the Marketing portfolio last month."</div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm">"List the resources allocated above 100% next sprint."</div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm">"Trend the open critical issues by week for 2026."</div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">How It Works:</h4>
                  <div className="space-y-3">
                    <ActionItem icon={MessageSquare} title="Ask in Plain Language" description="Type a question or pick a suggested prompt — no DAX or SQL required" />
                    <ActionItem icon={BarChart3} title="Auto-Visualize" description="The agent picks the most useful chart type (bar, line, pie, table) for the answer" />
                    <ActionItem icon={Filter} title="Refine in Place" description="Follow up with 'group by portfolio' or 'limit to last 90 days' to iterate without starting over" />
                    <ActionItem icon={Download} title="Pin & Export" description="Pin charts to a dashboard, export to Excel, or copy as an image for slides and emails" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Data Sources:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span>The agent uses the same analytics tables that power Power BI integration: projects, portfolios, tasks, risks, issues, time entries, and invoices</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span>Results respect your organization permissions — you only see data from projects you have access to</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span>Every answer shows the underlying query so analysts can verify or extend the result in Power BI</span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Sidebar &rarr; <code>Power BI Agent</code> (path <code>/powerbi-agent</code>). Each conversation is kept on
                    the page so you can scroll back to earlier prompts and answers.
                  </p>

                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 mt-3">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Tip:</strong> Be specific about the time window and grouping ("last 90 days, by portfolio") —
                      vague prompts produce vague charts.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "construction-overview" && (
            <section id="construction-overview">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                      <HardHat className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <CardTitle>Construction Suite</CardTitle>
                      <CardDescription>Purpose-built tools for construction, EPC, and capital project teams</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Construction Suite layers field-ready modules on top of the standard project workspace so general
                    contractors, owners, and subs can manage paperwork, field operations, and trades from a single tool.
                    Each module follows the same role and permission model as the rest of FridayReport.AI.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Modules at a Glance:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <FeatureHighlight icon={ClipboardList} title="Daily Logs" description="Capture daily field activity, weather, manpower, and progress photos" color="orange" />
                    <FeatureHighlight icon={HelpCircle} title="RFIs" description="Submit, route, and close out Requests for Information with full audit history" color="blue" />
                    <FeatureHighlight icon={FileText} title="Submittals" description="Manage shop drawings, product data, and samples through the approval workflow" color="purple" />
                    <FeatureHighlight icon={FileImage} title="Drawings" description="Upload, version, and markup construction drawings tied to sheets and revisions" color="green" />
                    <FeatureHighlight icon={ListChecks} title="Punch List" description="Track close-out items by location and trade with photos and sign-offs" color="red" />
                    <FeatureHighlight icon={ShieldCheck} title="Quality &amp; Safety" description="Inspections, observations, and incident reports with corrective actions" color="yellow" />
                    <FeatureHighlight icon={Hammer} title="Bidding" description="Run invitations to bid, compare bidder responses, and award packages" color="orange" />
                    <FeatureHighlight icon={Truck} title="Vendors" description="Maintain a vendor directory with insurance, prequal, and contact information" color="blue" />
                    <FeatureHighlight icon={GitBranch} title="Change Orders" description="Originate, price, and execute prime / subcontract change orders" color="purple" />
                    <FeatureHighlight icon={Receipt} title="Construction Invoices" description="Schedule-of-values billing for subcontractor invoices and owner pay applications, with retainage" color="green" />
                    <FeatureHighlight icon={Mic} title="Meetings" description="Run OAC and coordination meetings with agendas, minutes, and action items" color="orange" />
                    <FeatureHighlight icon={Mail} title="Correspondence" description="Track letters, transmittals, and formal notices with delivery records" color="blue" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Where to Find It:</h4>
                  <p className="text-muted-foreground">
                    On any construction-flagged project the modules appear as tabs along the top of the project workspace.
                    Organization admins can enable the suite on a per-project or per-portfolio basis from Organization
                    Settings &rarr; Construction.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "daily-logs" && (
            <section id="daily-logs">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                      <ClipboardList className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <CardTitle>Daily Logs</CardTitle>
                      <CardDescription>Capture what happened on site every day</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Daily Logs are the field journal for the project. Each log records weather, manpower, equipment,
                    activities completed, delays encountered, visitors, and supporting photos. Logs are date-stamped and
                    locked once approved so you have a defensible record for claims and audits.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">What Goes in a Log:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <ActionItem icon={Sun} title="Weather" description="Condition, temperature, wind speed, and precipitation" />
                    <ActionItem icon={Users} title="Labor entries" description="One row per crew on site: company / trade, headcount, hours worked, notes" />
                    <ActionItem icon={Hammer} title="Equipment entries" description="Equipment name, quantity, hours used, status, notes" />
                    <ActionItem icon={UserCircle} title="Visitors" description="Free-text list of inspectors, owners, or third parties who visited the site" />
                    <ActionItem icon={FileText} title="Notes" description="Narrative of the day — activities completed, delays, deliveries, issues" />
                    <ActionItem icon={FileImage} title="Photos &amp; attachments" description="Upload images and files alongside each log" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Every day the site is active. The daily log is the contemporaneous field record used for billing
                    disputes, schedule analysis, and as evidence in claims.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Project &rarr; Construction tab &rarr; <code>Daily Logs</code>, or sidebar path <code>/daily-logs</code>. Logs
                    are unique per project per date.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Walkthrough:</h4>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Click <em>New Log</em> and pick a date</li>
                    <li>Fill weather, then add labor and equipment rows for crews on site</li>
                    <li>Write the narrative under <em>Notes</em>, attach photos, save</li>
                    <li>Export the log to PDF when you need to send it out</li>
                  </ol>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Logs back-fill nicely, but it's much harder to remember headcount three days
                    later — log before you leave the trailer.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "rfis" && (
            <section id="rfis">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle>RFIs (Requests for Information)</CardTitle>
                      <CardDescription>Formally raise and resolve design questions</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Use RFIs to formally ask the design team for clarification on drawings, specs, or field conditions.
                    Every RFI is auto-numbered, routed through reviewers, and time-stamped at each step so you can
                    measure response times and protect the schedule when answers are slow.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Status:</h4>
                  <p className="text-muted-foreground">
                    A new RFI starts as <Badge className="bg-blue-100 text-blue-700">Open</Badge> and moves through your
                    team's review until a response is accepted as the official answer and the RFI is closed.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Whenever the field needs a written, traceable answer about the design — drawing conflicts, missing
                    details, spec clarifications, substitutions.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Project &rarr; Construction &rarr; <code>RFIs</code> (path <code>/rfis</code>).
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Creating an RFI:</h4>
                  <div className="space-y-3">
                    <ActionItem icon={Plus} title="Number &amp; subject" description="The RFI number is auto-assigned per project; add a clear subject" />
                    <ActionItem icon={FileText} title="Question &amp; background" description="Describe the question, reference drawings / specs, and attach photos or markups" />
                    <ActionItem icon={Users} title="Routing" description="Pick a primary reviewer (assigned to) and add a distribution list for cc'd parties" />
                    <ActionItem icon={Clock} title="Required-By Date" description="Set the date a response is needed; SLA timers start as soon as the RFI is sent" />
                    <ActionItem icon={MessageSquare} title="Discussion Thread" description="Replies, internal notes, and attachments stay together on the RFI record" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Schedule &amp; Cost Impact:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span>Flag whether the RFI has cost or schedule impact, then link it to a future change order if it does</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span>Aging report shows open RFIs grouped by days outstanding and reviewer to surface bottlenecks</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span>Closed RFIs become part of the searchable project history and can be referenced from drawings or punch list items</span></li>
                  </ul>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "submittals" && (
            <section id="submittals">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                      <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <CardTitle>Submittals</CardTitle>
                      <CardDescription>Shop drawings, product data, and samples through formal review</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Submittals manage the formal exchange of shop drawings, product data sheets, samples, and mock-ups
                    between subcontractors, the GC, and the design team. The module enforces a complete review chain
                    with stamps, mark-ups, and revision tracking.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Submittal Types:</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="secondary">Shop Drawings</Badge>
                    <Badge variant="secondary">Product Data</Badge>
                    <Badge variant="secondary">Samples</Badge>
                    <Badge variant="secondary">Mock-ups</Badge>
                    <Badge variant="secondary">Test Reports</Badge>
                    <Badge variant="secondary">O&amp;M Manuals</Badge>
                    <Badge variant="secondary">Warranties</Badge>
                    <Badge variant="secondary">Closeout</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Review Outcomes:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20"><Badge className="bg-green-100 text-green-700">Approved</Badge><p className="text-sm text-muted-foreground mt-1">No exceptions; release for fabrication or installation</p></div>
                    <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20"><Badge className="bg-yellow-100 text-yellow-700">Approved as Noted</Badge><p className="text-sm text-muted-foreground mt-1">Minor changes annotated; proceed with corrections</p></div>
                    <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20"><Badge className="bg-orange-100 text-orange-700">Revise &amp; Resubmit</Badge><p className="text-sm text-muted-foreground mt-1">Substantive changes required; new revision needed</p></div>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20"><Badge className="bg-red-100 text-red-700">Rejected</Badge><p className="text-sm text-muted-foreground mt-1">Does not meet specifications; restart submittal</p></div>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Workflow Features:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Spec Section Tagging:</strong> Tie each submittal to a CSI spec section so coverage is easy to audit</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Revisions:</strong> Each new revision keeps the prior versions accessible with a clear history of changes</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Lead-Time Tracking:</strong> Capture fabrication and delivery lead times to feed the procurement schedule</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Submittal Log:</strong> The master log shows status, days in review, and required-on-site dates across all packages</span></li>
                  </ul>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "drawings" && (
            <section id="drawings">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                      <FileImage className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <CardTitle>Drawings</CardTitle>
                      <CardDescription>Single source of truth for the current set of construction documents</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Drawings module stores every revision of every sheet so the field always works from the latest set.
                    Sheets are organized by discipline and number, version controlled, and viewable directly in the
                    browser without external software.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Sheet Organization:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Disciplines:</strong> Architectural, Structural, Mechanical, Electrical, Plumbing, Civil, Landscape, etc.</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Sheet Numbers:</strong> Standard prefixes (A-, S-, M-, E-, P-, C-) keep navigation predictable</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Sets:</strong> Group sheets by issue (Bid Set, IFC, As-Built) and switch between sets quickly</span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Working with Sheets:</h4>
                  <div className="space-y-3">
                    <ActionItem icon={Plus} title="Upload sheets" description="Add drawings to a set with their drawing number, title, and discipline; upload PDF or image files as the current revision" />
                    <ActionItem icon={RefreshCw} title="Versioning" description="Uploading a new revision on an existing drawing keeps prior revisions accessible in history" />
                    <ActionItem icon={Edit} title="Markups" description="Annotate sheets directly in the viewer; markup data is stored alongside the revision" />
                    <ActionItem icon={Download} title="Download" description="Download the current revision file at any time" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    To keep the team working from one current set instead of emailed PDFs that go stale the moment the
                    next addendum drops.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Project &rarr; Construction &rarr; <code>Drawings</code> (path <code>/drawings</code>).
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Keep set names disciplined ("IFC v3 – 2025-04-15") so the field can tell at a
                    glance which set is current.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "punch-list" && (
            <section id="punch-list">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                      <ListChecks className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <CardTitle>Punch List</CardTitle>
                      <CardDescription>Track close-out items from substantial completion to final acceptance</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Punch List module captures items that need to be fixed, completed, or replaced before the owner
                    accepts the work. Items are tied to a location, a responsible trade, and a due date — and travel from
                    open to verified with photo evidence at every step.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Status:</h4>
                  <p className="text-muted-foreground">
                    A punch item starts as <Badge className="bg-red-100 text-red-700">Open</Badge> and is closed once it
                    has been fixed and verified. Status changes are kept in a history log for auditability.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Key fields:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Number, title, description, location</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Category</strong> — group items (e.g. drywall, MEP, finishes)</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Priority:</strong> Low / Medium / High (defaults to Medium)</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Assigned to</strong> — pick the user responsible for resolving the item</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Due date and closed date</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Photos</strong> — attach as many as you need; each photo carries a type so you can keep "issue" and "fixed" shots separate</span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    From substantial completion to final acceptance — anything that needs to be fixed, completed, or
                    replaced before the owner signs off.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Project &rarr; Construction &rarr; <code>Punch List</code> (path <code>/punch-list</code>).
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Filter the list by assignee and export — that's the simplest way to hand each
                    subcontractor their own punch.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "quality-safety" && (
            <section id="quality-safety">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                      <ShieldCheck className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <CardTitle>Quality &amp; Safety</CardTitle>
                      <CardDescription>Inspections, observations, and incidents with corrective actions</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Quality &amp; Safety brings inspection checklists, field observations, and incident reporting into one
                    auditable workspace. Every item supports photos, follow-ups, and corrective actions so issues are
                    actually closed instead of getting lost on a clipboard.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Record Types:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <FeatureHighlight icon={ShieldCheck} title="Inspections" description="Templated checklists for daily safety walks, pre-pour, mechanical roughs, etc." color="yellow" />
                    <FeatureHighlight icon={Eye} title="Observations" description="One-off field notes for hazards, near-misses, and good catches" color="blue" />
                    <FeatureHighlight icon={AlertTriangle} title="Incidents" description="Recordable events including injuries, property damage, and environmental spills" color="red" />
                    <FeatureHighlight icon={CheckSquare} title="Corrective Actions" description="Assign, track, and verify the actions required to resolve a finding" color="green" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Severity / Risk Levels:</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline" className="border-red-500 text-red-600">Critical</Badge>
                    <Badge variant="outline" className="border-orange-500 text-orange-600">High</Badge>
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600">Medium</Badge>
                    <Badge variant="outline">Low</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Inspections in detail:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Inspection templates:</strong> Reusable checklists you fill out per inspection</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Inspections:</strong> Type, location, scheduled date, inspector, status (defaults to <em>Scheduled</em>), overall result, and per-line results</span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Observations in detail:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Category:</strong> Defaults to <em>Safety</em></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Observation type:</strong> Negative or Positive</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Severity:</strong> Defaults to Low</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Status:</strong> Defaults to <em>Open</em>; closes when corrective actions are completed</span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Incidents in detail:</h4>
                  <p className="text-muted-foreground">
                    Capture severity and a narrative; attach as many corrective actions as needed. Track each action to
                    closure with an assignee and due date.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Inspections for planned checklists, observations for one-off field notes, and incidents for
                    recordable events — and the corrective actions that follow each.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Project &rarr; Construction &rarr; <code>Quality &amp; Safety</code> (path <code>/quality-safety</code>).
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Don't reserve this module for incidents — logging positive observations and
                    near-misses surfaces leading indicators before something goes wrong.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "bidding" && (
            <section id="bidding">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                      <Hammer className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <CardTitle>Bidding</CardTitle>
                      <CardDescription>Run invitations to bid and award packages with confidence</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Bidding module helps you invite vendors, distribute bid documents, collect responses, and tabulate
                    pricing for award. Each bid package is its own workspace with documents, Q&amp;A, and a comparison grid.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Bid package fields:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Number, title, description, trade category, scope</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Estimated budget, due date, pre-bid date</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Status:</strong> Defaults to <em>Draft</em>; awarded packages capture the awarded vendor, amount, and date</span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Bid invitations &amp; bids:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Invitation</strong> per vendor — status defaults to <em>Invited</em>; can be marked declined with a reason</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Bid record:</strong> total amount, alternates, bond included flag, valid-until date, evaluation score, recommended flag</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Bid line items</strong> for side-by-side tabulation</span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Running a Package:</h4>
                  <div className="space-y-3">
                    <ActionItem icon={Plus} title="Create package" description="Define scope, trade category, estimated budget, and due dates" />
                    <ActionItem icon={Truck} title="Invite vendors" description="Pick from the vendor directory or add new bidders by email" />
                    <ActionItem icon={BarChart3} title="Tabulate bids" description="Compare bidders side by side using bid line items and your evaluation score" />
                    <ActionItem icon={CheckSquare} title="Award" description="Mark the winner and capture the awarded vendor, amount, and date on the package" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    When you're putting work out to bid — anything from a single trade package to a full prime contract
                    solicitation.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Project &rarr; Construction &rarr; <code>Bidding</code> (path <code>/bidding</code>).
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Use the evaluation score to record more than just price — schedule, references,
                    and exclusions matter, and the score makes the rationale defensible at award.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "vendors" && (
            <section id="vendors">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle>Vendors</CardTitle>
                      <CardDescription>Maintain your subcontractor and supplier directory</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Vendor directory is the master list of subcontractors and suppliers your organization works with.
                    Each vendor record stores contact details, trade scopes, certificates of insurance, prequalification
                    status, and historical performance ratings.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Vendor record fields:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <ActionItem icon={Building2} title="Company info" description="Company name, primary contact name, email, phone, website" />
                    <ActionItem icon={Mail} title="Address" description="Street, city, state, zip" />
                    <ActionItem icon={Hammer} title="Trade specialty" description="The scopes the vendor is qualified to perform" />
                    <ActionItem icon={ShieldCheck} title="Compliance" description="License number, insurance expiry, bonding capacity" />
                    <ActionItem icon={CheckSquare} title="Status" description="Defaults to Active; pause vendors who shouldn't be invited to bid" />
                    <ActionItem icon={Star} title="Rating" description="Your overall confidence score for the vendor" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Prequalification:</h4>
                  <p className="text-muted-foreground">
                    Each vendor can carry a prequalification record with safety, financial, quality, and experience
                    ratings, EMR rate, OSHA 300 log, insurance certificate, bonding letter, and an overall score. The
                    qualification status defaults to <em>Pending</em>.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Whenever you need a controlled list of subs and suppliers across projects — bidding, awards,
                    insurance compliance, and prequal all read from this directory.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Sidebar &rarr; <code>Vendors</code> (path <code>/vendors</code>).
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Set <em>insurance expiry</em> on every vendor — it's the single field that
                    keeps you from paying a vendor whose coverage just lapsed.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "change-orders" && (
            <section id="change-orders">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                      <GitBranch className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <CardTitle>Change Orders</CardTitle>
                      <CardDescription>Originate, price, and execute changes to scope, cost, and schedule</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Change Orders manages every change to the prime contract and to subcontracts in a single workflow.
                    Origination, pricing, owner approval, and subcontract execution are all linked so the budget,
                    schedule, and contract values stay in sync.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Document Types:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <FeatureHighlight icon={AlertTriangle} title="PCO (Potential)" description="Identifies a potential change before pricing is finalized" color="yellow" />
                    <FeatureHighlight icon={DollarSign} title="COR (Request)" description="Priced request submitted to the owner for approval" color="orange" />
                    <FeatureHighlight icon={CheckSquare} title="OCO (Owner)" description="Executed owner change order modifying the prime contract" color="green" />
                    <FeatureHighlight icon={GitMerge} title="SCO (Subcontract)" description="Change order issued to a subcontractor under their existing contract" color="purple" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Key fields:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Change order number, title, description</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Tier:</strong> Defaults to <em>PCO</em>; promote to a Change Order Request, an Owner Change Order, or a Subcontract Change Order as it progresses</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Status:</strong> Defaults to <em>Draft</em></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Reason code, cost impact, schedule impact in days</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Original / revised contract amounts</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Requested / reviewed / approved by &amp; dates</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Promoted from</strong> — link back to the lower-tier change it grew out of</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Line items</strong> for the cost build-up</span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    For every change to scope, cost, or schedule — whether you're identifying a potential change, pricing
                    a request to the owner, or issuing a change to a subcontractor.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Project &rarr; Construction &rarr; <code>Change Orders</code> (path <code>/change-orders</code>).
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Open a PCO the moment you see a potential change — even before pricing — so the
                    trail starts at the point of discovery, not the day pricing arrives.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "construction-invoices" && (
            <section id="construction-invoices">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle>Construction Invoices</CardTitle>
                      <CardDescription>Schedule-of-values billing for subcontractor invoices and owner pay applications</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    The Construction Invoices module captures each billing period against a contract: what was billed
                    last period, what's billed this period, what's left to bill, and what's been paid. Each invoice has
                    line items that follow a schedule-of-values pattern.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Status:</h4>
                  <p className="text-muted-foreground">
                    A new invoice starts as <Badge variant="outline">Draft</Badge>. Status, submitted date, approved date,
                    and paid date are all captured on the invoice record.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Key fields per invoice:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Invoice number, title, description</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Vendor name &amp; email</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Contract amount</strong> (base) and <strong>total amount</strong> (with approved changes)</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Previous billed, current billed, balance to finish</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Retainage</strong> held this period</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Period from / period to</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Paid amount</strong></span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Line items:</h4>
                  <p className="text-muted-foreground">
                    Each line carries a scheduled value and a percent complete; the percent drives the current billed
                    amount on that line.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    For each billing period — typically monthly — to record what was billed, what was paid, and what's
                    left against the contract.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Project &rarr; Construction &rarr; <code>Construction Invoices</code> (path
                    <code> /construction-invoices</code>).
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Reconcile the schedule of values against approved change orders before each
                    billing — a missed change order on the SOV is the most common cause of an underbilled period.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "meetings" && (
            <section id="meetings">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                      <Mic className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <CardTitle>Meetings</CardTitle>
                      <CardDescription>Run OAC, coordination, and subcontractor meetings with traceable minutes</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Meetings centralizes recurring construction meetings — Owner-Architect-Contractor, weekly subcontractor
                    coordination, safety stand-downs — with structured agendas, attendance, minutes, and action items
                    that carry forward week to week.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Meeting Types:</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="secondary">OAC</Badge>
                    <Badge variant="secondary">Subcontractor Coordination</Badge>
                    <Badge variant="secondary">Safety</Badge>
                    <Badge variant="secondary">Pre-Construction</Badge>
                    <Badge variant="secondary">Pre-Installation</Badge>
                    <Badge variant="secondary">Owner Update</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Key fields per meeting:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Meeting number, title, description</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Meeting type</strong> — defaults to <em>General</em></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Status</strong> — defaults to <em>Scheduled</em></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Date, start time, end time, location</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Attendees</strong> and <strong>minutes / notes</strong></span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Agenda items:</h4>
                  <p className="text-muted-foreground">
                    Add as many agenda items as you need, each with a title, description, presenter, and duration. Tick
                    them off as the meeting progresses.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Action items:</h4>
                  <p className="text-muted-foreground">
                    Capture commitments inside the meeting — title, description, assignee, due date, status (defaults to
                    <em> Open</em>) and priority (defaults to <em>Medium</em>).
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    Owner-Architect-Contractor (OAC) meetings, subcontractor coordination, safety stand-downs,
                    pre-installs — any meeting that needs an agenda, attendees, minutes, and follow-up actions.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Project &rarr; Construction &rarr; <code>Meetings</code> (path <code>/meetings</code>).
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Capture action items inside the meeting record as they're agreed — they carry
                    an assignee and a due date, and they show up to action owners outside the meeting.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "correspondence" && (
            <section id="correspondence">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle>Correspondence</CardTitle>
                      <CardDescription>Track formal letters, transmittals, and notices across the project</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Correspondence is the formal record of letters, transmittals, and notices sent between the parties on
                    a project. Use it for anything that needs to be archived for the contract record — directives,
                    notices of delay, transmittals of submittals or drawings, and meeting confirmations.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Document Types:</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="secondary">Letter</Badge>
                    <Badge variant="secondary">Transmittal</Badge>
                    <Badge variant="secondary">Notice</Badge>
                    <Badge variant="secondary">Directive</Badge>
                    <Badge variant="secondary">Memo</Badge>
                    <Badge variant="secondary">Email Capture</Badge>
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Key fields:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Correspondence number:</strong> Auto-assigned per project</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Type</strong> — defaults to <em>Letter</em></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Subject &amp; body</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>From name / from email, to name / to email</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Date</strong></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Status</strong> — defaults to <em>Draft</em></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Priority</strong> — defaults to <em>Normal</em></span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Attachments</strong></span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">When to use it:</h4>
                  <p className="text-muted-foreground">
                    For formal contractual communication — letters, transmittals, notices, directives, memos — that you
                    need to find, cite, and reference later.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">How to access it:</h4>
                  <p className="text-muted-foreground">
                    Project &rarr; Construction &rarr; <code>Correspondence</code> (path <code>/correspondence</code>).
                  </p>

                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Tip:</strong> Move items off <em>Draft</em> as soon as they're issued — anything still showing
                    Draft is effectively unsent in an audit.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "templates" && (
            <section id="templates">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                      <Copy className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <CardTitle>Templates</CardTitle>
                      <CardDescription>Spin up new projects, portfolios, and intake forms from reusable starting points</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Templates let you standardize how new work is created across your organization. Define a template once
                    — with its task list, custom fields, custom tabs, scoring criteria, and intake form — and then create
                    new projects (or invite intake submissions) that inherit that structure.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Template Types:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <FeatureHighlight icon={FolderKanban} title="Project Template" description="Pre-configured project with phases, tasks, key dates, and team roles" color="blue" />
                    <FeatureHighlight icon={Briefcase} title="Portfolio Template" description="Strategy, scoring criteria, and standard reports for a class of portfolios" color="purple" />
                    <FeatureHighlight icon={Inbox} title="Intake Form Template" description="Question set and approval workflow for new project requests" color="orange" />
                    <FeatureHighlight icon={Star} title="Scoring Template" description="Weighted criteria reusable across projects in the same portfolio" color="yellow" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Working with Templates:</h4>
                  <div className="space-y-3">
                    <ActionItem icon={Plus} title="Create from Existing" description="Save any project as a template to capture its structure for re-use" />
                    <ActionItem icon={Edit} title="Curate the Library" description="Tag templates by industry or methodology so teams pick the right starting point" />
                    <ActionItem icon={Settings} title="Apply on New" description="When creating a project, choose a template to pre-populate its content" />
                    <ActionItem icon={RefreshCw} title="Apply to Existing" description="Selectively apply template components (e.g., add a custom tab) to in-flight projects" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Governance:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span>Only org admins can publish or retire templates</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span>Templates can be marked Required for an intake type to enforce process consistency</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span>Template version history makes it safe to evolve templates without breaking existing projects</span></li>
                  </ul>
                </CardContent>
              </Card>
            </section>
            )}

            {activeSection === "training" && (
            <section id="training">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-100 dark:bg-pink-900/30">
                      <GraduationCap className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                    </div>
                    <div>
                      <CardTitle>Training (Friday Academy)</CardTitle>
                      <CardDescription>Self-paced learning paths for every role on the platform</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Friday Academy is the in-app training portal. It groups short video lessons, quick quizzes, and
                    walkthroughs into role-based learning paths so new users can ramp up without leaving the product.
                  </p>

                  <h4 className="font-semibold text-foreground mt-4">Learning Paths:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <FeatureHighlight icon={UserCircle} title="Team Member" description="Day-to-day tasks: timesheets, tasks, issues, calendar, notifications" color="blue" />
                    <FeatureHighlight icon={FolderKanban} title="Project Manager" description="Project setup, scheduling, risks, status reports, and stakeholder updates" color="green" />
                    <FeatureHighlight icon={Briefcase} title="Portfolio Manager" description="Portfolio strategy, scoring, prioritization, and PMO Radar" color="purple" />
                    <FeatureHighlight icon={Building2} title="Org Admin" description="User management, custom fields/tabs, integrations, and templates" color="orange" />
                    <FeatureHighlight icon={HardHat} title="Construction Lead" description="Daily logs, RFIs, submittals, change orders, and pay apps" color="yellow" />
                    <FeatureHighlight icon={BarChart3} title="Analyst" description="Power BI, scheduled reports, and the Power BI Agent" color="red" />
                  </div>

                  <h4 className="font-semibold text-foreground mt-4">Lesson Format:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Short Videos:</strong> 2-5 minute lessons that get straight to the point</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Try It:</strong> Optional in-product walkthroughs that highlight the actual buttons</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Quick Quiz:</strong> 3-5 questions per lesson to confirm understanding</span></li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" /><span><strong>Certificates:</strong> Completing a path earns a certificate that admins can verify</span></li>
                  </ul>

                  <h4 className="font-semibold text-foreground mt-4">Progress Tracking:</h4>
                  <p className="text-muted-foreground">
                    Each user sees their own completion progress on the Training page. Org admins can view team-wide
                    completion to identify training gaps and roll out new lessons as part of onboarding plans.
                  </p>
                </CardContent>
              </Card>
            </section>
            )}

            <div className="flex items-center justify-between mt-6">
              {prevSection ? (
                <Button
                  variant="outline"
                  onClick={() => navigateToSection(prevSection.id)}
                  className="gap-2"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                  {prevSection.name}
                </Button>
              ) : <div />}
              {nextSection ? (
                <Button
                  variant="outline"
                  onClick={() => navigateToSection(nextSection.id)}
                  className="gap-2"
                >
                  {nextSection.name}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : <div />}
            </div>

            <Card className="mt-8 bg-primary/5 border-primary/20">
              <CardContent className="py-6">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 shrink-0">
                    <HelpCircle className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <h3 className="font-semibold text-foreground">Need More Help?</h3>
                    <p className="text-sm text-muted-foreground">
                      Submit a help ticket or download the full guide as a PDF.
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={() => setIsHelpDialogOpen(true)}
                      className="gap-2"
                      data-testid="button-submit-help-ticket"
                    >
                      <HelpCircle className="h-4 w-4" />
                      Submit a Ticket
                    </Button>
                    <Button
                      onClick={handleDownloadPDF}
                      disabled={isGeneratingPDF}
                      variant="outline"
                      className="gap-2"
                      data-testid="button-download-pdf-footer"
                    >
                      <Download className="h-4 w-4" />
                      {isGeneratingPDF ? "Generating..." : "Download PDF"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <HelpDialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
