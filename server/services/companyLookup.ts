import OpenAI from "openai";
import { AiCreditsLimitError, withAiCredits } from "./aiCredits";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface CompanyInfo {
  companyName: string;
  industry: string;
  description: string;
  isPersonalEmail: boolean;
}

const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'live.com', 'msn.com', 'me.com', 'mac.com', 'qq.com', '163.com',
  'gmx.com', 'fastmail.com', 'tutanota.com'
];

export function extractDomain(email: string): string {
  const parts = email.toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : '';
}

export function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_EMAIL_DOMAINS.includes(domain.toLowerCase());
}

export async function lookupCompanyByDomain(
  domain: string,
  userId?: string | null,
  orgId?: number | null,
): Promise<CompanyInfo> {
  if (isPersonalEmailDomain(domain)) {
    return {
      companyName: '',
      industry: '',
      description: '',
      isPersonalEmail: true,
    };
  }

  const callOpenAI = () => openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a company research assistant. Given an email domain, identify the company that owns it and provide information about them. Return a JSON object with: companyName (official full company name), industry (the primary industry they operate in, e.g., "Technology", "Healthcare", "Finance", "Manufacturing", "Retail", "Education", "Consulting", "Media", "Real Estate", "Energy"), description (brief 1-sentence description of what the company does). If you cannot identify the company or it appears to be a personal domain, return companyName as the domain name formatted nicely, industry as "General", and description as empty.`
      },
      {
        role: "user",
        content: `What company owns the domain: ${domain}?`
      }
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 200,
  });

  // Signup-time / unauthenticated lookups skip the OpenAI call entirely
  // and return a domain-derived heuristic. We never call a billable model
  // without a chargeable user — silent metering bypass would be a billing bug.
  if (!userId) {
    return {
      companyName: formatDomainAsName(domain),
      industry: 'General',
      description: '',
      isPersonalEmail: false,
    };
  }

  try {
    const response = await withAiCredits(
      { userId, orgId: orgId ?? null, action: "company_lookup" },
      callOpenAI,
    );

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return {
      companyName: parsed.companyName || formatDomainAsName(domain),
      industry: parsed.industry || 'General',
      description: parsed.description || '',
      isPersonalEmail: false,
    };
  } catch (error) {
    // Always surface credit-limit errors so the route can return the
    // standardized 403 {limitExceeded:true,resourceType:"ai_runs"} payload.
    if (error instanceof AiCreditsLimitError) throw error;
    console.error('Company lookup error:', error);
    return {
      companyName: formatDomainAsName(domain),
      industry: 'General',
      description: '',
      isPersonalEmail: false,
    };
  }
}

function formatDomainAsName(domain: string): string {
  const name = domain.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export async function lookupCompanyByEmail(
  email: string,
  userId?: string | null,
  orgId?: number | null,
): Promise<CompanyInfo> {
  const domain = extractDomain(email);
  if (!domain) {
    return {
      companyName: '',
      industry: '',
      description: '',
      isPersonalEmail: true,
    };
  }
  return lookupCompanyByDomain(domain, userId, orgId);
}
