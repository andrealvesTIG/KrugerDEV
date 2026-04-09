import { useState, useRef, useEffect, useCallback, type MouseEvent } from "react";
import { useLocation } from "wouter";
import {
  Lock, LogOut, ChevronRight, Target, Lightbulb, BarChart3,
  TrendingUp, Users, Shield, Rocket, DollarSign, Globe,
  CheckCircle, ArrowRight, Briefcase, Zap, Brain,
  LineChart, PieChart, Layers, Clock, Award, Building2,
  ChevronDown, Printer, Download, Menu, X, Eye, Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { motion, useInView } from "framer-motion";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";
import RadarCanvas, { type RiskSignal } from "@/components/radar/RadarCanvas";

function ScreenshotPortfolio() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect width="320" height="180" fill="#f8fafc" />
      <rect width="50" height="180" fill="#1e293b" />
      {[20,40,60,80,100,120].map((y,i)=>(<rect key={i} x="8" y={y} width="34" height="6" rx="2" fill={i===0?"#3b82f6":"#334155"} />))}
      <rect x="60" y="8" width="252" height="20" rx="4" fill="#e2e8f0" />
      <text x="70" y="21" fontSize="8" fill="#64748b" fontFamily="sans-serif">Portfolio Overview</text>
      <rect x="65" y="35" width="55" height="40" rx="4" fill="#fff" stroke="#e2e8f0" />
      <text x="70" y="48" fontSize="5" fill="#94a3b8" fontFamily="sans-serif">Total Projects</text>
      <text x="70" y="62" fontSize="12" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">24</text>
      <rect x="125" y="35" width="55" height="40" rx="4" fill="#fff" stroke="#e2e8f0" />
      <text x="130" y="48" fontSize="5" fill="#94a3b8" fontFamily="sans-serif">On Track</text>
      <text x="130" y="62" fontSize="12" fill="#22c55e" fontWeight="bold" fontFamily="sans-serif">18</text>
      <rect x="185" y="35" width="55" height="40" rx="4" fill="#fff" stroke="#e2e8f0" />
      <text x="190" y="48" fontSize="5" fill="#94a3b8" fontFamily="sans-serif">At Risk</text>
      <text x="190" y="62" fontSize="12" fill="#f59e0b" fontWeight="bold" fontFamily="sans-serif">4</text>
      <rect x="245" y="35" width="55" height="40" rx="4" fill="#fff" stroke="#e2e8f0" />
      <text x="250" y="48" fontSize="5" fill="#94a3b8" fontFamily="sans-serif">Off Track</text>
      <text x="250" y="62" fontSize="12" fill="#ef4444" fontWeight="bold" fontFamily="sans-serif">2</text>
      <circle cx="92" cy="130" r="30" fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle cx="92" cy="130" r="30" fill="none" stroke="#22c55e" strokeWidth="8" strokeDasharray="141 188" transform="rotate(-90 92 130)" />
      <circle cx="92" cy="130" r="30" fill="none" stroke="#f59e0b" strokeWidth="8" strokeDasharray="25 163" strokeDashoffset="-141" transform="rotate(-90 92 130)" />
      <text x="82" y="133" fontSize="10" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">75%</text>
      {[0,1,2,3,4].map(i=>(<rect key={i} x={160+i*22} y={170-[50,65,40,70,55][i]} width="14" rx="2" height={[50,65,40,70,55][i]} fill={["#3b82f6","#6366f1","#8b5cf6","#3b82f6","#6366f1"][i]} opacity="0.8" />))}
    </svg>
  );
}

function ScreenshotGantt() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect width="320" height="180" fill="#f8fafc" />
      <rect x="0" y="0" width="320" height="22" fill="#fff" />
      <text x="10" y="15" fontSize="8" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">Gantt Chart — Critical Path</text>
      <circle cx="295" cy="11" r="5" fill="#ef4444" opacity="0.2" /><circle cx="295" cy="11" r="3" fill="#ef4444" />
      <circle cx="308" cy="11" r="5" fill="#22c55e" opacity="0.2" /><circle cx="308" cy="11" r="3" fill="#22c55e" />
      <rect x="0" y="22" width="90" height="158" fill="#f1f5f9" />
      {["Planning","Design","Dev Sprint 1","Dev Sprint 2","Testing","UAT","Deployment"].map((t,i)=>(<g key={i}><rect x="0" y={30+i*20} width="90" height="18" fill={i%2===0?"#f8fafc":"#f1f5f9"} /><text x="6" y={42+i*20} fontSize="5.5" fill="#475569" fontFamily="sans-serif">{t}</text></g>))}
      {[0,1,2,3,4,5,6].map(i=><line key={i} x1={90+i*33} y1="22" x2={90+i*33} y2="180" stroke="#e2e8f0" strokeWidth="0.5" />)}
      <rect x="95" y="32" width="45" height="10" rx="3" fill="#3b82f6" />
      <rect x="130" y="52" width="55" height="10" rx="3" fill="#6366f1" />
      <rect x="155" y="72" width="80" height="10" rx="3" fill="#8b5cf6" />
      <rect x="195" y="92" width="70" height="10" rx="3" fill="#8b5cf6" />
      <rect x="240" y="112" width="50" height="10" rx="3" fill="#f59e0b" />
      <rect x="260" y="132" width="40" height="10" rx="3" fill="#22c55e" />
      <rect x="280" y="152" width="30" height="10" rx="3" fill="#ef4444" />
      <line x1="140" y1="37" x2="155" y2="77" stroke="#ef4444" strokeWidth="1" strokeDasharray="3" />
      <line x1="235" y1="97" x2="240" y2="117" stroke="#ef4444" strokeWidth="1" strokeDasharray="3" />
      <line x1="290" y1="137" x2="280" y2="157" stroke="#ef4444" strokeWidth="1" strokeDasharray="3" />
    </svg>
  );
}

function ScreenshotCopilot() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect width="320" height="180" fill="#0f172a" />
      <rect x="0" y="0" width="320" height="24" fill="#1e293b" />
      <circle cx="12" cy="12" r="4" fill="#3b82f6" />
      <text x="20" y="15" fontSize="7" fill="#94a3b8" fontFamily="sans-serif">Friday Copilot</text>
      <rect x="200" y="6" width="50" height="12" rx="6" fill="#3b82f6" opacity="0.2" />
      <text x="210" y="15" fontSize="5" fill="#60a5fa" fontFamily="sans-serif">AI Active</text>
      <rect x="20" y="35" width="160" height="28" rx="8" fill="#1e293b" />
      <text x="30" y="47" fontSize="5.5" fill="#60a5fa" fontFamily="sans-serif">Friday</text>
      <text x="30" y="56" fontSize="5" fill="#cbd5e1" fontFamily="sans-serif">Here's your portfolio health summary...</text>
      <rect x="20" y="70" width="180" height="55" rx="6" fill="#1e293b" />
      <text x="28" y="83" fontSize="5" fill="#94a3b8" fontFamily="sans-serif">Risk Analysis</text>
      {[0,1,2,3,4,5].map(i=>(<rect key={i} x={30+i*25} y={115-[30,45,25,40,35,50][i]} width="16" rx="2" height={[30,45,25,40,35,50][i]} fill={[30,45,25,40,35,50][i]>35?"#ef4444":"#3b82f6"} opacity="0.8" />))}
      <rect x="140" y="140" width="160" height="24" rx="8" fill="#1e3a5f" />
      <text x="150" y="152" fontSize="5.5" fill="#93c5fd" fontFamily="sans-serif">You</text>
      <text x="150" y="160" fontSize="5" fill="#e2e8f0" fontFamily="sans-serif">Show me projects at risk this quarter</text>
      <rect x="20" y="145" width="100" height="28" rx="14" fill="#1e293b" stroke="#334155" />
      <text x="35" y="162" fontSize="5.5" fill="#64748b" fontFamily="sans-serif">Ask Friday anything...</text>
      <circle cx="28" cy="159" r="4" fill="#3b82f6" opacity="0.5" />
    </svg>
  );
}

