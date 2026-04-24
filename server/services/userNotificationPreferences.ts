import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_GROUPS,
  ALL_EMAIL_MASTER_KEY,
  type NotificationChannel,
  type NotificationDefinition,
  defaultPreferenceFor,
  groupMasterFieldId,
  isAllEmailDisabled,
  isGroupMasterDisabled,
  isRequiredNotification,
  preferenceFieldId,
  resolvePreference,
  sanitizePreferenceUpdate,
  notificationSupportsChannel,
} from "@shared/notificationCatalog";

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  prefs: Record<string, boolean>;
  loadedAt: number;
}

const userCache: Map<string, CacheEntry> = new Map();
const emailToUserIdCache: Map<string, { userId: string | null; loadedAt: number }> = new Map();

export function invalidateUserNotificationCache(userId?: string): void {
  if (userId) {
    userCache.delete(userId);
  } else {
    userCache.clear();
    emailToUserIdCache.clear();
  }
}

async function loadPrefs(userId: string): Promise<Record<string, boolean>> {
  const now = Date.now();
  const cached = userCache.get(userId);
  if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
    return cached.prefs;
  }
  try {
    const [row] = await db
      .select({ prefs: users.notificationPreferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const prefs = (row?.prefs as Record<string, boolean> | null) || {};
    userCache.set(userId, { prefs, loadedAt: now });
    return prefs;
  } catch (err) {
    console.error("Failed to load notification preferences for user", userId, err);
    return {};
  }
}

async function lookupUserIdByEmail(email: string): Promise<string | null> {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const now = Date.now();
  const cached = emailToUserIdCache.get(normalized);
  if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
    return cached.userId;
  }
  try {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);
    const userId = row?.id || null;
    emailToUserIdCache.set(normalized, { userId, loadedAt: now });
    return userId;
  } catch (err) {
    console.error("Failed to look up user by email", normalized, err);
    return null;
  }
}

export async function getUserNotificationPreferences(userId: string): Promise<{
  catalog: NotificationDefinition[];
  groups: typeof NOTIFICATION_GROUPS;
  preferences: Record<string, boolean>;
  allEmailMasterKey: string;
  resolved: Record<string, boolean>;
}> {
  const stored = await loadPrefs(userId);
  const resolved: Record<string, boolean> = {};
  for (const def of NOTIFICATION_CATALOG) {
    for (const channel of def.channels) {
      resolved[preferenceFieldId(def.key, channel)] = resolvePreference(stored, def.key, channel);
    }
  }
  resolved[`${ALL_EMAIL_MASTER_KEY}.email`] = !isAllEmailDisabled(stored);
  for (const group of NOTIFICATION_GROUPS) {
    const groupEntries = NOTIFICATION_CATALOG.filter((d) => d.groupId === group.id);
    const channels = new Set<NotificationChannel>();
    for (const e of groupEntries) for (const c of e.channels) channels.add(c);
    for (const channel of channels) {
      resolved[groupMasterFieldId(group.id, channel)] = !isGroupMasterDisabled(stored, group.id, channel);
    }
  }
  return {
    catalog: NOTIFICATION_CATALOG,
    groups: [...NOTIFICATION_GROUPS].sort((a, b) => a.sortOrder - b.sortOrder),
    preferences: stored,
    resolved,
    allEmailMasterKey: ALL_EMAIL_MASTER_KEY,
  };
}

export async function updateUserNotificationPreferences(
  userId: string,
  partial: Record<string, unknown>,
  options: { reset?: boolean } = {},
): Promise<{ saved: Record<string, boolean>; rejected: string[] }> {
  let nextPrefs: Record<string, boolean>;
  let rejected: string[] = [];
  if (options.reset) {
    nextPrefs = {};
  } else {
    const current = await loadPrefs(userId);
    const sanitized = sanitizePreferenceUpdate(partial);
    rejected = sanitized.rejected;
    nextPrefs = { ...current, ...sanitized.sanitized };
  }
  await db.update(users).set({ notificationPreferences: nextPrefs }).where(eq(users.id, userId));
  invalidateUserNotificationCache(userId);
  return { saved: nextPrefs, rejected };
}

export async function shouldSendNotification(
  userId: string | null | undefined,
  key: string,
  channel: NotificationChannel,
): Promise<boolean> {
  if (isRequiredNotification(key)) return true;
  if (!notificationSupportsChannel(key, channel)) {
    return defaultPreferenceFor(key, channel);
  }
  if (!userId) return defaultPreferenceFor(key, channel);
  const prefs = await loadPrefs(userId);
  return resolvePreference(prefs, key, channel);
}

export async function shouldSendEmailToAddress(
  email: string | null | undefined,
  key: string,
): Promise<boolean> {
  if (isRequiredNotification(key)) return true;
  if (!email) return defaultPreferenceFor(key, "email");
  const userId = await lookupUserIdByEmail(email);
  if (!userId) {
    return defaultPreferenceFor(key, "email");
  }
  return shouldSendNotification(userId, key, "email");
}
