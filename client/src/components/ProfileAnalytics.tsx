import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Briefcase, ListChecks, CheckCircle2, AlertTriangle, Shield, Flag, Layers, Activity, Trophy, Award, Star, Crown, Flame, Zap, Rocket, Bug, ShieldCheck, Building2, Share2, Link2, Download, GraduationCap } from "lucide-react";
import { getTrainingBadges, setTrainingUserId } from "@/lib/trainingData";
import type { TrainingModule } from "@/lib/trainingData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ProfileAnalyticsData {
  stats: {
    projectsManaged: number;
    tasksOwned: number;
    tasksAssigned: number;
    tasksCompleted: number;
    issuesAssigned: number;
    risksAssigned: number;
    risksResolved: number;
    milestonesOwned: number;
    portfoliosManaged: number;
    totalLogins: number;
    totalApiRequests: number;
  };
  ranking: {
    score: number;
    tier: { name: string; minScore: number; icon: string };
    nextTier: { name: string; minScore: number; icon: string } | null;
    progressToNext: number;
    tiers: Array<{ name: string; minScore: number; icon: string }>;
  };
  badges: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    earned: boolean;
    threshold: number;
    current: number;
    category: string;
  }>;
  weeklyActivity: Array<{ week: string; count: number }>;
  featureUsage: Array<{ name: string; count: number }>;
  recentActions: Array<{ action: string; entityType: string | null; createdAt: string }>;
  memberSince: string;
}

const TIER_COLORS: Record<string, string> = {
  Beginner: "text-slate-500",
  Associate: "text-green-500",
  Professional: "text-blue-500",
  Senior: "text-purple-500",
  Expert: "text-amber-500",
  Master: "text-red-500",
};

const TIER_BG: Record<string, string> = {
  Beginner: "bg-slate-500/10 border-slate-500/30",
  Associate: "bg-green-500/10 border-green-500/30",
  Professional: "bg-blue-500/10 border-blue-500/30",
  Senior: "bg-purple-500/10 border-purple-500/30",
  Expert: "bg-amber-500/10 border-amber-500/30",
  Master: "bg-red-500/10 border-red-500/30",
};

const TIER_PROGRESS_COLOR: Record<string, string> = {
  Beginner: "[&>div]:bg-slate-500",
  Associate: "[&>div]:bg-green-500",
  Professional: "[&>div]:bg-blue-500",
  Senior: "[&>div]:bg-purple-500",
  Expert: "[&>div]:bg-amber-500",
  Master: "[&>div]:bg-red-500",
};

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#f97316", "#ec4899", "#6366f1"];

function getTierIcon(icon: string, className?: string) {
  const cls = className || "h-5 w-5";
  switch (icon) {
    case "seedling": return <span className={cls}>🌱</span>;
    case "leaf": return <span className={cls}>🌿</span>;
    case "star": return <Star className={cls} />;
    case "award": return <Award className={cls} />;
    case "trophy": return <Trophy className={cls} />;
    case "crown": return <Crown className={cls} />;
    default: return <Star className={cls} />;
  }
}

function getBadgeIcon(icon: string, className?: string) {
  const cls = className || "h-5 w-5";
  switch (icon) {
    case "rocket": return <Rocket className={cls} />;
    case "briefcase": return <Briefcase className={cls} />;
    case "building": return <Building2 className={cls} />;
    case "list-checks": return <ListChecks className={cls} />;
    case "check-circle": return <CheckCircle2 className={cls} />;
    case "zap": return <Zap className={cls} />;
    case "shield": return <Shield className={cls} />;
    case "shield-check": return <ShieldCheck className={cls} />;
    case "bug": return <Bug className={cls} />;
    case "flag": return <Flag className={cls} />;
    case "activity": return <Activity className={cls} />;
    case "flame": return <Flame className={cls} />;
    case "layers": return <Layers className={cls} />;
    default: return <Award className={cls} />;
  }
}