function ScreenshotRadar() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect width="320" height="180" fill="#0f172a" />
      <rect x="0" y="0" width="320" height="22" fill="#1e293b" />
      <text x="10" y="14" fontSize="7" fill="#e2e8f0" fontWeight="bold" fontFamily="sans-serif">PMO Risk Radar</text>
      <rect x="240" y="5" width="35" height="12" rx="4" fill="#22c55e" opacity="0.2" /><text x="248" y="14" fontSize="5" fill="#22c55e" fontFamily="sans-serif">Live</text>
      <circle cx="160" cy="105" r="65" fill="none" stroke="#1e293b" strokeWidth="1" />
      <circle cx="160" cy="105" r="45" fill="none" stroke="#1e293b" strokeWidth="1" />
      <circle cx="160" cy="105" r="25" fill="none" stroke="#1e293b" strokeWidth="1" />
      <line x1="95" y1="105" x2="225" y2="105" stroke="#1e293b" strokeWidth="0.5" />
      <line x1="160" y1="40" x2="160" y2="170" stroke="#1e293b" strokeWidth="0.5" />
      <circle cx="130" cy="75" r="6" fill="#ef4444" opacity="0.7" /><circle cx="130" cy="75" r="3" fill="#ef4444" />
      <circle cx="195" cy="85" r="5" fill="#f59e0b" opacity="0.7" /><circle cx="195" cy="85" r="2.5" fill="#f59e0b" />
      <circle cx="175" cy="120" r="7" fill="#ef4444" opacity="0.7" /><circle cx="175" cy="120" r="3.5" fill="#ef4444" />
      <circle cx="140" cy="130" r="4" fill="#22c55e" opacity="0.7" /><circle cx="140" cy="130" r="2" fill="#22c55e" />
      <circle cx="185" cy="65" r="5" fill="#f59e0b" opacity="0.7" /><circle cx="185" cy="65" r="2.5" fill="#f59e0b" />
      <circle cx="145" cy="95" r="4.5" fill="#3b82f6" opacity="0.7" /><circle cx="145" cy="95" r="2.2" fill="#3b82f6" />
      <circle cx="200" cy="130" r="3.5" fill="#22c55e" opacity="0.7" /><circle cx="200" cy="130" r="1.7" fill="#22c55e" />
      <circle cx="120" cy="110" r="5.5" fill="#ef4444" opacity="0.7" /><circle cx="120" cy="110" r="2.8" fill="#ef4444" />
      <rect x="250" y="35" width="60" height="50" rx="4" fill="#1e293b" />
      <text x="255" y="48" fontSize="5" fill="#94a3b8" fontFamily="sans-serif">Risk Summary</text>
      <rect x="255" y="53" width="8" height="8" rx="2" fill="#ef4444" /><text x="266" y="60" fontSize="4.5" fill="#cbd5e1" fontFamily="sans-serif">Critical: 3</text>
      <rect x="255" y="64" width="8" height="8" rx="2" fill="#f59e0b" /><text x="266" y="71" fontSize="4.5" fill="#cbd5e1" fontFamily="sans-serif">Medium: 2</text>
      <rect x="255" y="75" width="8" height="8" rx="2" fill="#22c55e" /><text x="266" y="82" fontSize="4.5" fill="#cbd5e1" fontFamily="sans-serif">Low: 3</text>
    </svg>
  );
}

function ScreenshotTimesheets() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect width="320" height="180" fill="#f8fafc" />
      <rect x="0" y="0" width="50" height="180" fill="#1e293b" />
      {[20,40,60,80,100].map((y,i)=>(<rect key={i} x="8" y={y} width="34" height="6" rx="2" fill={i===4?"#3b82f6":"#334155"} />))}
      <text x="60" y="16" fontSize="8" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">Timesheets</text>
      <rect x="220" y="6" width="45" height="14" rx="4" fill="#3b82f6" /><text x="228" y="16" fontSize="5.5" fill="#fff" fontFamily="sans-serif">Submit</text>
      <rect x="55" y="28" width="260" height="16" rx="0" fill="#f1f5f9" />
      <text x="60" y="39" fontSize="5" fill="#64748b" fontFamily="sans-serif">Team Member</text>
      <text x="140" y="39" fontSize="5" fill="#64748b" fontFamily="sans-serif">Mon</text>
      <text x="165" y="39" fontSize="5" fill="#64748b" fontFamily="sans-serif">Tue</text>
      <text x="190" y="39" fontSize="5" fill="#64748b" fontFamily="sans-serif">Wed</text>
      <text x="215" y="39" fontSize="5" fill="#64748b" fontFamily="sans-serif">Thu</text>
      <text x="240" y="39" fontSize="5" fill="#64748b" fontFamily="sans-serif">Fri</text>
      <text x="270" y="39" fontSize="5" fill="#64748b" fontFamily="sans-serif">Total</text>
      {[0,1,2,3,4].map(i=>{const names=["Sarah Chen","Mike Johnson","Alex Rivera","Priya Patel","Tom Wilson"];const hrs=[[8,7,8,8,6],[6,8,8,7,8],[8,8,4,8,8],[7,8,8,6,7],[8,8,8,8,8]];return(<g key={i}><rect x="55" y={46+i*18} width="260" height="16" fill={i%2===0?"#fff":"#f8fafc"} /><text x="60" y={57+i*18} fontSize="5" fill="#334155" fontFamily="sans-serif">{names[i]}</text>{hrs[i].map((h,j)=>(<text key={j} x={143+j*25} y={57+i*18} fontSize="5" fill={h<7?"#f59e0b":"#334155"} fontFamily="sans-serif">{h}h</text>))}<text x="272" y={57+i*18} fontSize="5" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">{hrs[i].reduce((a,b)=>a+b)}h</text></g>);})}
      {[0,1,2,3,4].map(i=>(<rect key={i} x={70+i*48} y={170-[55,40,65,35,50][i]} width="30" rx="3" height={[55,40,65,35,50][i]} fill="#3b82f6" opacity={0.6+i*0.08} />))}
    </svg>
  );
}

function ScreenshotIssues() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect width="320" height="180" fill="#f8fafc" />
      <rect x="0" y="0" width="50" height="180" fill="#1e293b" />
      {[20,40,60,80].map((y,i)=>(<rect key={i} x="8" y={y} width="34" height="6" rx="2" fill={i===3?"#3b82f6":"#334155"} />))}
      <text x="60" y="16" fontSize="8" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">Issues & Risks Board</text>
      <rect x="60" y="28" width="60" height="145" rx="4" fill="#fff" stroke="#e2e8f0" />
      <rect x="60" y="28" width="60" height="16" rx="0" fill="#ef4444" opacity="0.1" />
      <text x="70" y="39" fontSize="5" fill="#ef4444" fontWeight="bold" fontFamily="sans-serif">Critical (3)</text>
      {[0,1,2].map(i=>(<g key={i}><rect x="64" y={48+i*28} width="52" height="24" rx="3" fill="#fff" stroke="#fecaca" /><rect x="67" y={51+i*28} width="20" height="4" rx="1" fill="#e2e8f0" /><rect x="67" y={58+i*28} width="40" height="3" rx="1" fill="#f1f5f9" /><rect x="67" y={64+i*28} width="14" height="4" rx="2" fill="#fecaca" /><text x="69" y={67+i*28} fontSize="3.5" fill="#ef4444" fontFamily="sans-serif">High</text></g>))}
      <rect x="128" y="28" width="60" height="145" rx="4" fill="#fff" stroke="#e2e8f0" />
      <rect x="128" y="28" width="60" height="16" rx="0" fill="#f59e0b" opacity="0.1" />
      <text x="135" y="39" fontSize="5" fill="#f59e0b" fontWeight="bold" fontFamily="sans-serif">Medium (5)</text>
      {[0,1,2,3].map(i=>(<g key={i}><rect x="132" y={48+i*24} width="52" height="20" rx="3" fill="#fff" stroke="#fde68a" /><rect x="135" y={51+i*24} width="22" height="4" rx="1" fill="#e2e8f0" /><rect x="135" y={58+i*24} width="38" height="3" rx="1" fill="#f1f5f9" /></g>))}
      <rect x="196" y="28" width="60" height="145" rx="4" fill="#fff" stroke="#e2e8f0" />
      <rect x="196" y="28" width="60" height="16" rx="0" fill="#22c55e" opacity="0.1" />
      <text x="208" y="39" fontSize="5" fill="#22c55e" fontWeight="bold" fontFamily="sans-serif">Low (8)</text>
      {[0,1,2].map(i=>(<g key={i}><rect x="200" y={48+i*24} width="52" height="20" rx="3" fill="#fff" stroke="#bbf7d0" /><rect x="203" y={51+i*24} width="18" height="4" rx="1" fill="#e2e8f0" /><rect x="203" y={58+i*24} width="35" height="3" rx="1" fill="#f1f5f9" /></g>))}
      <rect x="264" y="28" width="50" height="145" rx="4" fill="#fff" stroke="#e2e8f0" />
      <rect x="264" y="28" width="50" height="16" rx="0" fill="#3b82f6" opacity="0.1" />
      <text x="270" y="39" fontSize="5" fill="#3b82f6" fontWeight="bold" fontFamily="sans-serif">Resolved (12)</text>
    </svg>
  );
}

