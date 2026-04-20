import type { Request } from "express";
import { sql, type SQLWrapper, type SQL } from "drizzle-orm";
import { db } from "../db";
import { users, organizationMembers } from "@shared/schema";
import {
  resolveExcludedDomains,
  isEmailExcluded,
} from "@shared/lib/emailDomains";

export interface EmailDomainExclusion {
  domains: string[];
  excludedUserIds: Set<string>;
  excludedOrgIds: Set<number>;
  isUserExcluded: (userId: string | null | undefined) => boolean;
  isOrgExcluded: (orgId: number | null | undefined) => boolean;
  /**
   * Returns a raw SQL predicate string that excludes rows whose user-id column
   * matches an excluded user id. Returns "TRUE" if no exclusions apply.
   * The provided column expression is inlined verbatim (use only trusted strings).
   */
  userNotInSql: (columnExpr: string) => string;
  /**
   * Returns a raw SQL predicate string that excludes rows whose organization-id
   * column matches an excluded organization id. Returns "TRUE" if no exclusions apply.
   */
  orgNotInSql: (columnExpr: string) => string;
}

function safeQuote(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function makeSqlHelpers(userIds: Set<string>, orgIds: Set<number>) {
  const userInList = Array.from(userIds).map(safeQuote).join(',');
  const orgInList = Array.from(orgIds).map(o => String(Number(o))).join(',');
  return {
    userNotInSql: (col: string) =>
      userIds.size === 0 ? 'TRUE' : `(${col} IS NULL OR ${col} NOT IN (${userInList}))`,
    orgNotInSql: (col: string) =>
      orgIds.size === 0 ? 'TRUE' : `(${col} IS NULL OR ${col} NOT IN (${orgInList}))`,
  };
}

const EMPTY: EmailDomainExclusion = {
  domains: [],
  excludedUserIds: new Set(),
  excludedOrgIds: new Set(),
  isUserExcluded: () => false,
  isOrgExcluded: () => false,
  userNotInSql: () => 'TRUE',
  orgNotInSql: () => 'TRUE',
};

export function getExcludedDomainsFromRequest(req: Request): string[] {
  return resolveExcludedDomains(req.query.excludedEmailDomains as string | string[] | undefined);
}

export async function buildEmailDomainExclusion(domains: string[]): Promise<EmailDomainExclusion> {
  if (!domains.length) return EMPTY;

  const allUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users);

  const excludedUserIds = new Set<string>();
  for (const u of allUsers) {
    if (isEmailExcluded(u.email, domains)) {
      excludedUserIds.add(u.id);
    }
  }

  const memberships = await db
    .select({ userId: organizationMembers.userId, organizationId: organizationMembers.organizationId })
    .from(organizationMembers);

  const orgMembers = new Map<number, string[]>();
  for (const m of memberships) {
    if (!orgMembers.has(m.organizationId)) orgMembers.set(m.organizationId, []);
    orgMembers.get(m.organizationId)!.push(m.userId);
  }

  const excludedOrgIds = new Set<number>();
  for (const [orgId, members] of orgMembers.entries()) {
    if (members.length === 0) continue;
    if (members.every(uid => excludedUserIds.has(uid))) {
      excludedOrgIds.add(orgId);
    }
  }

  const helpers = makeSqlHelpers(excludedUserIds, excludedOrgIds);
  return {
    domains,
    excludedUserIds,
    excludedOrgIds,
    isUserExcluded: (uid) => !!uid && excludedUserIds.has(uid),
    isOrgExcluded: (oid) => oid != null && excludedOrgIds.has(oid),
    userNotInSql: helpers.userNotInSql,
    orgNotInSql: helpers.orgNotInSql,
  };
}

export async function getRequestEmailDomainExclusion(req: Request): Promise<EmailDomainExclusion> {
  const domains = getExcludedDomainsFromRequest(req);
  return buildEmailDomainExclusion(domains);
}

/**
 * Build a Drizzle SQL fragment that excludes a column matching any excluded domain.
 * Uses a positive condition (TRUE means "include this row").
 * If no domains are excluded, returns sql`TRUE`.
 */
export function emailDomainNotExcludedSql(emailColumn: SQLWrapper, domains: string[]): SQL {
  if (!domains.length) return sql`TRUE`;
  const lowered = domains.map(d => d.toLowerCase());
  const conditions = lowered.map(d => sql`LOWER(${emailColumn}) LIKE ${'%@' + d}`);
  let combined: SQL = conditions[0];
  for (let i = 1; i < conditions.length; i++) {
    combined = sql`${combined} OR ${conditions[i]}`;
  }
  return sql`NOT (${combined})`;
}
