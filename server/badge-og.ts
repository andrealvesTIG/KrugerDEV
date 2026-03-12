import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq, and, sql } from "drizzle-orm";
import { projects, tasks, issues, milestones, portfolios, taskResourceAssignments, resources } from "@shared/schema";
import sharp from "sharp";
import path from "path";
import fs from "fs";

const TIERS = [
  { name: "Beginner", minScore: 0 },
  { name: "Associate", minScore: 50 },
  { name: "Professional", minScore: 150 },
  { name: "Senior", minScore: 400 },
  { name: "Expert", minScore: 800 },
  { name: "Master", minScore: 1500 },
];

export interface BadgeOgData {
  displayName: string;
  jobTitle: string | null;
  tierName: string;
  score: number;
  badgeCount: number;
  totalBadges: number;
}

export async function getBadgeOgData(userId: string): Promise<BadgeOgData | null> {
  const [user] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      jobTitle: users.jobTitle,
      publicProfileEnabled: users.publicProfileEnabled,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.publicProfileEnabled) return null;

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Project Manager";

  const { apiRequestLogs } = await import("@shared/schema");

  const [pm] = await db.select({ count: sql<number>`count(*)::int` }).from(projects)
    .where(and(sql`(${projects.managerId} = ${userId} OR ${projects.businessOwnerId} = ${userId} OR ${projects.businessSponsorId} = ${userId} OR ${projects.technicalLeadId} = ${userId})`, sql`${projects.deletedAt} IS NULL`));
  const [tc] = await db.select({ count: sql<number>`count(DISTINCT ${tasks.id})::int` }).from(tasks)
    .leftJoin(taskResourceAssignments, eq(taskResourceAssignments.taskId, tasks.id))
    .leftJoin(resources, eq(resources.id, taskResourceAssignments.resourceId))
    .where(and(sql`(${tasks.ownerId} = ${userId} OR ${resources.userId} = ${userId})`, eq(tasks.status, 'Completed'), sql`${tasks.deletedAt} IS NULL`));
  const [ia] = await db.select({ count: sql<number>`count(*)::int` }).from(issues)
    .where(and(sql`(${issues.assigneeId} = ${userId} OR ${issues.ownerId} = ${userId})`, eq(issues.itemType, 'issue'), sql`${issues.deletedAt} IS NULL`));
  const [ra] = await db.select({ count: sql<number>`count(*)::int` }).from(issues)
    .where(and(sql`(${issues.assigneeId} = ${userId} OR ${issues.ownerId} = ${userId})`, eq(issues.itemType, 'risk'), sql`${issues.deletedAt} IS NULL`));
  const [mo] = await db.select({ count: sql<number>`count(*)::int` }).from(milestones)
    .where(and(eq(milestones.ownerId, userId), sql`${milestones.deletedAt} IS NULL`));
  const [po] = await db.select({ count: sql<number>`count(*)::int` }).from(portfolios)
    .where(and(sql`(${portfolios.managerId} = ${userId} OR ${portfolios.businessOwnerId} = ${userId})`, sql`${portfolios.deletedAt} IS NULL`));
  const [tl] = await db.select({ count: sql<number>`count(*)::int` }).from(apiRequestLogs)
    .where(and(eq(apiRequestLogs.userId, userId), sql`${apiRequestLogs.path} = '/api/auth/user'`, sql`${apiRequestLogs.method} = 'GET'`));

  const score = (pm.count * 20) + (tc.count * 5) + (ia.count * 8) + (ra.count * 10) + (mo.count * 15) + (po.count * 25) + Math.min(tl.count, 500) * 0.1;
  const currentTier = [...TIERS].reverse().find(t => score >= t.minScore) || TIERS[0];

  const BADGE_DEFS = [
    { id: "first-project", threshold: 1, val: pm.count },
    { id: "portfolio-builder", threshold: 3, val: pm.count },
    { id: "enterprise-leader", threshold: 10, val: pm.count },
    { id: "task-starter", threshold: 10, val: tc.count },
    { id: "task-master", threshold: 50, val: tc.count },
    { id: "task-ninja", threshold: 100, val: tc.count },
    { id: "risk-spotter", threshold: 5, val: ra.count },
    { id: "risk-guardian", threshold: 20, val: ra.count },
    { id: "bug-hunter", threshold: 5, val: ia.count },
    { id: "milestone-setter", threshold: 3, val: mo.count },
    { id: "power-user", threshold: 100, val: tl.count },
    { id: "dedicated", threshold: 500, val: tl.count },
    { id: "portfolio-strategist", threshold: 2, val: po.count },
  ];
  const badgeCount = BADGE_DEFS.filter(b => b.val >= b.threshold).length;

  return {
    displayName,
    jobTitle: user.jobTitle || null,
    tierName: currentTier.name,
    score: Math.round(score),
    badgeCount,
    totalBadges: BADGE_DEFS.length,
  };
}

