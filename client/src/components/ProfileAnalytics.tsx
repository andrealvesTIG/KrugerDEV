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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCallback } from "react";

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
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank', 'width=600,height=500');
  }, [profileUrl]);

  const handleShareTwitter = useCallback(() => {
    const url = encodeURIComponent(profileUrl);
    const text = encodeURIComponent(`Check out my PM profile and achievements on FridayReport.AI! #ProjectManagement #PMO`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=600,height=500');
  }, [profileUrl]);

  const handleShareTeams = useCallback(() => {
    const url = encodeURIComponent(profileUrl);
    const text = encodeURIComponent(`Check out my PM profile and achievements on FridayReport.AI!`);
    window.open(`https://teams.microsoft.com/share?href=${url}&msgText=${text}`, '_blank', 'width=600,height=500');
  }, [profileUrl]);

  const handleDownloadBadge = useCallback(async (badgeId: string, badgeName: string, badgeIcon: string, badgeDescription: string) => {
    const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Project Manager";
    try {
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:400px;padding:32px;background:#ffffff;font-family:system-ui,-apple-system,sans-serif;border-radius:16px;border:2px solid #f59e0b30;';

      const logoRow = document.createElement('div');
      logoRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:20px;';
      logoRow.innerHTML = `<img src="/logo-icon.png" style="width:20px;height:20px;" /><span style="font-size:12px;color:#6b7280;">FridayReport.AI</span>`;
      container.appendChild(logoRow);

      const badgeEmojiMap: Record<string, string> = {
        rocket: '\u{1F680}', briefcase: '\u{1F4BC}', building: '\u{1F3E2}',
        'list-checks': '\u2705', 'check-circle': '\u2714\uFE0F', zap: '\u26A1',
        shield: '\u{1F6E1}\uFE0F', 'shield-check': '\u{1F6E1}\uFE0F', bug: '\u{1F41B}',
        flag: '\u{1F3C1}', activity: '\u{1F4C8}', flame: '\u{1F525}', layers: '\u{1F4DA}',
      };
      const iconDiv = document.createElement('div');
      iconDiv.style.cssText = 'text-align:center;margin-bottom:12px;font-size:40px;';
      iconDiv.textContent = badgeEmojiMap[badgeIcon] || '\u{1F3C6}';
      container.appendChild(iconDiv);

      const nameDiv = document.createElement('div');
      nameDiv.style.cssText = 'text-align:center;font-size:18px;font-weight:700;color:#1f2937;margin-bottom:4px;';
      nameDiv.textContent = badgeName;
      container.appendChild(nameDiv);

      const descDiv = document.createElement('div');
      descDiv.style.cssText = 'text-align:center;font-size:13px;color:#6b7280;margin-bottom:16px;';
      descDiv.textContent = badgeDescription;
      container.appendChild(descDiv);

      const separator = document.createElement('div');
      separator.style.cssText = 'height:1px;background:#e5e7eb;margin-bottom:12px;';
      container.appendChild(separator);

      const userDiv = document.createElement('div');
      userDiv.style.cssText = 'text-align:center;font-size:14px;color:#374151;';
      userDiv.innerHTML = `Earned by <strong>${displayName}</strong>`;
      container.appendChild(userDiv);

      document.body.appendChild(container);
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(container, { pixelRatio: 2, backgroundColor: '#ffffff' });
      document.body.removeChild(container);

      const link = document.createElement('a');
      link.download = `FridayReport-Badge-${badgeName.replace(/\s+/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Badge downloaded!", description: `${badgeName} badge saved as PNG.` });
    } catch {
      toast({ title: "Error", description: "Failed to download badge image.", variant: "destructive" });
    }
  }, [toast, user]);

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics</h2>
          <p className="text-muted-foreground">Your professional engagement and performance overview</p>
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
                  <Tooltip
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
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie
                      data={featureUsage.slice(0, 8)}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                    >
                      {featureUsage.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
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
                      <button
                        onClick={() => handleDownloadBadge(badge.id, badge.name, badge.icon, badge.description)}
                        className="p-1 rounded hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600"
                        title="Download badge as PNG"
                      >
                        <Download className="h-3 w-3" />
                      </button>
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
                  <div className="mt-1.5">
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
