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
  UserCog
} from "lucide-react";
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
  { id: "tasks", name: "Tasks", icon: CheckSquare },
  { id: "issues", name: "Issues", icon: CircleDot },
  { id: "resources", name: "Resources", icon: UserCog },
  { id: "calendar", name: "Calendar", icon: Calendar },
  { id: "organizations", name: "Organizations", icon: Building2 },
  { id: "users", name: "User Management", icon: Users },
  { id: "settings", name: "Settings", icon: Settings },
  { id: "themes", name: "Themes", icon: Moon },
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
      <Text style={pdfStyles.coverTitle}>Friday Report</Text>
      <Text style={pdfStyles.coverSubtitle}>Project Portfolio Management</Text>
      <Text style={pdfStyles.coverSubtitle}>Complete User Guide</Text>
      <Text style={pdfStyles.coverVersion}>Version 1.0 - January 2026</Text>
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
        <Text style={pdfStyles.sectionSubtitle}>Introduction to Friday Report</Text>
        <Text style={pdfStyles.paragraph}>
          Friday Report is an enterprise-grade Project Portfolio Management application designed to help teams 
          track projects, portfolios, risks, milestones, and issues efficiently. The application follows 
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
      <Text style={pdfStyles.footer}>Friday Report User Guide</Text>
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
      <Text style={pdfStyles.footer}>Friday Report User Guide</Text>
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
      <Text style={pdfStyles.footer}>Friday Report User Guide</Text>
      <Text style={pdfStyles.pageNumber}>5</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>4. Projects</Text>
        <Text style={pdfStyles.sectionSubtitle}>Core project tracking and management</Text>
        <Text style={pdfStyles.paragraph}>
          Projects are the heart of Friday Report. Track individual initiatives with detailed information 
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
        <Text style={pdfStyles.listItem}>Initiation, Planning, Execution, Monitoring, Closing</Text>
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
          <Text style={pdfStyles.listItem}>Milestones Tab: Define key project milestones</Text>
        </View>
        <View style={pdfStyles.listRow}>
          <View style={pdfStyles.bulletPoint} />
          <Text style={pdfStyles.listItem}>Issues Tab: Log and track project issues</Text>
        </View>
      </View>
      <Text style={pdfStyles.footer}>Friday Report User Guide</Text>
      <Text style={pdfStyles.pageNumber}>6</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>5. Tasks</Text>
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
        <Text style={pdfStyles.sectionTitle}>6. Issues</Text>
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
      <Text style={pdfStyles.footer}>Friday Report User Guide</Text>
      <Text style={pdfStyles.pageNumber}>7</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>7. Resources</Text>
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
        <Text style={pdfStyles.sectionTitle}>8. Calendar</Text>
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
      <Text style={pdfStyles.footer}>Friday Report User Guide</Text>
      <Text style={pdfStyles.pageNumber}>8</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>9. Organizations</Text>
        <Text style={pdfStyles.sectionSubtitle}>Multi-organization support and switching</Text>
        <Text style={pdfStyles.paragraph}>
          Friday Report supports multiple organizations. Each organization has its own set of portfolios, 
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
        <Text style={pdfStyles.sectionTitle}>10. User Management</Text>
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
      <Text style={pdfStyles.footer}>Friday Report User Guide</Text>
      <Text style={pdfStyles.pageNumber}>9</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>11. Settings</Text>
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
      <Text style={pdfStyles.footer}>Friday Report User Guide</Text>
      <Text style={pdfStyles.pageNumber}>10</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>12. Themes</Text>
        <Text style={pdfStyles.sectionSubtitle}>Customize your visual experience</Text>
        <Text style={pdfStyles.paragraph}>
          Friday Report supports multiple themes to customize your visual experience. 
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
          with Friday Report. We're here to help you get the most out of your project portfolio management.
        </Text>
      </View>
      <Text style={pdfStyles.footer}>Friday Report User Guide</Text>
      <Text style={pdfStyles.pageNumber}>11</Text>
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

export default function UserGuide() {
  const [activeSection, setActiveSection] = useState("overview");
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

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
              Complete documentation for Friday Report - Project Portfolio Management
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
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
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

          <div className="flex-1 space-y-8 max-w-4xl">
            <section id="overview" className="scroll-mt-8">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Overview</CardTitle>
                      <CardDescription>Introduction to Friday Report</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    Friday Report is an enterprise-grade Project Portfolio Management application designed to help teams 
                    track projects, portfolios, risks, milestones, and issues efficiently. The application follows 
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

            <section id="dashboard" className="scroll-mt-8">
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
                </CardContent>
              </Card>
            </section>

            <section id="portfolios" className="scroll-mt-8">
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
                </CardContent>
              </Card>
            </section>

            <section id="projects" className="scroll-mt-8">
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
                    Projects are the heart of Friday Report. Track individual initiatives with detailed information 
                    including status, priority, health, budget, and completion percentage.
                  </p>
                  
                  <h4 className="font-semibold text-foreground mt-4">Project Attributes:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Status</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Initiation, Planning, Execution, Monitoring, Closing</p>
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
                    <Badge variant="outline" className="gap-1"><Milestone className="h-3 w-3" /> Milestones</Badge>
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
                      <span><strong>Milestones:</strong> Define key project milestones with Scrum board</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary shrink-0" />
                      <span><strong>Issues:</strong> Log and track project issues and bugs</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </section>

            <section id="tasks" className="scroll-mt-8">
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

            <section id="issues" className="scroll-mt-8">
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

            <section id="resources" className="scroll-mt-8">
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

                  <h4 className="font-semibold text-foreground mt-4">Resource Assignments:</h4>
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
                </CardContent>
              </Card>
            </section>

            <section id="calendar" className="scroll-mt-8">
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
                </CardContent>
              </Card>
            </section>

            <section id="organizations" className="scroll-mt-8">
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
                    Friday Report supports multiple organizations. Each organization has its own set of portfolios, 
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
                </CardContent>
              </Card>
            </section>

            <section id="users" className="scroll-mt-8">
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
                </CardContent>
              </Card>
            </section>

            <section id="settings" className="scroll-mt-8">
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
                </CardContent>
              </Card>
            </section>

            <section id="themes" className="scroll-mt-8">
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
                    Friday Report supports multiple themes to customize your visual experience. 
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
                </CardContent>
              </Card>
            </section>

            <Card className="mt-8 bg-primary/5 border-primary/20">
              <CardContent className="py-6">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 shrink-0">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <h3 className="font-semibold text-foreground">Need More Help?</h3>
                    <p className="text-sm text-muted-foreground">
                      Contact your administrator or reach out to our support team for additional assistance.
                    </p>
                  </div>
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
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