export async function generateBadgeOgImage(data: BadgeOgData): Promise<Buffer> {
  const tierColors: Record<string, string> = {
    Beginner: "#6b7280", Associate: "#22c55e", Professional: "#3b82f6",
    Senior: "#8b5cf6", Expert: "#f59e0b", Master: "#ef4444",
  };
  const tierColor = tierColors[data.tierName] || "#3b82f6";

  let logoB64 = "";
  try {
    const logoPath = path.resolve(process.cwd(), "client", "public", "logo-icon.png");
    if (fs.existsSync(logoPath)) {
      const resizedLogo = await sharp(logoPath).resize(80, 80).png().toBuffer();
      logoB64 = `data:image/png;base64,${resizedLogo.toString("base64")}`;
    }
  } catch {}

  const logoImg = logoB64
    ? `<image href="${logoB64}" x="40" y="35" width="60" height="60" />`
    : `<rect x="40" y="35" width="60" height="60" rx="10" fill="#3b82f6" /><text x="70" y="75" text-anchor="middle" font-size="32" font-weight="bold" fill="white" font-family="system-ui,sans-serif">F</text>`;

  const name = escapeXml(data.displayName);
  const subtitle = data.jobTitle ? escapeXml(data.jobTitle) : "";
  const tier = escapeXml(data.tierName);

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0f4ff" />
      <stop offset="100%" stop-color="#e0e7ff" />
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#fafbff" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="40" y="20" width="1120" height="590" rx="24" fill="url(#card)" stroke="#e2e8f0" stroke-width="2" />

  ${logoImg}
  <text x="115" y="72" font-size="22" font-weight="700" fill="#1e293b" font-family="system-ui,sans-serif">FridayReport.AI</text>

  <line x1="40" y1="110" x2="1160" y2="110" stroke="#e2e8f0" stroke-width="1" />

  <text x="600" y="190" text-anchor="middle" font-size="48" font-weight="800" fill="#0f172a" font-family="system-ui,sans-serif">${name}</text>
  ${subtitle ? `<text x="600" y="230" text-anchor="middle" font-size="24" fill="#64748b" font-family="system-ui,sans-serif">${subtitle}</text>` : ""}

  <rect x="420" y="${subtitle ? 250 : 210}" width="360" height="50" rx="25" fill="${tierColor}15" stroke="${tierColor}" stroke-width="2" />
  <text x="600" y="${subtitle ? 283 : 243}" text-anchor="middle" font-size="22" font-weight="700" fill="${tierColor}" font-family="system-ui,sans-serif">\u2B50 ${tier} Rank</text>

  <rect x="200" y="${subtitle ? 330 : 290}" width="250" height="120" rx="16" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5" />
  <text x="325" y="${subtitle ? 380 : 340}" text-anchor="middle" font-size="42" font-weight="800" fill="${tierColor}" font-family="system-ui,sans-serif">${data.score}</text>
  <text x="325" y="${subtitle ? 410 : 370}" text-anchor="middle" font-size="16" fill="#94a3b8" font-family="system-ui,sans-serif">Engagement Score</text>

  <rect x="500" y="${subtitle ? 330 : 290}" width="250" height="120" rx="16" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5" />
  <text x="625" y="${subtitle ? 380 : 340}" text-anchor="middle" font-size="42" font-weight="800" fill="#f59e0b" font-family="system-ui,sans-serif">${data.badgeCount}</text>
  <text x="625" y="${subtitle ? 410 : 370}" text-anchor="middle" font-size="16" fill="#94a3b8" font-family="system-ui,sans-serif">Badges Earned</text>

  <rect x="800" y="${subtitle ? 330 : 290}" width="250" height="120" rx="16" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5" />
  <text x="925" y="${subtitle ? 380 : 340}" text-anchor="middle" font-size="42" font-weight="800" fill="#64748b" font-family="system-ui,sans-serif">${data.totalBadges}</text>
  <text x="925" y="${subtitle ? 410 : 370}" text-anchor="middle" font-size="16" fill="#94a3b8" font-family="system-ui,sans-serif">Total Badges</text>

  <text x="600" y="${subtitle ? 530 : 490}" text-anchor="middle" font-size="18" fill="#94a3b8" font-family="system-ui,sans-serif">View full profile and badges at FridayReport.AI</text>

  <rect x="40" y="570" width="1120" height="40" rx="0" fill="#f1f5f9" />
  <text x="600" y="596" text-anchor="middle" font-size="14" fill="#94a3b8" font-family="system-ui,sans-serif">fridayreport.ai/badges \u2022 Project Portfolio Management</text>
</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer;
}