function ScreenshotAnalytics() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect width="320" height="180" fill="#f8fafc" />
      <rect x="0" y="0" width="50" height="180" fill="#1e293b" />
      {[20,40,60,80].map((y,i)=>(<rect key={i} x="8" y={y} width="34" height="6" rx="2" fill={i===1?"#3b82f6":"#334155"} />))}
      <text x="60" y="16" fontSize="8" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">Executive Analytics</text>
      <rect x="60" y="28" width="65" height="35" rx="4" fill="#fff" stroke="#e2e8f0" />
      <text x="65" y="40" fontSize="4.5" fill="#94a3b8" fontFamily="sans-serif">Budget Utilized</text>
      <text x="65" y="54" fontSize="11" fill="#22c55e" fontWeight="bold" fontFamily="sans-serif">$2.4M</text>
      <rect x="130" y="28" width="65" height="35" rx="4" fill="#fff" stroke="#e2e8f0" />
      <text x="135" y="40" fontSize="4.5" fill="#94a3b8" fontFamily="sans-serif">Schedule Variance</text>
      <text x="135" y="54" fontSize="11" fill="#f59e0b" fontWeight="bold" fontFamily="sans-serif">-3.2%</text>
      <rect x="200" y="28" width="65" height="35" rx="4" fill="#fff" stroke="#e2e8f0" />
      <text x="205" y="40" fontSize="4.5" fill="#94a3b8" fontFamily="sans-serif">Utilization Rate</text>
      <text x="205" y="54" fontSize="11" fill="#3b82f6" fontWeight="bold" fontFamily="sans-serif">87%</text>
      <rect x="270" y="28" width="45" height="35" rx="4" fill="#fff" stroke="#e2e8f0" />
      <text x="275" y="40" fontSize="4.5" fill="#94a3b8" fontFamily="sans-serif">SPI</text>
      <text x="275" y="54" fontSize="11" fill="#22c55e" fontWeight="bold" fontFamily="sans-serif">1.02</text>
      {[0,1,2,3,4,5,6,7].map(i=>(<rect key={i} x={65+i*27} y={170-[45,55,35,60,50,65,40,58][i]} width="18" rx="2" height={[45,55,35,60,50,65,40,58][i]} fill={["#3b82f6","#6366f1","#3b82f6","#6366f1","#3b82f6","#6366f1","#3b82f6","#6366f1"][i]} opacity="0.75" />))}
      <circle cx="265" cy="130" r="28" fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle cx="265" cy="130" r="28" fill="none" stroke="#3b82f6" strokeWidth="6" strokeDasharray="110 66" transform="rotate(-90 265 130)" />
      <circle cx="265" cy="130" r="28" fill="none" stroke="#22c55e" strokeWidth="6" strokeDasharray="40 136" strokeDashoffset="-110" transform="rotate(-90 265 130)" />
      <text x="255" y="133" fontSize="8" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">87%</text>
    </svg>
  );
}

function ScreenshotProjectDetail() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect width="320" height="180" fill="#0f172a" />
      <rect x="0" y="0" width="320" height="24" fill="#1e293b" />
      <text x="10" y="16" fontSize="8" fill="#e2e8f0" fontWeight="bold" fontFamily="sans-serif">Project Details</text>
      <rect x="200" y="6" width="50" height="12" rx="4" fill="#22c55e" opacity="0.2" /><text x="210" y="15" fontSize="5" fill="#22c55e" fontFamily="sans-serif">On Track</text>
      <rect x="10" y="32" width="140" height="65" rx="6" fill="#1e293b" />
      <text x="18" y="46" fontSize="6" fill="#94a3b8" fontFamily="sans-serif">Completion Progress</text>
      <rect x="18" y="52" width="120" height="6" rx="3" fill="#334155" />
      <rect x="18" y="52" width="84" height="6" rx="3" fill="#3b82f6" />
      <text x="18" y="68" fontSize="5" fill="#60a5fa" fontFamily="sans-serif">70% Complete</text>
      <text x="18" y="80" fontSize="5" fill="#64748b" fontFamily="sans-serif">Budget: $1.2M / $1.8M</text>
      <text x="18" y="90" fontSize="5" fill="#64748b" fontFamily="sans-serif">Timeline: Mar-Dec 2026</text>
      <rect x="160" y="32" width="150" height="65" rx="6" fill="#1e293b" />
      <text x="168" y="46" fontSize="6" fill="#94a3b8" fontFamily="sans-serif">Team Activity</text>
      {[0,1,2,3,4,5,6].map(i=>(<rect key={i} x={170+i*18} y={88-[25,35,20,40,30,22,38][i]} width="10" rx="2" height={[25,35,20,40,30,22,38][i]} fill="#6366f1" opacity="0.7" />))}
      <rect x="10" y="105" width="300" height="68" rx="6" fill="#1e293b" />
      <text x="18" y="118" fontSize="6" fill="#94a3b8" fontFamily="sans-serif">Milestones</text>
      {[0,1,2,3].map(i=>{const labels=["Design Phase","Sprint 1-3","UAT Testing","Go-Live"];const colors=["#22c55e","#22c55e","#3b82f6","#64748b"];return(<g key={i}><circle cx={30+i*72} cy="140" r="5" fill={colors[i]} /><line x1={i>0?30+(i-1)*72+5:0} y1="140" x2={30+i*72-5} y2="140" stroke={i>0?colors[i-1]:"none"} strokeWidth="2" /><text x={18+i*72} y="155" fontSize="4.5" fill="#cbd5e1" fontFamily="sans-serif">{labels[i]}</text></g>);})}
    </svg>
  );
}

function ScreenshotResources() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect width="320" height="180" fill="#f8fafc" />
      <rect x="0" y="0" width="50" height="180" fill="#1e293b" />
      {[20,40,60,80,100].map((y,i)=>(<rect key={i} x="8" y={y} width="34" height="6" rx="2" fill={i===2?"#3b82f6":"#334155"} />))}
      <text x="60" y="16" fontSize="8" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">Resource Allocation</text>
      {[0,1,2,3,4].map(i=>{const names=["Frontend Team","Backend Team","QA Team","DevOps","Design"];const pcts=[85,92,68,75,55];const colors=["#3b82f6","#6366f1","#f59e0b","#22c55e","#8b5cf6"];return(<g key={i}><text x="60" y={42+i*22} fontSize="5" fill="#334155" fontFamily="sans-serif">{names[i]}</text><rect x="130" y={35+i*22} width="130" height="8" rx="3" fill="#e2e8f0" /><rect x="130" y={35+i*22} width={130*pcts[i]/100} height="8" rx="3" fill={colors[i]} /><text x="265" y={42+i*22} fontSize="5" fill="#64748b" fontFamily="sans-serif">{pcts[i]}%</text></g>);})}
      <rect x="60" y="140" width="90" height="35" rx="4" fill="#fff" stroke="#e2e8f0" />
      <text x="65" y="153" fontSize="5" fill="#94a3b8" fontFamily="sans-serif">Available Resources</text>
      <text x="65" y="168" fontSize="12" fill="#22c55e" fontWeight="bold" fontFamily="sans-serif">12 / 48</text>
      <rect x="155" y="140" width="90" height="35" rx="4" fill="#fff" stroke="#e2e8f0" />
      <text x="160" y="153" fontSize="5" fill="#94a3b8" fontFamily="sans-serif">Avg Utilization</text>
      <text x="160" y="168" fontSize="12" fill="#3b82f6" fontWeight="bold" fontFamily="sans-serif">78%</text>
      <rect x="250" y="140" width="65" height="35" rx="4" fill="#fff" stroke="#e2e8f0" />
      <text x="255" y="153" fontSize="5" fill="#94a3b8" fontFamily="sans-serif">Over-allocated</text>
      <text x="255" y="168" fontSize="12" fill="#ef4444" fontWeight="bold" fontFamily="sans-serif">3</text>
    </svg>
  );
}

