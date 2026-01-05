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
  Image
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { pdf, Document, Page, Text, View, StyleSheet, Image as PDFImage } from "@react-pdf/renderer";

import dashboardScreenshot from "@assets/generated_images/ppm_dashboard_screenshot.png";
import portfoliosScreenshot from "@assets/generated_images/portfolios_page_screenshot.png";
import projectsScreenshot from "@assets/generated_images/projects_list_screenshot.png";
import tasksScreenshot from "@assets/generated_images/tasks_gantt_view_screenshot.png";
import issuesScreenshot from "@assets/generated_images/issues_page_screenshot.png";
import calendarScreenshot from "@assets/generated_images/calendar_view_screenshot.png";
import orgSettingsScreenshot from "@assets/generated_images/organization_settings_screenshot.png";
import projectDetailsScreenshot from "@assets/generated_images/project_details_screenshot.png";
import userProfileScreenshot from "@assets/generated_images/user_profile_screenshot.png";
import themeToggleScreenshot from "@assets/generated_images/theme_toggle_comparison.png";
import superAdminScreenshot from "@assets/generated_images/super_admin_console_screenshot.png";
import createProjectScreenshot from "@assets/generated_images/create_project_dialog_screenshot.png";
import risksScreenshot from "@assets/generated_images/risks_management_screenshot.png";
import sidebarScreenshot from "@assets/generated_images/sidebar_navigation_screenshot.png";

const sections = [
  { id: "overview", name: "Overview", icon: BookOpen },
  { id: "dashboard", name: "Dashboard", icon: LayoutDashboard },
  { id: "portfolios", name: "Portfolios", icon: Briefcase },
  { id: "projects", name: "Projects", icon: FolderKanban },
  { id: "tasks", name: "Tasks", icon: CheckSquare },
  { id: "issues", name: "Issues", icon: CircleDot },
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
      <Text style={pdfStyles.coverTitle}>PPM Suite</Text>
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
        <Text style={pdfStyles.sectionSubtitle}>Introduction to PPM Suite</Text>
        <Text style={pdfStyles.paragraph}>
          PPM Suite is an enterprise-grade Project Portfolio Management application designed to help teams 
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
      <Text style={pdfStyles.footer}>PPM Suite User Guide</Text>
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
      <Text style={pdfStyles.footer}>PPM Suite User Guide</Text>
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
      <Text style={pdfStyles.footer}>PPM Suite User Guide</Text>
      <Text style={pdfStyles.pageNumber}>5</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>4. Projects</Text>
        <Text style={pdfStyles.sectionSubtitle}>Core project tracking and management</Text>
        <Text style={pdfStyles.paragraph}>
          Projects are the heart of PPM Suite. Track individual initiatives with detailed information 
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
      <Text style={pdfStyles.footer}>PPM Suite User Guide</Text>
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
      <Text style={pdfStyles.footer}>PPM Suite User Guide</Text>
      <Text style={pdfStyles.pageNumber}>7</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>7. Calendar</Text>
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

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>8. Organizations</Text>
        <Text style={pdfStyles.sectionSubtitle}>Multi-organization support and switching</Text>
        <Text style={pdfStyles.paragraph}>
          PPM Suite supports multiple organizations. Each organization has its own set of portfolios, 
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
      <Text style={pdfStyles.footer}>PPM Suite User Guide</Text>
      <Text style={pdfStyles.pageNumber}>8</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>9. User Management</Text>
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

      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>10. Settings</Text>
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
      <Text style={pdfStyles.footer}>PPM Suite User Guide</Text>
      <Text style={pdfStyles.pageNumber}>9</Text>
    </Page>

    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.section}>
        <Text style={pdfStyles.sectionTitle}>11. Themes</Text>
        <Text style={pdfStyles.sectionSubtitle}>Customize your visual experience</Text>
        <Text style={pdfStyles.paragraph}>
          PPM Suite supports multiple themes to customize your visual experience. 
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
          with PPM Suite. We're here to help you get the most out of your project portfolio management.
        </Text>
      </View>
      <Text style={pdfStyles.footer}>PPM Suite User Guide</Text>
      <Text style={pdfStyles.pageNumber}>10</Text>
    </Page>
  </Document>
);