export function injectBadgeOgTags(html: string, data: BadgeOgData, userId: string, baseUrl?: string): string {
  const title = `${data.displayName} - ${data.tierName} Rank | FridayReport.AI`;
  const description = data.jobTitle
    ? `${data.displayName} (${data.jobTitle}) is a ${data.tierName}-ranked professional with ${data.badgeCount}/${data.totalBadges} badges on FridayReport.AI`
    : `${data.displayName} is a ${data.tierName}-ranked professional with ${data.badgeCount}/${data.totalBadges} badges on FridayReport.AI`;
  const url = `https://fridayreport.ai/badges/${encodeURIComponent(userId)}`;
  const imageUrl = baseUrl
    ? `${baseUrl}/api/users/${encodeURIComponent(userId)}/badge-card.png`
    : `https://fridayreport.ai/api/users/${encodeURIComponent(userId)}/badge-card.png`;

  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escapeAttr(title)}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${escapeAttr(description)}" />`
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*" \/>/,
    `<meta property="og:image" content="${imageUrl}" />`
  );
  html = html.replace(
    /<meta property="og:image:width" content="[^"]*" \/>/,
    `<meta property="og:image:width" content="1200" />`
  );
  html = html.replace(
    /<meta property="og:image:height" content="[^"]*" \/>/,
    `<meta property="og:image:height" content="630" />`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${url}" />`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*" \/>/,
    `<meta name="twitter:image" content="${imageUrl}" />`
  );

  return html;
}

