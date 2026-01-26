import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
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
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { LandingFooter } from "@/components/layout/LandingFooter";
import logoIcon from "@assets/icon_orange_bright@16x_1767637282986.png";

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
  { id: "issues", name: "Issues", icon: CircleDot },
  { id: "timesheets", name: "Timesheets", icon: Clock },
  { id: "resources", name: "Resources", icon: UserCog },
  { id: "calendar", name: "Calendar", icon: Calendar },
  { id: "integrations", name: "Integrations", icon: Plug },
  { id: "custom-links", name: "Custom Links", icon: Link2 },
  { id: "custom-fields", name: "Custom Fields", icon: Sliders },
  { id: "custom-tabs", name: "Custom Tabs", icon: LayoutTemplate },
  { id: "billing", name: "Billing & Credits", icon: CreditCard },
  { id: "organizations", name: "Organizations", icon: Building2 },
  { id: "users", name: "User Management", icon: Users },
  { id: "settings", name: "Settings", icon: Settings },
  { id: "themes", name: "Themes", icon: Moon },
];

export default function PublicUserGuide() {
  const [activeSection, setActiveSection] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && sections.find(s => s.id === hash)) {
      setActiveSection(hash);
    }
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
                  <li><strong className="text-slate-200">Milestones:</strong> Track key deliverables and project phases</li>
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
                    <li>Microsoft Planner</li>
                    <li>Planner Premium / Project for the Web</li>
                    <li>Project Online</li>
                    <li>Jira</li>
                    <li>Asana</li>
                    <li>Monday.com</li>
                    <li>Trello</li>
                    <li>Notion</li>
                    <li>ClickUp</li>
                    <li>Basecamp</li>
                  </ul>
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
                  <li><strong className="text-slate-200">Milestones:</strong> Key dates and deliverables</li>
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
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 sm:gap-3" data-testid="link-home-logo">
                <img src={logoIcon} alt="FridayReport.AI" className="h-7 w-7 sm:h-8 sm:w-8" />
                <span className="text-base sm:text-xl font-bold text-white" data-testid="text-brand-name">FridayReport.AI</span>
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
