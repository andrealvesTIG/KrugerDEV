import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
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
  ArrowLeft,
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
  Menu,
  X,
  HardHat,
  ClipboardList,
  HelpCircle,
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
  ListChecks,
  Receipt,
  MessageSquare,
  GitMerge
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { LandingFooter } from "@/components/layout/LandingFooter";
import logoIcon from "@assets/FridayReportAI_logo_F-symbol_1770231051194.png";
import logoWhite from "@assets/FridayReportAI_logo_white_1770231063709.png";

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
  { id: "training", name: "Training", icon: GraduationCap },
  { id: "billing", name: "Billing & Credits", icon: CreditCard },
  { id: "organizations", name: "Organizations", icon: Building2 },
  { id: "users", name: "User Management", icon: Users },
  { id: "settings", name: "Settings", icon: Settings },
  { id: "themes", name: "Themes", icon: Moon },
  { id: "notifications", name: "Notifications", icon: Flag },
  { id: "reports", name: "Scheduled Reports", icon: FileText },
];

export default function PublicUserGuide() {
  const [activeSection, setActiveSection] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && sections.find(s => s.id === hash)) {
        setActiveSection(hash);
      }
    };
    
    // Check initial hash
    handleHashChange();
    
    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSectionClick = (sectionId: string) => {
    setActiveSection(sectionId);
    setMobileMenuOpen(false);
    window.history.replaceState(null, '', `#${sectionId}`);
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case "overview":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Welcome to FridayReport.AI</h1>
                <p className="text-slate-400">Your complete project portfolio management solution</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Getting Started</CardTitle>
                <CardDescription className="text-slate-400">
                  FridayReport.AI is an enterprise-grade Project Portfolio Management (PPM) platform designed to help organizations manage portfolios, track progress, and deliver projects on time.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-slate-300">
                <p>Key capabilities include:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li>Portfolio and project management with real-time health monitoring</li>
                  <li>Executive dashboards with AI-powered insights</li>
                  <li>Resource allocation and capacity planning</li>
                  <li>Risk and issue tracking with proactive alerts</li>
                  <li>Gantt charts and timeline views</li>
                  <li>Automated status reporting</li>
                  <li>Timesheet tracking and approval workflows</li>
                  <li>Integration with Microsoft 365 ecosystem</li>
                </ul>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-slate-800/50 border-slate-700 hover-elevate cursor-pointer" onClick={() => handleSectionClick("dashboard")} data-testid="card-link-dashboard">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <LayoutDashboard className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white" data-testid="text-dashboard-title">Dashboard</h3>
                    <p className="text-sm text-slate-400">View portfolio overview and key metrics</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-500 ml-auto" />
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700 hover-elevate cursor-pointer" onClick={() => handleSectionClick("portfolios")} data-testid="card-link-portfolios">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Briefcase className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white" data-testid="text-portfolios-title">Portfolios</h3>
                    <p className="text-sm text-slate-400">Organize projects into portfolios</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-500 ml-auto" />
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700 hover-elevate cursor-pointer" onClick={() => handleSectionClick("projects")} data-testid="card-link-projects">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <FolderKanban className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white" data-testid="text-projects-title">Projects</h3>
                    <p className="text-sm text-slate-400">Manage individual projects</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-500 ml-auto" />
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700 hover-elevate cursor-pointer" onClick={() => handleSectionClick("integrations")} data-testid="card-link-integrations">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Plug className="h-5 w-5 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white" data-testid="text-integrations-title">Integrations</h3>
                    <p className="text-sm text-slate-400">Connect your favorite tools</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-500 ml-auto" />
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case "dashboard":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <LayoutDashboard className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                <p className="text-slate-400">Executive overview of your project portfolio</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>The Dashboard provides a comprehensive view of your entire project portfolio at a glance. Key features include:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Portfolio Health Summary:</strong> Visual indicators showing project status across all portfolios</li>
                  <li><strong className="text-slate-200">Key Performance Indicators:</strong> Track metrics like on-time delivery, budget utilization, and resource allocation</li>
                  <li><strong className="text-slate-200">Recent Activity:</strong> Stay updated on the latest changes across your projects</li>
                  <li><strong className="text-slate-200">Risk Overview:</strong> Quick view of open risks and issues requiring attention</li>
                  <li><strong className="text-slate-200">Custom Dashboards:</strong> Create personalized views for different stakeholder groups</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "portfolios":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Briefcase className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Portfolios</h1>
                <p className="text-slate-400">Organize and manage project portfolios</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Portfolios help you group related projects together for better oversight and strategic alignment:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Create Portfolios:</strong> Group projects by department, program, or strategic initiative</li>
                  <li><strong className="text-slate-200">Portfolio Managers:</strong> Assign owners responsible for portfolio health</li>
                  <li><strong className="text-slate-200">Aggregate Reporting:</strong> View combined metrics across all projects in a portfolio</li>
                  <li><strong className="text-slate-200">Resource Allocation:</strong> See how resources are distributed across portfolio projects</li>
                  <li><strong className="text-slate-200">Strategic Alignment:</strong> Link portfolios to organizational goals and objectives</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "projects":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <FolderKanban className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Projects</h1>
                <p className="text-slate-400">Full lifecycle project management</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Manage projects from initiation to closure with comprehensive tools:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Project Details:</strong> Capture all essential project information including objectives, scope, and stakeholders</li>
                  <li><strong className="text-slate-200">Gantt Charts:</strong> Visualize project schedules with interactive timeline views</li>
                  <li><strong className="text-slate-200">Task Management:</strong> Break down work into manageable tasks with dependencies</li>
                  <li><strong className="text-slate-200">Portfolio Key Dates:</strong> Track important dates for your portfolios</li>
                  <li><strong className="text-slate-200">Status Updates:</strong> Generate automated status reports with AI assistance</li>
                  <li><strong className="text-slate-200">Budget Tracking:</strong> Monitor project costs and budget utilization</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "integrations":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Plug className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Integrations</h1>
                <p className="text-slate-400">Connect your favorite tools and platforms</p>
              </div>
            </div>

            <div className="grid gap-4">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Plug className="h-5 w-5 text-blue-400" />
                    Project Management Integrations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-slate-400">
                  <p className="text-slate-300">Import and sync projects from your existing tools:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Microsoft Project (.mpp files)</li>
                    <li>Microsoft Planner (with milestone detection)</li>
                    <li>Planner Premium / Project for the Web (full schedule import with tasks, dependencies, hierarchies, milestones, and resource assignments via Dataverse)</li>
                    <li>Project Online</li>
                    <li>Jira</li>
                    <li>Asana</li>
                    <li>Monday.com</li>
                    <li>Trello</li>
                    <li>Notion</li>
                    <li>ClickUp</li>
                    <li>Basecamp</li>
                  </ul>
                  <div className="mt-3 p-3 rounded-lg bg-slate-700/50 border border-slate-600">
                    <p className="text-sm text-blue-400 font-medium mb-2">Planner Premium Quick Start</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Set up an Azure App Registration with Dynamics CRM permissions</li>
                      <li>Go to Integrations and click Planner Premium</li>
                      <li>Enter your Dataverse environment URL and authenticate</li>
                      <li>Select plans and import them as full projects with dependencies</li>
                    </ol>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-purple-400" />
                    ERP Systems
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-slate-400">
                  <p className="text-slate-300">Connect enterprise resource planning systems:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>SAP</li>
                    <li>Oracle</li>
                    <li>NetSuite</li>
                    <li>Dynamics 365</li>
                    <li>Workday</li>
                    <li>Salesforce</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-amber-400" />
                    Analytics & BI
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-slate-400">
                  <p className="text-slate-300">Export data to business intelligence platforms:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Power BI</li>
                    <li>Tableau</li>
                    <li>Google Analytics</li>
                    <li>Looker</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-sky-400" />
                    Identity & Directory
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-slate-400">
                  <p className="text-slate-300">Sync users and enable SSO:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Microsoft Entra ID (Azure AD)</li>
                    <li>Dynamics 365</li>
                    <li>Business Central</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case "tasks":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-teal-500/10 flex items-center justify-center">
                <CheckSquare className="h-6 w-6 text-teal-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Tasks</h1>
                <p className="text-slate-400">Work breakdown and task management</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Break down project work into manageable tasks:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Task Lists:</strong> Create and organize tasks within projects</li>
                  <li><strong className="text-slate-200">Assignments:</strong> Assign tasks to team members with due dates</li>
                  <li><strong className="text-slate-200">Dependencies:</strong> Link tasks to show relationships and critical path</li>
                  <li><strong className="text-slate-200">Progress Tracking:</strong> Update task completion and track time spent</li>
                  <li><strong className="text-slate-200">Filters & Views:</strong> Find tasks using multiple views and filter options</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "issues":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center">
                <CircleDot className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Issues & Risks</h1>
                <p className="text-slate-400">Proactive risk and issue management</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Identify and manage risks before they become problems:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Risk Register:</strong> Log and categorize project risks</li>
                  <li><strong className="text-slate-200">Risk Scoring:</strong> Assess probability and impact</li>
                  <li><strong className="text-slate-200">Mitigation Plans:</strong> Document response strategies</li>
                  <li><strong className="text-slate-200">Issue Tracking:</strong> Log and resolve project issues</li>
                  <li><strong className="text-slate-200">Escalation:</strong> Flag critical items for leadership attention</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "timesheets":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Timesheets</h1>
                <p className="text-slate-400">Time tracking and reporting</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Track time spent on projects and tasks:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Time Entry:</strong> Log hours against projects and tasks</li>
                  <li><strong className="text-slate-200">Approvals:</strong> Manager review and approval workflows</li>
                  <li><strong className="text-slate-200">Reporting:</strong> Generate timesheet reports for billing or analysis</li>
                  <li><strong className="text-slate-200">Utilization:</strong> Track resource utilization rates</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "resources":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <UserCog className="h-6 w-6 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Resources</h1>
                <p className="text-slate-400">Team and resource management</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Manage team members and resource allocation:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Resource Pool:</strong> Maintain a list of available team members</li>
                  <li><strong className="text-slate-200">Skills & Roles:</strong> Track competencies and job functions</li>
                  <li><strong className="text-slate-200">Capacity Planning:</strong> Balance workloads across the team</li>
                  <li><strong className="text-slate-200">Allocation:</strong> Assign resources to projects with time percentages</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "calendar":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-pink-500/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-pink-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Calendar</h1>
                <p className="text-slate-400">Visual timeline and scheduling</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Visualize project schedules and milestones:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Calendar Views:</strong> Month, week, and day views</li>
                  <li><strong className="text-slate-200">Key Dates:</strong> Portfolio key dates and deliverables</li>
                  <li><strong className="text-slate-200">Task Deadlines:</strong> Upcoming due dates</li>
                  <li><strong className="text-slate-200">Filtering:</strong> View by project, portfolio, or resource</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "billing":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Billing & Credits</h1>
                <p className="text-slate-400">Subscription and usage management</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Manage your subscription and AI credits:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Plans:</strong> Free, Professional, Business, and Enterprise tiers</li>
                  <li><strong className="text-slate-200">AI Credits:</strong> Monitor and purchase AI feature credits</li>
                  <li><strong className="text-slate-200">Seats:</strong> Manage user seats and permissions</li>
                  <li><strong className="text-slate-200">Invoices:</strong> View billing history and download receipts</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "organizations":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-violet-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Organizations</h1>
                <p className="text-slate-400">Multi-tenant organization management</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Set up and manage your organization:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Organization Settings:</strong> Configure name, branding, and defaults</li>
                  <li><strong className="text-slate-200">Multiple Organizations:</strong> Switch between different workspaces</li>
                  <li><strong className="text-slate-200">Data Isolation:</strong> Complete separation between organizations</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "users":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-sky-500/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-sky-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">User Management</h1>
                <p className="text-slate-400">Team access and permissions</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Manage user access and permissions:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Roles:</strong> Owner, Admin, Member, and Team Member roles</li>
                  <li><strong className="text-slate-200">Invitations:</strong> Invite new users via email</li>
                  <li><strong className="text-slate-200">SSO:</strong> Single sign-on with Microsoft Entra ID</li>
                  <li><strong className="text-slate-200">Permissions:</strong> Control access to projects and features</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "settings":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-slate-500/10 flex items-center justify-center">
                <Settings className="h-6 w-6 text-slate-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Settings</h1>
                <p className="text-slate-400">Configuration and preferences</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Customize your FridayReport.AI experience:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Organization Settings:</strong> General configuration options</li>
                  <li><strong className="text-slate-200">Module Visibility:</strong> Show/hide sidebar modules</li>
                  <li><strong className="text-slate-200">Notifications:</strong> Configure email and in-app notifications</li>
                  <li><strong className="text-slate-200">Integrations:</strong> Connect external tools and services</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "intakes":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Inbox className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Project Intakes</h1>
                <p className="text-slate-400">Capture and evaluate new project requests</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Streamline how new project requests enter your portfolio:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Intake Forms:</strong> Customizable forms for capturing project requests with all required information</li>
                  <li><strong className="text-slate-200">Approval Workflows:</strong> Route requests through appropriate stakeholders for review and approval</li>
                  <li><strong className="text-slate-200">Prioritization:</strong> Score and rank incoming requests based on business value and strategic fit</li>
                  <li><strong className="text-slate-200">Conversion:</strong> Convert approved intakes directly into active projects</li>
                  <li><strong className="text-slate-200">Pipeline View:</strong> Visualize all pending requests and their status in the intake pipeline</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "scoring":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Star className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Project Scoring</h1>
                <p className="text-slate-400">Evaluate and prioritize projects objectively</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Use scoring models to objectively evaluate and prioritize projects:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Scoring Criteria:</strong> Define weighted criteria across categories (Strategic, Financial, Risk, Resource, Technical) with configurable weights</li>
                  <li><strong className="text-slate-200">Inline Editing:</strong> Click category badges and weight labels to edit them directly on the scoring card</li>
                  <li><strong className="text-slate-200">Score & Justify:</strong> Use sliders to set scores (0-10) per criterion with justification notes. Unsaved changes are highlighted with an amber indicator and a Reset button</li>
                  <li><strong className="text-slate-200">Weighted Total:</strong> Scores are normalized by max score, weighted, and combined into a single 0-10 scale for objective comparison</li>
                  <li><strong className="text-slate-200">Portfolio Rollup:</strong> Saved project scores automatically aggregate into the portfolio Scoring Rollup with configurable aggregation methods (Average, Sum, Min, Max, Weighted Average) and weighted contribution breakdowns</li>
                  <li><strong className="text-slate-200">Key Date Compliance:</strong> Portfolio scoring also tracks key date compliance across projects, categorizing dates as Completed, Overdue, At Risk, or Upcoming</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "benefits":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Gift className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Benefits Tracking</h1>
                <p className="text-slate-400">Measure and track project value realization</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Track the expected and realized benefits of your projects:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Benefit Categories:</strong> Define financial, operational, and strategic benefit types</li>
                  <li><strong className="text-slate-200">Expected vs Actual:</strong> Compare planned benefits against realized outcomes</li>
                  <li><strong className="text-slate-200">Measurement Plans:</strong> Define how and when benefits will be measured</li>
                  <li><strong className="text-slate-200">Benefit Owners:</strong> Assign accountability for benefit realization</li>
                  <li><strong className="text-slate-200">Reporting:</strong> Generate benefit realization reports for stakeholders</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "decisions":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Scale className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Decision Log</h1>
                <p className="text-slate-400">Document and track key project decisions</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Maintain a clear record of important project decisions:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Decision Records:</strong> Capture the decision, rationale, and alternatives considered</li>
                  <li><strong className="text-slate-200">Decision Makers:</strong> Document who made the decision and when</li>
                  <li><strong className="text-slate-200">Impact Assessment:</strong> Record the expected impact on scope, schedule, and budget</li>
                  <li><strong className="text-slate-200">Decision Status:</strong> Track pending, approved, and deferred decisions</li>
                  <li><strong className="text-slate-200">Audit Trail:</strong> Maintain history for governance and compliance</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "lessons":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Lightbulb className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Lessons Learned</h1>
                <p className="text-slate-400">Capture knowledge for continuous improvement</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Build organizational knowledge from project experiences:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Lesson Categories:</strong> Categorize lessons by type: what went well, what could improve, recommendations</li>
                  <li><strong className="text-slate-200">Searchable Repository:</strong> Find relevant lessons from past projects</li>
                  <li><strong className="text-slate-200">Action Items:</strong> Create follow-up actions to implement improvements</li>
                  <li><strong className="text-slate-200">Phase-Based Capture:</strong> Document lessons at project milestones and closure</li>
                  <li><strong className="text-slate-200">Knowledge Sharing:</strong> Share lessons across teams and portfolios</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "custom-fields":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Sliders className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Custom Fields</h1>
                <p className="text-slate-400">Extend data models for your needs</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Add custom fields to capture organization-specific data:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Field Types:</strong> Text, number, date, dropdown, multi-select, checkbox, and more</li>
                  <li><strong className="text-slate-200">Entity Support:</strong> Add custom fields to projects, portfolios, tasks, and resources</li>
                  <li><strong className="text-slate-200">Required Fields:</strong> Mark fields as required for data completeness</li>
                  <li><strong className="text-slate-200">Field Groups:</strong> Organize custom fields into logical groupings</li>
                  <li><strong className="text-slate-200">Reporting:</strong> Include custom fields in reports and exports</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "custom-links":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-teal-500/10 flex items-center justify-center">
                <Link2 className="h-6 w-6 text-teal-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Custom Links</h1>
                <p className="text-slate-400">Add external links to your sidebar</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Integrate external tools and resources into your workspace:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Sidebar Links:</strong> Add quick-access links to external tools in the navigation</li>
                  <li><strong className="text-slate-200">Open Options:</strong> Open in new tab or embed within FridayReport.AI</li>
                  <li><strong className="text-slate-200">Custom Icons:</strong> Choose icons to match your linked resources</li>
                  <li><strong className="text-slate-200">Organization-Specific:</strong> Different links for different organizations</li>
                  <li><strong className="text-slate-200">Common Uses:</strong> Link to Power BI reports, SharePoint sites, Teams channels, or any web resource</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "custom-tabs":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-rose-500/10 flex items-center justify-center">
                <LayoutTemplate className="h-6 w-6 text-rose-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Custom Tabs</h1>
                <p className="text-slate-400">Organize sidebar navigation your way</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Customize the sidebar structure to match your workflow:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Custom Groups:</strong> Create named groups to organize sidebar items</li>
                  <li><strong className="text-slate-200">Drag & Drop:</strong> Reorder modules and links within groups</li>
                  <li><strong className="text-slate-200">Hide Modules:</strong> Hide unused modules to simplify the interface</li>
                  <li><strong className="text-slate-200">Per-Organization:</strong> Each organization can have its own sidebar layout</li>
                  <li><strong className="text-slate-200">Default Groups:</strong> Pre-configured Menu and Help groups as starting points</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "themes":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Moon className="h-6 w-6 text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Themes</h1>
                <p className="text-slate-400">Customize the visual appearance</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Personalize the look and feel of FridayReport.AI:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Light & Dark Mode:</strong> Switch between light and dark themes</li>
                  <li><strong className="text-slate-200">Accent Colors:</strong> Choose from multiple accent color options</li>
                  <li><strong className="text-slate-200">Per-User Settings:</strong> Each user can set their preferred theme</li>
                  <li><strong className="text-slate-200">System Preference:</strong> Automatically match your device settings</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "gantt-timeline":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <GanttChart className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Gantt &amp; Timeline</h1>
                <p className="text-slate-400">Visualize task schedules and dependencies</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Every project includes an interactive Gantt-style timeline with rich scheduling features:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Drag-to-Reschedule:</strong> Move bars to change dates; durations recalculate automatically</li>
                  <li><strong className="text-slate-200">Dependencies:</strong> Finish-to-start, start-to-start, finish-to-finish, and start-to-finish links</li>
                  <li><strong className="text-slate-200">Critical Path:</strong> Highlight the chain of dependent tasks driving project completion</li>
                  <li><strong className="text-slate-200">Milestones:</strong> Diamond markers for major checkpoints</li>
                  <li><strong className="text-slate-200">Zoom Levels:</strong> Day, week, month, quarter, year</li>
                  <li><strong className="text-slate-200">Baselines:</strong> Snapshot the planned schedule and track slippage</li>
                  <li><strong className="text-slate-200">Export:</strong> Print or export to PDF/PNG for status meetings</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "invoices":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Invoices</h1>
                <p className="text-slate-400">Track and manage invoices from external systems</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Track invoices imported from external accounting and ERP systems:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Statuses:</strong> Draft, Pending, Paid, Overdue, Cancelled</li>
                  <li><strong className="text-slate-200">Dynamics 365 Sync:</strong> Automatic invoice import from Microsoft Dynamics 365</li>
                  <li><strong className="text-slate-200">Filtering:</strong> Find invoices quickly by status, project, or vendor</li>
                  <li><strong className="text-slate-200">Project Linking:</strong> Tie invoices back to the originating project for cost reporting</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "simulation":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Activity className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Simulation</h1>
                <p className="text-slate-400">Monte Carlo-style portfolio forecasting</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Run scenario simulations to forecast portfolio outcomes before they happen:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Scenarios:</strong> Baseline, Optimistic, Pessimistic, Risk-Heavy, Resource Constrained</li>
                  <li><strong className="text-slate-200">Real-Time Controls:</strong> Play, pause, and step through simulations</li>
                  <li><strong className="text-slate-200">Budget Variance:</strong> Probability-weighted budget projections</li>
                  <li><strong className="text-slate-200">Schedule Variance:</strong> Forecast delays and acceleration per project</li>
                  <li><strong className="text-slate-200">Resource Forecasting:</strong> Predicted resource demand and capacity gaps</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "pmo-radar":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Radar className="h-6 w-6 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">PMO Radar</h1>
                <p className="text-slate-400">Portfolio-wide early-warning view of projects that need attention</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> When you own a portfolio (or several) and need a single screen that highlights the projects pulling the portfolio off-track instead of clicking into every status report.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Sidebar &rarr; <code className="text-cyan-300">PMO Radar</code> (path <code className="text-cyan-300">/pmo-radar</code>). The link is visible to anyone with access to at least one portfolio.</p>
                <p><strong className="text-slate-200">What you see:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Signal Categories:</strong> Schedule, Budget, Quality, Engagement, Risk, Resource</li>
                  <li><strong className="text-slate-200">Severity:</strong> Critical, High, Medium, Low</li>
                  <li><strong className="text-slate-200">Filters:</strong> Portfolio, owner, severity, signal type</li>
                  <li><strong className="text-slate-200">Drill Down:</strong> Click any row to open the underlying project, task, risk, or issue</li>
                  <li><strong className="text-slate-200">Trends:</strong> Track red/yellow project counts over time</li>
                </ul>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Filter by <em>your</em> owned portfolios first — the unfiltered list often spans more work than is yours to act on.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "powerbi-agent":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Bot className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Power BI Agent</h1>
                <p className="text-slate-400">Ask questions about your portfolio in plain English</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> When you want a chart or number from your portfolio data and don't want to hand-build it in Power BI or Excel.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Sidebar &rarr; <code className="text-purple-300">Power BI Agent</code> (path <code className="text-purple-300">/powerbi-agent</code>).</p>
                <p><strong className="text-slate-200">How it works:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Plain language prompt:</strong> Type a question such as "Which projects are over budget this quarter?" or "Top 10 overdue tasks by owner"</li>
                  <li><strong className="text-slate-200">Suggested visualisation:</strong> The agent picks a chart type that fits the answer (bar, line, table, KPI)</li>
                  <li><strong className="text-slate-200">Refine in place:</strong> Follow-up prompts like "group by portfolio" or "limit to the last 90 days"</li>
                  <li><strong className="text-slate-200">Permissions respected:</strong> Results only include data you already have access to</li>
                  <li><strong className="text-slate-200">Conversation history:</strong> Previous prompts and answers stay visible for audit</li>
                </ul>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Be specific about the time window and grouping ("last 90 days, by portfolio") — vague prompts produce vague charts.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "construction-overview":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <HardHat className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Construction Suite</h1>
                <p className="text-slate-400">Field-ready modules for general contractors and owners</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>The Construction Suite layers purpose-built modules on top of every project workspace:</p>
                <div className="grid sm:grid-cols-2 gap-3 mt-2">
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">Daily Logs</strong><p className="text-sm text-slate-400">Field activity, weather, manpower, photos</p></div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">RFIs</strong><p className="text-sm text-slate-400">Requests for Information with full audit history</p></div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">Submittals</strong><p className="text-sm text-slate-400">Shop drawings and product data approval flow</p></div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">Drawings</strong><p className="text-sm text-slate-400">Versioned sheets with markup and revisions</p></div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">Punch List</strong><p className="text-sm text-slate-400">Close-out items by location and trade</p></div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">Quality &amp; Safety</strong><p className="text-sm text-slate-400">Inspections, observations, and incidents</p></div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">Bidding</strong><p className="text-sm text-slate-400">Invitations to bid, tabulation, and award</p></div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">Vendors</strong><p className="text-sm text-slate-400">Subcontractor directory with insurance and prequal</p></div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">Change Orders</strong><p className="text-sm text-slate-400">PCO, COR, OCO, SCO with pricing build-up</p></div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">Pay Apps</strong><p className="text-sm text-slate-400">Schedule-of-values billing with retainage</p></div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">Meetings</strong><p className="text-sm text-slate-400">OAC and coordination minutes with action items</p></div>
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-700"><strong className="text-slate-200">Correspondence</strong><p className="text-sm text-slate-400">Formal letters, transmittals, and notices</p></div>
                </div>
                <p className="text-sm text-slate-400 mt-2">Org admins enable the suite on a per-project or per-portfolio basis from Organization Settings &rarr; Construction.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "daily-logs":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Daily Logs</h1>
                <p className="text-slate-400">Capture what happened on site every day</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> Every day the site is active. The daily log is your contemporaneous field record — used for billing disputes, schedule analysis, and as evidence if a claim arises.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Open a project &rarr; Construction tab &rarr; <code className="text-orange-300">Daily Logs</code>, or go straight to <code className="text-orange-300">/daily-logs</code>.</p>
                <p><strong className="text-slate-200">Key fields on a log:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Log date:</strong> The day the work happened (one log per project per day)</li>
                  <li><strong className="text-slate-200">Weather:</strong> Condition, temperature, wind speed, precipitation</li>
                  <li><strong className="text-slate-200">Labor entries:</strong> Company / trade, headcount, hours worked, notes</li>
                  <li><strong className="text-slate-200">Equipment entries:</strong> Equipment name, quantity, hours used, status, notes</li>
                  <li><strong className="text-slate-200">Visitors:</strong> Free-text list of inspectors, owners, third parties on site</li>
                  <li><strong className="text-slate-200">Notes:</strong> Narrative of the day — activities, delays, deliveries</li>
                  <li><strong className="text-slate-200">Photos &amp; attachments:</strong> Upload images and files with each log</li>
                </ul>
                <p><strong className="text-slate-200">Walkthrough:</strong></p>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>Click <em>New Log</em> and pick a date</li>
                  <li>Fill weather (or accept the auto-suggested values)</li>
                  <li>Add a labor row per crew on site, then equipment rows</li>
                  <li>Write the narrative under <em>Notes</em>, attach photos, save</li>
                  <li>Export the log to PDF for distribution</li>
                </ol>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Logs back-fill nicely, but it's much harder to remember headcount three days later — get into the habit of logging before you leave the trailer.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "rfis":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <HelpCircle className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">RFIs</h1>
                <p className="text-slate-400">Formally raise and resolve design questions</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> Whenever the field needs a written, traceable answer about the design — conflicts on the drawings, missing details, spec clarifications, substitutions.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Project &rarr; Construction &rarr; <code className="text-blue-300">RFIs</code> (path <code className="text-blue-300">/rfis</code>).</p>
                <p><strong className="text-slate-200">Key fields on an RFI:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">RFI number:</strong> Auto-assigned per project</li>
                  <li><strong className="text-slate-200">Subject &amp; question:</strong> The clarifying request itself</li>
                  <li><strong className="text-slate-200">Status:</strong> Defaults to <em>Open</em>; closes when an answer is accepted</li>
                  <li><strong className="text-slate-200">Priority:</strong> Low / Medium / High (defaults to Medium)</li>
                  <li><strong className="text-slate-200">Category, assigned to, due date</strong></li>
                  <li><strong className="text-slate-200">Distribution list:</strong> Additional parties cc'd on the thread</li>
                  <li><strong className="text-slate-200">Cost &amp; schedule impact flags</strong> with optional dollar / day estimates</li>
                  <li><strong className="text-slate-200">References &amp; attachments</strong> — link drawings, specs, photos</li>
                  <li><strong className="text-slate-200">Responses:</strong> Multiple replies per RFI; one can be marked the <em>official</em> answer</li>
                </ul>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> If the answer changes scope, flag the cost/schedule impact when you log the RFI — it makes the change-order conversation much shorter later.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "submittals":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Submittals</h1>
                <p className="text-slate-400">Shop drawings, product data, samples, and mock-ups</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> For every submittal required by the specifications — shop drawings, product data, samples, mock-ups, O&amp;M manuals, warranties, closeout deliverables.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Project &rarr; Construction &rarr; <code className="text-purple-300">Submittals</code> (path <code className="text-purple-300">/submittals</code>).</p>
                <p><strong className="text-slate-200">Key fields on a submittal:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Submittal number, title, description</strong></li>
                  <li><strong className="text-slate-200">Spec section</strong> — CSI section reference</li>
                  <li><strong className="text-slate-200">Type:</strong> Defaults to <em>Product Data</em>; choose Shop Drawings, Sample, Mock-up, etc.</li>
                  <li><strong className="text-slate-200">Status:</strong> Defaults to <em>Pending</em> through review</li>
                  <li><strong className="text-slate-200">Submitted by, reviewer</strong></li>
                  <li><strong className="text-slate-200">Submit / required / received / reviewed dates</strong> and <strong>lead time</strong> in days</li>
                  <li><strong className="text-slate-200">Cost &amp; schedule impact</strong> flags</li>
                  <li><strong className="text-slate-200">Attachments &amp; current revision</strong> — every revision is kept with its own status and review notes</li>
                </ul>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Set <em>required date</em> based on procurement lead time, not the install date — long-lead items often drive the schedule before they're even ordered.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "drawings":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <FileImage className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Drawings</h1>
                <p className="text-slate-400">Single source of truth for the current set of construction documents</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> To keep the team working from one current set instead of emailed PDFs that go stale the moment the next addendum drops.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Project &rarr; Construction &rarr; <code className="text-green-300">Drawings</code> (path <code className="text-green-300">/drawings</code>).</p>
                <p><strong className="text-slate-200">How it's organised:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Drawing sets</strong> — name and discipline (e.g. "Bid Set – Architectural", "IFC – MEP")</li>
                  <li><strong className="text-slate-200">Drawings</strong> within a set — drawing number, title, discipline, status (defaults to <em>Current</em>), description</li>
                  <li><strong className="text-slate-200">Revisions</strong> — each upload is a numbered/versioned revision with the file URL, name, type, and a thumbnail</li>
                  <li><strong className="text-slate-200">Markups</strong> — annotate sheets directly in the viewer; the markup data is stored alongside the revision</li>
                </ul>
                <p><strong className="text-slate-200">Walkthrough:</strong></p>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>Create or open a drawing set</li>
                  <li>Add drawings (number, title, discipline) and upload the file as the current revision</li>
                  <li>When a new revision arrives, upload it on the existing drawing — older revisions remain accessible in history</li>
                  <li>Open a sheet in the viewer to add markups</li>
                </ol>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Keep set names disciplined ("IFC v3 – 2025-04-15") so the field can tell at a glance which set is current.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "punch-list":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center">
                <ListChecks className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Punch List</h1>
                <p className="text-slate-400">Track close-out items from substantial completion to acceptance</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> From substantial completion to final acceptance — anything that needs to be fixed, completed or replaced before the owner signs off.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Project &rarr; Construction &rarr; <code className="text-red-300">Punch List</code> (path <code className="text-red-300">/punch-list</code>).</p>
                <p><strong className="text-slate-200">Key fields per item:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Number, title, description, location</strong></li>
                  <li><strong className="text-slate-200">Category</strong> — group items (e.g. drywall, MEP, finishes)</li>
                  <li><strong className="text-slate-200">Priority:</strong> Low / Medium / High (defaults to Medium)</li>
                  <li><strong className="text-slate-200">Status:</strong> Defaults to <em>Open</em>; status changes are kept in a history log</li>
                  <li><strong className="text-slate-200">Assigned to, due date, closed date</strong></li>
                  <li><strong className="text-slate-200">Photos</strong> — attach as many as you need; each photo carries a type so you can keep "issue" and "fixed" shots separate</li>
                </ul>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Filter the list by assignee and export — that's the simplest way to hand each subcontractor their own punch.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "quality-safety":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Quality &amp; Safety</h1>
                <p className="text-slate-400">Inspections, observations, and incidents with corrective actions</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> For inspections (planned checklists), observations (one-off field notes) and incidents (recordable events) — and the corrective actions that follow each.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Project &rarr; Construction &rarr; <code className="text-yellow-300">Quality &amp; Safety</code> (path <code className="text-yellow-300">/quality-safety</code>).</p>
                <p><strong className="text-slate-200">What's inside:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Inspection templates:</strong> Reusable checklists you fill out per inspection</li>
                  <li><strong className="text-slate-200">Inspections:</strong> Type, location, scheduled date, inspector, status (defaults to <em>Scheduled</em>), overall result, line-item results</li>
                  <li><strong className="text-slate-200">Incidents:</strong> Severity, status, narrative, with linked corrective actions</li>
                  <li><strong className="text-slate-200">Observations:</strong> Category (defaults to <em>Safety</em>), observation type (Negative / Positive), severity (defaults to Low), status (defaults to <em>Open</em>), with corrective actions</li>
                </ul>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Don't reserve this module for incidents — logging positive observations and near-misses is what surfaces leading indicators before something goes wrong.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "bidding":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Hammer className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Bidding</h1>
                <p className="text-slate-400">Run invitations to bid and award packages with confidence</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> When you're putting work out to bid — anything from a single trade package to a full prime contract solicitation.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Project &rarr; Construction &rarr; <code className="text-orange-300">Bidding</code> (path <code className="text-orange-300">/bidding</code>).</p>
                <p><strong className="text-slate-200">Bid package fields:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Number, title, description, trade category, scope</strong></li>
                  <li><strong className="text-slate-200">Estimated budget, due date, pre-bid date</strong></li>
                  <li><strong className="text-slate-200">Status:</strong> Defaults to <em>Draft</em>; awarded packages capture awarded vendor, amount and date</li>
                  <li><strong className="text-slate-200">Bid invitations:</strong> One per invited vendor — status defaults to <em>Invited</em>; can be marked declined with a reason</li>
                  <li><strong className="text-slate-200">Bids:</strong> Total amount, alternates, bond included flag, valid-until date, evaluation score, recommended flag</li>
                  <li><strong className="text-slate-200">Bid line items:</strong> Side-by-side comparison across bidders</li>
                </ul>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Use the evaluation score to record more than just price — schedule, references and exclusions matter, and the score makes the rationale defensible at award.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "vendors":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Truck className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Vendors</h1>
                <p className="text-slate-400">Maintain your subcontractor and supplier directory</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> Whenever you need a controlled list of subs and suppliers across projects — bidding, awards, insurance compliance and prequal all read from this directory.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Sidebar &rarr; <code className="text-blue-300">Vendors</code> (path <code className="text-blue-300">/vendors</code>).</p>
                <p><strong className="text-slate-200">Vendor record fields:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Company name, primary contact name, email, phone, website</strong></li>
                  <li><strong className="text-slate-200">Address, city, state, zip</strong></li>
                  <li><strong className="text-slate-200">Trade specialty</strong></li>
                  <li><strong className="text-slate-200">License number, insurance expiry, bonding capacity</strong></li>
                  <li><strong className="text-slate-200">Status</strong> — defaults to <em>Active</em></li>
                  <li><strong className="text-slate-200">Rating</strong> — your overall confidence score</li>
                </ul>
                <p><strong className="text-slate-200">Prequalification:</strong> Each vendor can carry a prequalification record with safety, financial, quality and experience ratings, EMR rate, OSHA 300 log, insurance certificate, bonding letter and an overall score. The qualification status defaults to <em>Pending</em>.</p>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Set <em>insurance expiry</em> on every vendor — it's the single field that prevents you from cutting a check to a vendor whose coverage just lapsed.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "change-orders":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <GitBranch className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Change Orders</h1>
                <p className="text-slate-400">Originate, price, and execute changes to scope, cost, and schedule</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> For every change to scope, cost or schedule — whether you're identifying a potential change, pricing a request to the owner, or issuing a change to a subcontractor.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Project &rarr; Construction &rarr; <code className="text-purple-300">Change Orders</code> (path <code className="text-purple-300">/change-orders</code>).</p>
                <p><strong className="text-slate-200">Key fields per change order:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Change order number, title, description</strong></li>
                  <li><strong className="text-slate-200">Tier:</strong> Defaults to <em>PCO</em> (potential); promote up to a Change Order Request, an Owner Change Order, or a Subcontract Change Order as it progresses</li>
                  <li><strong className="text-slate-200">Status:</strong> Defaults to <em>Draft</em></li>
                  <li><strong className="text-slate-200">Reason code, cost impact, schedule impact in days</strong></li>
                  <li><strong className="text-slate-200">Original / revised contract amounts</strong></li>
                  <li><strong className="text-slate-200">Requested / reviewed / approved by &amp; dates</strong></li>
                  <li><strong className="text-slate-200">Promoted from</strong> — link back to the lower-tier change it grew out of</li>
                  <li><strong className="text-slate-200">Line items</strong> for the cost build-up</li>
                </ul>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Open a PCO the moment you see a potential change — even before pricing — so the trail starts at the point of discovery, not the day pricing arrives.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "construction-invoices":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Receipt className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Construction Invoices</h1>
                <p className="text-slate-400">Schedule-of-values billing for subcontractor invoices and owner pay applications</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> For each billing period — typically monthly — to record what was billed, what was paid and what's left to bill against the contract.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Project &rarr; Construction &rarr; <code className="text-emerald-300">Construction Invoices</code> (path <code className="text-emerald-300">/construction-invoices</code>).</p>
                <p><strong className="text-slate-200">Key fields on an invoice:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Invoice number, title, description</strong></li>
                  <li><strong className="text-slate-200">Vendor name &amp; email</strong></li>
                  <li><strong className="text-slate-200">Contract amount</strong> (base) and <strong>total amount</strong> (with approved changes)</li>
                  <li><strong className="text-slate-200">Previous billed, current billed, balance to finish</strong></li>
                  <li><strong className="text-slate-200">Retainage</strong> held this period</li>
                  <li><strong className="text-slate-200">Status:</strong> Defaults to <em>Draft</em>; track Submitted, Approved, Paid dates</li>
                  <li><strong className="text-slate-200">Period from / period to</strong></li>
                  <li><strong className="text-slate-200">Paid amount</strong></li>
                </ul>
                <p><strong className="text-slate-200">Line items</strong> follow a schedule-of-values pattern: each line has a scheduled value and a percent complete that drives current billed.</p>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Reconcile the schedule of values against approved change orders before each billing — a missed change order on the SOV is the most common cause of an underbilled period.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "meetings":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Mic className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Meetings</h1>
                <p className="text-slate-400">Run OAC, coordination, and subcontractor meetings with traceable minutes</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> Owner-Architect-Contractor (OAC) meetings, subcontractor coordination, safety stand-downs, pre-installs — any meeting that needs an agenda, attendees, minutes and follow-up actions.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Project &rarr; Construction &rarr; <code className="text-orange-300">Meetings</code> (path <code className="text-orange-300">/meetings</code>).</p>
                <p><strong className="text-slate-200">Key fields on a meeting:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Meeting number, title, description</strong></li>
                  <li><strong className="text-slate-200">Meeting type</strong> — defaults to <em>General</em></li>
                  <li><strong className="text-slate-200">Status</strong> — defaults to <em>Scheduled</em></li>
                  <li><strong className="text-slate-200">Date, start time, end time, location</strong></li>
                  <li><strong className="text-slate-200">Attendees</strong></li>
                  <li><strong className="text-slate-200">Agenda items</strong> — title, description, presenter, duration</li>
                  <li><strong className="text-slate-200">Action items</strong> — title, description, assignee, due date, status (defaults to <em>Open</em>), priority</li>
                  <li><strong className="text-slate-200">Minutes / notes</strong></li>
                </ul>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Capture action items inside the meeting record as they're agreed — they carry an assignee and due date and become visible to owners outside the meeting.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "correspondence":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Mail className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Correspondence</h1>
                <p className="text-slate-400">Track formal letters, transmittals, and notices</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> For formal contractual communication — letters, transmittals, notices, directives, memos — that you need to find, cite and reference later.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Project &rarr; Construction &rarr; <code className="text-blue-300">Correspondence</code> (path <code className="text-blue-300">/correspondence</code>).</p>
                <p><strong className="text-slate-200">Key fields per item:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Correspondence number</strong> — auto-assigned per project</li>
                  <li><strong className="text-slate-200">Type</strong> — defaults to <em>Letter</em></li>
                  <li><strong className="text-slate-200">Subject &amp; body</strong></li>
                  <li><strong className="text-slate-200">From name / from email, to name / to email</strong></li>
                  <li><strong className="text-slate-200">Date</strong></li>
                  <li><strong className="text-slate-200">Status</strong> — defaults to <em>Draft</em></li>
                  <li><strong className="text-slate-200">Priority</strong> — defaults to <em>Normal</em></li>
                  <li><strong className="text-slate-200">Attachments</strong></li>
                </ul>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Move items off <em>Draft</em> as soon as they're issued — anything still showing Draft is effectively unsent in an audit.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "templates":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Copy className="h-6 w-6 text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Templates</h1>
                <p className="text-slate-400">Spin up new projects, portfolios, and intake forms from reusable starting points</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Standardize how new work is created across your organization:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Project Templates:</strong> Pre-configured phases, tasks, key dates, team roles</li>
                  <li><strong className="text-slate-200">Portfolio Templates:</strong> Strategy, scoring criteria, standard reports</li>
                  <li><strong className="text-slate-200">Intake Templates:</strong> Question set and approval workflow for project requests</li>
                  <li><strong className="text-slate-200">Scoring Templates:</strong> Reusable weighted criteria across portfolios</li>
                  <li><strong className="text-slate-200">Save from Existing:</strong> Save any project as a template to capture its structure</li>
                  <li><strong className="text-slate-200">Versioning:</strong> Evolve templates safely without breaking existing projects</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "training":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-pink-500/10 flex items-center justify-center">
                <GraduationCap className="h-6 w-6 text-pink-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Training (Friday Academy)</h1>
                <p className="text-slate-400">Self-paced learning paths for every role on the platform</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Friday Academy groups short video lessons, quick quizzes, and walkthroughs into role-based paths:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Team Member:</strong> Timesheets, tasks, issues, calendar, notifications</li>
                  <li><strong className="text-slate-200">Project Manager:</strong> Project setup, scheduling, risks, status reports</li>
                  <li><strong className="text-slate-200">Portfolio Manager:</strong> Portfolio strategy, scoring, prioritization, PMO Radar</li>
                  <li><strong className="text-slate-200">Org Admin:</strong> User management, custom fields/tabs, integrations, templates</li>
                  <li><strong className="text-slate-200">Construction Lead:</strong> Daily logs, RFIs, submittals, change orders, pay apps</li>
                  <li><strong className="text-slate-200">Analyst:</strong> Power BI, scheduled reports, Power BI Agent</li>
                  <li><strong className="text-slate-200">Lessons:</strong> 2-5 minute videos, in-product walkthroughs, quick quizzes, certificates</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      case "notifications":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Flag className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Notifications</h1>
                <p className="text-slate-400">Stay on top of changes that matter to you</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p><strong className="text-slate-200">When to use it:</strong> Tune what you get pinged about so the inbox stays useful.</p>
                <p><strong className="text-slate-200">How to access it:</strong> Profile menu &rarr; Notification Preferences (or Settings &rarr; Notifications).</p>
                <p><strong className="text-slate-200">What you can control:</strong></p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">In-app inbox:</strong> Assignments, status changes, mentions and approvals appear in the bell menu</li>
                  <li><strong className="text-slate-200">Email:</strong> Choose whether each event type also goes to email</li>
                  <li><strong className="text-slate-200">Per-event toggles:</strong> Turn individual event types on or off independently</li>
                  <li><strong className="text-slate-200">Mentions:</strong> Get notified when someone @mentions you in a comment or note</li>
                </ul>
                <p className="text-sm text-slate-500"><strong className="text-slate-300">Tip:</strong> Start with everything on for a week, then turn off the categories you find yourself ignoring — it's the fastest way to find your signal-to-noise sweet spot.</p>
              </CardContent>
            </Card>
          </div>
        );

      case "reports":
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Scheduled Reports</h1>
                <p className="text-slate-400">Automated status reports delivered on your schedule</p>
              </div>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 space-y-4 text-slate-300">
                <p>Build report templates once and let the system deliver them on a recurring cadence:</p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-slate-200">Templates:</strong> Project status, portfolio health, executive summary, financial roll-up</li>
                  <li><strong className="text-slate-200">Schedule:</strong> Daily, weekly, monthly, quarterly with custom send time</li>
                  <li><strong className="text-slate-200">Recipients:</strong> Internal users plus external email addresses</li>
                  <li><strong className="text-slate-200">Filters:</strong> Limit to selected portfolios, projects, owners, or status</li>
                  <li><strong className="text-slate-200">Format:</strong> PDF, Excel, or inline email body</li>
                  <li><strong className="text-slate-200">History:</strong> Browse and re-send any past report</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-lg bg-slate-500/10 flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-slate-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{sections.find(s => s.id === activeSection)?.name || activeSection}</h1>
                <p className="text-slate-400">Documentation for this feature</p>
              </div>
            </div>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6 text-slate-300">
                <p>Detailed documentation for this feature is available in the full application. Sign up to access complete documentation and start using FridayReport.AI.</p>
              </CardContent>
            </Card>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <Helmet>
        <title>User Guide - FridayReport.AI | Project Management Documentation</title>
        <meta name="description" content="Complete user guide for FridayReport.AI project portfolio management software. Learn about dashboards, portfolios, projects, resources, risks, timesheets, and integrations." />
        <meta property="og:title" content="User Guide - FridayReport.AI" />
        <meta property="og:description" content="Complete documentation for FridayReport.AI - your enterprise project portfolio management solution." />
        <link rel="canonical" href="https://fridayreport.ai/guide" />
      </Helmet>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 sm:gap-3" data-testid="link-home-logo">
                <img src={logoWhite} alt="FridayReport.AI" className="h-6 sm:h-7" data-testid="img-brand-logo" />
              </Link>
              <span className="hidden sm:inline-flex items-center text-slate-400">
                <ChevronRight className="h-4 w-4" />
                <span className="ml-2">User Guide</span>
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <button 
                className="lg:hidden text-slate-300 hover:text-white p-2"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                data-testid="button-mobile-menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <Link href="/" className="text-slate-300 hover:text-white text-xs sm:text-sm font-medium transition-colors hidden sm:block" data-testid="link-nav-home">
                Home
              </Link>
              <Link href="/auth" data-testid="link-get-started">
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-xs sm:text-sm" data-testid="button-get-started">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 pt-14 sm:pt-16">
        <aside className={cn(
          "fixed lg:sticky top-14 sm:top-16 left-0 z-40 h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] w-64 bg-slate-900/95 lg:bg-transparent border-r border-slate-800 transition-transform duration-200",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}>
          <ScrollArea className="h-full py-4 px-3">
            <nav className="space-y-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleSectionClick(section.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left",
                    activeSection === section.id
                      ? "bg-primary/10 text-primary"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  )}
                  data-testid={`guide-nav-${section.id}`}
                >
                  <section.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{section.name}</span>
                </button>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {renderSectionContent()}
            
            <div className="mt-12 pt-8 border-t border-slate-700">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <Link 
                  href="/"
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                  data-testid="link-back-home"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Home
                </Link>
                <Link href="/auth" data-testid="link-get-started-bottom">
                  <Button className="bg-primary hover:bg-primary/90" data-testid="button-get-started-bottom">
                    Get Started Free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>

      <LandingFooter />
    </div>
  );
}