function ScreenshotTraining() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect width="320" height="180" fill="#f8fafc" />
      <rect x="0" y="0" width="50" height="180" fill="#1e293b" />
      {[20,40,60,80,100].map((y,i)=>(<rect key={i} x="8" y={y} width="34" height="6" rx="2" fill={i===4?"#3b82f6":"#334155"} />))}
      <text x="60" y="16" fontSize="8" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">Training Academy</text>
      {[0,1,2].map(i=>{const titles=["PMO Fundamentals","Advanced Risk Mgmt","AI-Powered Reports"];const pcts=[100,72,30];const colors=["#22c55e","#3b82f6","#8b5cf6"];return(<g key={i}>
        <rect x={60+i*88} y="28" width="80" height="70" rx="6" fill="#fff" stroke="#e2e8f0" />
        <rect x={60+i*88} y="28" width="80" height="22" rx="6" fill={colors[i]} opacity="0.15" />
        <rect x={60+i*88} y="45" width="80" height="5" fill="#fff" />
        <text x={68+i*88} y="42" fontSize="5" fill={colors[i]} fontWeight="bold" fontFamily="sans-serif">{titles[i]}</text>
        <rect x={67+i*88} y="58" width="60" height="4" rx="2" fill="#e2e8f0" />
        <rect x={67+i*88} y="58" width={60*pcts[i]/100} height="4" rx="2" fill={colors[i]} />
        <text x={67+i*88} y="72" fontSize="4.5" fill="#64748b" fontFamily="sans-serif">{pcts[i]}% complete</text>
        <text x={67+i*88} y="82" fontSize="4" fill="#94a3b8" fontFamily="sans-serif">{["12 lessons","8 lessons","10 lessons"][i]}</text>
        <rect x={67+i*88} y="86" width="25" height="8" rx="3" fill={pcts[i]===100?colors[i]:colors[i]} opacity={pcts[i]===100?0.15:1} />
        <text x={70+i*88} y="92" fontSize="4" fill={pcts[i]===100?colors[i]:"#fff"} fontFamily="sans-serif">{pcts[i]===100?"Done":"Continue"}</text>
      </g>);})}
      <rect x="60" y="108" width="255" height="65" rx="6" fill="#fff" stroke="#e2e8f0" />
      <text x="68" y="122" fontSize="6" fill="#1e293b" fontWeight="bold" fontFamily="sans-serif">Your Learning Path</text>
      {[0,1,2,3].map(i=>{const items=["Risk Assessment","Stakeholder Mgmt","Gantt Mastery","AI Insights"];const st=["Completed","In Progress","Up Next","Locked"];const cols=["#22c55e","#3b82f6","#f59e0b","#94a3b8"];return(<g key={i}><circle cx={85+i*60} cy="145" r="6" fill={cols[i]} opacity="0.2" /><circle cx={85+i*60} cy="145" r="4" fill={cols[i]} />{i>0&&<line x1={85+(i-1)*60+6} y1="145" x2={85+i*60-6} y2="145" stroke={cols[i-1]} strokeWidth="1.5" />}<text x={72+i*60} y="160" fontSize="4" fill="#475569" fontFamily="sans-serif" textAnchor="middle">{items[i]}</text><text x={72+i*60} y="167" fontSize="3.5" fill={cols[i]} fontFamily="sans-serif" textAnchor="middle">{st[i]}</text></g>);})}
    </svg>
  );
}

const SCREENSHOT_COMPONENTS: Record<string, () => JSX.Element> = {
  "Portfolio Dashboard": ScreenshotPortfolio,
  "Gantt Chart & CPM": ScreenshotGantt,
  "Friday Copilot AI": ScreenshotCopilot,
  "PMO Risk Radar": ScreenshotRadar,
  "Timesheets": ScreenshotTimesheets,
  "Issues & Risks Board": ScreenshotIssues,
  "Executive Analytics": ScreenshotAnalytics,
  "Project Details": ScreenshotProjectDetail,
  "Resource Allocation": ScreenshotResources,
  "Training Academy": ScreenshotTraining,
};

const PRODUCT_SCREENSHOTS = [
  "Portfolio Dashboard", "Gantt Chart & CPM", "Friday Copilot AI", "PMO Risk Radar",
  "Timesheets", "Issues & Risks Board", "Executive Analytics", "Project Details",
  "Resource Allocation", "Training Academy",
];

const DEMO_RADAR_SIGNALS: RiskSignal[] = [
  { id: "d1", title: "Cloud Migration Delay", project: "Infrastructure Upgrade", projectId: 1, riskScore: 82, timeOffsetDays: -15, impactScore: 85, probability: 75, costExposureNorm: 70, costExposureRaw: 420000, confidence: 0.9, type: "schedule", costExposure: 420000, dueDate: null, status: "Open", itemType: "risk" },
  { id: "d2", title: "Vendor Contract Overrun", project: "ERP Rollout", projectId: 2, riskScore: 71, timeOffsetDays: 25, impactScore: 70, probability: 65, costExposureNorm: 60, costExposureRaw: 280000, confidence: 0.85, type: "budget", costExposure: 280000, dueDate: null, status: "Open", itemType: "risk" },
  { id: "d3", title: "API Integration Failure", project: "Platform Modernization", projectId: 3, riskScore: 65, timeOffsetDays: -8, impactScore: 60, probability: 55, costExposureNorm: 45, costExposureRaw: 150000, confidence: 0.8, type: "technical", costExposure: 150000, dueDate: null, status: "Open", itemType: "issue" },
  { id: "d4", title: "Resource Shortage Q3", project: "Mobile App Launch", projectId: 4, riskScore: 58, timeOffsetDays: 40, impactScore: 55, probability: 50, costExposureNorm: 35, costExposureRaw: 95000, confidence: 0.75, type: "resource", costExposure: 95000, dueDate: null, status: "Open", itemType: "risk" },
  { id: "d5", title: "Scope Creep - Phase 2", project: "CRM Migration", projectId: 5, riskScore: 45, timeOffsetDays: 60, impactScore: 50, probability: 40, costExposureNorm: 30, costExposureRaw: 75000, confidence: 0.7, type: "scope", costExposure: 75000, dueDate: null, status: "Open", itemType: "risk" },
  { id: "d6", title: "Data Loss During Cutover", project: "ERP Rollout", projectId: 2, riskScore: 88, timeOffsetDays: 10, impactScore: 90, probability: 80, costExposureNorm: 85, costExposureRaw: 650000, confidence: 0.95, type: "technical", costExposure: 650000, dueDate: null, status: "Open", itemType: "risk" },
  { id: "d7", title: "Compliance Gap - GDPR", project: "Platform Modernization", projectId: 3, riskScore: 52, timeOffsetDays: -30, impactScore: 65, probability: 45, costExposureNorm: 55, costExposureRaw: 200000, confidence: 0.8, type: "scope", costExposure: 200000, dueDate: null, status: "Open", itemType: "issue" },
  { id: "d8", title: "Testing Bottleneck", project: "Mobile App Launch", projectId: 4, riskScore: 38, timeOffsetDays: 15, impactScore: 40, probability: 35, costExposureNorm: 20, costExposureRaw: 45000, confidence: 0.65, type: "dependency", costExposure: 45000, dueDate: null, status: "Open", itemType: "issue" },
  { id: "d9", title: "Key Architect Departure", project: "Infrastructure Upgrade", projectId: 1, riskScore: 75, timeOffsetDays: -5, impactScore: 80, probability: 60, costExposureNorm: 50, costExposureRaw: 180000, confidence: 0.85, type: "resource", costExposure: 180000, dueDate: null, status: "Open", itemType: "risk" },
  { id: "d10", title: "Budget Reallocation Risk", project: "CRM Migration", projectId: 5, riskScore: 42, timeOffsetDays: 50, impactScore: 45, probability: 38, costExposureNorm: 25, costExposureRaw: 60000, confidence: 0.7, type: "budget", costExposure: 60000, dueDate: null, status: "Open", itemType: "risk" },
  { id: "d11", title: "Third-Party API Deprecation", project: "Platform Modernization", projectId: 3, riskScore: 60, timeOffsetDays: 70, impactScore: 55, probability: 50, costExposureNorm: 40, costExposureRaw: 120000, confidence: 0.75, type: "dependency", costExposure: 120000, dueDate: null, status: "Open", itemType: "risk" },
  { id: "d12", title: "UAT Sign-off Delayed", project: "ERP Rollout", projectId: 2, riskScore: 35, timeOffsetDays: -20, impactScore: 35, probability: 30, costExposureNorm: 15, costExposureRaw: 30000, confidence: 0.6, type: "schedule", costExposure: 30000, dueDate: null, status: "Open", itemType: "issue" },
];

function useForceLightTheme() {
  useEffect(() => {
    const root = window.document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.remove("dark");
    root.classList.add("light");
    return () => {
      root.classList.remove("light");
      if (hadDark) root.classList.add("dark");
    };
  }, []);
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

function AnimatedSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const sections = [
  { id: "hero", label: "Overview" },
  { id: "problem", label: "Problem" },
  { id: "solution", label: "Solution" },
  { id: "product", label: "Product" },
  { id: "market", label: "Market" },
  { id: "business-model", label: "Business Model" },
  { id: "traction", label: "Traction" },
  { id: "competitive", label: "Competitive Edge" },
  { id: "gtm", label: "Go-to-Market" },
  { id: "team", label: "Team" },
  { id: "investment", label: "Investment" },
];

function PasswordGate({ onSuccess }: { onSuccess: () => void }) {
  useForceLightTheme();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/investor/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Incorrect password. Please try again.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl mb-4 shadow-lg">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Investor Access</h1>
            <p className="text-slate-500 text-sm">Enter the password to view confidential materials</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="Enter investor password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 text-center text-lg tracking-wider border-slate-300 focus:border-blue-500 focus:ring-blue-500"
              autoFocus
            />
            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}
            <Button
              type="submit"
              disabled={loading || !password}
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-base"
            >
              {loading ? "Verifying..." : "Access Investor Materials"}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-400">
              These materials are confidential and intended for invited investors only.
            </p>
          </div>
        </div>

        <div className="text-center mt-6">
          <img src={logoBlack} alt="FridayReport.AI" className="h-6 mx-auto opacity-50 invert" />
        </div>
      </motion.div>
    </div>
  );
}

