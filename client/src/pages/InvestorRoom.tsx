import { useState, useEffect, useRef, useCallback } from "react";
import { motion, useInView } from "framer-motion";
import { Lock, Download, Mail, ChevronRight, Shield, BarChart3, Users, Zap, Target, Globe, TrendingUp, Calendar, CheckCircle2, ArrowRight, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import RadarCanvas, { type RiskSignal } from "@/components/radar/RadarCanvas";
import { useTheme } from "@/components/theme-provider";

const DEMO_SIGNALS: RiskSignal[] = [
  { id: "1", title: "Schedule Delay", project: "ERP Migration", projectId: 1, riskScore: 85, timeOffsetDays: -30, impactScore: 9, probability: 0.8, costExposureNorm: 0.7, costExposureRaw: 150000, confidence: 0.9, type: "schedule", costExposure: 150000, dueDate: "2026-06-01", status: "Open", itemType: "risk" },
  { id: "2", title: "Budget Overrun", project: "Cloud Platform", projectId: 2, riskScore: 72, timeOffsetDays: -15, impactScore: 8, probability: 0.7, costExposureNorm: 0.6, costExposureRaw: 80000, confidence: 0.85, type: "budget", costExposure: 80000, dueDate: "2026-05-15", status: "Open", itemType: "risk" },
  { id: "3", title: "Resource Gap", project: "Mobile App", projectId: 3, riskScore: 65, timeOffsetDays: 10, impactScore: 7, probability: 0.6, costExposureNorm: 0.5, costExposureRaw: 60000, confidence: 0.8, type: "resource", costExposure: 60000, dueDate: "2026-07-01", status: "Open", itemType: "risk" },
  { id: "4", title: "Vendor Dependency", project: "Data Lake", projectId: 4, riskScore: 58, timeOffsetDays: 20, impactScore: 6, probability: 0.55, costExposureNorm: 0.4, costExposureRaw: 45000, confidence: 0.75, type: "dependency", costExposure: 45000, dueDate: "2026-08-01", status: "Open", itemType: "issue" },
  { id: "5", title: "Tech Debt", project: "Legacy System", projectId: 5, riskScore: 50, timeOffsetDays: 45, impactScore: 5, probability: 0.5, costExposureNorm: 0.35, costExposureRaw: 35000, confidence: 0.7, type: "technical", costExposure: 35000, dueDate: null, status: "Open", itemType: "risk" },
  { id: "6", title: "Scope Creep", project: "CRM Integration", projectId: 6, riskScore: 78, timeOffsetDays: -5, impactScore: 8, probability: 0.75, costExposureNorm: 0.65, costExposureRaw: 120000, confidence: 0.88, type: "scope", costExposure: 120000, dueDate: "2026-04-30", status: "Open", itemType: "risk" },
  { id: "7", title: "Security Audit", project: "Cloud Platform", projectId: 2, riskScore: 45, timeOffsetDays: 30, impactScore: 5, probability: 0.45, costExposureNorm: 0.3, costExposureRaw: 25000, confidence: 0.65, type: "technical", costExposure: 25000, dueDate: "2026-09-01", status: "Open", itemType: "issue" },
  { id: "8", title: "Integration Risk", project: "ERP Migration", projectId: 1, riskScore: 68, timeOffsetDays: -10, impactScore: 7, probability: 0.65, costExposureNorm: 0.55, costExposureRaw: 90000, confidence: 0.82, type: "dependency", costExposure: 90000, dueDate: "2026-05-20", status: "Open", itemType: "risk" },
  { id: "9", title: "Data Migration", project: "Data Lake", projectId: 4, riskScore: 55, timeOffsetDays: 15, impactScore: 6, probability: 0.5, costExposureNorm: 0.42, costExposureRaw: 40000, confidence: 0.72, type: "technical", costExposure: 40000, dueDate: "2026-07-15", status: "Open", itemType: "risk" },
  { id: "10", title: "Training Delay", project: "Mobile App", projectId: 3, riskScore: 40, timeOffsetDays: 50, impactScore: 4, probability: 0.4, costExposureNorm: 0.25, costExposureRaw: 20000, confidence: 0.6, type: "resource", costExposure: 20000, dueDate: null, status: "Open", itemType: "issue" },
  { id: "11", title: "API Breaking Change", project: "CRM Integration", projectId: 6, riskScore: 62, timeOffsetDays: 5, impactScore: 7, probability: 0.58, costExposureNorm: 0.48, costExposureRaw: 55000, confidence: 0.78, type: "technical", costExposure: 55000, dueDate: "2026-06-15", status: "Open", itemType: "risk" },
  { id: "12", title: "Compliance Gap", project: "Legacy System", projectId: 5, riskScore: 70, timeOffsetDays: -20, impactScore: 8, probability: 0.68, costExposureNorm: 0.58, costExposureRaw: 100000, confidence: 0.85, type: "scope", costExposure: 100000, dueDate: "2026-05-01", status: "Open", itemType: "risk" },
];

function AnimatedSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function PasswordGate({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/investor/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onSuccess();
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Investor Room</h1>
          <p className="text-slate-400 mt-2">Enter the access password to view the pitch deck</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-slate-800 border-slate-700 text-white"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
            Access Deck
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

export default function InvestorRoom() {
  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const { toast } = useToast();
  const { theme } = useTheme();
  const contentRef = useRef<HTMLDivElement>(null);

  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    fetch("/api/investor/check-access", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.hasAccess) setHasAccess(true);
      })
      .finally(() => setCheckingAccess(false));
  }, []);

  const generatePdfBlob = useCallback(async (): Promise<Blob> => {
    const { default: jsPDF } = await import("jspdf");
    const { toCanvas } = await import("html-to-image");

    const sections = contentRef.current?.querySelectorAll("[data-slide]");
    if (!sections || sections.length === 0) throw new Error("No slides found");

    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1280, 720] });

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i] as HTMLElement;
      if (i > 0) pdf.addPage();

      const canvas = await toCanvas(section, {
        width: 1280,
        height: 720,
        backgroundColor: "#0f172a",
        pixelRatio: 2,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", 0, 0, 1280, 720);
    }

    return pdf.output("blob");
  }, []);

  const handleDownloadPdf = async () => {
    setGeneratingPdf(true);
    try {
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "FridayReport-AI-Investor-Deck.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF Downloaded", description: "Investor deck saved successfully" });
    } catch (err: any) {
      toast({ title: "PDF Error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleEmailPdf = async () => {
    if (!recipientEmail) return;
    setSendingEmail(true);
    try {
      const blob = await generatePdfBlob();
      const buffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const res = await fetch("/api/investor/email-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          recipientEmail,
          recipientName,
          pdfBase64: base64,
        }),
      });

      if (res.ok) {
        toast({ title: "Email Sent", description: `Investor deck sent to ${recipientEmail}` });
        setEmailDialogOpen(false);
        setRecipientEmail("");
        setRecipientName("");
      } else {
        throw new Error("Failed to send email");
      }
    } catch (err: any) {
      toast({ title: "Email Error", description: err.message, variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  if (checkingAccess) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!hasAccess) {
    return <PasswordGate onSuccess={() => setHasAccess(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700 backdrop-blur"
          onClick={handleDownloadPdf}
          disabled={generatingPdf}
        >
          {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Download PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-slate-800/80 border-slate-700 text-white hover:bg-slate-700 backdrop-blur"
          onClick={() => setEmailDialogOpen(true)}
        >
          <Mail className="h-4 w-4 mr-2" />
          Email Deck
        </Button>
      </div>

      <div ref={contentRef}>
        <section data-slide className="min-h-screen flex items-center justify-center px-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-red-500/10" />
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className="text-center max-w-4xl relative z-10"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-medium mb-8">
              <Zap className="h-4 w-4" /> Investor Pitch Deck
            </div>
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-orange-400 via-red-400 to-pink-400 bg-clip-text text-transparent">
                FridayReport.AI
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 mb-4">
              AI-Powered Project Portfolio Management
            </p>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Transforming how enterprises manage project portfolios with intelligent risk detection, resource optimization, and real-time insights.
            </p>
          </motion.div>
        </section>

        <AnimatedSection>
          <section data-slide className="min-h-screen flex items-center px-8 py-20">
            <div className="max-w-6xl mx-auto w-full">
              <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
                The <span className="text-orange-400">Problem</span>
              </h2>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { icon: BarChart3, title: "Lack of Visibility", desc: "67% of PMOs lack real-time visibility across their project portfolios, leading to delayed decisions." },
                  { icon: Target, title: "Risk Blind Spots", desc: "Organizations lose an average of $97M annually from poor project performance and undetected risks." },
                  { icon: Users, title: "Resource Misallocation", desc: "Teams spend 30% of their time on status reporting instead of high-value project work." },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.15 }}
                    viewport={{ once: true }}
                    className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8"
                  >
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mb-4">
                      <item.icon className="h-6 w-6 text-red-400" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                    <p className="text-slate-400 leading-relaxed">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        </AnimatedSection>

        <AnimatedSection>
          <section data-slide className="min-h-screen flex items-center px-8 py-20">
            <div className="max-w-6xl mx-auto w-full">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">
                Our <span className="text-orange-400">Solution</span>
              </h2>
              <p className="text-lg text-slate-400 text-center mb-12 max-w-3xl mx-auto">
                FridayReport.AI is an enterprise PMO platform that uses AI to detect risks early, optimize resources, and deliver actionable insights.
              </p>
              <div className="flex justify-center">
                <div className="w-full max-w-2xl aspect-square">
                  <RadarCanvas
                    signals={DEMO_SIGNALS}
                    onSignalClick={() => {}}
                    isDark={true}
                    centerLabel="PMO Radar"
                  />
                </div>
              </div>
            </div>
          </section>
        </AnimatedSection>

        <AnimatedSection>
          <section data-slide className="min-h-screen flex items-center px-8 py-20">
            <div className="max-w-6xl mx-auto w-full">
              <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
                Platform <span className="text-orange-400">Capabilities</span>
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { icon: Target, title: "PMO Radar", desc: "Real-time risk and issue visualization across your entire portfolio" },
                  { icon: BarChart3, title: "Executive Dashboards", desc: "Customizable dashboards with AI-generated insights and KPIs" },
                  { icon: Users, title: "Resource Management", desc: "Capacity planning, workload balancing, and skill tracking" },
                  { icon: Shield, title: "Risk & Issue Tracking", desc: "Comprehensive risk registers with AI-powered mitigation suggestions" },
                  { icon: Calendar, title: "Gantt & Scheduling", desc: "Advanced scheduling with CPM, dependencies, and auto-leveling" },
                  { icon: Zap, title: "Friday Copilot", desc: "AI assistant for natural-language queries across your project data" },
                  { icon: Globe, title: "Multi-Org Support", desc: "Enterprise multi-tenancy with role-based access control" },
                  { icon: TrendingUp, title: "Financial Tracking", desc: "Budget monitoring, cost exposure analysis, and invoice management" },
                  { icon: CheckCircle2, title: "Timesheet Management", desc: "Complete time tracking with approval workflows and compliance" },
                ].map((feat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    viewport={{ once: true }}
                    className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 hover:border-orange-500/30 transition-colors"
                  >
                    <feat.icon className="h-5 w-5 text-orange-400 mb-3" />
                    <h3 className="font-semibold mb-2">{feat.title}</h3>
                    <p className="text-sm text-slate-400">{feat.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        </AnimatedSection>

        <AnimatedSection>
          <section data-slide className="min-h-screen flex items-center px-8 py-20">
            <div className="max-w-5xl mx-auto w-full">
              <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
                <span className="text-orange-400">Pricing</span> Plans
              </h2>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  {
                    name: "Free",
                    price: "$0",
                    period: "forever",
                    features: ["1 Project", "5 Tasks per project", "Basic dashboards", "Community support"],
                    highlight: false,
                  },
                  {
                    name: "Pro",
                    price: "$29",
                    period: "/user/month",
                    features: ["Unlimited Projects", "Unlimited Tasks", "PMO Radar", "Friday Copilot AI", "Advanced reporting", "Priority support"],
                    highlight: true,
                  },
                  {
                    name: "Enterprise",
                    price: "Custom",
                    period: "contact us",
                    features: ["Everything in Pro", "Multi-org management", "SSO / SAML", "Dedicated success manager", "Custom integrations", "SLA guarantee"],
                    highlight: false,
                  },
                ].map((plan, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.15 }}
                    viewport={{ once: true }}
                    className={`rounded-2xl p-8 ${
                      plan.highlight
                        ? "bg-gradient-to-b from-orange-500/20 to-red-500/10 border-2 border-orange-500/40"
                        : "bg-slate-900/50 border border-slate-800"
                    }`}
                  >
                    {plan.highlight && (
                      <span className="text-xs font-medium text-orange-400 bg-orange-500/10 px-3 py-1 rounded-full">Most Popular</span>
                    )}
                    <h3 className="text-2xl font-bold mt-4">{plan.name}</h3>
                    <div className="mt-4 mb-6">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-slate-400 ml-2">{plan.period}</span>
                    </div>
                    <ul className="space-y-3">
                      {plan.features.map((f, j) => (
                        <li key={j} className="flex items-center gap-2 text-sm text-slate-300">
                          <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        </AnimatedSection>

        <AnimatedSection>
          <section data-slide className="min-h-screen flex items-center px-8 py-20">
            <div className="max-w-5xl mx-auto w-full">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">
                Competitive <span className="text-orange-400">Positioning</span>
              </h2>
              <p className="text-slate-400 text-center mb-12">How we compare to the market</p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left py-4 px-4 text-slate-400 font-medium">Feature</th>
                      <th className="py-4 px-4 text-orange-400 font-bold">FridayReport.AI</th>
                      <th className="py-4 px-4 text-slate-400 font-medium">MS Project</th>
                      <th className="py-4 px-4 text-slate-400 font-medium">Asana</th>
                      <th className="py-4 px-4 text-slate-400 font-medium">Monday.com</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["AI Risk Detection", true, false, false, false],
                      ["PMO Radar View", true, false, false, false],
                      ["AI Copilot", true, false, false, false],
                      ["Portfolio Management", true, true, false, true],
                      ["Gantt with CPM", true, true, false, false],
                      ["Resource Management", true, true, false, true],
                      ["Free Tier", true, false, true, false],
                      ["Multi-Org Support", true, false, false, true],
                    ].map(([feature, ...vals], i) => (
                      <tr key={i} className="border-b border-slate-800/50">
                        <td className="py-3 px-4 text-sm text-slate-300">{feature as string}</td>
                        {(vals as boolean[]).map((v, j) => (
                          <td key={j} className="py-3 px-4 text-center">
                            {v ? (
                              <CheckCircle2 className={`h-5 w-5 mx-auto ${j === 0 ? "text-green-400" : "text-slate-500"}`} />
                            ) : (
                              <X className="h-5 w-5 mx-auto text-slate-700" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </AnimatedSection>

        <AnimatedSection>
          <section data-slide className="min-h-screen flex items-center px-8 py-20">
            <div className="max-w-5xl mx-auto w-full">
              <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
                Product <span className="text-orange-400">Roadmap</span>
              </h2>
              <div className="space-y-8">
                {[
                  { quarter: "Q1 2026", status: "Completed", items: ["Core PMO Platform", "Portfolio & Project Management", "Risk & Issue Tracking", "Executive Dashboards"] },
                  { quarter: "Q2 2026", status: "In Progress", items: ["Friday Copilot AI", "PMO Radar Visualization", "Advanced Resource Management", "Training & Certification"] },
                  { quarter: "Q3 2026", status: "Planned", items: ["Enterprise SSO/SAML", "Advanced Integrations (Jira, Azure DevOps)", "Mobile App", "Custom Workflow Engine"] },
                  { quarter: "Q4 2026", status: "Planned", items: ["Predictive Analytics", "AI Auto-Scheduling", "Marketplace & Plugins", "SOC 2 Certification"] },
                ].map((milestone, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.15 }}
                    viewport={{ once: true }}
                    className="flex gap-6"
                  >
                    <div className="flex flex-col items-center">
                      <div className={`w-4 h-4 rounded-full ${milestone.status === "Completed" ? "bg-green-400" : milestone.status === "In Progress" ? "bg-orange-400" : "bg-slate-600"}`} />
                      {i < 3 && <div className="w-0.5 flex-1 bg-slate-800 mt-2" />}
                    </div>
                    <div className="flex-1 pb-8">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-semibold">{milestone.quarter}</h3>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          milestone.status === "Completed" ? "bg-green-500/10 text-green-400" :
                          milestone.status === "In Progress" ? "bg-orange-500/10 text-orange-400" :
                          "bg-slate-800 text-slate-400"
                        }`}>
                          {milestone.status}
                        </span>
                      </div>
                      <ul className="grid md:grid-cols-2 gap-2">
                        {milestone.items.map((item, j) => (
                          <li key={j} className="flex items-center gap-2 text-sm text-slate-400">
                            <ChevronRight className="h-3 w-3 text-orange-400" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        </AnimatedSection>

        <AnimatedSection>
          <section data-slide className="min-h-screen flex items-center justify-center px-8 py-20">
            <div className="text-center max-w-3xl">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Ready to <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">Transform</span> Your PMO?
              </h2>
              <p className="text-lg text-slate-400 mb-8">
                Join forward-thinking enterprises using AI to deliver projects on time, on budget, with full visibility.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-lg"
                  onClick={() => window.location.href = "/"}
                >
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-slate-700 text-white hover:bg-slate-800 text-lg"
                  onClick={() => window.location.href = "mailto:invest@fridayreport.ai"}
                >
                  Contact Us
                </Button>
              </div>
            </div>
          </section>
        </AnimatedSection>
      </div>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Email Investor Deck</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Recipient Name</label>
              <Input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="John Smith"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400 mb-1 block">Recipient Email *</label>
              <Input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="investor@example.com"
                className="bg-slate-800 border-slate-700 text-white"
                required
              />
            </div>
            <Button
              className="w-full bg-gradient-to-r from-orange-500 to-red-600"
              onClick={handleEmailPdf}
              disabled={sendingEmail || !recipientEmail}
            >
              {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              {sendingEmail ? "Generating & Sending..." : "Send Deck"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
