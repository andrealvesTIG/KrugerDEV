import { db } from "../db";
import {
  builtinAgentSettings,
  BUILTIN_AGENT_KEYS,
  type BuiltinAgentKey,
  type BuiltinAgentSetting,
  type BuiltinAgentProviderConfig,
} from "@shared/schema";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 5_000;

interface CacheEntry {
  value: BuiltinAgentSetting | null;
  expiresAt: number;
}

const cache = new Map<BuiltinAgentKey, CacheEntry>();

export function invalidateBuiltinAgentSettingsCache(key?: BuiltinAgentKey): void {
  if (key) cache.delete(key);
  else cache.clear();
}

export async function getBuiltinAgentSetting(
  key: BuiltinAgentKey,
): Promise<BuiltinAgentSetting | null> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  try {
    const [row] = await db
      .select()
      .from(builtinAgentSettings)
      .where(eq(builtinAgentSettings.agentKey, key));
    cache.set(key, { value: row ?? null, expiresAt: now + CACHE_TTL_MS });
    return row ?? null;
  } catch (err) {
    console.error(`[builtinAgentSettings] load failed for ${key}:`, err);
    return null;
  }
}

export async function isBuiltinAgentEnabled(key: BuiltinAgentKey): Promise<boolean> {
  const row = await getBuiltinAgentSetting(key);
  if (!row) return true;
  return row.enabled;
}

export async function getBuiltinAgentPromptOverride(
  key: BuiltinAgentKey,
): Promise<string | null> {
  const row = await getBuiltinAgentSetting(key);
  const v = row?.defaultSystemPrompt?.trim();
  return v && v.length > 0 ? v : null;
}

export async function getBuiltinAgentModelOverride(
  key: BuiltinAgentKey,
): Promise<string | null> {
  const row = await getBuiltinAgentSetting(key);
  const v = row?.defaultModel?.trim();
  return v && v.length > 0 ? v : null;
}

export async function getBuiltinAgentProviderConfig(
  key: BuiltinAgentKey,
): Promise<BuiltinAgentProviderConfig | null> {
  const row = await getBuiltinAgentSetting(key);
  return (row?.providerConfig as BuiltinAgentProviderConfig | null) ?? null;
}

export async function listAllBuiltinAgentSettings(): Promise<
  Record<BuiltinAgentKey, BuiltinAgentSetting | null>
> {
  const rows = await db.select().from(builtinAgentSettings);
  const map = new Map<BuiltinAgentKey, BuiltinAgentSetting>();
  for (const r of rows) map.set(r.agentKey as BuiltinAgentKey, r);
  return BUILTIN_AGENT_KEYS.reduce((acc, k) => {
    acc[k] = map.get(k) ?? null;
    return acc;
  }, {} as Record<BuiltinAgentKey, BuiltinAgentSetting | null>);
}

export async function upsertBuiltinAgentSetting(
  key: BuiltinAgentKey,
  patch: {
    enabled?: boolean;
    defaultSystemPrompt?: string | null;
    defaultModel?: string | null;
    providerConfig?: BuiltinAgentProviderConfig | null;
    updatedBy: string;
  },
): Promise<BuiltinAgentSetting> {
  const [existing] = await db
    .select()
    .from(builtinAgentSettings)
    .where(eq(builtinAgentSettings.agentKey, key));
  if (existing) {
    const [updated] = await db
      .update(builtinAgentSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(builtinAgentSettings.agentKey, key))
      .returning();
    invalidateBuiltinAgentSettingsCache(key);
    return updated;
  }
  const [created] = await db
    .insert(builtinAgentSettings)
    .values({
      agentKey: key,
      enabled: patch.enabled ?? true,
      defaultSystemPrompt: patch.defaultSystemPrompt ?? null,
      defaultModel: patch.defaultModel ?? null,
      providerConfig: patch.providerConfig ?? null,
      updatedBy: patch.updatedBy,
    })
    .returning();
  invalidateBuiltinAgentSettingsCache(key);
  return created;
}
