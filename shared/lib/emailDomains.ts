export const DEFAULT_EXCLUDED_EMAIL_DOMAINS = ['trusteditgroup.com', 'fridayreport.ai'];

export function normalizeDomain(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/\s+/g, '');
}

export function normalizeDomains(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (v == null) continue;
    const n = normalizeDomain(v);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function parseExcludedDomainsParam(
  raw: string | string[] | undefined | null
): string[] | null {
  if (raw == null) return null;
  const flat: string[] = [];
  const collect = (val: string) => {
    for (const piece of val.split(',')) {
      const n = normalizeDomain(piece);
      if (n) flat.push(n);
    }
  };
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === 'string') collect(v);
    }
  } else if (typeof raw === 'string') {
    collect(raw);
  }
  return Array.from(new Set(flat));
}

export function resolveExcludedDomains(raw: string | string[] | undefined | null): string[] {
  const parsed = parseExcludedDomainsParam(raw);
  if (parsed === null) return [...DEFAULT_EXCLUDED_EMAIL_DOMAINS];
  return parsed;
}

export function getEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

export function isEmailExcluded(
  email: string | null | undefined,
  excludedDomains: string[]
): boolean {
  if (!excludedDomains.length) return false;
  const domain = getEmailDomain(email);
  if (!domain) return false;
  return excludedDomains.includes(domain);
}

export function serializeExcludedDomainsParam(domains: string[]): string {
  return normalizeDomains(domains).join(',');
}
