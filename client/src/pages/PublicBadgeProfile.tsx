import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Briefcase, ListChecks, CheckCircle2, AlertTriangle, Shield, Flag, Layers, Activity, Trophy, Award, Star, Crown, Flame, Zap, Rocket, Bug, ShieldCheck, Building2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface PublicProfileData {
  displayName: string;
  jobTitle: string | null;
  memberSince: string;
  stats: {
    projectsManaged: number;
    tasksCompleted: number;
    risksManaged: number;
    issuesHandled: number;
    milestonesOwned: number;
    portfoliosManaged: number;
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
    category: string;
  }>;
  totalBadges: number;
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

export default function PublicBadgeProfile() {
  const params = useParams<{ userId: string; badgeId?: string }>();
  const highlightRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery<PublicProfileData>({
    queryKey: [`/api/users/${params.userId}/public-profile`],
    enabled: !!params.userId,
  });

  useEffect(() => {
    if (data) {
      const highlightedBadge = params.badgeId ? data.badges.find(b => b.id === params.badgeId) : null;
      document.title = highlightedBadge
        ? `${data.displayName} earned ${highlightedBadge.name} | FridayReport.AI`
        : `${data.displayName} - PM Profile | FridayReport.AI`;
    }
  }, [data, params.badgeId]);

  useEffect(() => {
    if (data && params.badgeId && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [data, params.badgeId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted/30">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Profile not found or unavailable.</p>
            <a href="/" className="text-primary hover:underline text-sm mt-2 inline-block">Go to FridayReport.AI</a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { ranking, badges, stats, totalBadges } = data;

  const statCards = [
    { label: "Projects Managed", value: stats.projectsManaged, icon: Briefcase, color: "text-blue-500" },
    { label: "Tasks Completed", value: stats.tasksCompleted, icon: CheckCircle2, color: "text-green-500" },
    { label: "Risks Managed", value: stats.risksManaged, icon: Shield, color: "text-red-500" },
    { label: "Issues Handled", value: stats.issuesHandled, icon: AlertTriangle, color: "text-amber-500" },
    { label: "Key Dates", value: stats.milestonesOwned, icon: Flag, color: "text-cyan-500" },
    { label: "Portfolios", value: stats.portfoliosManaged, icon: Layers, color: "text-indigo-500" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <a href="/" className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity">
            <div className="flex items-center gap-1.5">
              <img src="/logo-icon.png" alt="FridayReport.AI" className="h-7 w-7" />
              <span className="font-bold text-lg">FridayReport.AI</span>
            </div>
          </a>
          <a href="/auth" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
            Join <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <Card className={cn("border-2 mb-6", TIER_BG[ranking.tier.name] || "")}>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex flex-col items-center text-center">
                <div className={cn("text-5xl mb-2", TIER_COLORS[ranking.tier.name])}>
                  {getTierIcon(ranking.tier.icon, "h-14 w-14")}
                </div>
                <h1 className="text-2xl font-bold">{data.displayName}</h1>
                {data.jobTitle && (
                  <p className="text-sm text-muted-foreground">{data.jobTitle}</p>
                )}
                <Badge className={cn("mt-2", TIER_BG[ranking.tier.name], TIER_COLORS[ranking.tier.name])} variant="outline">
                  {ranking.tier.name} Rank
                </Badge>
                <div className="flex items-center gap-1 mt-2">
                  <img src="/logo-icon.png" alt="FridayReport.AI" className="h-4 w-4 shrink-0" />
                  <span className="text-[10px] font-semibold text-muted-foreground">FridayReport.AI</span>
                </div>
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
                  {ranking.tiers.map((tier) => (
                    <div
                      key={tier.name}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-full text-xs border",
                        ranking.score >= tier.minScore
                          ? cn(TIER_BG[tier.name], TIER_COLORS[tier.name], "font-medium")
                          : "bg-muted/30 text-muted-foreground/50 border-transparent"
                      )}
                    >
                      {getTierIcon(tier.icon, "h-3 w-3")}
                      <span className="hidden sm:inline">{tier.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {statCards.map(card => (
            <Card key={card.label}>
              <CardContent className="pt-4 pb-3 px-4 text-center">
                <card.icon className={cn("h-5 w-5 mx-auto mb-1", card.color)} />
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold">Badges Earned ({badges.length}/{totalBadges})</h2>
              <div className="ml-auto">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <img src="/logo-icon.png" alt="FridayReport.AI" className="h-5 w-5" />
                  <span>FridayReport.AI</span>
                </div>
              </div>
            </div>
            {badges.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {badges.map(badge => (
                  <div
                    key={badge.id}
                    ref={params.badgeId === badge.id ? highlightRef : undefined}
                    className={cn(
                      "flex flex-col items-center text-center p-3 rounded-lg border-2 relative transition-all duration-500",
                      params.badgeId === badge.id
                        ? "border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/40 shadow-lg shadow-amber-500/20"
                        : "border-amber-500/30 bg-amber-500/5"
                    )}
                  >
                    <div className="text-amber-500 mb-1">
                      {getBadgeIcon(badge.icon, "h-7 w-7")}
                    </div>
                    <p className="text-xs font-semibold">{badge.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{badge.description}</p>
                    <Badge variant="secondary" className="mt-1 text-[9px] px-1 py-0">
                      {badge.category}
                    </Badge>
                    <div className="flex items-center gap-0.5 mt-1.5">
                      <img src="/logo-icon.png" alt="FridayReport.AI" className="h-3 w-3 shrink-0" />
                      <span className="text-[8px] text-muted-foreground">FridayReport.AI</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No badges earned yet. Start managing projects to earn achievements!</p>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-8 space-y-2">
          <p className="text-xs text-muted-foreground">
            {data.memberSince && `Member since ${new Date(data.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Powered by{" "}
            <a href="/" className="text-primary hover:underline font-medium">FridayReport.AI</a>
            {" "}- Project Portfolio Management
          </p>
        </div>
      </div>
    </div>
  );
}
