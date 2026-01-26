import { Link } from "wouter";
import { 
  LayoutDashboard, 
  Briefcase, 
  FolderKanban, 
  CheckSquare, 
  CircleDot, 
  Calendar, 
  Users,
  Clock,
  Plug,
  BarChart3,
  FileText,
  Star,
  Gift,
  Scale,
  Lightbulb,
  CreditCard,
  Building2,
  Settings,
  BookOpen
} from "lucide-react";
import logoIcon from "@assets/icon_orange_bright@16x_1767637282986.png";

const footerSections = {
  features: {
    title: "Features",
    links: [
      { name: "Dashboard", href: "/guide#dashboard", icon: LayoutDashboard },
      { name: "Portfolios", href: "/guide#portfolios", icon: Briefcase },
      { name: "Projects", href: "/guide#projects", icon: FolderKanban },
      { name: "Tasks", href: "/guide#tasks", icon: CheckSquare },
      { name: "Issues & Risks", href: "/guide#issues", icon: CircleDot },
      { name: "Timesheets", href: "/guide#timesheets", icon: Clock },
      { name: "Calendar", href: "/guide#calendar", icon: Calendar },
      { name: "Resources", href: "/guide#resources", icon: Users },
    ]
  },
  capabilities: {
    title: "Capabilities",
    links: [
      { name: "Project Scoring", href: "/guide#scoring", icon: Star },
      { name: "Benefits Tracking", href: "/guide#benefits", icon: Gift },
      { name: "Decision Log", href: "/guide#decisions", icon: Scale },
      { name: "Lessons Learned", href: "/guide#lessons", icon: Lightbulb },
      { name: "Status Reporting", href: "/guide#overview", icon: FileText },
      { name: "Custom Fields", href: "/guide#custom-fields", icon: Settings },
    ]
  },
  integrations: {
    title: "Integrations",
    links: [
      { name: "Microsoft Project", href: "/guide#integrations", icon: FileText },
      { name: "Microsoft Planner", href: "/guide#integrations", icon: Calendar },
      { name: "Project Online", href: "/guide#integrations", icon: Plug },
      { name: "Power BI", href: "/guide#integrations", icon: BarChart3 },
      { name: "Entra ID / SSO", href: "/guide#integrations", icon: Users },
      { name: "All Integrations", href: "/guide#integrations", icon: Plug },
    ]
  },
  resources: {
    title: "Resources",
    links: [
      { name: "User Guide", href: "/guide", icon: BookOpen },
      { name: "Billing & Plans", href: "/guide#billing", icon: CreditCard },
      { name: "Organizations", href: "/guide#organizations", icon: Building2 },
      { name: "User Management", href: "/guide#users", icon: Users },
      { name: "Settings", href: "/guide#settings", icon: Settings },
    ]
  }
};

export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-4 lg:col-span-1 mb-4 lg:mb-0">
            <div className="flex items-center gap-2 mb-4">
              <img src={logoIcon} alt="FridayReport.AI" className="h-8 w-8" />
              <span className="text-xl font-bold text-white">FridayReport.AI</span>
            </div>
            <p className="text-sm text-slate-400 mb-4 max-w-xs">
              Enterprise PPM platform to manage portfolios, track progress, and deliver projects on time.
            </p>
            <div className="flex items-center gap-4">
              <Link 
                href="/guide" 
                className="text-sm text-primary hover:text-primary/80 transition-colors"
                data-testid="footer-link-user-guide"
              >
                User Guide
              </Link>
            </div>
          </div>

          {Object.entries(footerSections).map(([key, section]) => (
            <div key={key}>
              <h3 className="text-sm font-semibold text-white mb-4">{section.title}</h3>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <Link 
                      href={link.href}
                      className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                      data-testid={`footer-link-${link.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <link.icon className="h-3.5 w-3.5" />
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-800 mt-12 pt-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-400">
              Copyright {currentYear} Friday Report LLC. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link 
                href="/terms" 
                className="text-sm text-slate-400 hover:text-white transition-colors" 
                data-testid="footer-link-terms"
              >
                Terms of Service
              </Link>
              <Link 
                href="/privacy" 
                className="text-sm text-slate-400 hover:text-white transition-colors" 
                data-testid="footer-link-privacy"
              >
                Privacy Statement
              </Link>
              <Link 
                href="/guide" 
                className="text-sm text-slate-400 hover:text-white transition-colors" 
                data-testid="footer-link-guide-bottom"
              >
                User Guide
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
