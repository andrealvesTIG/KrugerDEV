import { useState, useCallback } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Zap,
  Eye,
  Clock,
  CheckCircle,
  ArrowRight,
  Building2,
  Search,
  User,
  ListChecks,
  LayoutDashboard,
  FolderKanban,
  AlertTriangle,
  Users,
  FileText,
  Settings
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
        <Helmet><title>FridayReport.AI - Thank You</title></Helmet>
        <div className="h-screen bg-white flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 mb-2" data-testid="text-thank-you">Thanks -- we'll email you shortly.</h1>
            <p className="text-sm text-slate-500 mb-6">We received your request. A team member will reach out within 24 hours.</p>
            <div className="flex flex-col gap-3 items-center">
              <Link href="/signin"><Button data-testid="button-go-to-signin">Go to Sign In<ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
              <button onClick={openLeadsModal} className="text-xs text-slate-400 underline hover:text-slate-600" data-testid="link-view-leads">View saved leads</button>
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
        <meta name="description" content="Ship projects on time with full visibility. Real-time dashboards, risk tracking, and AI-powered reporting for small teams." />
        <meta property="og:title" content="FridayReport.AI - Ship Projects On Time" />
        <meta property="og:description" content="Project management for small teams. Dashboards, resource planning, executive reporting." />
        <link rel="canonical" href="https://fridayreport.ai/" />
      </Helmet>
      <div className="h-screen bg-white flex flex-col overflow-hidden">
        {/* Nav */}
        <nav className="flex items-center justify-between px-5 lg:px-8 h-12 border-b border-slate-100 flex-shrink-0">
          <img src={logoBlack} alt="FridayReport.AI" className="h-5" data-testid="img-logo" />
          <div className="flex items-center gap-3">
            <Link href="/signin" className="text-xs text-slate-500 hover:text-slate-800 font-medium" data-testid="link-nav-login">Log in</Link>
            <Link href="/signin"><Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 border-indigo-600 text-white text-xs font-medium h-8" data-testid="button-nav-get-started">Get Started Free</Button></Link>
          </div>
        </nav>

        {/* Main - single screen */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* LEFT */}
          <div className="lg:w-[44%] flex flex-col justify-center px-5 lg:px-8 xl:px-12 py-4 lg:py-0">
            <h1 className="text-2xl xl:text-3xl font-bold text-slate-900 leading-tight tracking-tight mb-2" data-testid="text-headline">
              Ship projects on time with full visibility.
            </h1>
            <p className="text-sm text-slate-500 mb-4 leading-relaxed" data-testid="text-subheadline">
              Real-time dashboards, resource planning, and executive reporting for small teams -- without the overhead.
            </p>

            {/* Benefits */}
            <div className="space-y-2 mb-4">
              {[
                { icon: Zap, title: "Faster decisions", desc: "AI surfaces risks before they derail timelines." },
                { icon: Eye, title: "Instant visibility", desc: "Live dashboards replace manual status meetings." },
                { icon: Clock, title: "Less admin overhead", desc: "Auto-generated reports save hours every week." },
              ].map((b, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-md bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <b.icon className="h-3.5 w-3.5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{b.title}</p>
                    <p className="text-[11px] text-slate-500 leading-snug">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Trust */}
            <div className="border-t border-slate-100 pt-3 mb-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Built by Trusted IT Group</span>
              </div>
              <div className="flex flex-col gap-0.5 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><CheckCircle className="h-2.5 w-2.5 text-emerald-500" />Enterprise-grade security, SOC 2 compliant</span>
                <span className="flex items-center gap-1"><CheckCircle className="h-2.5 w-2.5 text-emerald-500" />Serving teams across 15+ industries since 2020</span>
              </div>
            </div>

            {/* Testimonial */}
            <div className="bg-slate-50 rounded-md p-2.5 mb-3">
              <p className="text-[11px] text-slate-600 italic leading-relaxed">"We went from spreadsheet chaos to real-time dashboards in under a day. Our exec team finally has the visibility they needed."</p>
              <p className="text-[10px] font-medium text-slate-700 mt-1">Sarah Chen, VP of Delivery -- Meridian Consulting</p>
            </div>

            {/* Micro FAQ */}
            <div className="space-y-1 hidden lg:block">
              {[
                { q: "Is my data private?", a: "Encrypted at rest and in transit. Full GDPR and SOC 2 compliance." },
                { q: "How fast can I get started?", a: "Most teams are running in under 10 minutes." },
              ].map((faq, i) => (
                <details key={i} className="group">
                  <summary className="text-[11px] font-medium text-slate-600 cursor-pointer hover:text-indigo-600 list-none flex items-center gap-1">
                    <ArrowRight className="h-2.5 w-2.5 group-open:rotate-90 transition-transform" />{faq.q}
                  </summary>
                  <p className="text-[10px] text-slate-500 mt-0.5 ml-3.5">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>

          {/* RIGHT */}
          <div className="lg:w-[56%] bg-slate-50 flex flex-col gap-3 p-3 lg:p-4 min-h-0 overflow-hidden">
            {/* Product Window */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex-shrink-0" data-testid="card-product-window">
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-red-400" /><div className="w-2 h-2 rounded-full bg-amber-400" /><div className="w-2 h-2 rounded-full bg-emerald-400" /></div>
                  <span className="text-[10px] font-medium text-slate-600 ml-1.5">FridayReport.AI</span>
                </div>
                <span className="text-[9px] text-slate-400">fridayreport.ai</span>
              </div>
              <div className="flex">
                {/* Mini sidebar */}
                <div className="w-8 bg-slate-800 flex flex-col items-center py-2 gap-2 flex-shrink-0">
                  <LayoutDashboard className="h-3 w-3 text-indigo-400" />
                  <FolderKanban className="h-3 w-3 text-slate-500" />
                  <ListChecks className="h-3 w-3 text-slate-500" />
                  <AlertTriangle className="h-3 w-3 text-slate-500" />
                  <Users className="h-3 w-3 text-slate-500" />
                  <FileText className="h-3 w-3 text-slate-500" />
                  <Settings className="h-3 w-3 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 flex-1 max-w-[140px]">
                      <Search className="h-2.5 w-2.5 text-slate-300" /><div className="h-4 bg-slate-100 rounded flex-1" />
                    </div>
                    <div className="w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center"><User className="h-2.5 w-2.5 text-indigo-600" /></div>
                  </div>
                  <div className="p-2.5">
                    <p className="text-[10px] font-semibold text-slate-800 mb-1.5">Project Management Software for small teams</p>
                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      <div className="bg-emerald-50 rounded p-1.5 text-center"><p className="text-[9px] text-slate-500">On Track</p><p className="text-xs font-bold text-emerald-600">12</p></div>
                      <div className="bg-amber-50 rounded p-1.5 text-center"><p className="text-[9px] text-slate-500">At Risk</p><p className="text-xs font-bold text-amber-600">3</p></div>
                      <div className="bg-red-50 rounded p-1.5 text-center"><p className="text-[9px] text-slate-500">Overdue</p><p className="text-xs font-bold text-red-600">1</p></div>
                    </div>
                    <div className="flex items-end gap-0.5 h-8 mb-2">
                      {[40, 65, 50, 80, 70, 90, 55, 75].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm bg-indigo-200" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                    <div className="space-y-1">
                      {[
                        { name: "API integration", status: "Done", color: "bg-emerald-500" },
                        { name: "User testing", status: "In Progress", color: "bg-indigo-500" },
                        { name: "Launch prep", status: "Pending", color: "bg-slate-300" },
                      ].map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-[9px]">
                          <span className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full ${t.color}`} /><span className="text-slate-700">{t.name}</span></span>
                          <span className="text-slate-400">{t.status}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-100 space-y-0.5">
                      <p className="text-[9px] text-slate-500 flex items-center gap-1"><CheckCircle className="h-2 w-2 text-indigo-500" />Real-time dashboards for every stakeholder</p>
                      <p className="text-[9px] text-slate-500 flex items-center gap-1"><CheckCircle className="h-2 w-2 text-indigo-500" />AI-generated status reports in seconds</p>
                      <p className="text-[9px] text-slate-500 flex items-center gap-1"><CheckCircle className="h-2 w-2 text-indigo-500" />Resource allocation with capacity planning</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Signup Table Card */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 lg:p-4 flex-1 min-h-0 flex flex-col" data-testid="card-signup-table">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900" data-testid="text-signup-heading">Get Early Access</h2>
                  <p className="text-[10px] text-slate-400">Free forever. No credit card required.</p>
                </div>
                <button onClick={openLeadsModal} className="text-[9px] text-slate-300 underline hover:text-slate-500" data-testid="link-view-saved-leads">View saved leads</button>
              </div>
              <form onSubmit={handleSubmit} noValidate className="flex-1 flex flex-col" data-testid="form-signup">
                <div className="border border-slate-200 rounded-md overflow-hidden flex-1">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-600 font-medium w-[120px] whitespace-nowrap">Full name <span className="text-red-400">*</span></td>
                        <td className="py-1 px-2">
                          <Input value={fullName} onChange={(e) => { setFullName(e.target.value); setNameError(""); }} placeholder="Jane Smith" className={`h-7 text-xs border-0 shadow-none focus-visible:ring-0 p-0 ${nameError ? 'text-red-500 placeholder:text-red-300' : ''}`} data-testid="input-full-name" autoComplete="name" />
                          {nameError && <span className="text-[10px] text-red-500">{nameError}</span>}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-600 font-medium whitespace-nowrap">Work email <span className="text-red-400">*</span></td>
                        <td className="py-1 px-2">
                          <Input type="email" value={workEmail} onChange={(e) => { setWorkEmail(e.target.value); setEmailError(""); }} placeholder="jane@company.com" className={`h-7 text-xs border-0 shadow-none focus-visible:ring-0 p-0 ${emailError ? 'text-red-500 placeholder:text-red-300' : ''}`} data-testid="input-work-email" autoComplete="email" />
                          {emailError && <span className="text-[10px] text-red-500">{emailError}</span>}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-600 font-medium whitespace-nowrap">Company</td>
                        <td className="py-1 px-2">
                          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 p-0" data-testid="input-company" autoComplete="organization" />
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-600 font-medium whitespace-nowrap">Team size</td>
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
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-600 font-medium whitespace-nowrap">Primary need</td>
                        <td className="py-1 px-2">
                          <Select value={primaryNeed} onValueChange={setPrimaryNeed}>
                            <SelectTrigger className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 px-0" data-testid="select-primary-need"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="delivery">Delivery</SelectItem>
                              <SelectItem value="visibility">Visibility</SelectItem>
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
                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 border-indigo-600 text-white font-semibold mt-2.5 h-9 text-sm" data-testid="button-get-early-access">
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
