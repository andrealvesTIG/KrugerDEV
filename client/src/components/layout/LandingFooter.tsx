import { Link, useLocation } from "wouter";
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
  BookOpen,
  Shield,
  TrendingUp,
  ExternalLink,
  Heart,
  Landmark,
  Factory,
  Cpu,
  HardHat,
  Zap,
  Building,
  GitCompare
} from "lucide-react";
import logoIcon from "@assets/FridayReportAI_logo_F-symbol_1770231051194.png";
import logoWhite from "@assets/FridayReportAI_logo_white_1770231063709.png";

function FooterLink({ href, name, icon: Icon, testId }: { href: string; name: string; icon: React.ElementType; testId: string }) {
  const [, setLocation] = useLocation();
  const isExternal = href.startsWith('http');
  
  const handleClick = (e: React.MouseEvent) => {
    if (isExternal) return;
    e.preventDefault();
    const [path, hash] = href.split('#');
    setLocation(path);
    if (hash) {
      setTimeout(() => {
        window.location.hash = hash;
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }, 100);
    }
  };
  
  return (
    <a 
      href={href}
      onClick={handleClick}
      className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
      data-testid={testId}
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <Icon className="h-3.5 w-3.5" />
      {name}
    </a>
  );
}

const methodologyLinks = [
  { 
    name: "PMI PMBOK Guide", 
    href: "https://www.pmi.org/pmbok-guide-standards", 
    icon: BookOpen,
    description: "Project management standards"
  },
  { 
    name: "PRINCE2", 
    href: "https://www.prince2.com/", 
    icon: Shield,
    description: "Structured project method"
  },
  { 
    name: "Gartner SPM", 
    href: "https://www.gartner.com/en/information-technology/role/strategic-portfolio-management", 
    icon: TrendingUp,
    description: "Portfolio management insights"
  },
  { 
    name: "PMI Risk Management", 
    href: "https://www.pmi.org/standards/risk-management", 
    icon: Shield,
    description: "Risk management standards"
  },
  { 
    name: "PMI Earned Value", 
    href: "https://www.pmi.org/standards/earned-value-management", 
    icon: BarChart3,
    description: "Cost & schedule performance"
  },
];

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
  industries: {
    title: "Industry Solutions",
    links: [
      { name: "Healthcare", href: "/healthcare", icon: Heart },
      { name: "Financial Services", href: "/financial-services", icon: Landmark },
      { name: "Manufacturing", href: "/manufacturing", icon: Factory },
      { name: "Industrial Automation", href: "/industrial-automation", icon: Cpu },
      { name: "Capital Projects", href: "/capital-projects", icon: HardHat },
      { name: "Energy & Utilities", href: "/energy", icon: Zap },
      { name: "Government", href: "/government", icon: Building },
    ]
  },
  compare: {
    title: "Compare",
    links: [
      { name: "vs Primavera P6", href: "/compare/primavera-p6", icon: GitCompare },
      { name: "vs Microsoft Project", href: "/compare/ms-project", icon: GitCompare },
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
      { name: "Investor Room", href: "https://investor.fridayreport.ai/", icon: BarChart3 },
      { name: "Media", href: "/media", icon: FileText },
    ]
  }
};

export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-8">
          <div className="col-span-2 md:col-span-3 lg:col-span-1 mb-4 lg:mb-0">
            <div className="flex items-center gap-2 mb-4">
              <img src={logoWhite} alt="FridayReport.AI" className="h-7" />
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
                    <FooterLink 
                      href={link.href}
                      name={link.name}
                      icon={link.icon}
                      testId={`footer-link-${link.name.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Methodologies Section */}
        <div className="border-t border-slate-800 mt-8 pt-8">
          <h3 className="text-sm font-semibold text-white mb-4">Based on Industry Methodologies</h3>
          <div className="flex flex-wrap gap-4">
            {methodologyLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors group"
                data-testid={`footer-link-methodology-${link.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <link.icon className="h-3.5 w-3.5" />
                <span>{link.name}</span>
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-800 mt-8 pt-8">
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