const BADGE_META: Record<string, { name: string; description: string; icon: string }> = {
  'first-project': { name: 'Project Starter', description: 'Manage your first project', icon: 'rocket' },
  'portfolio-leader': { name: 'Portfolio Leader', description: 'Manage 5+ projects', icon: 'briefcase' },
  'project-master': { name: 'Project Master', description: 'Manage 15+ projects', icon: 'building' },
  'task-starter': { name: 'Task Tracker', description: 'Own 10+ tasks', icon: 'list-checks' },
  'task-champion': { name: 'Task Champion', description: 'Complete 25+ tasks', icon: 'check-circle' },
  'task-legend': { name: 'Task Legend', description: 'Complete 100+ tasks', icon: 'zap' },
  'risk-manager': { name: 'Risk Manager', description: 'Resolve 10+ risks', icon: 'shield' },
  'risk-master': { name: 'Risk Master', description: 'Handle 25+ risks', icon: 'shield-check' },
  'issue-resolver': { name: 'Issue Resolver', description: 'Handle 20+ issues', icon: 'bug' },
  'milestone-tracker': { name: 'Milestone Tracker', description: 'Own 10+ milestones', icon: 'flag' },
  'power-user': { name: 'Power User', description: '100+ sessions', icon: 'activity' },
  'dedicated': { name: 'Dedicated PM', description: '500+ sessions', icon: 'flame' },
  'portfolio-strategist': { name: 'Portfolio Strategist', description: 'Manage 3+ portfolios', icon: 'layers' },
};

const BADGE_EMOJI: Record<string, string> = {
  rocket: '\u{1F680}', briefcase: '\u{1F4BC}', building: '\u{1F3E2}',
  'list-checks': '\u2705', 'check-circle': '\u2714\uFE0F', zap: '\u26A1',
  shield: '\u{1F6E1}\uFE0F', 'shield-check': '\u{1F6E1}\uFE0F', bug: '\u{1F41B}',
  flag: '\u{1F3C1}', activity: '\u{1F4C8}', flame: '\u{1F525}', layers: '\u{1F4DA}',
};

export interface SingleBadgeOgData {
  displayName: string;
  badgeId: string;
  badgeName: string;
  badgeDescription: string;
  badgeIcon: string;
  current: number;
  threshold: number;
  earned: boolean;
}