function FridayReportBranding({ size = "sm" }: { size?: "sm" | "md" }) {
  const iconSize = size === "md" ? "h-6 w-6" : "h-4 w-4";
  const textSize = size === "md" ? "text-sm" : "text-[10px]";
  return (
    <div className="flex items-center gap-1">
      <img src="/logo-icon.png" alt="FridayReport.AI" className={cn(iconSize, "shrink-0")} />
      <span className={cn("font-semibold text-muted-foreground", textSize)}>FridayReport.AI</span>
    </div>
  );
}

export default function ProfileAnalytics() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<ProfileAnalyticsData>({
    queryKey: [`/api/users/${user?.id}/profile-analytics`],
    enabled: !!user?.id,
  });

  const profileUrl = `https://fridayreport.ai/badges/${user?.id}`;

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(profileUrl);
    toast({ title: "Link copied!", description: "Your public profile link has been copied to clipboard." });
  }, [profileUrl, toast]);

  const handleShareLinkedIn = useCallback(() => {
    const url = encodeURIComponent(profileUrl);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank', 'noopener,noreferrer,width=600,height=500');
  }, [profileUrl]);

  const handleShareTwitter = useCallback(() => {
    const url = encodeURIComponent(profileUrl);
    const text = encodeURIComponent(`Check out my PM profile and achievements on FridayReport.AI! #ProjectManagement #PMO`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener,noreferrer,width=600,height=500');
  }, [profileUrl]);

  const handleShareTeams = useCallback(() => {
    const url = encodeURIComponent(profileUrl);
    const text = encodeURIComponent(`Check out my PM profile and achievements on FridayReport.AI!`);
    window.open(`https://teams.microsoft.com/share?href=${url}&msgText=${text}`, '_blank', 'noopener,noreferrer,width=600,height=500');
  }, [profileUrl]);

  const generateBadgeCanvas = useCallback(async (badgeName: string, badgeIcon: string, badgeDescription: string, current: number, threshold: number): Promise<string> => {
    const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Project Manager";
    const w = 480;
    const h = 560;
    const dpr = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const drawRoundRect = (x: number, y: number, rw: number, rh: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + rw - r, y);
      ctx.quadraticCurveTo(x + rw, y, x + rw, y + r);
      ctx.lineTo(x + rw, y + rh - r);
      ctx.quadraticCurveTo(x + rw, y + rh, x + rw - r, y + rh);
      ctx.lineTo(x + r, y + rh);
      ctx.quadraticCurveTo(x, y + rh, x, y + rh - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    const truncateText = (text: string, maxWidth: number): string => {
      if (ctx.measureText(text).width <= maxWidth) return text;
      let truncated = text;
      while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
        truncated = truncated.slice(0, -1);
      }
      return truncated + '...';
    };

    ctx.fillStyle = '#f8f9fb';
    ctx.fillRect(0, 0, w, h);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ffffff';
    drawRoundRect(24, 20, w - 48, h - 40, 20);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    drawRoundRect(24, 20, w - 48, h - 40, 20);
    ctx.stroke();

    ctx.save();
    drawRoundRect(24, 20, w - 48, h - 40, 20);
    ctx.clip();

    const badgeEmojiMap: Record<string, string> = {
      rocket: '\u{1F680}', briefcase: '\u{1F4BC}', building: '\u{1F3E2}',
      'list-checks': '\u2705', 'check-circle': '\u2714\uFE0F', zap: '\u26A1',
      shield: '\u{1F6E1}\uFE0F', 'shield-check': '\u{1F6E1}\uFE0F', bug: '\u{1F41B}',
      flag: '\u{1F3C1}', activity: '\u{1F4C8}', flame: '\u{1F525}', layers: '\u{1F4DA}',
    };

    const cx = w / 2;

    ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
    ctx.beginPath(); ctx.arc(cx, 130, 52, 0, Math.PI * 2); ctx.fill();
    ctx.font = '48px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText(badgeEmojiMap[badgeIcon] || '\u{1F3C6}', cx, 130);

    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText(truncateText(badgeName, w - 100), cx, 214);

    ctx.font = '15px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(truncateText(badgeDescription, w - 100), cx, 244);

    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`${current}/${threshold}`, cx, 290);

    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(80, 316); ctx.lineTo(w - 80, 316); ctx.stroke();

    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Earned by', cx, 346);

    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText(truncateText(displayName, w - 100), cx, 376);

    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(80, 410); ctx.lineTo(w - 80, 410); ctx.stroke();

    let fullLogoLoaded = false;
    const fullLogoImg = new Image();
    fullLogoImg.crossOrigin = 'anonymous';
    try {
      await new Promise<void>((resolve) => {
        fullLogoImg.onload = () => { fullLogoLoaded = true; resolve(); };
        fullLogoImg.onerror = () => resolve();
        fullLogoImg.src = '/logo-full.png';
      });
    } catch {}

    if (fullLogoLoaded && fullLogoImg.complete && fullLogoImg.naturalWidth > 0) {
      const logoH = 22;
      const logoW = (fullLogoImg.naturalWidth / fullLogoImg.naturalHeight) * logoH;
      ctx.drawImage(fullLogoImg, cx - logoW / 2, 434, logoW, logoH);
    } else {
      let iconLoaded = false;
      try {
        const iconImg = new Image();
        iconImg.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          iconImg.onload = () => { iconLoaded = true; resolve(); };
          iconImg.onerror = () => resolve();
          iconImg.src = '/logo-icon.png';
        });
        if (iconLoaded && iconImg.complete && iconImg.naturalWidth > 0) {
          ctx.drawImage(iconImg, cx - 68, 430, 24, 24);
          ctx.font = '700 14px system-ui, -apple-system, sans-serif';
          ctx.fillStyle = '#17255A';
          ctx.textAlign = 'left';
          ctx.fillText('FridayReport.AI', cx - 38, 448);
          ctx.textAlign = 'center';
        } else {
          ctx.font = '700 14px system-ui, -apple-system, sans-serif';
          ctx.fillStyle = '#17255A';
          ctx.fillText('FridayReport.AI', cx, 448);
        }
      } catch {
        ctx.font = '700 14px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#17255A';
        ctx.fillText('FridayReport.AI', cx, 448);
      }
    }

    ctx.restore();
    return canvas.toDataURL('image/png');
  }, [user]);

  const handleDownloadBadge = useCallback(async (badgeId: string, badgeName: string, badgeIcon: string, badgeDescription: string, current: number, threshold: number) => {
    try {
      const dataUrl = await generateBadgeCanvas(badgeName, badgeIcon, badgeDescription, current, threshold);
      const link = document.createElement('a');
      link.download = `FridayReport-Badge-${badgeName.replace(/\s+/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Badge downloaded!", description: `${badgeName} badge saved as PNG.` });
    } catch {
      toast({ title: "Error", description: "Failed to download badge image.", variant: "destructive" });
    }
  }, [toast, generateBadgeCanvas]);

  const getBadgeShareUrls = useCallback((badgeId: string, badgeName: string, badgeDescription: string) => {
    const badgeUrl = `${window.location.origin}/badges/${user?.id}/${badgeId}`;
    const shareText = `I just earned the "${badgeName}" badge on FridayReport.AI! ${badgeDescription} #ProjectManagement #PMO #FridayReportAI`;
    return {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(badgeUrl)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(badgeUrl)}`,
      teams: `https://teams.microsoft.com/share?href=${encodeURIComponent(badgeUrl)}&msgText=${encodeURIComponent(shareText)}`,
    };
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Failed to load analytics data.
      </div>
    );
  }

  const { stats, ranking, badges, weeklyActivity, featureUsage } = data;
  const earnedBadges = badges.filter(b => b.earned);
  const lockedBadges = badges.filter(b => !b.earned);

  const statCards = [
    { label: "Projects Managed", value: stats.projectsManaged, icon: Briefcase, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Tasks Owned", value: stats.tasksOwned, icon: ListChecks, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Tasks Completed", value: stats.tasksCompleted, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "Issues Assigned", value: stats.issuesAssigned, icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Risks Managed", value: stats.risksAssigned, icon: Shield, color: "text-red-500", bg: "bg-red-500/10" },
    { label: "Milestones Owned", value: stats.milestonesOwned, icon: Flag, color: "text-cyan-500", bg: "bg-cyan-500/10" },
    { label: "Portfolios", value: stats.portfoliosManaged, icon: Layers, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { label: "Sessions", value: stats.totalLogins, icon: Activity, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  const chartData = weeklyActivity.map(w => ({
    week: new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    actions: w.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Analytics</h2>
          <p className="text-sm text-muted-foreground">Your professional engagement and performance overview</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Share2 className="h-4 w-4 mr-2" />
              Share Profile
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopyLink}>
              <Link2 className="h-4 w-4 mr-2" />
              Copy Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShareLinkedIn}>
              <svg className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#0A66C2"/><path d="M7.5 10v7M7.5 7v.01M10.5 17v-4a2 2 0 014 0v4M10.5 10v7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Share on LinkedIn
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShareTwitter}>
              <svg className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#000"/><path d="M16.99 3.75h2.7l-5.9 6.74 6.94 9.18h-5.44l-4.26-5.57-4.87 5.57H3.35l6.31-7.21L3.08 3.75h5.58l3.85 5.09zm-.95 14.31h1.5L8.14 5.29H6.52z" fill="#fff"/></svg>
              Share on X (Twitter)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShareTeams}>
              <svg className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#5059C9"/><circle cx="18" cy="6.5" r="2" fill="#7B83EB"/><path d="M20 9.5h-3.5a.5.5 0 00-.5.5v4.5a2.25 2.25 0 004.5 0V10a.5.5 0 00-.5-.5z" fill="#7B83EB"/><circle cx="12.5" cy="6" r="2.5" fill="#fff"/><path d="M16 9.5H9a.5.5 0 00-.5.5v5a3.25 3.25 0 006.5 0v-5a1 1 0 00-1-1H16z" fill="#fff"/><rect x="3" y="5.5" width="9" height="9" rx="1" fill="#5059C9"/><rect x="3" y="5.5" width="9" height="9" rx="1" fill="white" fillOpacity="0.3"/><path d="M5.5 8.5h4M7.5 8.5V13" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/></svg>
              Share on Teams
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className={cn("border-2", TIER_BG[ranking.tier.name] || "")}>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex flex-col items-center text-center">
              <div className={cn("text-5xl mb-2", TIER_COLORS[ranking.tier.name])}>
                {getTierIcon(ranking.tier.icon, "h-12 w-12")}
              </div>
              <h3 className={cn("text-2xl font-bold", TIER_COLORS[ranking.tier.name])}>
                {ranking.tier.name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">Professional Rank</p>
              <FridayReportBranding size="sm" />
            </div>
            <div className="flex-1 w-full space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Engagement Score</span>
                <span className={cn("text-2xl font-bold", TIER_COLORS[ranking.tier.name])}>{ranking.score}</span>
              </div>
              {ranking.nextTier ? (
                <div className="space-y-2">
                  <Progress value={ranking.progressToNext} className={cn("h-3", TIER_PROGRESS_COLOR[ranking.tier.name])} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{ranking.tier.name} ({ranking.tier.minScore})</span>
                    <span>{ranking.nextTier.name} ({ranking.nextTier.minScore})</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Progress value={100} className={cn("h-3", TIER_PROGRESS_COLOR[ranking.tier.name])} />
                  <p className="text-xs text-muted-foreground text-center">Maximum rank achieved!</p>
                </div>
              )}
              <div className="flex gap-1 justify-center">
                {ranking.tiers.map((tier, i) => (
                  <div
                    key={tier.name}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-full text-xs border",
                      ranking.score >= tier.minScore
                        ? cn(TIER_BG[tier.name], TIER_COLORS[tier.name], "font-medium")
                        : "bg-muted/30 text-muted-foreground/50 border-transparent"
                    )}
                    title={`${tier.name}: ${tier.minScore}+ points`}
                  >
                    {getTierIcon(tier.icon, "h-3 w-3")}
                    <span className="hidden lg:inline">{tier.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map(card => (
          <Card key={card.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", card.bg)}>
                  <card.icon className={cn("h-4 w-4", card.color)} />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Activity Over Time</CardTitle>
            <CardDescription className="text-xs">Weekly actions (last 12 weeks)</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <RechartsTooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Bar dataKey="actions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                No activity data yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Feature Usage</CardTitle>
            <CardDescription className="text-xs">Most used features (last 30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            {featureUsage.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="w-full sm:w-1/2 h-[180px] sm:h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={featureUsage.slice(0, 8)}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        innerRadius={35}
                      >
                        {featureUsage.slice(0, 8).map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full sm:flex-1 space-y-1.5">
                  {featureUsage.slice(0, 8).map((f, i) => (
                    <div key={f.name} className="flex items-center gap-2 text-xs">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="truncate text-muted-foreground">{f.name}</span>
                      <span className="ml-auto font-medium">{f.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                No feature usage data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                Badges ({earnedBadges.length}/{badges.length})
              </CardTitle>
              <CardDescription className="text-xs">Earn badges by reaching professional milestones</CardDescription>
            </div>
            <FridayReportBranding size="md" />
          </div>
        </CardHeader>
        <CardContent>
          {earnedBadges.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Earned</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {earnedBadges.map(badge => (
                  <div
                    key={badge.id}
                    className="flex flex-col items-center text-center p-3 rounded-lg border-2 border-amber-500/30 bg-amber-500/5 relative group"
                  >
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1 rounded hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600"
                            title="Share badge"
                          >
                            <Share2 className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => handleDownloadBadge(badge.id, badge.name, badge.icon, badge.description, badge.current, badge.threshold)}>
                            <Download className="h-3.5 w-3.5 mr-2" />
                            Download PNG
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={getBadgeShareUrls(badge.id, badge.name, badge.description).linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center">
                              <svg className="h-3.5 w-3.5 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#0A66C2"/><path d="M7.5 10v7M7.5 7v.01M10.5 17v-4a2 2 0 014 0v4M10.5 10v7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              LinkedIn
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={getBadgeShareUrls(badge.id, badge.name, badge.description).twitter} target="_blank" rel="noopener noreferrer" className="flex items-center">
                              <svg className="h-3.5 w-3.5 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#000"/><path d="M16.99 3.75h2.7l-5.9 6.74 6.94 9.18h-5.44l-4.26-5.57-4.87 5.57H3.35l6.31-7.21L3.08 3.75h5.58l3.85 5.09zm-.95 14.31h1.5L8.14 5.29H6.52z" fill="#fff"/></svg>
                              X (Twitter)
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={getBadgeShareUrls(badge.id, badge.name, badge.description).teams} target="_blank" rel="noopener noreferrer" className="flex items-center">
                              <svg className="h-3.5 w-3.5 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#5059C9"/><circle cx="18" cy="6.5" r="2" fill="#7B83EB"/><path d="M20 9.5h-3.5a.5.5 0 00-.5.5v4.5a2.25 2.25 0 004.5 0V10a.5.5 0 00-.5-.5z" fill="#7B83EB"/><circle cx="12.5" cy="6" r="2.5" fill="#fff"/><path d="M16 9.5H9a.5.5 0 00-.5.5v5a3.25 3.25 0 006.5 0v-5a1 1 0 00-1-1H16z" fill="#fff"/></svg>
                              Teams
                            </a>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="text-amber-500 mb-1">
                      {getBadgeIcon(badge.icon, "h-7 w-7")}
                    </div>
                    <p className="text-xs font-semibold">{badge.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{badge.description}</p>
                    <Badge variant="secondary" className="mt-1.5 text-[10px] px-1.5 py-0">
                      {badge.current}/{badge.threshold}
                    </Badge>
                    <div className="mt-1.5">
                      <FridayReportBranding size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {lockedBadges.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Locked</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {lockedBadges.map(badge => (
                  <div
                    key={badge.id}
                    className="flex flex-col items-center text-center p-3 rounded-lg border border-dashed border-muted-foreground/20 opacity-60"
                  >
                    <div className="text-muted-foreground/40 mb-1">
                      {getBadgeIcon(badge.icon, "h-7 w-7")}
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">{badge.name}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{badge.description}</p>
                    <div className="mt-1.5 w-full">
                      <Progress value={(badge.current / badge.threshold) * 100} className="h-1.5" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{badge.current}/{badge.threshold}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <TrainingCertificationsCard />
    </div>
  );
}

function CertShareButtons({ badgeName, userName }: { badgeName: string; userName: string }) {
  const { toast } = useToast();
  const shareText = `I just earned my ${badgeName} certification from Friday Academy on FridayReport.AI! #FridayAcademy #ProjectManagement #PPM`;
  const shareUrl = typeof window !== "undefined" ? window.location.origin + "/training" : "";

  const handleLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(`${badgeName} Certification - Friday Academy`)}&summary=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
  };

  const handleTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    toast({ title: "Copied to clipboard", description: "Certification details copied — ready to share!" });
  };

  return (
    <div className="flex items-center gap-1 mt-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full hover:bg-[#0A66C2]/10 hover:text-[#0A66C2]"
              onClick={handleLinkedIn}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p className="text-xs">Share on LinkedIn</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full hover:bg-black/10 hover:text-black dark:hover:bg-white/10 dark:hover:text-white"
              onClick={handleTwitter}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p className="text-xs">Share on X</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full hover:bg-primary/10"
              onClick={handleCopyLink}
            >
              <Link2 className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p className="text-xs">Copy to clipboard</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function TrainingCertificationsCard() {
  const { user } = useAuth();
  setTrainingUserId(user?.id ?? null);

  const { data: apiModules } = useQuery<TrainingModule[]>({
    queryKey: ['/api/training/modules'],
    staleTime: 60000,
  });

  const modules = apiModules || [];
  if (modules.length === 0) return null;

  const badges = getTrainingBadges(modules);
  const earned = badges.filter((b) => b.earned);
  const locked = badges.filter((b) => !b.earned);
  const userName = user?.username || user?.email || "User";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Training Certifications ({earned.length}/{badges.length})
            </CardTitle>
            <CardDescription className="text-xs">Earn certifications by completing Friday Academy training modules</CardDescription>
          </div>
          <FridayReportBranding size="md" />
        </div>
      </CardHeader>
      <CardContent>
        {earned.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Certified</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {earned.map((badge) => (
                <div
                  key={badge.moduleId}
                  className="flex flex-col items-center text-center p-3 rounded-lg border-2 border-primary/30 bg-primary/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold mb-1">
                    {badge.certPrefix}
                  </div>
                  <p className="text-xs font-semibold">{badge.moduleName}</p>
                  <Badge variant="secondary" className="mt-1.5 text-[10px] px-1.5 py-0 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
                    <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Certified
                  </Badge>
                  <CertShareButtons badgeName={badge.moduleName} userName={userName} />
                  <div className="mt-1">
                    <FridayReportBranding size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {locked.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">In Progress</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {locked.map((badge) => (
                <div
                  key={badge.moduleId}
                  className="flex flex-col items-center text-center p-3 rounded-lg border border-dashed border-muted-foreground/20 opacity-60"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-bold mb-1">
                    {badge.certPrefix}
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">{badge.moduleName}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Complete all lessons to earn</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
