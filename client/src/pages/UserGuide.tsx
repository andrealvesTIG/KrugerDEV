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
  Sun
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

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

export default function UserGuide() {
  const [activeSection, setActiveSection] = useState("overview");

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            User Guide
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Complete documentation for PPM Suite - Project Portfolio Management
          </p>
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
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                  <p className="text-slate-600 dark:text-slate-400">
                    PPM Suite is an enterprise-grade Project Portfolio Management application designed to help teams 
                    track projects, portfolios, risks, milestones, and issues efficiently. The application follows 
                    modern design principles inspired by tools like Linear and Asana.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Target className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium text-slate-900 dark:text-white">Portfolio Management</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Organize projects into strategic portfolios</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <TrendingUp className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium text-slate-900 dark:text-white">Project Tracking</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Monitor progress, health, and budgets</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <AlertTriangle className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium text-slate-900 dark:text-white">Risk Management</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Identify and mitigate project risks</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Clock className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium text-slate-900 dark:text-white">Timeline View</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Visualize milestones on calendar</p>
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
                  <p className="text-slate-600 dark:text-slate-400">
                    The Dashboard provides a high-level overview of your organization's project portfolio. 
                    It displays key metrics, recent activity, and quick access to important information.
                  </p>
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Key Features:</h4>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-400">
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
                  <p className="text-slate-600 dark:text-slate-400">
                    Portfolios allow you to group related projects together for strategic management. 
                    Each portfolio can have its own strategy, manager, and set of projects.
                  </p>
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Managing Portfolios:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Plus className="h-5 w-5 text-green-500 mt-0.5" />
                      <div>
                        <h5 className="font-medium text-slate-900 dark:text-white">Create Portfolio</h5>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Click the "New Portfolio" button and fill in name, description, and strategy</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Eye className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div>
                        <h5 className="font-medium text-slate-900 dark:text-white">View Details</h5>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Click on a portfolio card to see all associated projects and details</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Edit className="h-5 w-5 text-yellow-500 mt-0.5" />
                      <div>
                        <h5 className="font-medium text-slate-900 dark:text-white">Edit Portfolio</h5>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Update portfolio information, strategy, or assigned manager</p>
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
                  <p className="text-slate-600 dark:text-slate-400">
                    Projects are the heart of PPM Suite. Track individual initiatives with detailed information 
                    including status, priority, health, budget, and completion percentage.
                  </p>
                  
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Project Attributes:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Status</Badge>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Initiation, Planning, Execution, Monitoring, Closing</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Priority</Badge>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Low, Medium, High, Critical</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Health</Badge>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Green (on track), Yellow (at risk), Red (critical)</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">Progress</Badge>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">0-100% completion with visual progress bar</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Project Details Page:</h4>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-400">
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
                  <p className="text-slate-600 dark:text-slate-400">
                    Tasks represent individual work items that need to be completed. They can be associated 
                    with specific projects and assigned to team members.
                  </p>
                  
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Task Management:</h4>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-400">
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
                  <p className="text-slate-600 dark:text-slate-400">
                    Issues help you track bugs, problems, and enhancement requests across your projects. 
                    Each issue is linked to a specific project for organized tracking.
                  </p>
                  
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Issue Types:</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Bug</Badge>
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Task</Badge>
                    <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Enhancement</Badge>
                  </div>

                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Issue Workflow:</h4>
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
                  <p className="text-slate-600 dark:text-slate-400">
                    The Calendar view provides a visual timeline of your projects, milestones, and key dates. 
                    Navigate through months to see upcoming deadlines and important events.
                  </p>
                  
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Calendar Features:</h4>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-400">
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
                  <p className="text-slate-600 dark:text-slate-400">
                    PPM Suite supports multiple organizations. Each organization has its own set of portfolios, 
                    projects, and team members. Switch between organizations using the sidebar selector.
                  </p>
                  
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Access Control:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Shield className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h5 className="font-medium text-slate-900 dark:text-white">Super Admin</h5>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Can access all organizations and manage system-wide settings</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Users className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h5 className="font-medium text-slate-900 dark:text-white">Organization Members</h5>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Can only access organizations they are members of</p>
                      </div>
                    </div>
                  </div>

                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Organization Switcher:</h4>
                  <p className="text-slate-600 dark:text-slate-400">
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
                  <p className="text-slate-600 dark:text-slate-400">
                    Manage your user profile and account settings through the user menu in the sidebar. 
                    Click on your avatar to access profile options.
                  </p>
                  
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">User Menu Options:</h4>
                  <ul className="space-y-2 text-slate-600 dark:text-slate-400">
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
                  <p className="text-slate-600 dark:text-slate-400">
                    Configure application settings, organization preferences, and user-specific options 
                    through the various settings pages.
                  </p>
                  
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Settings Areas:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Building2 className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h5 className="font-medium text-slate-900 dark:text-white">Organization Settings</h5>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Manage organization name, description, and member access</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Users className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h5 className="font-medium text-slate-900 dark:text-white">User Settings</h5>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Personal preferences, notifications, and account settings</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Shield className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h5 className="font-medium text-slate-900 dark:text-white">Super Admin Panel</h5>
                        <p className="text-sm text-slate-600 dark:text-slate-400">System-wide settings (Super Admins only)</p>
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
                  <p className="text-slate-600 dark:text-slate-400">
                    PPM Suite supports multiple themes to customize your visual experience. 
                    Toggle between light and dark modes using the theme switcher in the top bar.
                  </p>
                  
                  <h4 className="font-semibold text-slate-900 dark:text-white mt-4">Available Themes:</h4>
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
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">Need More Help?</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Contact your administrator or reach out to our support team for additional assistance.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
