import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

const TIERS = [
  { name: "Beginner", minScore: 0 },
  { name: "Associate", minScore: 50 },
  { name: "Professional", minScore: 150 },
  { name: "Senior", minScore: 400 },
  { name: "Expert", minScore: 800 },
  { name: "Master", minScore: 1500 },
];

interface BadgeOgData {
  displayName: string;
  jobTitle: string | null;
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
  return { displayName, jobTitle: user.jobTitle || null };
}

export function injectBadgeOgTags(html: string, data: BadgeOgData, userId: string): string {
  const title = `${data.displayName} - FridayReport.AI Profile`;
  const description = data.jobTitle
    ? `${data.displayName} (${data.jobTitle}) on FridayReport.AI - View their professional profile and achievement badges.`
    : `${data.displayName} on FridayReport.AI - View their professional profile and achievement badges.`;
  const url = `https://fridayreport.ai/badges/${encodeURIComponent(userId)}`;
  const image = "https://fridayreport.ai/og-image.jpg";

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
    `<meta property="og:image" content="${image}" />`
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
    `<meta name="twitter:image" content="${image}" />`
  );

  return html;
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
