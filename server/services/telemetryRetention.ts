import { sql } from "drizzle-orm";
import crypto from "crypto";
import { db } from "../db";

const IP_HASH_SALT = process.env.IP_HASH_SALT || "fr_default_ip_salt_v1";

function hashIp(ip: string): string {
  return crypto.createHmac("sha256", IP_HASH_SALT).update(ip).digest("hex").slice(0, 32);
}

/**
 * Telemetry retention sweep:
 *   - hashes raw IPs older than 90 days on user_page_events / user_acquisition
 *   - deletes raw page-event rows older than 90 days
 *   - deletes anonymous (never-linked-to-a-user) page events older than 7 days
 *
 * Designed to be safe to run repeatedly. All operations are best-effort; a
 * single failure doesn't abort the rest of the sweep.
 */
export async function runTelemetryRetentionSweep(): Promise<{
  hashedPageEventIps: number;
  hashedAcquisitionIps: number;
  deletedOldPageEvents: number;
  deletedUnlinkedAnonEvents: number;
}> {
  const result = {
    hashedPageEventIps: 0,
    hashedAcquisitionIps: 0,
    deletedOldPageEvents: 0,
    deletedUnlinkedAnonEvents: 0,
  };

  // 1) Hash IPs older than 90 days on user_page_events (one-way: prefix with 'h:').
  try {
    const rows = await db.execute(sql`
      SELECT id, ip_address FROM user_page_events
      WHERE ip_address IS NOT NULL
        AND ip_address NOT LIKE 'h:%'
        AND created_at < NOW() - INTERVAL '90 days'
      LIMIT 5000
    `);
    for (const r of rows.rows as Array<{ id: number; ip_address: string }>) {
      const h = "h:" + hashIp(r.ip_address);
      await db.execute(sql`UPDATE user_page_events SET ip_address = ${h} WHERE id = ${r.id}`);
      result.hashedPageEventIps++;
    }
  } catch (e) {
    console.error("[retention] hash user_page_events ips failed:", e);
  }

  // 2) Hash IPs older than 90 days on user_acquisition.
  try {
    const rows = await db.execute(sql`
      SELECT id, ip_address FROM user_acquisition
      WHERE ip_address IS NOT NULL
        AND ip_address NOT LIKE 'h:%'
        AND created_at < NOW() - INTERVAL '90 days'
      LIMIT 5000
    `);
    for (const r of rows.rows as Array<{ id: number; ip_address: string }>) {
      const h = "h:" + hashIp(r.ip_address);
      await db.execute(sql`UPDATE user_acquisition SET ip_address = ${h} WHERE id = ${r.id}`);
      result.hashedAcquisitionIps++;
    }
  } catch (e) {
    console.error("[retention] hash user_acquisition ips failed:", e);
  }

  // 3) Delete raw page events older than 90 days (privacy retention).
  try {
    const del = await db.execute(sql`
      DELETE FROM user_page_events
      WHERE created_at < NOW() - INTERVAL '90 days'
    `);
    result.deletedOldPageEvents = del.rowCount ?? 0;
  } catch (e) {
    console.error("[retention] delete old page events failed:", e);
  }

  // 4) Purge anonymous (never linked to a user) page events older than 7 days.
  try {
    const del = await db.execute(sql`
      DELETE FROM user_page_events
      WHERE user_id IS NULL
        AND created_at < NOW() - INTERVAL '7 days'
    `);
    result.deletedUnlinkedAnonEvents = del.rowCount ?? 0;
  } catch (e) {
    console.error("[retention] delete unlinked anon events failed:", e);
  }

  return result;
}