function ScreenshotFigure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="my-6 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
      <div className="relative">
        <img
          src={src}
          alt={alt}
          className="w-full h-auto"
          loading="lazy"
          data-testid={`img-${alt.toLowerCase().replace(/\s+/g, '-')}`}
        />
        <div className="absolute top-2 right-2">
          <Badge variant="secondary" className="text-xs gap-1">
            <Image className="h-3 w-3" />
            Screenshot
          </Badge>
        </div>
      </div>
      <figcaption className="px-4 py-3 text-sm text-muted-foreground bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
        {caption}
      </figcaption>
    </figure>
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
      link.download = "PPM_Suite_User_Guide.pdf";
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
              Complete documentation for PPM Suite - Project Portfolio Management
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
                      <CardDescription>Introduction to PPM Suite</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    PPM Suite is an enterprise-grade Project Portfolio Management application designed to help teams 
                    track projects, portfolios, risks, milestones, and issues efficiently. The application follows 
                    modern design principles inspired by tools like Linear and Asana.
                  </p>
                  
                  <ScreenshotFigure 
                    src={sidebarScreenshot}
                    alt="Navigation Sidebar"
                    caption="Figure 1: The main navigation sidebar provides quick access to all major sections of PPM Suite"
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Target className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium text-foreground">Portfolio Management</h4>
                        <p className="text-sm text-muted-foreground">Organize projects into strategic portfolios</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <TrendingUp className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium text-foreground">Project Tracking</h4>
                        <p className="text-sm text-muted-foreground">Monitor progress, health, and budgets</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <AlertTriangle className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium text-foreground">Risk Management</h4>
                        <p className="text-sm text-muted-foreground">Identify and mitigate project risks</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Clock className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium text-foreground">Timeline View</h4>
                        <p className="text-sm text-muted-foreground">Visualize milestones on calendar</p>
                      </div>
                    </div>
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
                  
                  <ScreenshotFigure 
                    src={dashboardScreenshot}
                    alt="Dashboard Overview"
                    caption="Figure 2: The main dashboard displaying KPI cards, project health distribution, and status overview charts"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Key Features:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Summary Cards:</strong> View total projects, portfolios, active tasks, and open issues at a glance</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Budget Overview:</strong> Track total allocated budget across all projects</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Health Indicators:</strong> Quickly identify projects needing attention</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Clickable Cards:</strong> Click any metric card to navigate directly to the relevant page</span>
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
                  
                  <ScreenshotFigure 
                    src={portfoliosScreenshot}
                    alt="Portfolios Page"
                    caption="Figure 3: The Portfolios page showing portfolio cards with project counts, budget totals, and health indicators"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Managing Portfolios:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Plus className="h-5 w-5 text-green-500 mt-0.5" />
                      <div>
                        <h5 className="font-medium text-foreground">Create Portfolio</h5>
                        <p className="text-sm text-muted-foreground">Click the "New Portfolio" button and fill in name, description, and strategy</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Eye className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div>
                        <h5 className="font-medium text-foreground">View Details</h5>
                        <p className="text-sm text-muted-foreground">Click on a portfolio card to see all associated projects and details</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Edit className="h-5 w-5 text-yellow-500 mt-0.5" />
                      <div>
                        <h5 className="font-medium text-foreground">Edit Portfolio</h5>
                        <p className="text-sm text-muted-foreground">Update portfolio information, strategy, or assigned manager</p>
                      </div>
                    </div>
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
                    Projects are the heart of PPM Suite. Track individual initiatives with detailed information 
                    including status, priority, health, budget, and completion percentage.
                  </p>
                  
                  <ScreenshotFigure 
                    src={projectsScreenshot}
                    alt="Projects List"
                    caption="Figure 4: The Projects list view with health indicators, status badges, progress bars, and budget information"
                  />
                  
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

                  <ScreenshotFigure 
                    src={projectDetailsScreenshot}
                    alt="Project Details"
                    caption="Figure 5: Project details page showing summary, milestones, tasks, risks, and issues tabs"
                  />
                  
                  <ScreenshotFigure 
                    src={createProjectScreenshot}
                    alt="Create Project Dialog"
                    caption="Figure 6: The Create New Project dialog with fields for name, description, priority, status, budget, and dates"
                  />

                  <h4 className="font-semibold text-foreground mt-4">Project Details Page:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Overview Tab:</strong> Project summary with key metrics and description</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Tasks Tab:</strong> Manage project-specific tasks</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Risks Tab:</strong> Track and assess project risks</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Milestones Tab:</strong> Define key project milestones</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Issues Tab:</strong> Log and track project issues</span>
                    </li>
                  </ul>
                  
                  <ScreenshotFigure 
                    src={risksScreenshot}
                    alt="Risks Management"
                    caption="Figure 7: Risk management table showing probability, impact, status, and owner for each risk"
                  />
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
                  
                  <ScreenshotFigure 
                    src={tasksScreenshot}
                    alt="Tasks Gantt View"
                    caption="Figure 8: The Tasks page with Gantt chart timeline view and Kanban board for visual task management"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Task Management:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Status Tracking:</strong> Open, In Progress, Completed, Cancelled</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Priority Levels:</strong> Set importance from Low to Critical</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Due Dates:</strong> Set deadlines for task completion</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
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
                  
                  <ScreenshotFigure 
                    src={issuesScreenshot}
                    alt="Issues Page"
                    caption="Figure 9: The Issues page with type icons, priority badges, status indicators, and project associations"
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
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">In Progress</Badge>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Resolved</Badge>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                    <Badge variant="outline">Closed</Badge>
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
                  
                  <ScreenshotFigure 
                    src={calendarScreenshot}
                    alt="Calendar View"
                    caption="Figure 10: The Calendar view displaying project milestones and events with color-coded project indicators"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Calendar Features:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Project Timelines:</strong> View project start and end dates</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Milestone Markers:</strong> See key milestone dates on the calendar</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Task Deadlines:</strong> Track upcoming task due dates</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Month Navigation:</strong> Easily navigate between months</span>
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
                    PPM Suite supports multiple organizations. Each organization has its own set of portfolios, 
                    projects, and team members. Switch between organizations using the sidebar selector.
                  </p>
                  
                  <ScreenshotFigure 
                    src={orgSettingsScreenshot}
                    alt="Organization Settings"
                    caption="Figure 11: Organization settings page with member management table and role assignments"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Access Control:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Shield className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h5 className="font-medium text-foreground">Super Admin</h5>
                        <p className="text-sm text-muted-foreground">Can access all organizations and manage system-wide settings</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Users className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h5 className="font-medium text-foreground">Organization Members</h5>
                        <p className="text-sm text-muted-foreground">Can only access organizations they are members of</p>
                      </div>
                    </div>
                  </div>
                  
                  <ScreenshotFigure 
                    src={superAdminScreenshot}
                    alt="Super Admin Console"
                    caption="Figure 12: Super Admin console for managing organizations and users across the entire system"
                  />

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
                  
                  <ScreenshotFigure 
                    src={userProfileScreenshot}
                    alt="User Profile"
                    caption="Figure 13: User profile page displaying personal information, role, and organization memberships"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">User Menu Options:</h4>
                  <ul className="space-y-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Profile:</strong> View and edit your personal information</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>User Settings:</strong> Configure your account preferences</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Org Settings:</strong> Manage organization settings (if authorized)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-1 text-primary" />
                      <span><strong>Log Out:</strong> Sign out of the application</span>
                    </li>
                  </ul>
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
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Building2 className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h5 className="font-medium text-foreground">Organization Settings</h5>
                        <p className="text-sm text-muted-foreground">Manage organization name, description, and member access</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Users className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h5 className="font-medium text-foreground">User Settings</h5>
                        <p className="text-sm text-muted-foreground">Personal preferences, notifications, and account settings</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Shield className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h5 className="font-medium text-foreground">Super Admin Panel</h5>
                        <p className="text-sm text-muted-foreground">System-wide settings (Super Admins only)</p>
                      </div>
                    </div>
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
                    PPM Suite supports multiple themes to customize your visual experience. 
                    Toggle between light and dark modes using the theme switcher in the top bar.
                  </p>
                  
                  <ScreenshotFigure 
                    src={themeToggleScreenshot}
                    alt="Theme Toggle Comparison"
                    caption="Figure 14: Side-by-side comparison of Light Mode and Dark Mode showing the theme toggle in action"
                  />
                  
                  <h4 className="font-semibold text-foreground mt-4">Available Themes:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <Sun className="h-5 w-5 text-amber-500" />
                      <div>
                        <h5 className="font-medium text-foreground">Light</h5>
                        <p className="text-sm text-muted-foreground">Bright, clean interface</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-800 dark:bg-slate-900 border border-slate-600 dark:border-slate-700">
                      <Moon className="h-5 w-5 text-blue-400" />
                      <div>
                        <h5 className="font-medium text-white">Dark</h5>
                        <p className="text-sm text-slate-300">Easy on the eyes</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
                    Your theme preference is saved and will persist across sessions.
                  </p>
                </CardContent>
              </Card>
            </section>

            <Card className="mt-8 bg-primary/5 border-primary/20">
              <CardContent className="py-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
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