function SectionHeading({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  return (
    <motion.div variants={fadeUp} className="text-center mb-12">
      {badge && (
        <Badge variant="secondary" className="mb-4 bg-blue-50 text-blue-700 border-blue-200 px-3 py-1 text-xs font-medium tracking-wide uppercase">
          {badge}
        </Badge>
      )}
      <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">{title}</h2>
      {subtitle && <p className="text-lg text-slate-500 max-w-2xl mx-auto">{subtitle}</p>}
    </motion.div>
  );
}

function MetricCard({ value, label, icon: Icon, color = "blue" }: { value: string; label: string; icon: any; color?: string }) {
  const colorMap: Record<string, string> = {
    blue: "from-blue-500 to-blue-600",
    green: "from-emerald-500 to-emerald-600",
    purple: "from-purple-500 to-purple-600",
    orange: "from-orange-500 to-orange-600",
    indigo: "from-indigo-500 to-indigo-600",
  };
  return (
    <motion.div variants={fadeUp}>
      <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow bg-white overflow-hidden">
        <CardContent className="p-6 text-center">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${colorMap[color] || colorMap.blue} mb-4`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
          <div className="text-sm text-slate-500">{label}</div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function InvestorDeck({ onLogout, isAdmin }: { onLogout: () => void; isAdmin: boolean }) {
  useForceLightTheme();
  const [activeSection, setActiveSection] = useState("hero");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const generatePdfBlob = useCallback(async () => {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const allMotion = document.querySelectorAll<HTMLElement>('[style*="opacity"]');
    const savedMotion: { el: HTMLElement; opacity: string; transform: string }[] = [];
    allMotion.forEach((el) => {
      savedMotion.push({ el, opacity: el.style.opacity, transform: el.style.transform });
      el.style.opacity = "1";
      el.style.transform = "none";
    });

    const gradientEls = document.querySelectorAll<HTMLElement>(".bg-clip-text");
    const savedGradient: { el: HTMLElement; cssText: string }[] = [];
    gradientEls.forEach((el) => {
      savedGradient.push({ el, cssText: el.style.cssText });
      el.style.backgroundClip = "unset";
      el.style.webkitBackgroundClip = "unset";
      el.style.color = "#7dd3fc";
      el.style.backgroundImage = "none";
      el.style.webkitTextFillColor = "#7dd3fc";
    });

    await new Promise((r) => setTimeout(r, 300));

    const slideWidth = 1280;
    const slideHeight = 720;
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [slideWidth, slideHeight] });

    let pageAdded = false;
    for (let i = 0; i < sections.length; i++) {
      const el = document.getElementById(sections[i].id);
      if (!el) continue;

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        windowWidth: 1280,
        logging: false,
      });

      if (canvas.width === 0 || canvas.height === 0) continue;

      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const imgRatio = canvas.width / canvas.height;
      const slideRatio = slideWidth / slideHeight;

      let drawW: number, drawH: number, drawX: number, drawY: number;
      if (imgRatio > slideRatio) {
        drawW = slideWidth;
        drawH = slideWidth / imgRatio;
        drawX = 0;
        drawY = (slideHeight - drawH) / 2;
      } else {
        drawH = slideHeight;
        drawW = slideHeight * imgRatio;
        drawX = (slideWidth - drawW) / 2;
        drawY = 0;
      }

      if (pageAdded) pdf.addPage();
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, slideWidth, slideHeight, "F");
      pdf.addImage(imgData, "JPEG", drawX, drawY, drawW, drawH);
      pageAdded = true;
    }

    savedMotion.forEach(({ el, opacity, transform }) => {
      el.style.opacity = opacity;
      el.style.transform = transform;
    });
    savedGradient.forEach(({ el, cssText }) => {
      el.style.cssText = cssText;
    });

    return pdf;
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    setPdfGenerating(true);
    try {
      const pdf = await generatePdfBlob();
      pdf.save("FridayReport-AI-Investor-Deck.pdf");
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfGenerating(false);
    }
  }, [generatePdfBlob]);

  const handleEmailPdf = useCallback(async () => {
    if (!emailAddress || !emailAddress.includes("@")) return;
    setEmailSending(true);
    try {
      const pdf = await generatePdfBlob();
      const pdfBase64 = pdf.output("datauristring").split(",")[1];

      const res = await fetch("/api/investor/email-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddress, pdfBase64 }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }

      setEmailSent(true);
      toast({ title: "Email sent", description: `Investor deck sent to ${emailAddress}` });
      setTimeout(() => {
        setEmailDialogOpen(false);
        setEmailAddress("");
        setEmailSent(false);
      }, 2000);
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setEmailSending(false);
    }
  }, [emailAddress, generatePdfBlob, toast]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileMenuOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-b border-slate-200 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3 flex-shrink-0">
              <img src={logoBlack} alt="FridayReport.AI" className="h-6" />
              <Badge variant="outline" className="hidden sm:inline-flex border-amber-300 bg-amber-50 text-amber-700 text-[10px] font-semibold uppercase tracking-wider">
                Confidential
              </Badge>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={pdfGenerating}
                className="text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                {pdfGenerating ? (
                  <><span className="w-3.5 h-3.5 mr-1 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin inline-block" /> Generating...</>
                ) : (
                  <><Download className="w-3.5 h-3.5 mr-1" /> Download PDF</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setEmailSent(false); setEmailDialogOpen(true); }}
                disabled={emailSending}
                className="text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
              >
                <Mail className="w-3.5 h-3.5 mr-1" /> Email PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="text-slate-500 hover:text-red-600 text-xs"
              >
                <LogOut className="w-3.5 h-3.5 mr-1" />
                {isAdmin ? "Back to App" : "Exit"}
              </Button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="xl:hidden p-2 text-slate-500"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="hidden xl:block border-t border-slate-100 bg-white/90">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-1 h-9 overflow-x-auto scrollbar-hide">
              {sections.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
                    activeSection === id
                      ? "bg-blue-100 text-blue-700"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="xl:hidden border-t border-slate-200 bg-white/95 backdrop-blur-lg py-2 px-4 max-h-[60vh] overflow-y-auto">
            {sections.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`block w-full text-left px-3 py-2 text-sm rounded-lg ${
                  activeSection === id ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="pt-14 xl:pt-[5.75rem]">
        {/* Hero */}
        <section id="hero" className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white py-24 md:py-32">
          <div className="absolute inset-0">
            <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-400/5 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <AnimatedSection>
              <motion.div variants={fadeUp}>
                <Badge className="mb-6 bg-white/10 text-white/90 border-white/20 backdrop-blur px-4 py-1.5 text-xs tracking-wider uppercase">
                  Confidential Investor Materials
                </Badge>
              </motion.div>
              <motion.h1 variants={fadeUp} className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-snug">
                The Future of
                <span className="block bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent pb-2">
                  Project Portfolio Management
                </span>
              </motion.h1>
              <motion.p variants={fadeUp} className="text-xl md:text-2xl text-blue-200/80 mb-4 max-w-3xl mx-auto font-light">
                AI-powered enterprise PPM that replaces spreadsheets, disconnected tools, and manual reporting with a single intelligent platform.
              </motion.p>
              <motion.p variants={fadeUp} className="text-base text-blue-300/60 mb-10 max-w-2xl mx-auto">
                FridayReport.AI helps PMOs, project managers, and executives make better decisions faster — with real-time visibility, automated insights, and actionable intelligence.
              </motion.p>
              <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  size="lg"
                  className="bg-white text-slate-900 hover:bg-blue-50 font-semibold px-8 h-12 text-base shadow-xl"
                  onClick={() => window.open("mailto:founder@fridayreport.ai?subject=Demo Request", "_blank")}
                >
                  Request Demo <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="border-white/30 text-white hover:bg-white/10 font-semibold px-8 h-12 text-base backdrop-blur"
                  onClick={() => window.open("mailto:founder@fridayreport.ai?subject=Investor Inquiry", "_blank")}
                >
                  Contact Founder
                </Button>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        {/* Problem */}
        <section id="problem" className="py-20 md:py-28 bg-slate-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <SectionHeading
                badge="The Problem"
                title="Enterprise Project Management Is Broken"
                subtitle="Organizations lose millions annually due to poor project visibility, fragmented tools, and manual reporting processes."
              />

              <div className="grid md:grid-cols-3 gap-8">
                {[
                  {
                    icon: Eye,
                    title: "No Visibility",
                    desc: "Executives can't see real-time project status. By the time reports reach leadership, the data is already stale.",
                    stat: "67%",
                    statLabel: "of projects fail due to poor visibility",
                  },
                  {
                    icon: Layers,
                    title: "Tool Fragmentation",
                    desc: "Teams juggle MS Project, Jira, spreadsheets, Slack, and email. No single source of truth exists.",
                    stat: "5-7",
                    statLabel: "tools used per project on average",
                  },
                  {
                    icon: Clock,
                    title: "Manual Reporting",
                    desc: "PMs spend 30%+ of their time gathering data and formatting status reports instead of managing projects.",
                    stat: "12hrs",
                    statLabel: "per week spent on manual reporting",
                  },
                ].map((item) => (
                  <motion.div key={item.title} variants={fadeUp}>
                    <Card className="border-0 shadow-lg h-full bg-white hover:shadow-xl transition-shadow">
                      <CardContent className="p-8">
                        <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-5">
                          <item.icon className="w-6 h-6 text-red-500" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
                        <p className="text-slate-500 mb-6 leading-relaxed">{item.desc}</p>
                        <div className="pt-4 border-t border-slate-100">
                          <span className="text-2xl font-bold text-red-600">{item.stat}</span>
                          <span className="text-xs text-slate-400 block mt-1">{item.statLabel}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* Solution */}
        <section id="solution" className="py-20 md:py-28 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <SectionHeading
                badge="Our Solution"
                title="One Intelligent Platform for Everything"
                subtitle="FridayReport.AI unifies project, portfolio, and resource management with AI-powered insights — eliminating tool sprawl and manual busywork."
              />

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">
                {[
                  { icon: Brain, title: "AI-Native Intelligence", desc: "Friday Copilot answers questions, generates reports, and surfaces risks using natural language — like having a senior PM on call 24/7.", gradient: "from-blue-500 to-indigo-600" },
                  { icon: Zap, title: "Real-Time Everything", desc: "Live dashboards, instant status updates, and automated alerts ensure leaders always have current, actionable information.", gradient: "from-amber-500 to-orange-600" },
                  { icon: Shield, title: "Enterprise-Grade Security", desc: "SSO via Microsoft 365 & Google, role-based access control, audit trails, and encrypted data at rest and in transit.", gradient: "from-emerald-500 to-teal-600" },
                  { icon: Globe, title: "Built for Global Teams", desc: "Multi-org support, timezone-aware scheduling, and configurable working calendars for distributed enterprises.", gradient: "from-purple-500 to-violet-600" },
                ].map((item) => (
                  <motion.div key={item.title} variants={fadeUp}>
                    <Card className="border-0 shadow-md hover:shadow-xl transition-all h-full bg-white group hover:-translate-y-1 duration-300">
                      <CardContent className="p-6">
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-4 shadow-lg`}>
                          <item.icon className="w-5 h-5 text-white" />
                        </div>
                        <h4 className="font-bold text-slate-900 mb-2">{item.title}</h4>
                        <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <div className="max-w-4xl mx-auto">
                <motion.div variants={fadeUp}>
                  <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 rounded-2xl shadow-2xl overflow-hidden h-full flex flex-col">
                    <div className="flex items-center justify-between px-6 pt-5 pb-1">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                          <Shield className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <span className="text-sm font-bold text-white block leading-tight">PMO Radar</span>
                          <span className="text-[10px] text-slate-400">Real-time risk intelligence</span>
                        </div>
                      </div>
                      <Badge className="bg-cyan-500/15 text-cyan-300 text-[10px] border border-cyan-500/25">Live Demo</Badge>
                    </div>
                    <div className="flex-1 min-h-[380px] relative">
                      <RadarCanvas
                        signals={DEMO_RADAR_SIGNALS}
                        onSignalClick={() => {}}
                        isDark={true}
                        centerLabel="RISK OVERVIEW"
                        horizontalMetric="riskScore"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-2.5 px-5 pb-5">
                      {[
                        { label: "Critical", count: DEMO_RADAR_SIGNALS.filter(s => s.riskScore > 70).length, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
                        { label: "High", count: DEMO_RADAR_SIGNALS.filter(s => s.riskScore > 50 && s.riskScore <= 70).length, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
                        { label: "Medium", count: DEMO_RADAR_SIGNALS.filter(s => s.riskScore > 30 && s.riskScore <= 50).length, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
                        { label: "Low", count: DEMO_RADAR_SIGNALS.filter(s => s.riskScore <= 30).length, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
                      ].map((s) => (
                        <div key={s.label} className={`rounded-lg p-2.5 border text-center ${s.bg}`}>
                          <div className={`text-lg font-bold ${s.color}`}>{s.count}</div>
                          <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* Product */}
        <section id="product" className="py-20 md:py-28 bg-slate-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <SectionHeading
                badge="Product"
                title="A Complete PPM Platform"
                subtitle="Everything project teams and executives need — from Gantt charts and timesheets to AI-powered risk radar and automated reporting."
              />

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
                {[
                  { icon: BarChart3, title: "Portfolio Dashboards", desc: "Executive-level views with KPIs, health scores, and drill-down analytics across all projects." },
                  { icon: Layers, title: "Project Management", desc: "Gantt charts, task hierarchies, dependencies, milestones, and critical path analysis." },
                  { icon: Shield, title: "PMO Radar", desc: "Dynamic risk visualization with simulation engine, timeline playback, and predictive modeling." },
                  { icon: Brain, title: "Friday Copilot", desc: "Natural language interface to query data, generate reports, and get AI-powered recommendations." },
                  { icon: Clock, title: "Timesheets & Resources", desc: "Time tracking, capacity planning, workload balancing, and utilization analytics." },
                  { icon: Award, title: "Training Academy", desc: "Built-in PM training modules with quizzes, progress tracking, and certification." },
                ].map((item) => (
                  <motion.div key={item.title} variants={fadeUp}>
                    <Card className="border-0 shadow-md hover:shadow-lg transition-shadow h-full bg-white">
                      <CardContent className="p-6">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4">
                          <item.icon className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
                        <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <motion.div variants={fadeUp} className="mb-16">
                <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Platform Screenshots</h3>
                <p className="text-sm text-slate-500 text-center mb-8">A glimpse into the FridayReport.AI experience</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {PRODUCT_SCREENSHOTS.map((label) => {
                    const Comp = SCREENSHOT_COMPONENTS[label];
                    if (!Comp) return null;
                    return (
                      <div key={label} className="group cursor-pointer">
                        <div className="relative rounded-xl overflow-hidden shadow-md border border-slate-200 bg-white hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                          <Comp />
                        </div>
                        <p className="text-xs font-medium text-slate-600 text-center mt-2">{label}</p>
                      </div>
                    );
                  })}
                </div>
              </motion.div>

              <SectionHeading title="How It Works" subtitle="Get started in minutes, not months." />
              <div className="grid md:grid-cols-5 gap-4">
                {[
                  { step: "1", title: "Sign Up", desc: "Create your account with email or SSO" },
                  { step: "2", title: "Set Up Org", desc: "Configure your organization and invite team" },
                  { step: "3", title: "Import Projects", desc: "Import from MS Project, Excel, or create new" },
                  { step: "4", title: "Track & Report", desc: "Real-time dashboards and automated reports" },
                  { step: "5", title: "Ask Friday", desc: "Get AI insights and recommendations" },
                ].map((item) => (
                  <motion.div key={item.step} variants={fadeUp} className="text-center">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center mx-auto mb-3 text-sm">
                      {item.step}
                    </div>
                    <h4 className="font-semibold text-slate-900 text-sm mb-1">{item.title}</h4>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* Market */}
        <section id="market" className="py-20 md:py-28 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <SectionHeading
                badge="Market Opportunity"
                title="A Massive, Growing Market"
                subtitle="The global project management software market is expanding rapidly, driven by digital transformation and remote work."
              />

              <div className="grid md:grid-cols-3 gap-8 mb-16">
                <MetricCard value="$7.6B" label="Total Addressable Market (TAM)" icon={Globe} color="blue" />
                <MetricCard value="$2.4B" label="Serviceable Addressable Market (SAM)" icon={Target} color="indigo" />
                <MetricCard value="$180M" label="Serviceable Obtainable Market (SOM)" icon={Rocket} color="purple" />
              </div>

              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { title: "Enterprise PMOs", desc: "Organizations with 50+ projects needing portfolio-level visibility and governance.", icon: Building2 },
                  { title: "Mid-Market Companies", desc: "Growing businesses transitioning from spreadsheets to professional PM tooling.", icon: TrendingUp },
                  { title: "Consulting & SI Firms", desc: "System integrators and PMO consultants who need a platform to serve their clients.", icon: Users },
                ].map((item) => (
                  <motion.div key={item.title} variants={fadeUp}>
                    <Card className="border-0 shadow-md h-full bg-gradient-to-br from-slate-50 to-blue-50/50">
                      <CardContent className="p-6">
                        <item.icon className="w-8 h-8 text-blue-600 mb-4" />
                        <h4 className="font-semibold text-slate-900 mb-2">{item.title}</h4>
                        <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* Business Model */}
        <section id="business-model" className="py-20 md:py-28 bg-slate-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <SectionHeading
                badge="Business Model"
                title="Scalable SaaS Revenue"
                subtitle="Multi-tiered subscription model with strong expansion revenue from seat-based pricing and enterprise features."
              />

              <div className="grid md:grid-cols-3 gap-8 mb-12">
                {[
                  {
                    title: "Free",
                    price: "Free",
                    period: "",
                    desc: "For individuals and small teams getting started",
                    features: ["Up to 3 users", "5 projects", "Core PM features", "Gantt charts & task management", "Community support", "Basic reporting"],
                    highlight: false,
                  },
                  {
                    title: "Pro",
                    price: "$25,000",
                    period: "/mo",
                    desc: "For growing organizations that need full power",
                    features: ["Unlimited users", "Unlimited projects", "Friday Copilot AI (unlimited)", "PMO Risk Radar", "Advanced analytics & dashboards", "Portfolio management", "Timesheets & resource planning", "SSO (Microsoft 365 & Google)", "Priority support", "Training Academy access"],
                    highlight: true,
                  },
                  {
                    title: "Enterprise",
                    price: "Custom",
                    period: "",
                    desc: "For large organizations with complex needs",
                    features: ["Everything in Pro", "Multi-org support", "Dedicated Customer Success Manager", "Custom integrations & API access", "SLA guarantee (99.9% uptime)", "On-premise deployment option", "White-glove onboarding", "Custom training & workshops", "Executive business reviews"],
                    highlight: false,
                  },
                ].map((tier) => (
                  <motion.div key={tier.title} variants={fadeUp}>
                    <Card className={`border-0 shadow-lg h-full ${tier.highlight ? "ring-2 ring-blue-500 bg-white scale-[1.02]" : "bg-white"}`}>
                      <CardContent className="p-8">
                        {tier.highlight && (
                          <Badge className="mb-3 bg-blue-600 text-white text-[10px]">Most Popular</Badge>
                        )}
                        <h3 className="text-xl font-bold text-slate-900 mb-1">{tier.title}</h3>
                        <p className="text-xs text-slate-400 mb-4">{tier.desc}</p>
                        <div className="mb-6">
                          <span className="text-3xl font-bold text-slate-900">{tier.price}</span>
                          {tier.period && <span className="text-slate-500 text-sm">{tier.period}</span>}
                        </div>
                        <ul className="space-y-3">
                          {tier.features.map((f) => (
                            <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <motion.div variants={fadeUp} className="text-center">
                <h4 className="text-lg font-semibold text-slate-900 mb-4">Revenue Expansion Opportunities</h4>
                <div className="flex flex-wrap justify-center gap-3">
                  {["Seat expansion", "Module upsells", "Partner referral fees", "Training & certification", "Premium integrations", "Professional services"].map((item) => (
                    <Badge key={item} variant="secondary" className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 text-sm">
                      {item}
                    </Badge>
                  ))}
                </div>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        {/* Traction */}
        <section id="traction" className="py-20 md:py-28 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <SectionHeading
                badge="Traction"
                title="Early Momentum & Validation"
                subtitle="Strong early signals from pilot customers, partnerships, and product development velocity."
              />

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
                <MetricCard value="500+" label="Platform Features Built" icon={Zap} color="blue" />
                <MetricCard value="15+" label="Active Pilot Organizations" icon={Building2} color="green" />
                <MetricCard value="3" label="Strategic Partnerships" icon={Users} color="purple" />
                <MetricCard value="12mo" label="Product Dev Velocity" icon={Rocket} color="orange" />
              </div>

              <div className="grid md:grid-cols-2 gap-8 mb-12">
                <motion.div variants={fadeUp}>
                  <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50 h-full">
                    <CardContent className="p-8">
                      <h4 className="font-bold text-slate-900 text-lg mb-4">What Pilot Users Say</h4>
                      <div className="space-y-4">
                        {[
                          { quote: "Finally, a PPM tool that doesn't feel like it was built in 2005. The AI assistant is a game-changer.", author: "PMO Director, Fortune 500 Manufacturer" },
                          { quote: "We replaced three tools with FridayReport. Our reporting time dropped by 70%.", author: "VP of Operations, Mid-Market Tech Company" },
                        ].map((t) => (
                          <div key={t.author} className="bg-white/80 rounded-lg p-4">
                            <p className="text-sm text-slate-700 italic mb-2">"{t.quote}"</p>
                            <p className="text-xs text-slate-500 font-medium">— {t.author}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div variants={fadeUp}>
                  <Card className="border-0 shadow-lg h-full bg-white">
                    <CardContent className="p-8">
                      <h4 className="font-bold text-slate-900 text-lg mb-4">Key Milestones</h4>
                      <div className="space-y-4">
                        {[
                          { date: "Q1 2025", event: "Product launch with full PPM suite" },
                          { date: "Q2 2025", event: "Friday Copilot AI released" },
                          { date: "Q3 2025", event: "Enterprise pilot program initiated" },
                          { date: "Q4 2025", event: "Partner program launched" },
                          { date: "Q1 2026", event: "MS Project & Planner integrations live" },
                          { date: "Q2 2026", event: "Series A fundraising" },
                        ].map((m) => (
                          <div key={m.date} className="flex gap-4 items-start">
                            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-[10px] min-w-[70px] justify-center flex-shrink-0">
                              {m.date}
                            </Badge>
                            <span className="text-sm text-slate-700">{m.event}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* Competitive Advantage */}
        <section id="competitive" className="py-20 md:py-28 bg-slate-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <SectionHeading
                badge="Competitive Edge"
                title="Why FridayReport.AI Wins"
                subtitle="We combine the depth of enterprise PPM with the simplicity of modern SaaS and the intelligence of AI."
              />

              <motion.div variants={fadeUp}>
                <Card className="border-0 shadow-xl bg-white overflow-hidden mb-12">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-900 text-white">
                            <th className="text-left p-4 font-semibold">Feature</th>
                            <th className="text-center p-4 font-semibold bg-blue-700">FridayReport.AI</th>
                            <th className="text-center p-4 font-semibold">MS Project Online</th>
                            <th className="text-center p-4 font-semibold">Monday.com</th>
                            <th className="text-center p-4 font-semibold">Smartsheet</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ["AI Copilot (NLP)", true, false, false, false],
                            ["Portfolio Management", true, true, false, true],
                            ["Gantt + CPM", true, true, false, false],
                            ["Risk Radar Visualization", true, false, false, false],
                            ["Built-in Timesheets", true, false, true, false],
                            ["Training Academy", true, false, false, false],
                            ["SSO (Microsoft + Google)", true, true, true, true],
                            ["Modern, Intuitive UI", true, false, true, true],
                            ["Affordable for Mid-Market", true, false, true, true],
                            ["Import MS Project Files", true, true, false, false],
                          ].map(([feature, ...values], i) => (
                            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                              <td className="p-4 font-medium text-slate-900">{feature as string}</td>
                              {(values as boolean[]).map((v, j) => (
                                <td key={j} className={`text-center p-4 ${j === 0 ? "bg-blue-50/50" : ""}`}>
                                  {v ? (
                                    <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                                  ) : (
                                    <X className="w-5 h-5 text-slate-300 mx-auto" />
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { icon: Brain, title: "AI-First Architecture", desc: "Friday Copilot is not a bolt-on chatbot. It's deeply integrated into every data layer, providing real insights that save hours daily." },
                  { icon: Layers, title: "Unified Platform", desc: "No more stitching together 5 tools. Projects, portfolios, risks, timesheets, and reporting — all in one place." },
                  { icon: Zap, title: "Rapid Innovation", desc: "500+ features shipped in 12 months. We move faster than legacy vendors and ship what customers actually need." },
                ].map((item) => (
                  <motion.div key={item.title} variants={fadeUp}>
                    <Card className="border-0 shadow-md bg-white h-full">
                      <CardContent className="p-6">
                        <item.icon className="w-8 h-8 text-blue-600 mb-4" />
                        <h4 className="font-semibold text-slate-900 mb-2">{item.title}</h4>
                        <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* GTM */}
        <section id="gtm" className="py-20 md:py-28 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <SectionHeading
                badge="Go-to-Market"
                title="Multi-Channel Growth Strategy"
                subtitle="Blending product-led growth with strategic partnerships and targeted enterprise sales."
              />

              <div className="grid md:grid-cols-3 gap-8">
                {[
                  {
                    icon: Rocket,
                    title: "Product-Led Growth",
                    items: ["Free trial with full feature access", "Self-serve onboarding with AI guidance", "In-app training academy drives adoption", "Viral features (shared dashboards, badges)"],
                  },
                  {
                    icon: Briefcase,
                    title: "Enterprise Sales",
                    items: ["Targeted outreach to PMOs and CIOs", "Enterprise pilot programs (POC)", "Industry-specific landing pages", "Conference and event presence"],
                  },
                  {
                    icon: Users,
                    title: "Partner Ecosystem",
                    items: ["PMO consulting firm partnerships", "Independent consultant network", "Trainer certification program", "Referral revenue sharing"],
                  },
                ].map((channel) => (
                  <motion.div key={channel.title} variants={fadeUp}>
                    <Card className="border-0 shadow-lg h-full bg-white hover:shadow-xl transition-shadow">
                      <CardContent className="p-8">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-5">
                          <channel.icon className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-4">{channel.title}</h3>
                        <ul className="space-y-3">
                          {channel.items.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                              <ArrowRight className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>

        {/* Team */}
        <section id="team" className="py-20 md:py-28 bg-slate-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <SectionHeading
                badge="Team"
                title="Built by Industry Veterans"
                subtitle="Our team combines deep enterprise PM expertise with modern engineering capability."
              />

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
                {[
                  { name: "Founder & CEO", role: "Product & Strategy", desc: "15+ years in enterprise project management. Former PMO leader at Fortune 500. PMP certified.", color: "from-blue-500 to-indigo-600" },
                  { name: "CTO", role: "Engineering", desc: "Full-stack architect with deep experience in SaaS platforms, AI/ML, and scalable cloud infrastructure.", color: "from-purple-500 to-indigo-600" },
                  { name: "Head of Growth", role: "Sales & Marketing", desc: "B2B SaaS growth leader. Experience scaling enterprise software from $0 to $10M ARR.", color: "from-emerald-500 to-teal-600" },
                ].map((member) => (
                  <motion.div key={member.name} variants={fadeUp}>
                    <Card className="border-0 shadow-lg bg-white h-full hover:shadow-xl transition-shadow">
                      <CardContent className="p-8 text-center">
                        <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${member.color} mx-auto mb-4 flex items-center justify-center`}>
                          <Users className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">{member.name}</h3>
                        <p className="text-sm text-blue-600 font-medium mb-3">{member.role}</p>
                        <p className="text-sm text-slate-500 leading-relaxed">{member.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              <motion.div variants={fadeUp} className="text-center">
                <h4 className="text-lg font-semibold text-slate-900 mb-4">Advisory Board</h4>
                <div className="flex flex-wrap justify-center gap-4">
                  {["Enterprise PPM Expert", "SaaS Growth Advisor", "AI/ML Strategist", "Industry Domain Expert"].map((advisor) => (
                    <div key={advisor} className="bg-white rounded-lg shadow-md px-6 py-4 border border-slate-100">
                      <p className="text-sm font-medium text-slate-700">{advisor}</p>
                      <p className="text-xs text-slate-400 mt-1">Placeholder</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        {/* Investment */}
        <section id="investment" className="py-20 md:py-28 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <motion.div variants={fadeUp} className="text-center mb-12">
                <Badge className="mb-4 bg-white/10 text-white/90 border-white/20 backdrop-blur px-3 py-1 text-xs tracking-wider uppercase">
                  Investment Opportunity
                </Badge>
                <h2 className="text-3xl md:text-4xl font-bold mb-3">Join Us in Redefining PPM</h2>
                <p className="text-lg text-blue-200/80 max-w-2xl mx-auto">
                  We're raising our next round to accelerate growth, expand the team, and capture the market.
                </p>
              </motion.div>

              <div className="grid md:grid-cols-2 gap-8 mb-12">
                <motion.div variants={fadeUp}>
                  <div className="bg-white/5 backdrop-blur rounded-2xl p-8 border border-white/10">
                    <h4 className="text-xl font-bold mb-6 text-white">The Ask</h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-white/10">
                        <span className="text-blue-200/80">Round</span>
                        <span className="font-semibold text-white">Seed / Series A</span>
                      </div>
                      <div className="flex items-center justify-between pb-3 border-b border-white/10">
                        <span className="text-blue-200/80">Target Raise</span>
                        <span className="font-semibold text-white">$[X]M</span>
                      </div>
                      <div className="flex items-center justify-between pb-3 border-b border-white/10">
                        <span className="text-blue-200/80">Valuation</span>
                        <span className="font-semibold text-white">To be discussed</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-blue-200/80">Timeline</span>
                        <span className="font-semibold text-white">Q2-Q3 2026</span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div variants={fadeUp}>
                  <div className="bg-white/5 backdrop-blur rounded-2xl p-8 border border-white/10">
                    <h4 className="text-xl font-bold mb-6 text-white">Use of Funds</h4>
                    <div className="space-y-4">
                      {[
                        { label: "Engineering & Product", pct: "45%", w: "45%" },
                        { label: "Sales & Marketing", pct: "25%", w: "25%" },
                        { label: "Customer Success", pct: "15%", w: "15%" },
                        { label: "Operations & G&A", pct: "15%", w: "15%" },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-blue-200/80">{item.label}</span>
                            <span className="text-sm font-semibold text-white">{item.pct}</span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-2">
                            <div className="bg-gradient-to-r from-blue-400 to-cyan-400 h-2 rounded-full transition-all" style={{ width: item.w }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>

              <motion.div variants={fadeUp}>
                <div className="bg-white/5 backdrop-blur rounded-2xl p-8 border border-white/10 mb-12">
                  <h4 className="text-xl font-bold mb-6 text-white text-center">Milestone Roadmap</h4>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                      { quarter: "Q2 2026", goal: "Close round, expand engineering team to 10+" },
                      { quarter: "Q3 2026", goal: "Launch enterprise tier, 50+ paying customers" },
                      { quarter: "Q4 2026", goal: "International expansion, marketplace integrations" },
                      { quarter: "Q1 2027", goal: "$1M ARR target, strategic partnership deals" },
                    ].map((m) => (
                      <div key={m.quarter} className="text-center">
                        <Badge className="mb-3 bg-blue-500/20 text-blue-300 border-blue-400/30 text-xs">
                          {m.quarter}
                        </Badge>
                        <p className="text-sm text-blue-100/80">{m.goal}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              <motion.div variants={fadeUp} className="text-center">
                <h4 className="text-xl font-bold mb-4">Ready to Learn More?</h4>
                <p className="text-blue-200/70 mb-6 max-w-lg mx-auto">
                  We'd love to walk you through a live demo and discuss how FridayReport.AI fits your investment thesis.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button
                    size="lg"
                    className="bg-white text-slate-900 hover:bg-blue-50 font-semibold px-8 h-12"
                    onClick={() => window.open("mailto:founder@fridayreport.ai?subject=Investor Meeting Request", "_blank")}
                  >
                    Schedule a Meeting <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-white/30 text-white hover:bg-white/10 font-semibold px-8 h-12"
                    onClick={() => window.open("mailto:founder@fridayreport.ai?subject=Request Data Room Access", "_blank")}
                  >
                    Request Data Room Access
                  </Button>
                </div>
              </motion.div>
            </AnimatedSection>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-slate-50 text-slate-700 py-12 border-t border-slate-200 print:hidden">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <img src={logoBlack} alt="FridayReport.AI" className="h-6 opacity-80" />
                <span className="text-xs text-slate-300">|</span>
                <span className="text-xs text-slate-500">
                  Last updated: {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-300 text-slate-700 hover:bg-slate-100 text-xs"
                onClick={() => window.open("mailto:founder@fridayreport.ai?subject=Investor Contact", "_blank")}
              >
                Contact Founder <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-200 text-center">
              <p className="text-xs text-slate-400 max-w-2xl mx-auto leading-relaxed">
                This document contains confidential and proprietary information of Friday Report LLC.
                It is intended solely for the use of invited investors and may not be reproduced, distributed,
                or disclosed to any third party without prior written consent. All projections and forward-looking
                statements are estimates and not guarantees of future performance.
              </p>
              <p className="text-xs text-slate-400 mt-3">&copy; {new Date().getFullYear()} Friday Report LLC. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>

      <style>{`
        @media print {
          nav, footer, .print\\:hidden { display: none !important; }
          section { break-inside: avoid; page-break-inside: avoid; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Email Investor Deck</DialogTitle>
            <DialogDescription>
              Enter the recipient's email. We'll generate the PDF and send it as an attachment.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleEmailPdf(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="investor-email">Email address</Label>
              <Input
                id="investor-email"
                type="email"
                placeholder="investor@example.com"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                disabled={emailSending}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEmailDialogOpen(false)} disabled={emailSending}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={emailSending || !emailAddress.includes("@") || emailSent}
                className="min-w-[120px]"
              >
                {emailSent ? (
                  <><CheckCircle className="w-4 h-4 mr-1" /> Sent!</>
                ) : emailSending ? (
                  <><span className="w-3.5 h-3.5 mr-1 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Sending...</>
                ) : (
                  <><Mail className="w-4 h-4 mr-1" /> Send PDF</>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function InvestorRoom() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  const isSuperAdmin = user?.role === "super_admin";

  useEffect(() => {
    if (authLoading) return;

    if (isSuperAdmin) {
      setAuthenticated(true);
      setChecking(false);
      return;
    }

    fetch("/api/investor/session", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setAuthenticated(data.authenticated);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [isSuperAdmin, authLoading]);

  const handleLogout = async () => {
    if (isSuperAdmin) {
      setLocation("/home");
      return;
    }
    await fetch("/api/investor/logout", { method: "POST", credentials: "include" });
    setAuthenticated(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return <PasswordGate onSuccess={() => setAuthenticated(true)} />;
  }

  return <InvestorDeck onLogout={handleLogout} isAdmin={isSuperAdmin} />;
}