export async function getSingleBadgeOgData(userId: string, badgeId: string): Promise<SingleBadgeOgData | null> {
  const meta = BADGE_META[badgeId];
  if (!meta) return null;

  const [user] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      publicProfileEnabled: users.publicProfileEnabled,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.publicProfileEnabled) return null;

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Project Manager";

  const { apiRequestLogs } = await import("@shared/schema");
  const [pm] = await db.select({ count: sql<number>`count(*)::int` }).from(projects)
    .where(and(sql`(${projects.managerId} = ${userId} OR ${projects.businessOwnerId} = ${userId} OR ${projects.businessSponsorId} = ${userId} OR ${projects.technicalLeadId} = ${userId})`, sql`${projects.deletedAt} IS NULL`));
  const [to] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks)
    .where(and(eq(tasks.ownerId, userId), sql`${tasks.deletedAt} IS NULL`));
  const [tc] = await db.select({ count: sql<number>`count(DISTINCT ${tasks.id})::int` }).from(tasks)
    .leftJoin(taskResourceAssignments, eq(taskResourceAssignments.taskId, tasks.id))
    .leftJoin(resources, eq(resources.id, taskResourceAssignments.resourceId))
    .where(and(sql`(${tasks.ownerId} = ${userId} OR ${resources.userId} = ${userId})`, eq(tasks.status, 'Completed'), sql`${tasks.deletedAt} IS NULL`));
  const [ia] = await db.select({ count: sql<number>`count(*)::int` }).from(issues)
    .where(and(sql`(${issues.assigneeId} = ${userId} OR ${issues.ownerId} = ${userId})`, eq(issues.itemType, 'issue'), sql`${issues.deletedAt} IS NULL`));
  const [ra] = await db.select({ count: sql<number>`count(*)::int` }).from(issues)
    .where(and(sql`(${issues.assigneeId} = ${userId} OR ${issues.ownerId} = ${userId})`, eq(issues.itemType, 'risk'), sql`${issues.deletedAt} IS NULL`));
  const [rr] = await db.select({ count: sql<number>`count(*)::int` }).from(issues)
    .where(and(sql`(${issues.assigneeId} = ${userId} OR ${issues.ownerId} = ${userId})`, eq(issues.itemType, 'risk'), sql`${issues.status} IN ('Mitigated', 'Closed')`, sql`${issues.deletedAt} IS NULL`));
  const [mo] = await db.select({ count: sql<number>`count(*)::int` }).from(milestones)
    .where(and(eq(milestones.ownerId, userId), sql`${milestones.deletedAt} IS NULL`));
  const [po] = await db.select({ count: sql<number>`count(*)::int` }).from(portfolios)
    .where(and(sql`(${portfolios.managerId} = ${userId} OR ${portfolios.businessOwnerId} = ${userId})`, sql`${portfolios.deletedAt} IS NULL`));
  const [tl] = await db.select({ count: sql<number>`count(*)::int` }).from(apiRequestLogs)
    .where(and(eq(apiRequestLogs.userId, userId), sql`${apiRequestLogs.path} = '/api/auth/user'`, sql`${apiRequestLogs.method} = 'GET'`));

  const statsMap: Record<string, number> = {
    projectsManaged: pm.count, tasksOwned: to.count, tasksCompleted: tc.count,
    risksResolved: rr.count, risksAssigned: ra.count, issuesAssigned: ia.count,
    milestonesOwned: mo.count, totalLogins: tl.count, portfoliosManaged: po.count,
  };

  const badgeStatMap: Record<string, { stat: string; threshold: number }> = {
    'first-project': { stat: 'projectsManaged', threshold: 1 },
    'portfolio-leader': { stat: 'projectsManaged', threshold: 5 },
    'project-master': { stat: 'projectsManaged', threshold: 15 },
    'task-starter': { stat: 'tasksOwned', threshold: 10 },
    'task-champion': { stat: 'tasksCompleted', threshold: 25 },
    'task-legend': { stat: 'tasksCompleted', threshold: 100 },
    'risk-manager': { stat: 'risksResolved', threshold: 10 },
    'risk-master': { stat: 'risksAssigned', threshold: 25 },
    'issue-resolver': { stat: 'issuesAssigned', threshold: 20 },
    'milestone-tracker': { stat: 'milestonesOwned', threshold: 10 },
    'power-user': { stat: 'totalLogins', threshold: 100 },
    'dedicated': { stat: 'totalLogins', threshold: 500 },
    'portfolio-strategist': { stat: 'portfoliosManaged', threshold: 3 },
  };

  const badgeStat = badgeStatMap[badgeId];
  if (!badgeStat) return null;

  const current = statsMap[badgeStat.stat] || 0;

  return {
    displayName,
    badgeId,
    badgeName: meta.name,
    badgeDescription: meta.description,
    badgeIcon: meta.icon,
    current,
    threshold: badgeStat.threshold,
    earned: current >= badgeStat.threshold,
  };
}

