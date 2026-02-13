import { useState, useCallback } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle,
  ArrowRight,
  Search,
  User,
  ListChecks,
  LayoutDashboard,
  FolderKanban,
  AlertTriangle,
  Users,
  FileText,
  Settings,
  Sparkles,
  Shield,
  Star,
} from "lucide-react";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";

interface LeadEntry {
  fullName: string;
  workEmail: string;
  company: string;
  teamSize: string;
  primaryNeed: string;
  submittedAt: string;
}

export default function LandingPage() {
  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [company, setCompany] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [primaryNeed, setPrimaryNeed] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [nameError, setNameError] = useState("");
  const [leadsModalOpen, setLeadsModalOpen] = useState(false);
  const [savedLeads, setSavedLeads] = useState<LeadEntry[]>([]);

  const validateEmail = useCallback((email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;
    if (!fullName.trim()) { setNameError("Required"); hasError = true; } else { setNameError(""); }
    if (!workEmail.trim() || !validateEmail(workEmail)) { setEmailError("Valid email required"); hasError = true; } else { setEmailError(""); }
    if (hasError) return;

    const entry: LeadEntry = {
      fullName: fullName.trim(), workEmail: workEmail.trim(), company: company.trim(),
      teamSize, primaryNeed, submittedAt: new Date().toISOString(),
    };
    const existing = JSON.parse(localStorage.getItem("fridayreport_leads") || "[]");
    existing.push(entry);
    localStorage.setItem("fridayreport_leads", JSON.stringify(existing));
    setSubmitted(true);
  };

  const openLeadsModal = () => {
    setSavedLeads(JSON.parse(localStorage.getItem("fridayreport_leads") || "[]"));
    setLeadsModalOpen(true);
  };

  if (submitted) {
    return (
      <>
        <Helmet><title>FridayReport.AI - Welcome Aboard</title></Helmet>
        <div className="h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="text-center max-w-lg">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
              <Sparkles className="h-8 w-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3" style={{ fontFamily: "var(--font-display)" }} data-testid="text-thank-you">
              You just took control.
            </h1>
            <p className="text-sm text-slate-400 mb-8 leading-relaxed max-w-sm mx-auto">
              We received your request. A real human from our team will reach out within 24 hours to get you started.
            </p>
            <div className="flex flex-col gap-4 items-center">
              <Link href="/signin">
                <Button className="bg-amber-500 hover:bg-amber-600 border-amber-500 text-slate-950 font-semibold px-8" data-testid="button-go-to-signin">
                  Go to Sign In<ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <button onClick={openLeadsModal} className="text-xs text-slate-500 underline hover:text-slate-300 transition-colors" data-testid="link-view-leads">View saved leads</button>
            </div>
          </div>
          <LeadsModal open={leadsModalOpen} onClose={() => setLeadsModalOpen(false)} leads={savedLeads} />
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>FridayReport.AI - Project Management Software for Small Teams</title>
        <meta name="description" content="When you can see everything, nothing gets missed. Real-time project dashboards, risk tracking, and AI reporting for teams that ship." />
        <meta property="og:title" content="FridayReport.AI - When You Can See Everything, Nothing Gets Missed" />
        <meta property="og:description" content="Project management software for small teams. Real-time dashboards, AI-powered reporting, and resource planning." />
        <link rel="canonical" href="https://fridayreport.ai/" />
      </Helmet>

      <div className="h-screen flex flex-col overflow-hidden bg-slate-950">
        {/* Nav - minimal, dramatic */}
        <nav className="flex items-center justify-between px-5 lg:px-8 h-12 border-b border-white/5 flex-shrink-0 bg-slate-950/80 backdrop-blur-sm relative z-10">
          <div className="flex items-center gap-2">
            <img src={logoBlack} alt="FridayReport.AI" className="h-5 brightness-0 invert" data-testid="img-logo" />
          </div>
          <div className="flex items-center gap-4">
            <Link href="/signin" className="text-xs text-slate-400 hover:text-white transition-colors font-medium" data-testid="link-nav-login">Log in</Link>
            <Link href="/signin">
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 border-amber-500 text-slate-950 text-xs font-semibold h-8" data-testid="button-nav-get-started">
                Start Free
              </Button>
            </Link>
          </div>
        </nav>

        {/* Main - split layout */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">

          {/* LEFT - The Story (dark, dramatic) */}
          <div className="lg:w-[42%] flex flex-col justify-center px-6 lg:px-10 xl:px-14 py-5 lg:py-0 relative">
            {/* Subtle ambient glow */}
            <div className="absolute top-1/4 left-1/3 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10">
              {/* Tagline */}
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px w-6 bg-amber-500" />
                <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-[0.2em]">Project Management Software for small teams</span>
              </div>

              {/* The Headline - inherent drama */}
              <h1
                className="text-3xl xl:text-4xl font-bold text-white leading-[1.15] tracking-tight mb-3"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-headline"
              >
                When you can see
                <br />
                <span className="text-amber-400">everything</span>,
                <br />
                nothing gets missed.
              </h1>

              {/* The sub-story - warm sell */}
              <p className="text-sm text-slate-400 mb-5 leading-relaxed max-w-md" data-testid="text-subheadline">
                Your team deserves better than scattered spreadsheets and guesswork.
                One dashboard. Every project. Complete clarity.
              </p>

              {/* Three truths - simple, iconic */}
              <div className="space-y-2.5 mb-5">
                {[
                  { icon: Sparkles, text: "AI surfaces risks before they become problems" },
                  { icon: Shield, text: "Enterprise-grade security your CTO will trust" },
                  { icon: Star, text: "Set up in 10 minutes, not 10 days" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-3 w-3 text-amber-400" />
                    </div>
                    <p className="text-xs text-slate-300">{item.text}</p>
                  </div>
                ))}
              </div>

              {/* Testimonial - the human touch */}
              <div className="border-l-2 border-amber-500/30 pl-3 mb-4">
                <p className="text-[11px] text-slate-400 italic leading-relaxed">
                  "We replaced three tools with FridayReport and our exec team finally stopped asking 'where are we on that project?'"
                </p>
                <p className="text-[10px] text-slate-300 mt-1 font-medium">
                  Sarah Chen, VP Delivery -- Meridian Consulting
                </p>
              </div>

              {/* Trust badges */}
              <div className="flex items-center gap-4 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><CheckCircle className="h-2.5 w-2.5 text-emerald-400" />SOC 2 Compliant</span>
                <span className="flex items-center gap-1"><CheckCircle className="h-2.5 w-2.5 text-emerald-400" />GDPR Ready</span>
                <span className="flex items-center gap-1"><CheckCircle className="h-2.5 w-2.5 text-emerald-400" />15+ Industries</span>
              </div>
            </div>
          </div>

          {/* RIGHT - The Product + Capture (light, warm) */}
          <div className="lg:w-[58%] bg-slate-900/50 flex flex-col gap-3 p-3 lg:p-4 min-h-0 overflow-hidden relative">
            {/* Warm gradient wash */}
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/3 via-transparent to-indigo-500/3 pointer-events-none" />

            {/* Product Window - The Star Character */}
            <div className="relative bg-white rounded-lg shadow-2xl shadow-amber-500/5 flex-shrink-0 ring-1 ring-white/10" data-testid="card-product-window">
              {/* Window chrome */}
              <div className="px-3 py-1.5 bg-slate-50 rounded-t-lg border-b border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-rose-400" /><div className="w-2 h-2 rounded-full bg-amber-400" /><div className="w-2 h-2 rounded-full bg-emerald-400" /></div>
                  <span className="text-[10px] font-semibold text-slate-500">FridayReport.AI</span>
                </div>
                <div className="bg-slate-100 rounded-md px-2 py-0.5 flex items-center gap-1 flex-1 max-w-[160px]">
                  <Search className="h-2 w-2 text-slate-300" />
                  <span className="text-[8px] text-slate-300">fridayreport.ai/dashboard</span>
                </div>
                <div className="w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center"><User className="h-2.5 w-2.5 text-indigo-600" /></div>
              </div>
              <div className="flex">
                {/* Sidebar */}
                <div className="w-9 bg-slate-900 flex flex-col items-center py-2 gap-2 flex-shrink-0 rounded-bl-lg">
                  <LayoutDashboard className="h-3 w-3 text-amber-400" />
                  <FolderKanban className="h-3 w-3 text-slate-600" />
                  <ListChecks className="h-3 w-3 text-slate-600" />
                  <AlertTriangle className="h-3 w-3 text-slate-600" />
                  <Users className="h-3 w-3 text-slate-600" />
                  <FileText className="h-3 w-3 text-slate-600" />
                  <Settings className="h-3 w-3 text-slate-600" />
                </div>
                {/* Dashboard content */}
                <div className="flex-1 min-w-0 p-2.5">
                  <p className="text-[10px] font-semibold text-slate-800 mb-1.5">Project Management Software for small teams</p>
                  {/* KPI row */}
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    <div className="bg-emerald-50 rounded p-1 text-center"><p className="text-[8px] text-slate-500">On Track</p><p className="text-[11px] font-bold text-emerald-600">12</p></div>
                    <div className="bg-amber-50 rounded p-1 text-center"><p className="text-[8px] text-slate-500">At Risk</p><p className="text-[11px] font-bold text-amber-600">3</p></div>
                    <div className="bg-red-50 rounded p-1 text-center"><p className="text-[8px] text-slate-500">Overdue</p><p className="text-[11px] font-bold text-red-600">1</p></div>
                    <div className="bg-indigo-50 rounded p-1 text-center"><p className="text-[8px] text-slate-500">Total</p><p className="text-[11px] font-bold text-indigo-600">16</p></div>
                  </div>
                  {/* Chart */}
                  <div className="flex items-end gap-[3px] h-7 mb-2">
                    {[35, 55, 45, 72, 60, 85, 50, 68, 78, 62].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i === 5 ? '#f59e0b' : i >= 7 ? '#818cf8' : '#c7d2fe' }} />
                    ))}
                  </div>
                  {/* Task rows */}
                  <div className="space-y-0.5">
                    {[
                      { name: "API Integration", status: "Complete", color: "bg-emerald-500" },
                      { name: "User Testing Sprint", status: "In Progress", color: "bg-amber-500" },
                      { name: "Launch Readiness", status: "Pending", color: "bg-slate-300" },
                    ].map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-[9px] py-0.5">
                        <span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${t.color}`} /><span className="text-slate-700">{t.name}</span></span>
                        <span className="text-slate-400">{t.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Signup Table - The Capture */}
            <div className="relative bg-white rounded-lg shadow-xl shadow-black/5 ring-1 ring-white/10 p-3 lg:p-4 flex-1 min-h-0 flex flex-col" data-testid="card-signup-table">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }} data-testid="text-signup-heading">
                    Get Early Access
                  </h2>
                  <p className="text-[10px] text-slate-400">Free forever for small teams. No credit card.</p>
                </div>
                <button onClick={openLeadsModal} className="text-[9px] text-slate-300 underline hover:text-slate-500 transition-colors" data-testid="link-view-saved-leads">View saved leads</button>
              </div>
              <form onSubmit={handleSubmit} noValidate className="flex-1 flex flex-col" data-testid="form-signup">
                <div className="border border-slate-200 rounded-md overflow-hidden flex-1">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-500 font-medium w-[110px] whitespace-nowrap text-[11px]">Full name <span className="text-amber-500">*</span></td>
                        <td className="py-1 px-2">
                          <Input value={fullName} onChange={(e) => { setFullName(e.target.value); setNameError(""); }} placeholder="Jane Smith" className={`h-7 text-xs border-0 shadow-none focus-visible:ring-0 p-0 ${nameError ? 'text-red-500 placeholder:text-red-300' : ''}`} data-testid="input-full-name" autoComplete="name" />
                          {nameError && <span className="text-[10px] text-red-500">{nameError}</span>}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-500 font-medium whitespace-nowrap text-[11px]">Work email <span className="text-amber-500">*</span></td>
                        <td className="py-1 px-2">
                          <Input type="email" value={workEmail} onChange={(e) => { setWorkEmail(e.target.value); setEmailError(""); }} placeholder="jane@company.com" className={`h-7 text-xs border-0 shadow-none focus-visible:ring-0 p-0 ${emailError ? 'text-red-500 placeholder:text-red-300' : ''}`} data-testid="input-work-email" autoComplete="email" />
                          {emailError && <span className="text-[10px] text-red-500">{emailError}</span>}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-500 font-medium whitespace-nowrap text-[11px]">Company</td>
                        <td className="py-1 px-2">
                          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 p-0" data-testid="input-company" autoComplete="organization" />
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-500 font-medium whitespace-nowrap text-[11px]">Team size</td>
                        <td className="py-1 px-2">
                          <Select value={teamSize} onValueChange={setTeamSize}>
                            <SelectTrigger className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 px-0" data-testid="select-team-size"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1-5">1 -- 5</SelectItem>
                              <SelectItem value="6-15">6 -- 15</SelectItem>
                              <SelectItem value="16-50">16 -- 50</SelectItem>
                              <SelectItem value="51-200">51 -- 200</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-500 font-medium whitespace-nowrap text-[11px]">Primary need</td>
                        <td className="py-1 px-2">
                          <Select value={primaryNeed} onValueChange={setPrimaryNeed}>
                            <SelectTrigger className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 px-0" data-testid="select-primary-need"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="delivery">Delivery tracking</SelectItem>
                              <SelectItem value="visibility">Portfolio visibility</SelectItem>
                              <SelectItem value="resource-planning">Resource planning</SelectItem>
                              <SelectItem value="executive-reporting">Executive reporting</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 border-amber-500 text-slate-950 font-bold mt-2.5 h-9 text-sm tracking-wide" data-testid="button-get-early-access">
                  Get Early Access<ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <p className="text-[9px] text-slate-400 text-center mt-1">No spam. Unsubscribe anytime.</p>
              </form>
            </div>
          </div>
        </div>
      </div>
      <LeadsModal open={leadsModalOpen} onClose={() => setLeadsModalOpen(false)} leads={savedLeads} />
    </>
  );
}

function LeadsModal({ open, onClose, leads }: { open: boolean; onClose: () => void; leads: LeadEntry[] }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Saved Leads ({leads.length})</DialogTitle>
          <DialogDescription>All early access signups stored locally.</DialogDescription>
        </DialogHeader>
        {leads.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No leads captured yet.</p>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="table-saved-leads">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-3 font-medium text-slate-600">Name</th>
                    <th className="pb-2 pr-3 font-medium text-slate-600">Email</th>
                    <th className="pb-2 pr-3 font-medium text-slate-600">Company</th>
                    <th className="pb-2 pr-3 font-medium text-slate-600">Size</th>
                    <th className="pb-2 pr-3 font-medium text-slate-600">Need</th>
                    <th className="pb-2 font-medium text-slate-600">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-slate-800">{lead.fullName}</td>
                      <td className="py-2 pr-3 text-slate-600">{lead.workEmail}</td>
                      <td className="py-2 pr-3 text-slate-600">{lead.company || "--"}</td>
                      <td className="py-2 pr-3 text-slate-600">{lead.teamSize || "--"}</td>
                      <td className="py-2 pr-3 text-slate-600">{lead.primaryNeed || "--"}</td>
                      <td className="py-2 text-slate-400">{new Date(lead.submittedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
