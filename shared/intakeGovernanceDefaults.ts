import type { IntakeGovernanceCategory } from "./schema";

// Default question catalogs for the Architecture and Cybersecurity governance
// questionnaires. These are seeded lazily on first list-fetch for an intake so
// existing intakes also receive them automatically.
export const DEFAULT_GOVERNANCE_QUESTIONS: Record<IntakeGovernanceCategory, string[]> = {
  architecture: [
    "Does this initiative introduce a new application or platform to the technology landscape?",
    "Does it integrate with existing enterprise systems (ERP, CRM, HRIS, data warehouse)?",
    "Will it require changes to the existing data model or master data?",
    "Does it use approved technologies from the enterprise reference architecture?",
    "Will it require new infrastructure (servers, network, storage, cloud accounts)?",
    "Are there dependencies on shared services (auth, logging, monitoring, API gateway)?",
    "Will it expose APIs that other systems will consume?",
    "Does the solution adhere to the organization's cloud and hosting standards?",
    "Has a high-level architecture diagram been produced and reviewed?",
    "Has the Architecture Review Board (ARB) been engaged?",
  ],
  cybersecurity: [
    "Will this initiative process, store, or transmit personally identifiable information (PII)?",
    "Will it process, store, or transmit payment card (PCI) or financial data?",
    "Will it process, store, or transmit protected health information (PHI)?",
    "Does it require user authentication and integrate with the corporate SSO / IdP?",
    "Will it require role-based access control and segregation of duties?",
    "Does it transmit data over the public internet, and if so is data encrypted in transit (TLS 1.2+)?",
    "Is sensitive data encrypted at rest using approved key management?",
    "Does it involve a third-party vendor or SaaS provider that requires a security assessment?",
    "Have data classification, retention, and disposal requirements been documented?",
    "Has a threat model / security risk assessment been completed for this initiative?",
  ],
};