export async function generateSingleBadgeImage(data: SingleBadgeOgData): Promise<Buffer> {
  let logoB64 = "";
  try {
    const logoPath = path.resolve(process.cwd(), "client", "public", "logo-icon.png");
    if (fs.existsSync(logoPath)) {
      const resizedLogo = await sharp(logoPath).resize(40, 40).png().toBuffer();
      logoB64 = `data:image/png;base64,${resizedLogo.toString("base64")}`;
    }
  } catch {}

  const logoImg = logoB64
    ? `<image href="${logoB64}" x="526" y="490" width="32" height="32" />`
    : `<rect x="526" y="490" width="32" height="32" rx="6" fill="#f59e0b" /><text x="542" y="513" text-anchor="middle" font-size="18" font-weight="bold" fill="white" font-family="system-ui,sans-serif">F</text>`;

  const emoji = BADGE_EMOJI[data.badgeIcon] || '\u{1F3C6}';
  const truncSvg = (str: string, maxLen: number) => {
    const escaped = escapeXml(str);
    return escaped.length > maxLen ? escaped.slice(0, maxLen - 3) + '...' : escaped;
  };
  const name = truncSvg(data.badgeName, 40);
  const desc = truncSvg(data.badgeDescription, 60);
  const userName = truncSvg(data.displayName, 35);

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="rgba(0,0,0,0.08)" />
    </filter>
    <clipPath id="cardClip">
      <rect x="300" y="25" width="600" height="580" rx="24" />
    </clipPath>
  </defs>
  <rect width="1200" height="630" fill="#f8f9fb" />

  <rect x="300" y="25" width="600" height="580" rx="24" fill="white" stroke="#e5e7eb" stroke-width="1" filter="url(#shadow)" />

  <g clip-path="url(#cardClip)">
    <circle cx="600" cy="155" r="65" fill="rgba(245,158,11,0.08)" />
    <text x="600" y="172" text-anchor="middle" font-size="60" font-family="system-ui,sans-serif">${emoji}</text>

    <text x="600" y="270" text-anchor="middle" font-size="34" font-weight="800" fill="#111827" font-family="system-ui,sans-serif">${name}</text>
    <text x="600" y="302" text-anchor="middle" font-size="19" fill="#6b7280" font-family="system-ui,sans-serif">${desc}</text>

    <text x="600" y="355" text-anchor="middle" font-size="32" font-weight="700" fill="#f59e0b" font-family="system-ui,sans-serif">${data.current}/${data.threshold}</text>

    <line x1="420" y1="385" x2="780" y2="385" stroke="#f0f0f0" stroke-width="1" />

    <text x="600" y="418" text-anchor="middle" font-size="17" fill="#9ca3af" font-family="system-ui,sans-serif">Earned by</text>
    <text x="600" y="450" text-anchor="middle" font-size="26" font-weight="700" fill="#111827" font-family="system-ui,sans-serif">${userName}</text>

    <line x1="420" y1="475" x2="780" y2="475" stroke="#f0f0f0" stroke-width="1" />

    ${logoImg}
    <text x="566" y="510" text-anchor="start" font-size="18" font-weight="600" fill="#6b7280" font-family="system-ui,sans-serif">FridayReport.AI</text>
  </g>
</svg>`;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

export function injectSingleBadgeOgTags(html: string, data: SingleBadgeOgData, userId: string, baseUrl?: string): string {
  const title = data.earned
    ? `${data.displayName} earned ${data.badgeName} | FridayReport.AI`
    : `${data.displayName} is progressing toward ${data.badgeName} | FridayReport.AI`;
  const description = data.earned
    ? `${data.displayName} earned the "${data.badgeName}" badge on FridayReport.AI! ${data.badgeDescription}. Progress: ${data.current}/${data.threshold}.`
    : `${data.displayName} is working toward the "${data.badgeName}" badge on FridayReport.AI. ${data.badgeDescription}. Progress: ${data.current}/${data.threshold}.`;
  const url = `https://fridayreport.ai/badges/${encodeURIComponent(userId)}/${encodeURIComponent(data.badgeId)}`;
  const imageUrl = baseUrl
    ? `${baseUrl}/api/users/${encodeURIComponent(userId)}/badges/${encodeURIComponent(data.badgeId)}/image.png`
    : `https://fridayreport.ai/api/users/${encodeURIComponent(userId)}/badges/${encodeURIComponent(data.badgeId)}/image.png`;

  html = html.replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeAttr(title)}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeAttr(description)}" />`);
  html = html.replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${imageUrl}" />`);
  html = html.replace(/<meta property="og:image:width" content="[^"]*" \/>/, `<meta property="og:image:width" content="1200" />`);
  html = html.replace(/<meta property="og:image:height" content="[^"]*" \/>/, `<meta property="og:image:height" content="630" />`);
  html = html.replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeAttr(title)}" />`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeAttr(description)}" />`);
  html = html.replace(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${imageUrl}" />`);
  return html;
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
