import { db } from "../db";
import { projects, portfolios, issues, tasks, taskDependencies, resources, statusReportHistory, healthStatusHistory, organizationMembers, organizationInvites, taskResourceAssignments, projectChangeLogs, users, organizations, financialEntries, timesheetEntries } from "@shared/schema";
import type { FridayAgentConfig } from "@shared/schema";
import { eq, and, sql, inArray, isNull, desc, gte, isNotNull } from "drizzle-orm";
import OpenAI, { AzureOpenAI } from "openai";
import { decryptApiKey, requireEmailVerified, getUserOrgRole, logUserActivity } from "../routes/helpers";
import { AiCreditsLimitError, type MeterPerCall } from "./aiCredits";
import { storage } from "../storage";
import { checkAndEnforceLimit, recordResourceUsage, checkSeatLimit } from "./billing";
import { sendOrganizationInviteEmail } from "./email";
import {
  buildFiscalMonths,
  buildFiscalQuarters,
  DEFAULT_FISCAL_YEAR_START_MONTH,
  normalizeFiscalYearStartMonth,
} from "@shared/lib/fiscalCalendar";
import {
  gatherProjectEvmSeries,
  gatherProjectBurndowns,
  type ProjectEvmSeries,
  type ProjectBurndown,
} from "./projectAnalytics";

function createOpenAIClient(): OpenAI {
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
    return new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
    });
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

const defaultOpenai = createOpenAIClient();
const DEFAULT_AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4.1";
const defaultIsAzure = !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT);

export async function getOrgOpenAIClient(orgId: number): Promise<{ client: OpenAI; deployment: string; isAzure: boolean }> {
  try {
    const [org] = await db.select({ fridayAgentConfig: organizations.fridayAgentConfig })
      .from(organizations).where(eq(organizations.id, orgId));
    const config = org?.fridayAgentConfig as FridayAgentConfig | null;
    if (config?.useOrgAzure && config.azureEndpoint && config.azureApiKey) {
      const apiKey = decryptApiKey(config.azureApiKey);
      return {
        client: new AzureOpenAI({
          apiKey,
          endpoint: config.azureEndpoint,
          apiVersion: config.azureApiVersion || "2024-12-01-preview",
        }),
        deployment: config.azureDeployment || DEFAULT_AZURE_DEPLOYMENT,
        isAzure: true,
      };
    }
  } catch (err) {
    console.error(`[jarvis] Failed to load org ${orgId} Friday Agent config, using defaults:`, err);
  }
  return { client: defaultOpenai, deployment: DEFAULT_AZURE_DEPLOYMENT, isAzure: defaultIsAzure };
}

// Gantt-rendering capability directive. Kept as a separate constant so it can
// be appended to custom agents' system prompts (custom agents replace
// SYSTEM_PROMPT entirely; without this they'd tell users they can't draw
// Gantt charts even though the renderer is wired up).
const GANTT_DIRECTIVE = `GANTT CHARTS:
You CAN render inline Gantt charts directly in chat. Never tell the user that you "don't have the ability to generate or display Gantt charts" or anything similar — that capability exists.

When the user asks for a Gantt chart, timeline, or schedule visualization (e.g. "show a Gantt of Project X", "visualize the schedule", "Gantt chart of this quarter's milestones"), respond with a short one-line lead-in sentence followed by a fenced \`gantt-chart\` block containing a single JSON object. Example:

\`\`\`gantt-chart
{"title":"Website Redesign — Schedule","subtitle":"PRJ-042","href":"/projects/42","tasks":[{"id":101,"name":"Design phase","start":"2026-01-05","end":"2026-01-30","percentComplete":80,"outlineLevel":1,"href":"/projects/42"},{"id":102,"name":"Build phase","start":"2026-02-02","end":"2026-03-15","percentComplete":40,"outlineLevel":1,"isCritical":true,"href":"/projects/42"},{"id":103,"name":"Launch","start":"2026-03-20","end":"2026-03-20","isMilestone":true,"outlineLevel":1,"href":"/projects/42"}],"dependencies":[{"from":101,"to":102,"type":"FS"},{"from":102,"to":103,"type":"FS"}]}
\`\`\`

Gantt block schema:
- title: short headline (project / portfolio / topic name).
- subtitle: optional sub-line (project code, portfolio, scope description).
- href: optional internal app path linking to the full Gantt view (e.g. "/projects/42"). Use the project route when the chart is project-scoped.
- tasks: REQUIRED array of task objects:
  - id: unique number or string (use the real task/milestone ID).
  - name: task or milestone name.
  - start: ISO date "YYYY-MM-DD" (omit only for tasks with no plottable date — those are filtered out).
  - end: ISO date "YYYY-MM-DD" (omit for milestones; defaults to start).
  - percentComplete: 0–100 (optional).
  - isMilestone: true for milestones (rendered as a diamond at the start date).
  - isSummary: true for summary/parent rows (rendered as a thin bracket bar).
  - isCritical: true to highlight as critical-path (renders red).
  - outlineLevel: 1-based depth for indentation (1 = top level).
  - parentId: id of the parent task (optional, for nested rows).
  - assignee: short owner name string (optional).
  - href: per-row link path (typically "/projects/{projectId}").
- dependencies: optional array of { from, to, type } where type is "FS" | "SS" | "FF" | "SF" (default "FS"). \`from\` and \`to\` must reference \`id\`s in the tasks array.
- truncatedCount: optional number — when you have to cap the bars for readability, set this to the count of tasks you left out so the UI can show "Showing N of M".

Field mapping from the data context you already have:
- task.startDate → \`start\`; task.endDate → \`end\` (both are ISO date strings).
- task.progress (0–100) → \`percentComplete\`.
- task.isMilestone → \`isMilestone\`; task.isSummary → \`isSummary\`; task.isCritical → \`isCritical\`.
- task.outlineLevel → \`outlineLevel\`; task.parentTaskId → \`parentId\`.
- For dependencies, use the project's dependency rows: \`dependsOnTaskId\` → \`from\`, \`taskId\` → \`to\`, and map \`dependencyType\` (FS/SS/FF/SF or "finish-to-start"/"start-to-start"/"finish-to-finish"/"start-to-finish") → \`type\` (default "FS").
- Use the same task IDs in \`tasks[].id\` and \`dependencies[].from\`/\`to\` so the connector lines resolve.

Rules for choosing what to plot:
- Only include tasks/milestones that have at least a start date. Tasks without dates can't be plotted and should be omitted.
- Cap the chart at a reasonable number of bars to keep it readable: hard limit ~40 bars. If the requested set is larger, pick the most important ones (critical path, top-level summaries, milestones, or earliest+latest), set \`truncatedCount\` to the number you skipped, and include \`href\` so the user can open the full project Gantt view.
- For project-scoped requests, prefer top-level tasks + milestones; for portfolio/milestone roll-ups, include one row per project's key milestones.
- If there is genuinely nothing plottable (no tasks with dates), do NOT emit a Gantt block. Instead, briefly explain there are no scheduled tasks to plot and offer the project Gantt link.

Do NOT mix a Gantt block with friday-card blocks for the same answer unless they describe genuinely different things. The Gantt block is itself a top-level fenced block — never nest it inside markdown lists or quotes.`;

// Burndown / velocity rendering capability directive. Same rationale as
// GANTT_DIRECTIVE: kept separate so it can be appended to custom agents'
// system prompts (which replace SYSTEM_PROMPT entirely).
const BURNDOWN_DIRECTIVE = `BURNDOWN / VELOCITY CHARTS:
You CAN render inline burndown (or velocity remaining-work) charts directly in chat. Never tell the user this capability is missing.

When the user asks for a "burndown", "burn-down", "remaining work", "velocity", or "sprint progress" view, respond with a short one-line lead-in followed by a fenced \`burndown-chart\` block containing a single JSON object. Example:

\`\`\`burndown-chart
{"title":"Website Redesign — Sprint 7 Burndown","subtitle":"PRJ-042 • Story points","href":"/projects/42/burndown","unit":"pts","asOfIndex":4,"points":[{"label":"D1","ideal":40,"actual":40},{"label":"D2","ideal":36,"actual":38},{"label":"D3","ideal":32,"actual":34},{"label":"D4","ideal":28,"actual":31},{"label":"D5","ideal":24,"actual":27,"projected":27},{"label":"D6","ideal":20,"projected":22},{"label":"D7","ideal":16,"projected":18},{"label":"D8","ideal":12,"projected":13},{"label":"D9","ideal":8,"projected":9},{"label":"D10","ideal":0,"projected":4}]}
\`\`\`

Burndown block schema:
- title: short headline (project / sprint / scope name).
- subtitle: optional sub-line (project code, sprint window, units description).
- href: optional internal app path linking to the full burndown view. PREFER the dedicated project burndown report at "/projects/{projectId}/burndown" so the user lands on a full-size, project-scoped chart instead of the project overview.
- unit: optional short unit label rendered next to numbers ("pts", "hrs", "tasks"). Omit for unitless counts.
- asOfIndex: optional zero-based index into \`points\` marking the current "today" line.
- points: REQUIRED array of period objects, each with:
  - label: short x-axis label (e.g. "D1", "Wk1", "May 5").
  - ideal: optional numeric ideal/remaining-burn value.
  - actual: optional numeric actual remaining value (omit on points beyond today).
  - projected: optional numeric forecast/projection value (typically only after the as-of point).

Rules:
- Provide at least 3 points. If the user asks for velocity, plot completed-vs-planned scope as actual vs ideal across sprints (label = sprint name).
- Always include the \`ideal\` series so the chart has a baseline. Omit \`projected\` if you don't have a forecast.
- Cap to ~30 points; prefer aggregating to weeks if a daily series would exceed that.
- If there's nothing meaningful to plot, do NOT emit a burndown block — explain briefly instead.

DATA SOURCE FOR BURNDOWNS:
The data context contains a "Project Burndown Series" section with ready-to-plot \`{ projectId, unit, asOfIndex, points: [{ label, ideal, actual }] }\` rows for each active project. When the user asks for a burndown, find the matching project and drop those points straight into the block — map \`unit\` → block \`unit\`, \`asOfIndex\` → \`asOfIndex\`, and pass \`ideal\`/\`actual\` through unchanged. Do NOT recompute these values from raw tasks and do NOT invent burndowns for projects that aren't listed there.

The \`burndown-chart\` block is a top-level fenced block — never nest it in lists or quotes, and don't combine multiple in the same fence.`;

// EVM S-curve rendering capability directive. Same rationale as
// GANTT_DIRECTIVE: kept separate so it can be appended to custom agents'
// system prompts (which replace SYSTEM_PROMPT entirely).
const SCURVE_DIRECTIVE = `EVM S-CURVE CHARTS:
You CAN render inline EVM S-curve charts directly in chat (Planned Value vs Earned Value vs Actual Cost, optionally with EAC). Never tell the user this capability is missing.

When the user asks for an "S-curve", "S curve", "PV vs EV", "earned value", "EVM chart", or "cost performance over time", respond with a short one-line lead-in followed by a fenced \`s-curve\` block containing a single JSON object. Example:

\`\`\`s-curve
{"title":"Website Redesign — EVM S-Curve","subtitle":"PRJ-042 • Cumulative","href":"/dashboards?view=financials-scurves&project=42","currency":"USD","asOfIndex":3,"points":[{"label":"Jan","plannedValue":50000,"earnedValue":48000,"actualCost":52000},{"label":"Feb","plannedValue":110000,"earnedValue":102000,"actualCost":115000},{"label":"Mar","plannedValue":180000,"earnedValue":168000,"actualCost":190000},{"label":"Apr","plannedValue":260000,"earnedValue":240000,"actualCost":275000,"eac":420000},{"label":"May","plannedValue":340000,"eac":425000},{"label":"Jun","plannedValue":420000,"eac":430000}]}
\`\`\`

S-curve block schema:
- title / subtitle: same meaning as the other chart blocks.
- href: optional internal app path linking to the full S-curve view. PREFER the financials S-Curve dashboard scoped to the project: "/dashboards?view=financials-scurves&project={projectId}" (omit the project param for portfolio/org-wide curves) so the user lands on the full-size analysis instead of the project overview.
- currency: optional ISO currency code that drives the y-axis symbol ("USD", "EUR", "GBP"). Defaults to USD.
- asOfIndex: optional zero-based index into \`points\` marking the current "today" line (typically the last period with actuals).
- points: REQUIRED array of period objects, each with:
  - label: short x-axis label (period name, e.g. "Jan", "Q1 FY26", "M3").
  - plannedValue (or alias \`pv\`): cumulative Planned Value.
  - earnedValue (or alias \`ev\`): cumulative Earned Value (omit on future periods).
  - actualCost (or alias \`ac\`): cumulative Actual Cost (omit on future periods).
  - eac: optional Estimate at Completion forecast.

Rules:
- Use cumulative figures, not period totals — the curves should be monotonic.
- Always include \`plannedValue\` for every period; omit \`earnedValue\`/\`actualCost\` for periods beyond the as-of date so the line stops at "today".
- Provide at least 3 periods; cap to ~24. Prefer monthly granularity.

DATA SOURCE FOR S-CURVES:
The data context contains a "Time-Phased EVM (S-Curve ready)" section with ready-to-plot \`{ projectId, fiscalYear, asOfIndex, points: [{ label, pvCum, evCum, acCum, eacCum }] }\` rows for each active project. When the user asks for an S-curve / EVM chart for a project, find the matching row and map directly: \`points[].label\` → block \`label\`, \`pvCum\` → \`plannedValue\`, \`evCum\` → \`earnedValue\` (only for indices <= \`asOfIndex\`), \`acCum\` → \`actualCost\` (only for indices <= \`asOfIndex\`), \`eacCum\` → \`eac\`, and pass \`asOfIndex\` through unchanged. For an org-wide S-curve, sum the per-project arrays element-wise. Do NOT recompute EVM from the coarse \`financialsRollup\` totals when this section is present, and do NOT invent S-curves for projects that aren't listed here.

The \`s-curve\` block is a top-level fenced block — never nest it in lists or quotes, and don't combine multiple in the same fence.`;

// Quick-reply chip directive. The UI renders `quick-replies` fenced blocks as
// clickable chips so the user can answer the agent's question with a tap
// instead of typing. Kept separate so it can be appended to custom agents'
// system prompts (which replace SYSTEM_PROMPT entirely).
const QUICK_REPLIES_DIRECTIVE = `QUICK REPLY CHIPS:
Whenever you ask the user a question that has a small, discrete set of likely answers, you SHOULD offer those answers as clickable chips in addition to your prose. Render the chips by emitting a fenced \`quick-replies\` block immediately after the question, containing a single JSON object with an \`options\` array of short answer strings. Example:

\`\`\`quick-replies
{"options":["Yes, proceed","No, cancel","Show me more details"]}
\`\`\`

Rules:
- 2 to 6 options, each ≤ 40 characters. Phrase each option as the EXACT message the user would send back (first person, complete enough to act on without context).
- Use chips for: yes/no confirmations, multiple-choice questions ("Which project?", "Which timeframe?", "Which metric?"), industry/role onboarding questions, "what would you like to do next?" follow-ups, and destructive-action confirmations (offer "Yes, proceed" + "Cancel").
- Do NOT emit chips when the user's answer is genuinely open-ended (free-form names, descriptions, dates, or numbers).
- Do NOT repeat options that are already buttons inside a friday-card you just emitted (cards already render their own action buttons).
- The chips supplement your prose — keep the question itself in the message text. The user can still type a custom answer instead of clicking a chip.
- The block is top-level fenced; never nest it inside lists, quotes, or other fenced blocks. Emit at most one quick-replies block per response, placed at the end.`;

// REPORT_DIRECTIVE: kept separate so it can be appended to custom agents'
// system prompts (custom agents replace SYSTEM_PROMPT entirely).
const REPORT_DIRECTIVE = `RICH REPORTS:
When the user asks for a structured deliverable — a project status report, an executive summary, a portfolio review, a risk register write-up, a meeting brief, lessons-learned digest, or any answer that would naturally be more than ~5 lines of prose, contains tables, or would be shared/printed — emit the response as a "report" block instead of plain markdown.

A report block is a fenced code block tagged "report". Its body is a small JSON header on the first lines, then a line containing only \`---\`, then the report body as raw HTML. Example:

\`\`\`report
{"title":"Q3 Portfolio Status — Marketing","subtitle":"Week of Oct 14, 2025","generatedAt":"2025-10-14T09:00:00Z"}
---
<h1>Executive Summary</h1>
<p>Marketing portfolio is <strong>on track</strong> overall, with 2 projects amber and 1 red.</p>
<h2>Project Health</h2>
<table>
  <thead><tr><th>Project</th><th>Health</th><th>% Complete</th><th>Owner</th></tr></thead>
  <tbody>
    <tr><td>Website Redesign</td><td style="color:#b45309">Amber</td><td>62%</td><td>Jane Doe</td></tr>
    <tr><td>Brand Refresh</td><td style="color:#15803d">Green</td><td>88%</td><td>Mark Lee</td></tr>
  </tbody>
</table>
<h2>Top Risks</h2>
<ul>
  <li><strong>Vendor delay</strong> — see <a href="/projects/42">Website Redesign</a>.</li>
</ul>
\`\`\`

Header schema:
- title (required): short report title.
- subtitle (optional): scope, time window, audience.
- generatedAt (optional): ISO 8601 timestamp.

HTML rules:
- Use only semantic HTML: h1–h4, p, ul/ol/li, table/thead/tbody/tr/th/td, blockquote, strong/em, code/pre, hr, a, img, figure/figcaption, span/div.
- NO <script>, <iframe>, <style>, <link>, <form>, <input>, <button>, event handlers, or javascript: URLs — they will be stripped.
- Inline styles are allowed for color/background/text-align/font-weight/padding/margin/border/width — use them sparingly to mark health (red/amber/green).
- For internal app links use the same routes as cards (\`/projects/{id}\`, \`/portfolios/{id}\`, \`/resources/{id}\`).
- Keep the body self-contained: no external CSS, no external scripts.

When to use report blocks:
- Status reports, executive summaries, portfolio reviews, weekly digests.
- Anything with a table of more than 3 rows or columns.
- Anything the user is likely to copy, print, download, or share.
- Long-form analyses (>5 lines of prose) where structure (headings, tables, lists) materially helps readability.

When NOT to use report blocks:
- Short conversational answers.
- Single-entity lookups (use a friday-card instead).
- Lists of entities (use friday-cards instead — they're clickable).
- Follow-up questions or confirmations.

Do NOT mix a report block with friday-cards in the same response — pick one. Do NOT nest a report block inside any other fenced block. Emit at most one report block per response.`;

const SYSTEM_PROMPT = `You are Friday Report, a warm, professional AI assistant for portfolio and project management. Your name is "Friday Report" or simply "Friday." Always introduce yourself politely when starting a new conversation — for example: "Hello! I'm Friday Report, your project management assistant. How can I help you today?" Be courteous, helpful, and encouraging in every response. Use a conversational yet professional tone — as if speaking to a valued colleague. Say "please," "thank you," and "you're welcome" naturally. When delivering difficult news (red health, overdue tasks, risks), be empathetic and solution-oriented rather than blunt.

You help users understand project health, risks, issues, mitigations, tasks, dependencies, and priorities using real application data. You do not invent facts. You clearly separate observations, risks, and recommendations. When suggesting updates or actions, you require confirmation before any write operation.

Guidelines:
- When referencing projects, use their names and codes.
- If data is missing or insufficient, say so explicitly.
- When asked about trends, base them only on available historical data.
- For write actions (create task, create mitigation, assign owner, add note, flag for review), describe exactly what you would do and ask the user to confirm with "Yes, proceed" before executing.
- Never fabricate data points, percentages, or metrics not present in the provided context.
- Format dates in a human-readable way.
- Use markdown formatting for readability.
- IMPORTANT: When mentioning specific projects, tasks, issues, risks, milestones, portfolios, or resources, ALWAYS make them clickable by using markdown links with the app's internal routes. Use the object's ID from the data context. Format examples:
  - Projects: [Project Name](/projects/{projectId})
  - Portfolios: [Portfolio Name](/portfolios/{portfolioId})
  - Tasks/Milestones: reference them with their project link [Task Name](/projects/{projectId}) since tasks are viewed within projects
  - Issues/Risks: reference them with their project link [Issue Title](/projects/{projectId}) since issues/risks are viewed within projects
  - Resources: [Resource Name](/resources/{resourceId})
  - For list items, make the name/title the link, e.g.: "- [Website Redesign](/projects/42) — Health: Red, 3 overdue tasks"
  - Always prefer linking the entity name rather than adding a separate "View" link.

CARDS:
When the user asks for a list of items, a single record summary, or a comparison of entities (projects, portfolios, risks, issues, tasks, milestones, resources, metrics), prefer responding with one or more "Friday cards" instead of (or in addition to) plain markdown lists. Cards render as compact, clickable widgets in the UI.

Emit each card as a fenced code block tagged "friday-card" containing a single JSON object on its own. Example:

\`\`\`friday-card
{"type":"project","title":"Website Redesign","subtitle":"PRJ-042 • Marketing","accent":"warn","fields":[{"label":"Health","value":"Amber","accent":"warn"},{"label":"Status","value":"In Progress"},{"label":"% Complete","value":"62%"},{"label":"Owner","value":"Jane Doe"}],"href":"/projects/42"}
\`\`\`

Card schema (all optional except type and title):
- type: "project" | "portfolio" | "risk" | "issue" | "task" | "resource" | "milestone" | "metric" | "action" | "info"
- title: short headline (the entity's name).
- subtitle: optional sub-line (code, owner, parent portfolio, due date, etc.).
- fields: array of { label, value, accent? } where accent is one of "default"|"muted"|"good"|"warn"|"danger".
- href: internal app path (e.g. "/projects/42") that opens the entity when the card is clicked.
- accent: "default"|"good"|"warn"|"danger" — drives the color bar/icon.
- actions: optional array of { label, type, projectId?, data? } where type is one of the supported write actions; the user can click the action button to execute it. \`projectId\` is optional — only include it when the action is project-scoped.

Use cards when:
- Listing 2 or more entities (each becomes a card).
- Showing a single key entity in detail.
- Highlighting key metrics or KPIs (use "metric" type).
- Suggesting a single concrete next step (use "action" type with an actions array).

DESTRUCTIVE-CONFIRMATION CARDS (REQUIRED PATTERN):
You must NEVER call a tool to delete a project, portfolio, task, risk, issue, or resource, to bulk-delete tasks, or to remove an org member. Those operations are too dangerous to invoke from a tool loop.

Instead, when the user asks for any of those, emit a single "action"-type Friday card whose \`actions\` array contains BOTH a destructive button AND a "cancel" button. The UI styles destructive actions in red and renders Cancel as a dismissal. Example:

\`\`\`friday-card
{"type":"action","title":"Delete project \"Website Redesign\"?","subtitle":"This soft-deletes the project and all its tasks/risks/issues. You can restore it from the Recycle Bin.","accent":"danger","actions":[{"label":"Delete project","type":"delete_project","projectId":42,"data":{}},{"label":"Cancel","type":"cancel"}]}
\`\`\`

Destructive action types: delete_portfolio, delete_project, delete_risk, delete_issue, delete_task, bulk_delete_tasks, delete_resource, remove_member.

Each destructive card MUST:
- include exactly one destructive action plus a "cancel" action,
- use \`accent:"danger"\`,
- carry the IDs the executor needs in either \`projectId\` (for project-scoped deletes) or inside \`data\` (e.g. \`{"portfolioId":7}\`, \`{"resourceId":12}\`, \`{"taskIds":[1,2,3]}\`, \`{"userId":"abc"}\`).

For non-destructive actions (create_*, update_*, add_project_to_portfolio, remove_project_from_portfolio, assign_resources_to_task, invite_member, assign_owner, add_note, flag_for_review) you may either call the matching tool directly after explicit confirmation, OR offer them as Friday card actions. Tool calls are preferred when the user has clearly confirmed in chat.

Choose accent based on data:
- Health Red, overdue, blocked → "danger".
- Health Amber, at-risk, due soon → "warn".
- Health Green, on track, completed → "good".
- Otherwise → "default".

Do NOT wrap cards inside other markdown containers (no nested fences). It is fine to mix a short paragraph of prose followed by several card blocks. Always emit cards as standalone top-level fenced blocks.

${GANTT_DIRECTIVE}

${BURNDOWN_DIRECTIVE}

${SCURVE_DIRECTIVE}

${QUICK_REPLIES_DIRECTIVE}

${REPORT_DIRECTIVE}`;

export interface JarvisContext {
  projects: any[];
  portfolios: any[];
  risks: any[];
  issues: any[];
  tasks: any[];
  milestones: any[];
  dependencies: any[];
  resources: any[];
  statusReports: any[];
  healthHistory: any[];
  // Org's fiscal calendar setting (1..12 calendar month that is FY M1).
  // Drives every fiscal-period label/order so AI summaries stay consistent
  // with what users see in financial grids and exports.
  fiscalYearStartMonth: number;
  // Org-wide signals (rolled up to keep token budget reasonable)
  financialsRollup: Array<{
    projectId: number;
    fiscalYear: number;
    scenario: string;
    financialView: string | null;
    total: number;
  }>;
  timesheetsRollup: Array<{
    projectId: number;
    userId: string;
    totalHours: number;
    days: number;
  }>;
  deliverables: Array<{
    taskId: number;
    projectId: number;
    name: string;
    deliverables: string;
    status: string | null;
    endDate: string | null;
  }>;
  // Time-phased EVM (PV/EV/AC/EAC cumulative per fiscal month) per project
  // for the current fiscal year, ready to drop straight into an `s-curve`
  // chart block. Computed by `gatherProjectEvmSeries` using the same math
  // as the Financials → S-Curve dashboard route.
  evmTimePhased: ProjectEvmSeries[];
  // Ideal-vs-actual remaining-work series per project, ready to drop into
  // a `burndown-chart` block. Computed by `gatherProjectBurndowns` from
  // task progress + dates over the project window.
  burndowns: ProjectBurndown[];
}

// Short-lived in-memory cache so back-to-back chat turns from the same user
// don't re-issue ~10 parallel queries. TTL is small enough that data feels
// fresh; users rarely send a new message and immediately expect to see a
// project they created < 20s ago reflected in Friday's context.
const ORG_CONTEXT_TTL_MS = 20_000;
const orgContextCache = new Map<number, { value: JarvisContext; expiresAt: number }>();

export function invalidateOrganizationContextCache(orgId?: number) {
  if (orgId == null) orgContextCache.clear();
  else orgContextCache.delete(orgId);
}

export async function gatherOrganizationContext(orgId: number): Promise<JarvisContext> {
  const now = Date.now();
  const cached = orgContextCache.get(orgId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const value = await gatherOrganizationContextUncached(orgId);
  orgContextCache.set(orgId, { value, expiresAt: now + ORG_CONTEXT_TTL_MS });
  return value;
}

// Project lifecycle states that are explicitly terminal — projects in any of
// these are not in flight, so Friday excludes them from time-phased EVM and
// burndown payloads. Anything else (including the canonical
// Initiation/Planning/Execution/Monitoring/Closing/Billing states from
// `PROJECT_STATUSES_EXTENDED`, the legacy "Active"/"On Hold" values still
// present on a few older rows, and unknown/null statuses) is treated as
// chartable so dashboards stay populated.
const TERMINAL_PROJECT_STATUSES = new Set([
  "Closed",
  "Cancelled",
  "Completed",
  "Archived",
]);

// Cap is intentionally generous so orgs with dozens of in-flight projects
// don't get partial chart coverage. The bigger payload is still bounded by
// the per-project series size (12 EVM points + ~16 burndown points).
const PROJECT_CHART_CAP = 200;

export function selectChartableProjectIds<T extends { id: number; status?: string | null }>(
  projects: T[],
): number[] {
  const ids: number[] = [];
  for (const p of projects) {
    const s = p.status == null ? null : String(p.status);
    if (s && TERMINAL_PROJECT_STATUSES.has(s)) continue;
    ids.push(p.id);
    if (ids.length >= PROJECT_CHART_CAP) break;
  }
  return ids;
}

async function gatherOrganizationContextUncached(orgId: number): Promise<JarvisContext> {
  const [orgRow] = await db.select({ fiscalYearStartMonth: organizations.fiscalYearStartMonth })
    .from(organizations).where(eq(organizations.id, orgId));
  const fiscalYearStartMonth = normalizeFiscalYearStartMonth(
    orgRow?.fiscalYearStartMonth ?? DEFAULT_FISCAL_YEAR_START_MONTH,
  );
  const [orgProjects, orgPortfolios, orgResources] = await Promise.all([
    db.select().from(projects).where(
      and(eq(projects.organizationId, orgId), isNull(projects.deletedAt))
    ),
    db.select().from(portfolios).where(
      and(eq(portfolios.organizationId, orgId), isNull(portfolios.deletedAt))
    ),
    db.select({
      id: resources.id,
      displayName: resources.displayName,
      resourceType: resources.resourceType,
      title: resources.title,
      department: resources.department,
    }).from(resources).where(
      and(eq(resources.organizationId, orgId), isNull(resources.deletedAt))
    ),
  ]);

  const projectIds = orgProjects.map(p => p.id);
  if (projectIds.length === 0) {
    return {
      projects: [],
      portfolios: orgPortfolios.map(summarizePortfolio),
      risks: [],
      issues: [],
      tasks: [],
      milestones: [],
      dependencies: [],
      resources: orgResources,
      statusReports: [],
      healthHistory: [],
      fiscalYearStartMonth,
      financialsRollup: [],
      timesheetsRollup: [],
      deliverables: [],
      evmTimePhased: [],
      burndowns: [],
    };
  }

  const MAX_ISSUES = 200;
  const MAX_TASKS = 300;
  const MAX_DEPS = 100;

  // Compute the start of the previous 90 days for timesheet rollup
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split("T")[0];

  // Determine current fiscal year (calendar-anchored) for financial rollup
  const _now = new Date();
  const _calMonth = _now.getMonth() + 1;
  const _currentFy = fiscalYearStartMonth === 1
    ? _now.getFullYear()
    : (_calMonth >= fiscalYearStartMonth ? _now.getFullYear() + 1 : _now.getFullYear());

  const [allIssues, allTasks, allDeps, recentReports, recentHealth, financialsAgg, timesheetsAgg, deliverableTasks] = await Promise.all([
    db.select({
      id: issues.id,
      projectId: issues.projectId,
      itemType: issues.itemType,
      issueNumber: issues.issueNumber,
      title: issues.title,
      description: issues.description,
      category: issues.category,
      priority: issues.priority,
      severity: issues.severity,
      status: issues.status,
      assignee: issues.assignee,
      targetResolutionDate: issues.targetResolutionDate,
      actualResolutionDate: issues.actualResolutionDate,
      probability: issues.probability,
      impact: issues.impact,
      riskScore: issues.riskScore,
      responseStrategy: issues.responseStrategy,
      mitigationPlan: issues.mitigationPlan,
      contingencyPlan: issues.contingencyPlan,
      escalatedToPortfolio: issues.escalatedToPortfolio,
      dueDate: issues.dueDate,
      proximity: issues.proximity,
    }).from(issues).where(
      and(inArray(issues.projectId, projectIds), isNull(issues.deletedAt))
    ).limit(MAX_ISSUES),
    db.select({
      id: tasks.id,
      projectId: tasks.projectId,
      name: tasks.name,
      status: tasks.status,
      priority: tasks.priority,
      startDate: tasks.startDate,
      endDate: tasks.endDate,
      progress: tasks.progress,
      assignee: tasks.assignee,
      isMilestone: tasks.isMilestone,
      isCritical: tasks.isCritical,
      milestoneType: tasks.milestoneType,
      deliverables: tasks.deliverables,
    }).from(tasks).where(
      and(inArray(tasks.projectId, projectIds), isNull(tasks.deletedAt))
    ).limit(MAX_TASKS),
    db.select().from(taskDependencies).where(
      inArray(taskDependencies.taskId, sql`(SELECT id FROM tasks WHERE project_id IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)}) AND deleted_at IS NULL)`)
    ).limit(MAX_DEPS).catch(() => []),
    db.select({
      id: statusReportHistory.id,
      projectId: statusReportHistory.projectId,
      reportDate: statusReportHistory.reportDate,
      executiveSummary: statusReportHistory.executiveSummary,
      projectHealth: statusReportHistory.projectHealth,
      completionPercentage: statusReportHistory.completionPercentage,
      openRisksCount: statusReportHistory.openRisksCount,
      openIssuesCount: statusReportHistory.openIssuesCount,
    }).from(statusReportHistory).where(
      inArray(statusReportHistory.projectId, projectIds)
    ).orderBy(desc(statusReportHistory.createdAt)).limit(50),
    db.select().from(healthStatusHistory).where(
      inArray(healthStatusHistory.projectId, projectIds)
    ).orderBy(desc(healthStatusHistory.createdAt)).limit(30),
    // Financials rollup: current + previous fiscal year, grouped by
    // project / fiscal year / scenario / financial view (Capital, Direct Expense, Labor).
    db.select({
      projectId: financialEntries.projectId,
      fiscalYear: financialEntries.fiscalYear,
      scenario: financialEntries.scenario,
      financialView: financialEntries.financialView,
      total: sql<string>`COALESCE(SUM(${financialEntries.amount}), 0)`,
    })
      .from(financialEntries)
      .where(and(
        inArray(financialEntries.projectId, projectIds),
        inArray(financialEntries.fiscalYear, [_currentFy, _currentFy - 1]),
      ))
      .groupBy(
        financialEntries.projectId,
        financialEntries.fiscalYear,
        financialEntries.scenario,
        financialEntries.financialView,
      )
      .limit(400)
      .catch(() => [] as any[]),
    // Timesheet rollup: last 90 days, grouped by project + user.
    db.select({
      projectId: timesheetEntries.projectId,
      userId: timesheetEntries.userId,
      totalHours: sql<string>`COALESCE(SUM(${timesheetEntries.hours}), 0)`,
      days: sql<number>`COUNT(DISTINCT ${timesheetEntries.entryDate})`,
    })
      .from(timesheetEntries)
      .where(and(
        eq(timesheetEntries.organizationId, orgId),
        gte(timesheetEntries.entryDate, ninetyDaysAgoStr),
      ))
      .groupBy(timesheetEntries.projectId, timesheetEntries.userId)
      .limit(300)
      .catch(() => [] as any[]),
    // Deliverables: tasks with non-empty `deliverables` content.
    db.select({
      taskId: tasks.id,
      projectId: tasks.projectId,
      name: tasks.name,
      deliverables: tasks.deliverables,
      status: tasks.status,
      endDate: tasks.endDate,
    })
      .from(tasks)
      .where(and(
        inArray(tasks.projectId, projectIds),
        isNull(tasks.deletedAt),
        isNotNull(tasks.deliverables),
        sql`${tasks.deliverables} <> ''`,
      ))
      .limit(150)
      .catch(() => [] as any[]),
  ]);

  const risksData = allIssues.filter(i => i.itemType === "risk");
  const issuesData = allIssues.filter(i => i.itemType === "issue");
  const tasksData = allTasks.filter(t => !t.isMilestone);
  const milestonesData = allTasks.filter(t => t.isMilestone);

  const financialsRollup = (financialsAgg as any[]).map((row) => ({
    projectId: row.projectId,
    fiscalYear: row.fiscalYear,
    scenario: row.scenario,
    financialView: row.financialView,
    total: Number(row.total) || 0,
  }));

  const timesheetsRollup = (timesheetsAgg as any[]).map((row) => ({
    projectId: row.projectId,
    userId: row.userId,
    totalHours: Number(row.totalHours) || 0,
    days: Number(row.days) || 0,
  }));

  const deliverablesData = (deliverableTasks as any[]).map((row) => ({
    taskId: row.taskId,
    projectId: row.projectId,
    name: row.name,
    deliverables: String(row.deliverables ?? ""),
    status: row.status ?? null,
    endDate: row.endDate ?? null,
  }));

  // Time-phased EVM + burndown for non-terminal projects only. We catch and
  // log here (rather than swallowing silently) so an analytics failure
  // degrades to "no chart data" without taking down the rest of the Friday
  // context, but the failure is still visible in server logs for diagnosis.
  const activeProjectIds = selectChartableProjectIds(orgProjects);
  const [evmTimePhased, burndowns] = await Promise.all([
    gatherProjectEvmSeries(fiscalYearStartMonth, activeProjectIds)
      .then(r => r.projects)
      .catch((err) => {
        console.error(`[jarvis] gatherProjectEvmSeries failed for org ${orgId}:`, err);
        return [] as ProjectEvmSeries[];
      }),
    gatherProjectBurndowns(activeProjectIds).catch((err) => {
      console.error(`[jarvis] gatherProjectBurndowns failed for org ${orgId}:`, err);
      return [] as ProjectBurndown[];
    }),
  ]);

  return {
    projects: orgProjects.map(summarizeProject),
    portfolios: orgPortfolios.map(summarizePortfolio),
    risks: risksData,
    issues: issuesData,
    tasks: tasksData,
    milestones: milestonesData,
    dependencies: allDeps,
    resources: orgResources,
    statusReports: recentReports,
    healthHistory: recentHealth,
    fiscalYearStartMonth,
    financialsRollup,
    timesheetsRollup,
    deliverables: deliverablesData,
    evmTimePhased,
    burndowns,
  };
}

function summarizeProject(p: any) {
  return {
    id: p.id,
    name: p.name,
    projectCode: p.projectCode,
    status: p.status,
    priority: p.priority,
    health: p.health,
    healthReason: p.healthReason,
    completionPercentage: p.completionPercentage,
    startDate: p.startDate,
    endDate: p.endDate,
    budget: p.budget,
    actualCost: p.actualCost,
    forecastCost: p.forecastCost,
    portfolioId: p.portfolioId,
    managerId: p.managerId,
    businessSponsorId: p.businessSponsorId,
    riskLevel: p.riskLevel,
    department: p.department,
    category: p.category,
    scheduleVariance: p.scheduleVariance,
    costVariance: p.costVariance,
    billableStatus: p.billableStatus,
  };
}

function summarizePortfolio(p: any) {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    healthScore: p.healthScore,
    budgetAllocated: p.budgetAllocated,
    budgetSpent: p.budgetSpent,
    riskTolerance: p.riskTolerance,
    department: p.department,
    strategicObjective: p.strategicObjective,
    targetStartDate: p.targetStartDate,
    targetEndDate: p.targetEndDate,
  };
}

function buildDataContext(ctx: JarvisContext): string {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const projectCount = ctx.projects.length;
  const atRisk = ctx.projects.filter(p => p.health === "Red");
  const amber = ctx.projects.filter(p => p.health === "Yellow");
  const openRisks = ctx.risks.filter(r => !["Closed", "Mitigated"].includes(r.status));
  const openIssues = ctx.issues.filter(i => !["Resolved", "Closed"].includes(i.status));
  const overdueTasks = ctx.tasks.filter(t =>
    t.endDate && new Date(t.endDate) < now && t.status !== "Completed" && t.status !== "Cancelled"
  );
  const upcomingMilestones = ctx.milestones.filter(m => {
    if (!m.endDate) return false;
    const d = new Date(m.endDate);
    return d >= now && d <= new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) && m.status !== "Completed";
  });
  const risksWithoutMitigation = openRisks.filter(r => !r.mitigationPlan && !r.responseStrategy);
  const projectsWithoutManager = ctx.projects.filter(p => !p.managerId);

  // Fiscal calendar context: compute the current FY's bounds + quarter labels
  // from the same helper the grids/exports use, so any AI mention of fiscal
  // periods is consistent (no hardcoded Oct labels for non-October orgs).
  const fyStart = ctx.fiscalYearStartMonth;
  const calMonth = now.getMonth() + 1;
  // FY label = the calendar year in which the FY ends.
  const currentFiscalYear = fyStart === 1
    ? now.getFullYear()
    : (calMonth >= fyStart ? now.getFullYear() + 1 : now.getFullYear());
  const fyMonths = buildFiscalMonths(currentFiscalYear, fyStart);
  const fyQuarters = buildFiscalQuarters(currentFiscalYear, fyStart);
  const currentFyMonth = fyMonths.find(m => m.year === now.getFullYear() && m.month === calMonth);
  const currentFyQuarter = fyQuarters.find(q =>
    currentFyMonth ? q.monthIndices.includes(currentFyMonth.monthNum - 1) : false
  );

  let summary = `## Current Data Snapshot (as of ${todayStr})\n\n`;
  summary += `**Fiscal Calendar:** FY starts in ${fyMonths[0].longLabel}. `
    + `Current period is FY ${currentFiscalYear} `
    + `(${fyMonths[0].label} ${fyMonths[0].year} – ${fyMonths[11].label} ${fyMonths[11].year}). `
    + `Quarters: ${fyQuarters.map(q => `${q.label} (${q.hint})`).join(", ")}. `
    + (currentFyMonth && currentFyQuarter
      ? `Today falls in fiscal month M${currentFyMonth.monthNum} (${currentFyMonth.label}) / `
        + `${currentFyQuarter.label}.\n`
      : `Today is outside the current fiscal year window.\n`);
  summary += `**Organization Overview:** ${projectCount} projects, ${ctx.portfolios.length} portfolios, ${ctx.resources.length} resources\n`;
  summary += `**Health:** ${atRisk.length} Red, ${amber.length} Yellow, ${projectCount - atRisk.length - amber.length} Green\n`;
  summary += `**Open Risks:** ${openRisks.length} | **Open Issues:** ${openIssues.length}\n`;
  summary += `**Overdue Tasks:** ${overdueTasks.length} | **Upcoming Milestones (14d):** ${upcomingMilestones.length}\n`;
  summary += `**Risks without mitigation plan:** ${risksWithoutMitigation.length}\n`;
  summary += `**Projects without manager:** ${projectsWithoutManager.length}\n\n`;

  summary += `### Projects\n${JSON.stringify(ctx.projects, null, 1)}\n\n`;

  if (ctx.portfolios.length > 0) {
    summary += `### Portfolios\n${JSON.stringify(ctx.portfolios, null, 1)}\n\n`;
  }

  if (openRisks.length > 0) {
    summary += `### Open Risks (${openRisks.length})\n${JSON.stringify(openRisks, null, 1)}\n\n`;
  }

  if (openIssues.length > 0) {
    summary += `### Open Issues (${openIssues.length})\n${JSON.stringify(openIssues, null, 1)}\n\n`;
  }

  if (overdueTasks.length > 0) {
    summary += `### Overdue Tasks (${overdueTasks.length})\n${JSON.stringify(overdueTasks, null, 1)}\n\n`;
  }

  const activeTasks = ctx.tasks.filter(t => t.status === "In Progress").slice(0, 30);
  if (activeTasks.length > 0) {
    summary += `### In-Progress Tasks (${activeTasks.length})\n${JSON.stringify(activeTasks, null, 1)}\n\n`;
  }

  if (upcomingMilestones.length > 0) {
    summary += `### Upcoming Milestones\n${JSON.stringify(upcomingMilestones, null, 1)}\n\n`;
  }

  if (ctx.dependencies.length > 0) {
    summary += `### Task Dependencies (${ctx.dependencies.length})\n${JSON.stringify(ctx.dependencies.slice(0, 30), null, 1)}\n\n`;
  }

  if (ctx.statusReports.length > 0) {
    summary += `### Recent Status Reports\n${JSON.stringify(ctx.statusReports.slice(0, 10), null, 1)}\n\n`;
  }

  if (ctx.healthHistory.length > 0) {
    summary += `### Recent Health Changes\n${JSON.stringify(ctx.healthHistory.slice(0, 10), null, 1)}\n\n`;
  }

  // ----- Org-wide signals: financials, timesheets, deliverables -----

  if (ctx.financialsRollup.length > 0) {
    // Compute totals per project (across all FY/scenario/view) and a
    // budget-vs-actual snapshot for the current FY for quick reasoning.
    const byProject = new Map<number, { budget: number; forecast: number; actual: number }>();
    for (const r of ctx.financialsRollup) {
      const cur = byProject.get(r.projectId) ?? { budget: 0, forecast: 0, actual: 0 };
      const s = (r.scenario || "").toLowerCase();
      if (s === "aop") cur.budget += r.total;
      else if (s === "fcst") cur.forecast += r.total;
      else if (s === "act") cur.actual += r.total;
      byProject.set(r.projectId, cur);
    }
    const budgetVsActual = Array.from(byProject.entries()).map(([projectId, t]) => ({
      projectId,
      budget: Math.round(t.budget),
      forecast: Math.round(t.forecast),
      actual: Math.round(t.actual),
      variance: Math.round(t.budget - t.actual),
    }));

    summary += `### Org-wide Financial Signals\n`;
    summary += `Rolled up from \`financial_entries\` for the current and previous fiscal year, by project / fiscal year / scenario (aop=Plan, fcst=Forecast, act=Actual) / financial view (Capital, Direct Expense, Labor). Use these totals when the user asks "how much have we spent / planned / forecasted on Project X".\n\n`;
    summary += `**Budget vs Actual (FY current + previous combined, per project):**\n${JSON.stringify(budgetVsActual.slice(0, 50), null, 1)}\n\n`;
    summary += `**Detailed rollup (by FY/scenario/view):**\n${JSON.stringify(ctx.financialsRollup.slice(0, 200), null, 1)}\n\n`;
  }

  if (ctx.timesheetsRollup.length > 0) {
    // Aggregate to a "hours per project" view so common questions like
    // "who is logging the most time on Project X" or "total hours on Project Y last quarter"
    // can be answered directly.
    const hoursByProject = new Map<number, number>();
    for (const r of ctx.timesheetsRollup) {
      hoursByProject.set(r.projectId, (hoursByProject.get(r.projectId) ?? 0) + r.totalHours);
    }
    const hoursPerProject = Array.from(hoursByProject.entries())
      .map(([projectId, hours]) => ({ projectId, totalHours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => b.totalHours - a.totalHours)
      .slice(0, 50);

    summary += `### Org-wide Time Tracking (last 90 days)\n`;
    summary += `Rolled up from \`timesheet_entries\`. Use when the user asks about effort spent, who is working on what, or capacity utilization.\n\n`;
    summary += `**Hours per project (last 90d):**\n${JSON.stringify(hoursPerProject, null, 1)}\n\n`;
    summary += `**Hours per (project, user) (last 90d):**\n${JSON.stringify(ctx.timesheetsRollup.slice(0, 200), null, 1)}\n\n`;
  }

  if (ctx.deliverables.length > 0) {
    summary += `### Project Deliverables\n`;
    summary += `Tasks that explicitly enumerate deliverables (artifacts, outputs, signed contracts, releases, etc.). Use when the user asks "what deliverables do we owe on Project X" or "what was promised this quarter".\n\n`;
    summary += `${JSON.stringify(ctx.deliverables.slice(0, 100), null, 1)}\n\n`;
  }

  if (ctx.evmTimePhased.length > 0) {
    summary += `### Time-Phased EVM (S-Curve ready) — current FY\n`;
    summary += `Per-project cumulative Planned Value (pvCum), Earned Value (evCum), Actual Cost (acCum), and Estimate at Completion (eacCum) for each fiscal month of the current FY. These are the EXACT numbers the Financials → S-Curve dashboard renders. When the user asks for an S-curve, EVM chart, or PV-vs-EV view, drop these straight into an \`s-curve\` block (use \`points[].label\` for x-axis, \`pvCum\`/\`evCum\`/\`acCum\`/\`eacCum\` for the four series, and \`asOfIndex\` for the today line). Only include earned/actual on points up to \`asOfIndex\`; future points should keep PV/EAC only. Do NOT invent values for projects not present here.\n\n`;
    summary += `${JSON.stringify(ctx.evmTimePhased, null, 1)}\n\n`;
  }

  if (ctx.burndowns.length > 0) {
    summary += `### Project Burndown Series (ideal vs actual remaining work)\n`;
    summary += `Per-project ideal-vs-actual remaining work over the project window, weighted by estimated hours when available (\`unit\`: hrs/days/tasks). Drop straight into a \`burndown-chart\` block: \`points[].label\` → x-axis, \`ideal\`/\`actual\` → series, \`asOfIndex\` → today marker, \`unit\` → chart \`unit\`. \`actual\` is null for buckets after today (don't emit those into the actual line). Only emit charts for projects listed here.\n\n`;
    summary += `${JSON.stringify(ctx.burndowns, null, 1)}\n\n`;
  }

  // Always emphasize that milestones are first-class
  if (ctx.milestones.length > 0) {
    const completedMilestones = ctx.milestones.filter(m => m.status === "Completed").length;
    summary += `### Milestone Roll-up\n`;
    summary += `${ctx.milestones.length} total milestones, ${completedMilestones} completed, ${ctx.milestones.length - completedMilestones} open. Treat these as critical schedule anchors when summarizing project progress.\n\n`;
  }

  return summary;
}

export interface JarvisMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const jarvisTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task in a project. Call this ONLY after the user has explicitly confirmed (e.g. said 'yes', 'proceed', 'do it', 'go ahead').",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID to create the task in" },
          name: { type: "string", description: "The task name" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"], description: "Task priority" },
          description: { type: "string", description: "Optional task description" },
          assignee: { type: "string", description: "Optional assignee name" },
        },
        required: ["projectId", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_risk",
      description: "Create a new risk/mitigation entry in a project. Call this ONLY after the user has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID" },
          title: { type: "string", description: "The risk title" },
          description: { type: "string", description: "Risk description" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          probability: { type: "string", enum: ["Very Low", "Low", "Medium", "High", "Very High"] },
          impact: { type: "string", enum: ["Very Low", "Low", "Medium", "High", "Very High"] },
          responseStrategy: { type: "string", enum: ["Avoid", "Transfer", "Mitigate", "Accept"] },
          mitigationPlan: { type: "string", description: "The mitigation plan" },
        },
        required: ["projectId", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_issue",
      description: "Create a new issue in a project. Call this ONLY after the user has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID" },
          title: { type: "string", description: "The issue title" },
          description: { type: "string", description: "Issue description" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          severity: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
        },
        required: ["projectId", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_project_note",
      description: "Add or update notes on a project. Call this ONLY after the user has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID" },
          note: { type: "string", description: "The note content" },
        },
        required: ["projectId", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "flag_project_for_review",
      description: "Flag a project for review by setting its health to Red. Call this ONLY after the user has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID" },
          reason: { type: "string", description: "The reason for flagging" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update an existing task's metadata. You can change status, priority, assignee, dates, progress, description, and other fields. Call this ONLY after the user has explicitly confirmed. Use the task ID from the data context.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "number", description: "The task ID to update" },
          projectId: { type: "number", description: "The project ID the task belongs to" },
          name: { type: "string", description: "New task name" },
          description: { type: "string", description: "New task description" },
          status: { type: "string", enum: ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"], description: "New task status" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"], description: "New task priority" },
          assignee: { type: "string", description: "New assignee name (text field)" },
          progress: { type: "number", description: "Progress percentage (0-100)" },
          startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
          endDate: { type: "string", description: "End date in YYYY-MM-DD format" },
          isMilestone: { type: "boolean", description: "Whether this is a milestone" },
          isCritical: { type: "boolean", description: "Whether this is on the critical path" },
        },
        required: ["taskId", "projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_resources_to_task",
      description: "Assign one or more resources (people) to a task. This replaces all current resource assignments on the task. Use the resource IDs from the data context. Call this ONLY after the user has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "number", description: "The task ID to assign resources to" },
          projectId: { type: "number", description: "The project ID the task belongs to" },
          resourceIds: {
            type: "array",
            items: { type: "number" },
            description: "Array of resource IDs to assign to the task. Pass an empty array to remove all assignments.",
          },
          allocations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                resourceId: { type: "number" },
                allocationPercentage: { type: "number", description: "Allocation percentage (0-100), default 100" },
              },
              required: ["resourceId"],
            },
            description: "Optional allocation percentages per resource. If not provided, defaults to 100% for each.",
          },
        },
        required: ["taskId", "projectId", "resourceIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_resource",
      description: "Create a new resource (person/team member) in the organization. Call this ONLY after the user has explicitly confirmed. This is organization-scoped — no project ID needed.",
      parameters: {
        type: "object",
        properties: {
          displayName: { type: "string", description: "Full display name of the resource (required)" },
          firstName: { type: "string", description: "First name" },
          lastName: { type: "string", description: "Last name" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
          title: { type: "string", description: "Job title or role (e.g. 'Senior Developer', 'Project Manager')" },
          department: { type: "string", description: "Department (e.g. 'Engineering', 'Design', 'Marketing')" },
          resourceType: { type: "string", enum: ["Employee", "Contractor", "Vendor", "Equipment", "Material"], description: "Type of resource" },
          location: { type: "string", description: "Office location" },
          skills: { type: "string", description: "Comma-separated skills (e.g. 'JavaScript, React, Node.js')" },
          experienceLevel: { type: "string", enum: ["Junior", "Mid-Level", "Senior", "Lead", "Principal"], description: "Experience level" },
          hourlyRate: { type: "string", description: "Standard hourly rate (numeric string)" },
          weeklyCapacity: { type: "string", description: "Hours per week available (numeric string, default 40)" },
          availability: { type: "number", description: "Availability percentage 0-100 (default 100)" },
          startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
          isBillable: { type: "boolean", description: "Whether this resource is billable (default true)" },
        },
        required: ["displayName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_create_resources",
      description: "Create multiple resources (people/team members) in the organization at once. Call this ONLY after presenting the list to the user and receiving explicit confirmation. This is organization-scoped — no project ID needed.",
      parameters: {
        type: "object",
        properties: {
          resources: {
            type: "array",
            description: "Array of resource objects to create",
            items: {
              type: "object",
              properties: {
                displayName: { type: "string", description: "Full display name (required)" },
                firstName: { type: "string", description: "First name" },
                lastName: { type: "string", description: "Last name" },
                email: { type: "string", description: "Email address" },
                phone: { type: "string", description: "Phone number" },
                title: { type: "string", description: "Job title or role" },
                department: { type: "string", description: "Department" },
                resourceType: { type: "string", enum: ["Employee", "Contractor", "Vendor", "Equipment", "Material"], description: "Type of resource" },
                location: { type: "string", description: "Office location" },
                skills: { type: "string", description: "Comma-separated skills" },
                experienceLevel: { type: "string", enum: ["Junior", "Mid-Level", "Senior", "Lead", "Principal"], description: "Experience level" },
                hourlyRate: { type: "string", description: "Standard hourly rate" },
                weeklyCapacity: { type: "string", description: "Hours per week available (default 40)" },
                availability: { type: "number", description: "Availability percentage 0-100" },
                startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
                isBillable: { type: "boolean", description: "Whether this resource is billable (default true)" },
              },
              required: ["displayName"],
            },
          },
        },
        required: ["resources"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email on behalf of the user. Two-step flow REQUIRED: (1) First call with userConfirmed=false to validate recipients and preview — this returns a preview without sending. (2) Show the user the preview (recipients, subject, body summary, attachments) and ask 'Send it?'. Only after the user explicitly says yes (e.g. 'yes', 'send', 'go ahead'), call again with userConfirmed=true to actually send. Recipients must already exist in the user's organization (members or resources with email on file). To attach a PDF, pass its pdfId from generate_pdf.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "array",
            items: { type: "string" },
            description: "Recipient email addresses (org members or resources only).",
          },
          cc: {
            type: "array",
            items: { type: "string" },
            description: "Optional CC list (org members or resources only).",
          },
          subject: { type: "string", description: "Subject line (max 200 chars)." },
          body: { type: "string", description: "Body in plain text or simple markdown." },
          pdfId: { type: "string", description: "Optional pdfId from a prior generate_pdf call." },
          userConfirmed: { type: "boolean", description: "Set false to preview/validate; set true ONLY after the user has explicitly approved sending in chat." },
        },
        required: ["to", "subject", "body", "userConfirmed"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_portfolio",
      description: "Create a new portfolio in the organization. Call ONLY after the user has explicitly confirmed. Organization-scoped (no projectId).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Portfolio name (required)" },
          description: { type: "string", description: "Description" },
          status: { type: "string", description: "Status (e.g. Active, Planning, On Hold)" },
          department: { type: "string", description: "Department" },
          strategicObjective: { type: "string", description: "Strategic objective the portfolio serves" },
          riskTolerance: { type: "string", description: "Risk tolerance (e.g. Low, Medium, High)" },
          budgetAllocated: { type: "string", description: "Allocated budget (numeric string)" },
          targetStartDate: { type: "string", description: "Target start date YYYY-MM-DD" },
          targetEndDate: { type: "string", description: "Target end date YYYY-MM-DD" },
          isCustom: { type: "boolean", description: "True for custom portfolios that group projects manually instead of by foreign key" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_pdf",
      description: "Generate a downloadable PDF report from markdown content. ALWAYS use this when the user asks for a PDF, document, report file, or anything that should be exported. Never tell the user you cannot generate PDFs — call this tool instead. Returns a download link the user can click. This is organization-scoped — no project ID needed.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title shown at the top of the PDF and used as the document title (max 200 chars)." },
          filename: { type: "string", description: "Optional filename for the download (e.g. 'weekly-update.pdf'). If omitted, a slug of the title is used." },
          content: { type: "string", description: "The full body of the report as markdown. Supports headings (#, ##, ###), bullet lists (-, *), numbered lists, bold (**text**), and paragraphs." },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_portfolio",
      description: "Update an existing portfolio's metadata. Call ONLY after explicit confirmation. Use the portfolioId from the data context.",
      parameters: {
        type: "object",
        properties: {
          portfolioId: { type: "number", description: "Portfolio ID to update" },
          name: { type: "string" },
          description: { type: "string" },
          status: { type: "string" },
          department: { type: "string" },
          strategicObjective: { type: "string" },
          riskTolerance: { type: "string" },
          budgetAllocated: { type: "string" },
          targetStartDate: { type: "string", description: "YYYY-MM-DD" },
          targetEndDate: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["portfolioId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_project_to_portfolio",
      description: "Link a project to a custom portfolio. Call ONLY after explicit confirmation. Both IDs are required.",
      parameters: {
        type: "object",
        properties: {
          portfolioId: { type: "number" },
          projectId: { type: "number" },
        },
        required: ["portfolioId", "projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_project_from_portfolio",
      description: "Unlink a project from a custom portfolio. Call ONLY after explicit confirmation.",
      parameters: {
        type: "object",
        properties: {
          portfolioId: { type: "number" },
          projectId: { type: "number" },
        },
        required: ["portfolioId", "projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description: "Create a new project in the organization. Call ONLY after explicit confirmation. Organization-scoped (no parent projectId).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Project name (required)" },
          projectCode: { type: "string", description: "Optional unique project code (e.g. PRJ-2025-007)" },
          description: { type: "string" },
          status: { type: "string", enum: ["Initiation", "Planning", "Execution", "Monitoring", "Closing"] },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          methodology: { type: "string", enum: ["Waterfall", "Agile", "Hybrid", "Scrum", "Kanban"] },
          portfolioId: { type: "number", description: "Optional parent portfolio ID" },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          endDate: { type: "string", description: "YYYY-MM-DD" },
          budget: { type: "string", description: "Budget (numeric string)" },
          department: { type: "string" },
          managerId: { type: "string", description: "User ID of the project manager" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project",
      description: "Update an existing project's metadata (status, priority, dates, manager, etc.). Call ONLY after explicit confirmation.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number" },
          name: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["Initiation", "Planning", "Execution", "Monitoring", "Closing"] },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          methodology: { type: "string", enum: ["Waterfall", "Agile", "Hybrid", "Scrum", "Kanban"] },
          health: { type: "string", enum: ["Green", "Yellow", "Red"] },
          healthReason: { type: "string" },
          portfolioId: { type: "number" },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          endDate: { type: "string", description: "YYYY-MM-DD" },
          budget: { type: "string" },
          completionPercentage: { type: "number", description: "0-100" },
          managerId: { type: "string" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_risk",
      description: "Update an existing risk's metadata. Call ONLY after explicit confirmation.",
      parameters: {
        type: "object",
        properties: {
          riskId: { type: "number" },
          projectId: { type: "number", description: "Project the risk belongs to (for verification)" },
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          status: { type: "string" },
          probability: { type: "string", enum: ["Very Low", "Low", "Medium", "High", "Very High"] },
          impact: { type: "string", enum: ["Very Low", "Low", "Medium", "High", "Very High"] },
          responseStrategy: { type: "string", enum: ["Avoid", "Transfer", "Mitigate", "Accept"] },
          mitigationPlan: { type: "string" },
          contingencyPlan: { type: "string" },
          assignee: { type: "string" },
          dueDate: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["riskId", "projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_issue",
      description: "Update an existing issue's metadata. Call ONLY after explicit confirmation.",
      parameters: {
        type: "object",
        properties: {
          issueId: { type: "number" },
          projectId: { type: "number", description: "Project the issue belongs to (for verification)" },
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          severity: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          status: { type: "string" },
          assignee: { type: "string" },
          targetResolutionDate: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["issueId", "projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_resource",
      description: "Update an existing organization resource's metadata. Call ONLY after explicit confirmation. Organization-scoped (no projectId).",
      parameters: {
        type: "object",
        properties: {
          resourceId: { type: "number" },
          displayName: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          title: { type: "string" },
          department: { type: "string" },
          resourceType: { type: "string", enum: ["Employee", "Contractor", "Vendor", "Equipment", "Material"] },
          location: { type: "string" },
          skills: { type: "string" },
          experienceLevel: { type: "string", enum: ["Junior", "Mid-Level", "Senior", "Lead", "Principal"] },
          hourlyRate: { type: "string" },
          weeklyCapacity: { type: "string" },
          availability: { type: "number", description: "0-100" },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          isBillable: { type: "boolean" },
        },
        required: ["resourceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "invite_member",
      description: "Invite a new user to the organization by email. Sends an invitation email. Call ONLY after explicit confirmation. Requires org_admin or owner role on the executing user.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Email address to invite" },
          role: { type: "string", enum: ["owner", "org_admin", "member", "team_member", "viewer"], description: "Org role to grant. Defaults to 'member'." },
        },
        required: ["email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_create_tasks",
      description: "Create multiple tasks in a project at once from structured data (e.g. parsed from a CSV file). Call this ONLY after presenting the parsed data to the user and receiving explicit confirmation. Each task object should have at minimum a name.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID to create all tasks in" },
          tasks: {
            type: "array",
            description: "Array of task objects to create",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "The task name (required)" },
                description: { type: "string", description: "Task description" },
                priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"], description: "Task priority" },
                status: { type: "string", enum: ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"], description: "Task status" },
                assignee: { type: "string", description: "Assignee name" },
                startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
                endDate: { type: "string", description: "End date / due date in YYYY-MM-DD format" },
                isMilestone: { type: "boolean", description: "Whether this is a milestone" },
              },
              required: ["name"],
            },
          },
        },
        required: ["projectId", "tasks"],
      },
    },
  },
];

const ORG_SCOPED_TOOLS = new Set([
  "create_resource",
  "bulk_create_resources",
  "generate_pdf",
  "send_email",
  "create_portfolio",
  "update_portfolio",
  "add_project_to_portfolio",
  "remove_project_from_portfolio",
  "create_project",
  "update_resource",
  "invite_member",
]);

async function handleToolCall(
  orgId: number,
  userId: string,
  toolName: string,
  args: Record<string, any>,
): Promise<string> {
  // Any tool call mutates org data; bust the short-TTL cache so the next
  // turn's context reflects the change.
  invalidateOrganizationContextCache(orgId);
  if (ORG_SCOPED_TOOLS.has(toolName)) {
    return handleOrgScopedToolCall(orgId, userId, toolName, args);
  }

  const projectId = args.projectId;
  if (!projectId || typeof projectId !== "number") {
    return JSON.stringify({ success: false, message: "Valid projectId is required." });
  }
  const projectInOrg = await verifyProjectBelongsToOrg(projectId, orgId);
  if (!projectInOrg) {
    return JSON.stringify({ success: false, message: "Project not found in this organization." });
  }

  switch (toolName) {
    case "create_task": {
      const result = await executeJarvisAction(orgId, userId, {
        type: "create_task",
        projectId,
        data: { name: args.name, priority: args.priority, description: args.description, assignee: args.assignee },
      });
      return JSON.stringify(result);
    }
    case "create_risk": {
      const result = await executeJarvisAction(orgId, userId, {
        type: "create_mitigation",
        projectId,
        data: {
          title: args.title, description: args.description, priority: args.priority,
          probability: args.probability, impact: args.impact,
          responseStrategy: args.responseStrategy, mitigationPlan: args.mitigationPlan,
        },
      });
      return JSON.stringify(result);
    }
    case "create_issue": {
      const result = await executeJarvisAction(orgId, userId, {
        type: "create_issue",
        projectId,
        data: {
          title: args.title, description: args.description,
          priority: args.priority, severity: args.severity,
        },
      });
      return JSON.stringify(result);
    }
    case "add_project_note": {
      const result = await executeJarvisAction(orgId, userId, {
        type: "add_note",
        projectId,
        data: { note: args.note },
      });
      return JSON.stringify(result);
    }
    case "flag_project_for_review": {
      const result = await executeJarvisAction(orgId, userId, {
        type: "flag_for_review",
        projectId,
        data: { reason: args.reason },
      });
      return JSON.stringify(result);
    }
    case "update_project": {
      const result = await executeJarvisAction(orgId, userId, {
        type: "update_project",
        projectId,
        data: args,
      });
      return JSON.stringify(result);
    }
    case "update_risk": {
      const result = await executeJarvisAction(orgId, userId, {
        type: "update_risk",
        projectId,
        data: args,
      });
      return JSON.stringify(result);
    }
    case "update_issue": {
      const result = await executeJarvisAction(orgId, userId, {
        type: "update_issue",
        projectId,
        data: args,
      });
      return JSON.stringify(result);
    }
    case "update_task": {
      const taskId = args.taskId;
      if (!taskId || typeof taskId !== "number") {
        return JSON.stringify({ success: false, message: "Valid taskId is required." });
      }

      const [existingTask] = await db.select({ id: tasks.id, projectId: tasks.projectId })
        .from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
      if (!existingTask) {
        return JSON.stringify({ success: false, message: "Task not found in this project." });
      }

      const validStatuses = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"];
      const validPriorities = ["Low", "Medium", "High", "Critical"];

      function parseDateField(val: unknown): string | null | undefined {
        if (val === undefined) return undefined;
        if (typeof val !== "string") return undefined;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return undefined;
        const d = new Date(val + "T00:00:00Z");
        if (isNaN(d.getTime())) return undefined;
        return val;
      }

      const updates: Record<string, any> = {};
      if (typeof args.name === "string" && args.name.trim()) updates.name = args.name.trim().slice(0, 500);
      if (typeof args.description === "string") updates.description = args.description.slice(0, 5000);
      if (typeof args.priority === "string" && validPriorities.includes(args.priority)) updates.priority = args.priority;
      if (typeof args.assignee === "string") updates.assignee = args.assignee.slice(0, 200);

      if (typeof args.progress === "number" && args.progress >= 0 && args.progress <= 100) {
        updates.progress = Math.round(args.progress);
      }
      if (typeof args.status === "string" && validStatuses.includes(args.status)) {
        updates.status = args.status;
      }

      if (updates.status === "Completed") updates.progress = 100;
      else if (updates.status === "Not Started") updates.progress = 0;
      else if (updates.progress === 100 && !updates.status) updates.status = "Completed";
      else if (updates.progress === 0 && !updates.status) updates.status = "Not Started";
      else if (typeof updates.progress === "number" && updates.progress > 0 && !updates.status) updates.status = "In Progress";

      const parsedStart = parseDateField(args.startDate);
      const parsedEnd = parseDateField(args.endDate);
      if (parsedStart !== undefined) updates.startDate = parsedStart;
      if (parsedEnd !== undefined) updates.endDate = parsedEnd;
      if (parsedStart && parsedEnd && new Date(parsedStart) > new Date(parsedEnd)) {
        return JSON.stringify({ success: false, message: "Start date cannot be after end date." });
      }

      if (typeof args.isMilestone === "boolean") updates.isMilestone = args.isMilestone;
      if (typeof args.isCritical === "boolean") updates.isCritical = args.isCritical;

      if (Object.keys(updates).length === 0) {
        return JSON.stringify({ success: false, message: "No valid fields to update." });
      }

      updates.updatedAt = new Date();
      await db.update(tasks).set(updates).where(eq(tasks.id, taskId));

      const changedFields = Object.keys(updates).filter(k => k !== "updatedAt").join(", ");
      return JSON.stringify({ success: true, message: `Task updated successfully. Changed: ${changedFields}.`, taskId });
    }
    case "assign_resources_to_task": {
      const taskId = args.taskId;
      if (!taskId || typeof taskId !== "number") {
        return JSON.stringify({ success: false, message: "Valid taskId is required." });
      }

      const [existingTask] = await db.select({ id: tasks.id, projectId: tasks.projectId })
        .from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
      if (!existingTask) {
        return JSON.stringify({ success: false, message: "Task not found in this project." });
      }

      const rawResourceIds = args.resourceIds;
      if (!Array.isArray(rawResourceIds)) {
        return JSON.stringify({ success: false, message: "resourceIds must be an array." });
      }
      const resourceIds = [...new Set(rawResourceIds.filter((id: any) => typeof id === "number" && Number.isFinite(id)))];
      if (resourceIds.length > 20) {
        return JSON.stringify({ success: false, message: "Maximum 20 resources can be assigned to a single task." });
      }

      if (resourceIds.length > 0) {
        const validResources = await db.select({ id: resources.id, displayName: resources.displayName })
          .from(resources)
          .where(and(
            inArray(resources.id, resourceIds),
            eq(resources.organizationId, orgId),
            isNull(resources.deletedAt)
          ));
        const validIds = new Set(validResources.map(r => r.id));
        const invalidIds = resourceIds.filter((id: number) => !validIds.has(id));
        if (invalidIds.length > 0) {
          return JSON.stringify({ success: false, message: `Invalid resource IDs: ${invalidIds.join(", ")}. Resources must exist in this organization.` });
        }

        await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, taskId));

        const rawAllocations = Array.isArray(args.allocations) ? args.allocations : [];
        const assignmentData = resourceIds.map((resId: number) => {
          const alloc = rawAllocations.find((a: any) => typeof a === "object" && a && a.resourceId === resId);
          const pct = typeof alloc?.allocationPercentage === "number" && Number.isFinite(alloc.allocationPercentage)
            ? Math.min(100, Math.max(0, Math.round(alloc.allocationPercentage)))
            : 100;
          return { taskId, resourceId: resId, allocationPercentage: pct };
        });

        await db.insert(taskResourceAssignments).values(assignmentData);

        const names = validResources.filter(r => resourceIds.includes(r.id)).map(r => r.displayName).join(", ");
        return JSON.stringify({ success: true, message: `Assigned ${resourceIds.length} resource(s) to the task: ${names}.`, taskId, resourceIds });
      } else {
        await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, taskId));
        return JSON.stringify({ success: true, message: "All resource assignments removed from the task.", taskId });
      }
    }
    case "bulk_create_tasks": {
      const taskList = args.tasks;
      if (!Array.isArray(taskList) || taskList.length === 0) {
        return JSON.stringify({ success: false, message: "No tasks provided." });
      }
      if (taskList.length > 200) {
        return JSON.stringify({ success: false, message: "Maximum 200 tasks can be created at once." });
      }

      const validStatuses = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"];
      const validPriorities = ["Low", "Medium", "High", "Critical"];

      function parseDate(val: unknown): string | null {
        if (typeof val !== "string") return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return null;
        const d = new Date(val + "T00:00:00Z");
        if (isNaN(d.getTime())) return null;
        return val;
      }

      const skipped: string[] = [];
      const taskValues = taskList
        .filter((t: any, idx: number) => {
          if (!t.name || typeof t.name !== "string" || !t.name.trim()) {
            skipped.push(`Row ${idx + 1}: missing or invalid task name`);
            return false;
          }
          return true;
        })
        .map((t: any) => ({
          projectId,
          name: String(t.name).trim().slice(0, 500),
          description: typeof t.description === "string" ? t.description.slice(0, 5000) : null,
          status: typeof t.status === "string" && validStatuses.includes(t.status) ? t.status : "Not Started",
          priority: typeof t.priority === "string" && validPriorities.includes(t.priority) ? t.priority : "Medium",
          assignee: typeof t.assignee === "string" ? t.assignee.slice(0, 200) : null,
          startDate: parseDate(t.startDate),
          endDate: parseDate(t.endDate),
          isMilestone: t.isMilestone === true,
          organizationId: orgId,
        }));

      if (taskValues.length === 0) {
        return JSON.stringify({ success: false, message: "No valid tasks found — each task needs at least a name." });
      }

      const created = await db.insert(tasks).values(taskValues).returning({ id: tasks.id, name: tasks.name });
      const result: Record<string, any> = {
        success: true,
        message: `Successfully created ${created.length} task(s) in the project.`,
        taskCount: created.length,
        tasks: created.slice(0, 20).map(t => ({ id: t.id, name: t.name })),
      };
      if (skipped.length > 0) {
        result.message += ` ${skipped.length} row(s) were skipped.`;
        result.skipped = skipped.slice(0, 10);
      }
      return JSON.stringify(result);
    }
    default:
      return JSON.stringify({ success: false, message: "Unknown tool." });
  }
}

type ResourceInsert = typeof resources.$inferInsert;
type ResourceSanitizedFields = Partial<Omit<ResourceInsert, "organizationId">>;

function sanitizeResourceFields(r: Record<string, unknown>): ResourceSanitizedFields {
  const validTypes = ["Employee", "Contractor", "Vendor", "Equipment", "Material"];
  const validLevels = ["Junior", "Mid-Level", "Senior", "Lead", "Principal"];

  const fields: ResourceSanitizedFields = {};
  if (typeof r.displayName === "string" && r.displayName.trim()) {
    fields.displayName = r.displayName.trim().slice(0, 200);
  }
  if (typeof r.firstName === "string") fields.firstName = r.firstName.trim().slice(0, 100);
  if (typeof r.lastName === "string") fields.lastName = r.lastName.trim().slice(0, 100);
  if (typeof r.email === "string" && r.email.includes("@")) fields.email = r.email.trim().slice(0, 200);
  if (typeof r.phone === "string") fields.phone = r.phone.trim().slice(0, 50);
  if (typeof r.title === "string") fields.title = r.title.trim().slice(0, 200);
  if (typeof r.department === "string") fields.department = r.department.trim().slice(0, 200);
  fields.resourceType = (typeof r.resourceType === "string" && validTypes.includes(r.resourceType)) ? r.resourceType : "Employee";
  if (typeof r.location === "string") fields.location = r.location.trim().slice(0, 200);
  if (typeof r.skills === "string") fields.skills = r.skills.slice(0, 1000);
  if (typeof r.experienceLevel === "string" && validLevels.includes(r.experienceLevel)) fields.experienceLevel = r.experienceLevel;
  if (typeof r.hourlyRate === "string" && !isNaN(Number(r.hourlyRate))) fields.hourlyRate = Number(r.hourlyRate);
  else if (typeof r.hourlyRate === "number") fields.hourlyRate = r.hourlyRate;
  if (typeof r.weeklyCapacity === "string" && !isNaN(Number(r.weeklyCapacity))) fields.weeklyCapacity = Number(r.weeklyCapacity);
  else if (typeof r.weeklyCapacity === "number") fields.weeklyCapacity = r.weeklyCapacity;
  if (typeof r.availability === "number" && r.availability >= 0 && r.availability <= 100) fields.availability = Math.round(r.availability);
  if (typeof r.isBillable === "boolean") fields.isBillable = r.isBillable;

  if (typeof r.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.startDate)) {
    const [y, m, d] = r.startDate.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      fields.startDate = r.startDate;
    }
  }

  return fields;
}

async function handleOrgScopedToolCall(
  orgId: number,
  userId: string,
  toolName: string,
  args: Record<string, any>,
): Promise<string> {
  switch (toolName) {
    case "generate_pdf": {
      const title = typeof args.title === "string" && args.title.trim()
        ? args.title.trim().slice(0, 200)
        : "Friday Report";
      const content = typeof args.content === "string" ? args.content : "";
      if (!content.trim()) {
        return JSON.stringify({ success: false, message: "Content is required to generate a PDF." });
      }
      const filenameRaw = typeof args.filename === "string" && args.filename.trim()
        ? args.filename.trim()
        : `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report"}.pdf`;
      const filename = (filenameRaw.endsWith(".pdf") ? filenameRaw : `${filenameRaw}.pdf`).slice(0, 120);

      const { renderMarkdownToPdfBuffer } = await import("./fridayPdfGenerator");
      const buffer = await renderMarkdownToPdfBuffer(title, content);
      const { storeGeneratedFile } = await import("./fridayGeneratedFiles");
      const file = storeGeneratedFile(userId, orgId, filename, "application/pdf", buffer);
      const downloadUrl = `/api/jarvis/generated-files/${file.id}`;
      return JSON.stringify({
        success: true,
        message: `PDF generated. Reply to the user with EXACTLY this markdown link so they can download it: [Download ${filename}](${downloadUrl}). Do NOT tell the user you cannot generate PDFs. To attach this PDF to an email, pass pdfId="${file.id}" to send_email.`,
        pdfId: file.id,
        downloadUrl,
        filename,
      });
    }

    case "send_email": {
      const { sendFridayEmail } = await import("./fridayEmailTool");
      return sendFridayEmail(orgId, userId, args);
    }

    case "create_resource": {
      const result = await executeJarvisAction(orgId, userId, {
        type: "create_resource",
        data: args,
      });
      return JSON.stringify(result);
    }

    case "create_portfolio":
    case "update_portfolio":
    case "add_project_to_portfolio":
    case "remove_project_from_portfolio":
    case "create_project":
    case "update_resource":
    case "invite_member": {
      const result = await executeJarvisAction(orgId, userId, {
        type: toolName as any,
        data: args,
      });
      return JSON.stringify(result);
    }

    case "bulk_create_resources": {
      const resourceList = args.resources;
      if (!Array.isArray(resourceList) || resourceList.length === 0) {
        return JSON.stringify({ success: false, message: "No resources provided." });
      }
      if (resourceList.length > 200) {
        return JSON.stringify({ success: false, message: "Maximum 200 resources can be created at once." });
      }

      const skipped: string[] = [];
      const resourceValues: ResourceInsert[] = [];
      resourceList.forEach((r: Record<string, unknown>, idx: number) => {
        const fields = sanitizeResourceFields(r);
        if (!fields.displayName) {
          skipped.push(`Row ${idx + 1}: missing or invalid display name`);
          return;
        }
        resourceValues.push({
          organizationId: orgId,
          displayName: fields.displayName,
          ...fields,
        });
      });

      if (resourceValues.length === 0) {
        return JSON.stringify({ success: false, message: "No valid resources found — each resource needs at least a display name." });
      }

      const created = await db.insert(resources).values(resourceValues).returning({ id: resources.id, displayName: resources.displayName });
      const result: Record<string, any> = {
        success: true,
        message: `Successfully created ${created.length} resource(s) in the organization.`,
        resourceCount: created.length,
        resources: created.slice(0, 20).map(r => ({ id: r.id, displayName: r.displayName })),
      };
      if (skipped.length > 0) {
        result.message += ` ${skipped.length} row(s) were skipped.`;
        result.skipped = skipped.slice(0, 10);
      }
      return JSON.stringify(result);
    }

    default:
      return JSON.stringify({ success: false, message: "Unknown tool." });
  }
}

export interface PageContext {
  path: string;
  entityType: "project" | "portfolio" | "resource" | null;
  entityId: number | null;
}

export interface FileAttachment {
  name: string;
  type: string;
  size: number;
  content: string;
}

function buildPageContextDirective(pageContext: PageContext | undefined, ctx: JarvisContext): string {
  if (!pageContext?.entityType || !pageContext.entityId) return "";

  if (pageContext.entityType === "project") {
    const project = ctx.projects.find((p: any) => p.id === pageContext.entityId);
    if (!project) return "";

    const projectTasks = ctx.tasks.filter((t: any) => t.projectId === pageContext.entityId);
    const projectMilestones = ctx.milestones.filter((m: any) => m.projectId === pageContext.entityId);
    const projectRisks = ctx.risks.filter((r: any) => r.projectId === pageContext.entityId);
    const projectIssues = ctx.issues.filter((i: any) => i.projectId === pageContext.entityId);
    const projectReports = ctx.statusReports.filter((r: any) => r.projectId === pageContext.entityId);

    return `\n\nCURRENT PAGE CONTEXT: The user is currently viewing project [${project.name}](/projects/${project.id}) (ID: ${project.id}).
Prioritize answering questions about THIS project. When the user says "this project" or asks about tasks, risks, issues without specifying a project, assume they mean this one.

**Focused Project Detail:**
- Project: ${JSON.stringify(project, null, 1)}
- Tasks (${projectTasks.length}): ${JSON.stringify(projectTasks.slice(0, 50), null, 1)}
- Milestones (${projectMilestones.length}): ${JSON.stringify(projectMilestones.slice(0, 20), null, 1)}
- Risks (${projectRisks.length}): ${JSON.stringify(projectRisks, null, 1)}
- Issues (${projectIssues.length}): ${JSON.stringify(projectIssues, null, 1)}
- Recent Status Reports: ${JSON.stringify(projectReports.slice(0, 5), null, 1)}
`;
  }

  if (pageContext.entityType === "portfolio") {
    const portfolio = ctx.portfolios.find((p: any) => p.id === pageContext.entityId);
    if (!portfolio) return "";

    const portfolioProjects = ctx.projects.filter((p: any) => p.portfolioId === pageContext.entityId);
    return `\n\nCURRENT PAGE CONTEXT: The user is currently viewing portfolio [${portfolio.name}](/portfolios/${portfolio.id}) (ID: ${portfolio.id}).
Prioritize answering questions about THIS portfolio and its projects. When the user says "this portfolio" or asks general questions, assume they mean this one.

**Focused Portfolio Detail:**
- Portfolio: ${JSON.stringify(portfolio, null, 1)}
- Projects in Portfolio (${portfolioProjects.length}): ${JSON.stringify(portfolioProjects, null, 1)}
`;
  }

  if (pageContext.entityType === "resource") {
    const resource = ctx.resources.find((r: any) => r.id === pageContext.entityId);
    if (!resource) return "";

    return `\n\nCURRENT PAGE CONTEXT: The user is currently viewing resource [${resource.displayName}](/resources/${resource.id}) (ID: ${resource.id}).
Prioritize answering questions about THIS resource. When the user says "this person" or "this resource", assume they mean this one.

**Focused Resource Detail:**
- Resource: ${JSON.stringify(resource, null, 1)}
`;
  }

  return "";
}

function buildAttachmentContext(attachments?: FileAttachment[]): string {
  if (!attachments || attachments.length === 0) return "";

  let ctx = `\n\nATTACHED FILES: The user has attached ${attachments.length} file(s) to this message. Analyze their contents and incorporate them into your response.\n`;

  for (const att of attachments) {
    const isTextBased = att.type.startsWith("text/") ||
      att.type === "application/json" ||
      att.type === "application/xml" ||
      att.type === "text/csv" ||
      att.type === "application/csv" ||
      att.name.match(/\.(txt|csv|json|xml|md|log|yaml|yml|ini|conf|cfg|tsv|html|htm|sql|js|ts|py|rb|go|java|c|cpp|h|css|scss|less)$/i);

    if (isTextBased) {
      let decoded: string;
      try {
        decoded = Buffer.from(att.content, "base64").toString("utf-8");
      } catch {
        decoded = att.content;
      }
      const truncated = decoded.length > 50000 ? decoded.slice(0, 50000) + "\n...(truncated)" : decoded;
      ctx += `\n### File: ${att.name} (${att.type}, ${(att.size / 1024).toFixed(1)} KB)\n\`\`\`\n${truncated}\n\`\`\`\n`;
    } else {
      ctx += `\n### File: ${att.name} (${att.type}, ${(att.size / 1024).toFixed(1)} KB)\n[Binary file — contents cannot be displayed as text]\n`;
    }
  }

  return ctx;
}

interface JarvisEnrichedError extends Error {
  originalError?: unknown;
  logDetails?: string;
}

function isTransientOpenAIError(err: any): boolean {
  const status = err?.status || err?.response?.status;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  if (err?.code === "ETIMEDOUT" || err?.code === "ECONNRESET" || err?.code === "ECONNABORTED") return true;
  if (err?.type === "connection_error" || err?.type === "timeout") return true;
  return false;
}

function classifyOpenAIError(err: any): { userMessage: string; logDetails: string } {
  const status = err?.status || err?.response?.status;
  const message = err?.message || "Unknown error";
  const type = err?.type || err?.constructor?.name || "UnknownError";
  const code = err?.code || "none";
  const logDetails = `type=${type} status=${status || "N/A"} code=${code} message=${message}`;

  if (status === 429) {
    return { userMessage: "AI service is busy, please try again in a moment.", logDetails };
  }
  if (status === 404) {
    return { userMessage: "AI model deployment not found. Please check your Azure OpenAI endpoint URL (should be just https://your-resource.openai.azure.com without /openai/v1) and deployment name in Organization Settings → Friday Agent.", logDetails };
  }
  if (status === 401 || status === 403) {
    return { userMessage: "AI service authentication failed. Please check your Azure OpenAI API key in Organization Settings → Friday Agent.", logDetails };
  }
  if (status >= 500 && status < 600) {
    return { userMessage: "AI service is temporarily unavailable. Please try again shortly.", logDetails };
  }
  if (code === "ETIMEDOUT" || code === "ECONNABORTED" || err?.type === "timeout") {
    return { userMessage: "Request timed out. Please try again.", logDetails };
  }
  if (code === "ECONNRESET" || code === "ECONNREFUSED" || err?.type === "connection_error") {
    return { userMessage: "Could not connect to AI service. Please try again.", logDetails };
  }
  return { userMessage: "An unexpected error occurred. Please try again.", logDetails };
}

async function callOpenAIWithRetry(
  createFn: () => Promise<any>,
  label: string,
): Promise<any> {
  try {
    return await createFn();
  } catch (err: any) {
    const { logDetails } = classifyOpenAIError(err);
    if (isTransientOpenAIError(err)) {
      let retryDelay = err?.status === 429 ? 2000 : 1000;
      const retryAfter = err?.headers?.["retry-after"] || err?.response?.headers?.["retry-after"];
      if (retryAfter) {
        const parsed = Number(retryAfter);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 10) {
          retryDelay = parsed * 1000;
        }
      }
      console.warn(`[JARVIS] Transient error on ${label}, retrying in ${retryDelay}ms: ${logDetails}`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return await createFn();
    }
    throw err;
  }
}

export interface CustomAgentDataScope {
  type: "org" | "portfolios" | "projects";
  portfolioIds?: number[];
  projectIds?: number[];
}

async function detectOrgNeedsSetup(orgId: number, userId: string): Promise<boolean> {
  try {
    const [projectRows, portfolioRows, userRow] = await Promise.all([
      db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.organizationId, orgId), isNull(projects.deletedAt))).limit(1),
      db.select({ id: portfolios.id }).from(portfolios)
        .where(and(eq(portfolios.organizationId, orgId), isNull(portfolios.deletedAt))).limit(1),
      db.select({ onboardingCompleted: users.onboardingCompleted })
        .from(users).where(eq(users.id, userId)).limit(1),
    ]);
    const isEmpty = projectRows.length === 0 && portfolioRows.length === 0;
    const onboardingCompleted = !!userRow[0]?.onboardingCompleted;
    return isEmpty && !onboardingCompleted;
  } catch (err) {
    console.error("[jarvis] detectOrgNeedsSetup failed:", err);
    return false;
  }
}

const ONBOARDING_DIRECTIVE = `\n\nONBOARDING MODE — This workspace is brand new (no portfolios or projects yet) and the user has not finished onboarding.

Your job in this conversation:
1. Greet the user warmly, introduce yourself as Friday, and ask what industry they work in and what they're hoping to do in the app — unless they have already told you.
2. Once they share an industry (either by clicking one of the suggested cards or typing it), briefly confirm what you heard.
3. Then OFFER to configure the workspace for them by emitting a single Friday action card. Use this exact format on its own line as a top-level fenced block:

\`\`\`friday-card
{"type":"action","title":"Set up your workspace for {Industry}","subtitle":"I'll create a starter portfolio with sample projects, milestones, risks, and demo resources tailored to {Industry}.","accent":"default","fields":[{"label":"Industry","value":"{Industry}"},{"label":"What you'll get","value":"1 portfolio, 2 demo projects, milestones, risks, and resources"}],"actions":[{"label":"Apply setup","type":"configure_organization","data":{"industry":"{Industry}"}},{"label":"Not now","type":"configure_organization","data":{"dismiss":true}}]}
\`\`\`

Supported industry keys (use exactly these in the data.industry field): Technology, Healthcare, Finance, Manufacturing, Retail, Consulting. If the user describes "something else" or an industry that isn't in that list, set data.industry to "General" and tell them in the subtitle that you'll start with a generic Strategic Initiatives portfolio they can customize.

4. Wait for the user to click Apply (the system runs configure_organization). Do NOT call any other tools or assume the configuration ran without confirmation.
5. After Apply succeeds, your next reply should welcome the user and link to the new portfolio/projects (the action result will include their IDs and names — render them as markdown links like [Portfolio Name](/portfolios/{id})).
6. If the user says "not now", "skip", or otherwise declines, drop the configure card offer and ask how else you can help.

Important: only emit the configure_organization card while the workspace is empty. Never offer it for orgs that already have projects.`;

export interface CustomAgentRuntimeConfig {
  systemPrompt: string;
  model: string;                                    // 'gpt-4o' | 'gpt-4o-mini'
  allowedTools: string[];
  dataScope: CustomAgentDataScope;
  /**
   * Called once per *confirmed write* tool execution to enforce + record an
   * additional AI-credit charge under `custom_chat_agent_action`. Throws
   * AiCreditsLimitError if the user is out of credits — the runtime then
   * skips the tool and informs the model via a tool-error message.
   */
  meterAction?: () => Promise<void>;
}

const CUSTOM_AGENT_SAFE_TOOLS = new Set([
  "create_task",
  "create_risk",
  "create_issue",
  "add_project_note",
  "flag_project_for_review",
  "assign_resources_to_task",
]);

export function filterContextByScope(ctx: JarvisContext, scope: CustomAgentRuntimeConfig["dataScope"]): JarvisContext {
  if (scope.type === "org") return ctx;
  let allowedProjectIds: Set<number>;
  if (scope.type === "projects") {
    allowedProjectIds = new Set(scope.projectIds ?? []);
  } else {
    const portfolioSet = new Set(scope.portfolioIds ?? []);
    allowedProjectIds = new Set(
      ctx.projects.filter((p: any) => p.portfolioId && portfolioSet.has(p.portfolioId)).map((p: any) => p.id)
    );
  }
  const filterByProj = <T extends { projectId?: number }>(arr: T[]) => arr.filter(x => x.projectId == null || allowedProjectIds.has(x.projectId));
  return {
    ...ctx,
    projects: ctx.projects.filter((p: any) => allowedProjectIds.has(p.id)),
    portfolios: scope.type === "portfolios"
      ? ctx.portfolios.filter((p: any) => (scope.portfolioIds ?? []).includes(p.id))
      : ctx.portfolios.filter((p: any) => ctx.projects.some((pr: any) => pr.portfolioId === p.id && allowedProjectIds.has(pr.id))),
    risks: filterByProj(ctx.risks as any[]),
    issues: filterByProj(ctx.issues as any[]),
    tasks: filterByProj(ctx.tasks as any[]),
    milestones: filterByProj(ctx.milestones as any[]),
    dependencies: filterByProj(ctx.dependencies as any[]),
    statusReports: filterByProj(ctx.statusReports as any[]),
    healthHistory: filterByProj(ctx.healthHistory as any[]),
    financialsRollup: ctx.financialsRollup.filter(r => allowedProjectIds.has(r.projectId)),
    timesheetsRollup: ctx.timesheetsRollup.filter(r => allowedProjectIds.has(r.projectId)),
    deliverables: ctx.deliverables.filter(d => allowedProjectIds.has(d.projectId)),
    evmTimePhased: ctx.evmTimePhased.filter(s => allowedProjectIds.has(s.projectId)),
    burndowns: ctx.burndowns.filter(b => allowedProjectIds.has(b.projectId)),
  };
}

export async function streamJarvisResponse(
  orgId: number,
  userId: string,
  messages: JarvisMessage[],
  concise: boolean,
  onChunk: (content: string) => void,
  onDone: (fullResponse: string) => void,
  onError: (error: Error) => void,
  /**
   * Higher-order metering hook: must wrap EACH OpenAI chat.completions.create
   * call so the AI-credit limit is enforced + recorded per call. Throws
   * AiCreditsLimitError if the user is over their limit; we catch that and
   * abort the tool loop gracefully via onError so a single 1-credit user
   * cannot drain N credits via a tool loop.
   */
  meterPerCall: MeterPerCall,
  pageContext?: PageContext,
  attachments?: FileAttachment[],
  options?: { forceOnboarding?: boolean },
  agentConfig?: CustomAgentRuntimeConfig,
) {
  try {
    let [context, needsSetup] = await Promise.all([
      gatherOrganizationContext(orgId),
      agentConfig ? Promise.resolve(false) : detectOrgNeedsSetup(orgId, userId),
    ]);
    if (agentConfig) context = filterContextByScope(context, agentConfig.dataScope);
    const dataContext = buildDataContext(context);
    const pageDirective = buildPageContextDirective(pageContext, context);
    const attachmentContext = buildAttachmentContext(attachments);
    const onboardingDirective = (needsSetup || options?.forceOnboarding) ? ONBOARDING_DIRECTIVE : "";

    const conciseDirective = concise
      ? `\n\nIMPORTANT — Concise mode is ON. Keep every reply SHORT: max 3-5 bullet points or 2-3 short sentences. No lengthy explanations. Omit sections that have nothing notable. If the user needs more detail, they will ask.`
      : `\n\nDetailed mode is ON. Provide thorough, structured responses. Use sections (Observations, Risks/Concerns, Recommendations) when helpful. Include relevant data points and context. Use bullet points for clarity.`;

    const actionDirective = `\n\nACTION EXECUTION RULES:
- When the user asks you to create or update a task, risk, issue, project, portfolio, resource, note, or to invite a member, first describe what you will do and ask for confirmation.
- When the user confirms (says "yes", "proceed", "do it", "go ahead", "ok", "sure", "confirm", etc.), you MUST call the appropriate tool function to actually execute the action. Do NOT just say you did it — you must use the tool.
- After the tool executes, report the result to the user based on the tool response. Always link back to the created/updated entity using the markdown link format (\`[Name](/path/{id})\`) so the user can jump to it.
- The project IDs, portfolio IDs, risk/issue IDs, task IDs, and resource IDs are all available in the data context above. Match names to their IDs.

NON-DESTRUCTIVE TOOLS YOU CAN CALL DIRECTLY (after explicit confirmation):
- Tasks: create_task, bulk_create_tasks, update_task, assign_resources_to_task
- Risks/Issues: create_risk, create_issue, update_risk, update_issue
- Projects: create_project, update_project, add_project_note, flag_project_for_review
- Portfolios: create_portfolio, update_portfolio, add_project_to_portfolio, remove_project_from_portfolio
- Resources: create_resource, bulk_create_resources, update_resource
- Members: invite_member

DESTRUCTIVE OPERATIONS — DO NOT CALL TOOLS:
- delete_portfolio, delete_project, delete_risk, delete_issue, delete_task, bulk_delete_tasks, delete_resource, remove_member.
- For ANY destructive request, do NOT invoke a tool. Instead emit a single Friday card (type "action", accent "danger") with two buttons: a destructive one carrying the entity IDs, and a "cancel" button. The user clicks Confirm to dispatch the action through /api/jarvis/action; clicking Cancel dismisses the card with no side effects.

INVITE MEMBER RULES:
- Only call invite_member after the user has confirmed the email + role in chat.
- Only org owners and admins are authorized; the executor will reject the call otherwise and you must report the failure honestly.
- Default role is "member". Other valid roles: owner, org_admin, member, team_member, viewer.

RESOURCE CREATION RULES:
- When the user asks to add a new resource/person/team member to the organization, gather the key details (name, role/title, department, email, type, skills, etc.) and present a summary for confirmation before calling create_resource.
- When a CSV or file is attached with resource/people data, parse it and use bulk_create_resources to create them all at once. Present a summary table first and ask for confirmation.
- These tools are organization-scoped — they do NOT require a project ID.
- At minimum, a display name is required. If the user provides a full name, try to split it into firstName and lastName as well.
- Valid resource types: Employee, Contractor, Vendor, Equipment, Material. Default to Employee if not specified.
- Valid experience levels: Junior, Mid-Level, Senior, Lead, Principal.

TASK UPDATE & RESOURCE ASSIGNMENT RULES:
- When the user asks to update a task (change status, priority, assignee, dates, progress, etc.), identify the task by name or ID from the data context, describe the change, and ask for confirmation before calling update_task.
- When the user asks to assign resources/people to a task, match the resource name to the resource ID from the data context. Use assign_resources_to_task to set assignments. This replaces all current assignments — include all desired resources, not just new ones.
- When asked to assign resources during bulk task import (e.g. from CSV with an "Assignee" column), first create the tasks, then use assign_resources_to_task for each task that has a matching resource in the organization. Also set the assignee text field via update_task or during creation.
- The resources list with IDs and names is available in the data context. Always match resource names case-insensitively and report if a name doesn't match any known resource.

CSV FILE IMPORT RULES:
- When a CSV file is attached, parse its content to identify task data. Look for columns like: name/title/task, description, priority, status, assignee, start date, end date, due date.
- Be flexible with column names — map variations like "Task Name", "Title", "Activity" → name; "Owner", "Assigned To" → assignee; "Due Date", "End", "Deadline" → endDate; "Start", "Begin" → startDate.
- Present a summary table of the parsed tasks to the user showing what will be created (task name, priority, assignee, dates, etc.).
- Ask for confirmation before executing. If the user is on a project page, use that project. Otherwise ask which project to import into.
- Use the bulk_create_tasks tool to create all tasks at once — do NOT call create_task repeatedly.
- After creation, report how many tasks were created successfully.`;

    // Custom agents replace SYSTEM_PROMPT entirely, so they lose the
    // Gantt-rendering directive. Append it so they still know they CAN draw
    // inline Gantt charts via the fenced gantt-chart block.
    const baseSystem = agentConfig
      ? `${agentConfig.systemPrompt}\n\n${GANTT_DIRECTIVE}\n\n${BURNDOWN_DIRECTIVE}\n\n${SCURVE_DIRECTIVE}\n\n${QUICK_REPLIES_DIRECTIVE}\n\n${REPORT_DIRECTIVE}`
      : SYSTEM_PROMPT;
    const includeActionDirective = agentConfig
      ? agentConfig.allowedTools.some(t => CUSTOM_AGENT_SAFE_TOOLS.has(t))
      : true;

    // Precompute scope-allowed projects so every tool call can be authorised
    // against the agent's configured data scope, not just the model's view.
    let agentAllowedProjectIds: Set<number> | null = null;
    if (agentConfig && agentConfig.dataScope.type !== "org") {
      if (agentConfig.dataScope.type === "projects") {
        agentAllowedProjectIds = new Set(agentConfig.dataScope.projectIds ?? []);
      } else {
        const ps = new Set(agentConfig.dataScope.portfolioIds ?? []);
        agentAllowedProjectIds = new Set(
          context.projects
            .filter((p) => p.portfolioId != null && ps.has(p.portfolioId))
            .map((p) => p.id)
        );
      }
    }
    const systemMessage = `${baseSystem}${onboardingDirective}${pageDirective}${conciseDirective}${includeActionDirective ? actionDirective : ""}${attachmentContext}\n\n---\n\n${dataContext}`;

    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemMessage },
      ...messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const { client: orgOpenai, deployment: orgDeployment, isAzure: orgIsAzure } = await getOrgOpenAIClient(orgId);

    let fullResponse = "";
    const pendingPdfLinks: Array<{ filename: string; downloadUrl: string }> = [];
    const MAX_TOOL_ROUNDS = 5;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      // Enforce credits BEFORE opening the stream; record only after the
      // stream completes successfully (see recordSuccess() below).
      let stream;
      let recordSuccess: () => Promise<void>;
      try {
        const filteredTools = agentConfig
          ? jarvisTools.filter(t => t.type === "function" && agentConfig.allowedTools.includes(t.function.name))
          : jarvisTools;
        ({ result: stream, recordSuccess } = await meterPerCall(round, () => callOpenAIWithRetry(
          () => orgOpenai.chat.completions.create({
            model: orgIsAzure ? orgDeployment : (agentConfig?.model || "gpt-4o"),
            messages: apiMessages,
            stream: true,
            max_completion_tokens: concise ? 4096 : 8192,
            temperature: 0.3,
            ...(filteredTools.length > 0 ? { tools: filteredTools } : {}),
          }),
          `stream round ${round}`,
        )));
      } catch (err: any) {
        if (err instanceof AiCreditsLimitError) {
          console.warn(`[JARVIS] Tool loop aborted at round ${round} — AI credit limit reached`);
          onError(err);
          return;
        }
        throw err;
      }

      let currentToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
      let hasToolCalls = false;
      let finishReason = "";

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const content = choice.delta?.content || "";
        if (content) {
          fullResponse += content;
          onChunk(content);
        }

        if (choice.delta?.tool_calls) {
          hasToolCalls = true;
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index;
            if (!currentToolCalls.has(idx)) {
              currentToolCalls.set(idx, { id: tc.id || "", name: tc.function?.name || "", arguments: "" });
            }
            const existing = currentToolCalls.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          }
        }
      }

      // Stream completed without throwing — charge 1 credit for this round.
      await recordSuccess();

      if (!hasToolCalls || finishReason !== "tool_calls") {
        break;
      }

      apiMessages.push({
        role: "assistant",
        content: fullResponse || null,
        tool_calls: Array.from(currentToolCalls.values()).map(tc => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      for (const [, tc] of currentToolCalls) {
        try {
          const args = JSON.parse(tc.arguments);

          // Custom-agent guardrails: enforce data scope + per-action metering
          // BEFORE executing any write. The model can hallucinate a projectId
          // that's outside the agent's scope; reject those server-side.
          if (agentConfig) {
            if (!agentConfig.allowedTools.includes(tc.name)) {
              apiMessages.push({
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({ success: false, message: `Tool '${tc.name}' is not enabled for this agent.` }),
              });
              continue;
            }
            const isOrgScoped = ORG_SCOPED_TOOLS.has(tc.name);
            if (isOrgScoped && agentConfig.dataScope.type !== "org") {
              apiMessages.push({
                role: "tool", tool_call_id: tc.id,
                content: JSON.stringify({ success: false, message: "This agent's data scope does not permit org-wide tools." }),
              });
              continue;
            }
            if (!isOrgScoped && agentAllowedProjectIds) {
              const pid = typeof args.projectId === "number" ? args.projectId : Number(args.projectId);
              if (!Number.isFinite(pid) || !agentAllowedProjectIds.has(pid)) {
                apiMessages.push({
                  role: "tool", tool_call_id: tc.id,
                  content: JSON.stringify({ success: false, message: `Project ${args.projectId ?? "(none)"} is outside this agent's data scope.` }),
                });
                continue;
              }
            }
            if (agentConfig.meterAction) {
              try {
                await agentConfig.meterAction();
              } catch (meterErr: unknown) {
                if (meterErr instanceof AiCreditsLimitError) {
                  apiMessages.push({
                    role: "tool", tool_call_id: tc.id,
                    content: JSON.stringify({ success: false, message: "AI credit limit reached for write actions." }),
                  });
                  continue;
                }
                throw meterErr;
              }
            }
          }

          const result = await handleToolCall(orgId, userId, tc.name, args);
          if (tc.name === "generate_pdf") {
            try {
              const parsed = JSON.parse(result);
              if (parsed?.success && typeof parsed.downloadUrl === "string" && typeof parsed.filename === "string") {
                pendingPdfLinks.push({ filename: parsed.filename, downloadUrl: parsed.downloadUrl });
              }
            } catch {}
          }
          apiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        } catch (err: any) {
          apiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({ success: false, message: err.message || "Tool execution failed." }),
          });
        }
      }

      fullResponse = "";
    }

    // Deterministically guarantee the user sees a clickable download link for
    // any PDF Friday generated this turn, even if the model forgot to echo it.
    const missingLinks = pendingPdfLinks.filter(l => !fullResponse.includes(l.downloadUrl));
    if (missingLinks.length > 0) {
      const appended = missingLinks
        .map(l => `\n\n[Download ${l.filename}](${l.downloadUrl})`)
        .join("");
      fullResponse += appended;
      onChunk(appended);
    }

    onDone(fullResponse);
  } catch (err: any) {
    const { userMessage, logDetails } = classifyOpenAIError(err);
    console.error(`[JARVIS] Stream error: ${logDetails}`, err?.stack || err);
    const enrichedError: JarvisEnrichedError = Object.assign(new Error(userMessage), {
      originalError: err,
      logDetails,
    });
    onError(enrichedError);
  }
}

async function verifyProjectBelongsToOrg(projectId: number, orgId: number): Promise<boolean> {
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)));
  return !!project;
}

export type JarvisActionType =
  | "create_task" | "update_task" | "delete_task" | "bulk_delete_tasks"
  | "create_mitigation" | "create_risk" | "update_risk" | "delete_risk"
  | "create_issue" | "update_issue" | "delete_issue"
  | "create_project" | "update_project" | "delete_project"
  | "create_portfolio" | "update_portfolio" | "delete_portfolio"
  | "add_project_to_portfolio" | "remove_project_from_portfolio"
  | "create_resource" | "update_resource" | "delete_resource"
  | "assign_resources_to_task"
  | "invite_member" | "remove_member"
  | "assign_owner" | "add_note" | "flag_for_review"
  | "configure_organization";

const PROJECT_SCOPED_ACTION_TYPES = new Set<JarvisActionType>([
  "create_task", "update_task", "delete_task", "bulk_delete_tasks",
  "create_mitigation", "create_risk", "update_risk", "delete_risk",
  "create_issue", "update_issue", "delete_issue",
  "update_project", "delete_project",
  "assign_resources_to_task",
  "assign_owner", "add_note", "flag_for_review",
]);

const ADMIN_ONLY_ACTION_TYPES = new Set<JarvisActionType>([
  "delete_project", "delete_portfolio", "delete_resource",
  "invite_member", "remove_member",
]);

const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const PROBABILITY_LEVELS = ["Very Low", "Low", "Medium", "High", "Very High"];
const RESPONSE_STRATEGIES = ["Avoid", "Transfer", "Mitigate", "Accept"];
const PROJECT_STATUSES = ["Initiation", "Planning", "Execution", "Monitoring", "Closing"];
const METHODOLOGIES = ["Waterfall", "Agile", "Hybrid", "Scrum", "Kanban"];
const HEALTH_VALUES = ["Green", "Yellow", "Red"];
const RESOURCE_TYPE_VALUES = ["Employee", "Contractor", "Vendor", "Equipment", "Material"];
const EXPERIENCE_LEVELS = ["Junior", "Mid-Level", "Senior", "Lead", "Principal"];
const INVITE_ROLES = ["owner", "org_admin", "member", "team_member", "viewer"];

function pickEnum<T extends string>(value: any, allowed: T[], fallback?: T): T | undefined {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function clipString(value: any, max: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

export async function executeJarvisAction(
  orgId: number,
  userId: string,
  action: {
    type: JarvisActionType;
    projectId?: number;
    data: Record<string, any>;
  }
): Promise<{
  success: boolean;
  message: string;
  entityId?: number;
  entityIds?: number[];
  links?: Array<{ label: string; href: string }>;
}> {
  if (!action.type) {
    return { success: false, message: "Unknown action type." };
  }

  if (!userId) {
    return { success: false, message: "Authentication required." };
  }

  // Org-scoped action — doesn't need a projectId and short-circuits before
  // the project ownership check below.
  if (action.type === "configure_organization") {
    // Permission: only org admins/owners may seed an entire workspace.
    const role = await getUserOrgRole(userId, orgId);
    if (role !== "owner" && role !== "org_admin") {
      return { success: false, message: "Only an Organization Admin can configure the workspace." };
    }
    const industryRaw = typeof action.data?.industry === "string" ? action.data.industry : "General";
    const { configureOrganizationFromIndustry } = await import("./onboarding");
    const result = await configureOrganizationFromIndustry(userId, orgId, industryRaw);
    if (!result.success) {
      return { success: false, message: result.message };
    }
    invalidateOrganizationContextCache(orgId);
    const links: Array<{ label: string; href: string }> = [];
    if (result.portfolio) {
      links.push({ label: result.portfolio.name, href: `/portfolios/${result.portfolio.id}` });
    }
    for (const project of result.projects ?? []) {
      links.push({ label: project.name, href: `/projects/${project.id}` });
    }
    return {
      success: true,
      message: result.message,
      entityId: result.portfolio?.id,
      links,
    };
  }

  // Email verification for any mutation.
  const emailCheck = await requireEmailVerified(userId);
  if (!emailCheck.verified) {
    return { success: false, message: emailCheck.error || "Email verification required." };
  }

  // Role check. Viewers cannot mutate; admin-only actions require owner/org_admin.
  const role = await getUserOrgRole(userId, orgId);
  if (!role) {
    return { success: false, message: "You are not a member of this organization." };
  }
  if (role === "viewer") {
    return { success: false, message: "Viewers cannot perform write actions." };
  }
  if (ADMIN_ONLY_ACTION_TYPES.has(action.type) && role !== "owner" && role !== "org_admin") {
    return { success: false, message: "Only organization admins or owners can perform this action." };
  }

  // Project verification when required.
  if (PROJECT_SCOPED_ACTION_TYPES.has(action.type)) {
    if (action.type !== "bulk_delete_tasks") {
      if (!action.projectId || typeof action.projectId !== "number") {
        return { success: false, message: "Valid projectId is required for this action." };
      }
      const projectInOrg = await verifyProjectBelongsToOrg(action.projectId, orgId);
      if (!projectInOrg) {
        return { success: false, message: "Project not found in this organization." };
      }
    }
  }

  invalidateOrganizationContextCache(orgId);

  try {
    switch (action.type) {
      // ────────────────── Tasks ──────────────────
      case "create_task": {
        if (!action.data.name || typeof action.data.name !== "string") {
          return { success: false, message: "Task name is required." };
        }
        const limit = await checkAndEnforceLimit(userId, "tasks" as any, 1, orgId);
        if (!limit.allowed) {
          return { success: false, message: limit.error || "Task limit reached." };
        }
        const [newTask] = await db.insert(tasks).values({
          projectId: action.projectId!,
          name: action.data.name.slice(0, 500),
          description: clipString(action.data.description, 5000),
          status: "Not Started",
          priority: pickEnum(action.data.priority, PRIORITIES, "Medium")!,
          startDate: action.data.startDate || null,
          endDate: action.data.endDate || null,
          assignee: clipString(action.data.assignee, 200),
          organizationId: orgId,
        }).returning();
        await recordResourceUsage(userId, "tasks" as any, newTask.id, 1, orgId);
        await logUserActivity(userId, "create_task_via_friday", "task", newTask.id, { projectId: action.projectId, name: newTask.name });
        return { success: true, message: `Task "${newTask.name}" created successfully.`, entityId: newTask.id };
      }

      case "update_task": {
        const taskId = Number(action.data.taskId);
        if (!taskId) return { success: false, message: "taskId is required." };
        const updates: Record<string, any> = {};
        if (action.data.name) updates.name = String(action.data.name).slice(0, 500);
        if (action.data.description !== undefined) updates.description = clipString(action.data.description, 5000);
        if (action.data.priority) updates.priority = pickEnum(action.data.priority, PRIORITIES);
        if (action.data.status) updates.status = String(action.data.status).slice(0, 100);
        if (action.data.startDate) updates.startDate = action.data.startDate;
        if (action.data.endDate) updates.endDate = action.data.endDate;
        if (action.data.assignee !== undefined) updates.assignee = clipString(action.data.assignee, 200);
        if (typeof action.data.completionPercentage === "number") {
          updates.completionPercentage = Math.max(0, Math.min(100, action.data.completionPercentage));
        }
        const updated = await storage.updateTask(taskId, updates);
        await logUserActivity(userId, "update_task_via_friday", "task", taskId, { changes: Object.keys(updates) });
        return { success: true, message: `Task "${updated.name}" updated successfully.`, entityId: updated.id };
      }

      case "delete_task": {
        const taskId = Number(action.data.taskId);
        if (!taskId) return { success: false, message: "taskId is required." };
        const ok = await storage.softDeleteItem("task", taskId, userId, orgId);
        if (!ok) return { success: false, message: "Task could not be deleted." };
        await logUserActivity(userId, "delete_task_via_friday", "task", taskId, {});
        return { success: true, message: `Task deleted and moved to the Recycle Bin.`, entityId: taskId };
      }

      case "bulk_delete_tasks": {
        const ids = Array.isArray(action.data.taskIds) ? action.data.taskIds.map(Number).filter((n: number) => Number.isFinite(n)) : [];
        if (ids.length === 0) return { success: false, message: "taskIds array is required." };
        // Verify each task belongs to the org.
        const found = await db.select({ id: tasks.id, organizationId: tasks.organizationId })
          .from(tasks).where(inArray(tasks.id, ids));
        const validIds = found.filter(t => t.organizationId === orgId).map(t => t.id);
        if (validIds.length === 0) return { success: false, message: "No matching tasks in this organization." };
        const deletedCount = await storage.bulkSoftDeleteTasks(validIds, userId);
        await logUserActivity(userId, "bulk_delete_tasks_via_friday", "task", undefined, { count: deletedCount, taskIds: validIds });
        return { success: true, message: `${deletedCount} task(s) moved to the Recycle Bin.`, entityIds: validIds };
      }

      // ────────────────── Risks ──────────────────
      case "create_risk":
      case "create_mitigation": {
        if (!action.data.title || typeof action.data.title !== "string") {
          return { success: false, message: "Risk title is required." };
        }
        const limit = await checkAndEnforceLimit(userId, "risks" as any, 1, orgId);
        if (!limit.allowed) {
          return { success: false, message: limit.error || "Risk limit reached." };
        }
        const [newRisk] = await db.insert(issues).values({
          projectId: action.projectId!,
          itemType: "risk",
          title: action.data.title.slice(0, 500),
          description: clipString(action.data.description, 5000),
          priority: pickEnum(action.data.priority, PRIORITIES, "Medium")!,
          status: "Identified",
          responseStrategy: pickEnum(action.data.responseStrategy, RESPONSE_STRATEGIES, "Mitigate")!,
          mitigationPlan: clipString(action.data.mitigationPlan, 5000),
          probability: pickEnum(action.data.probability, PROBABILITY_LEVELS, "Medium")!,
          impact: pickEnum(action.data.impact, PROBABILITY_LEVELS, "Medium")!,
        }).returning();
        await recordResourceUsage(userId, "risks" as any, newRisk.id, 1, orgId);
        await logUserActivity(userId, "create_risk_via_friday", "risk", newRisk.id, { projectId: action.projectId, title: newRisk.title });
        return { success: true, message: `Risk "${newRisk.title}" created successfully.`, entityId: newRisk.id };
      }

      case "update_risk": {
        const riskId = Number(action.data.riskId);
        if (!riskId) return { success: false, message: "riskId is required." };
        const updates: Record<string, any> = {};
        if (action.data.title) updates.title = String(action.data.title).slice(0, 500);
        if (action.data.description !== undefined) updates.description = clipString(action.data.description, 5000);
        if (action.data.priority) updates.priority = pickEnum(action.data.priority, PRIORITIES);
        if (action.data.status) updates.status = String(action.data.status).slice(0, 100);
        if (action.data.probability) updates.probability = pickEnum(action.data.probability, PROBABILITY_LEVELS);
        if (action.data.impact) updates.impact = pickEnum(action.data.impact, PROBABILITY_LEVELS);
        if (action.data.responseStrategy) updates.responseStrategy = pickEnum(action.data.responseStrategy, RESPONSE_STRATEGIES);
        if (action.data.mitigationPlan !== undefined) updates.mitigationPlan = clipString(action.data.mitigationPlan, 5000);
        if (action.data.contingencyPlan !== undefined) updates.contingencyPlan = clipString(action.data.contingencyPlan, 5000);
        if (action.data.assignee !== undefined) updates.assignee = clipString(action.data.assignee, 200);
        if (action.data.dueDate) updates.dueDate = action.data.dueDate;
        const updated = await storage.updateRisk(riskId, updates);
        await logUserActivity(userId, "update_risk_via_friday", "risk", riskId, { changes: Object.keys(updates) });
        return { success: true, message: `Risk "${updated.title}" updated successfully.`, entityId: updated.id };
      }

      case "delete_risk": {
        const riskId = Number(action.data.riskId);
        if (!riskId) return { success: false, message: "riskId is required." };
        const ok = await storage.softDeleteItem("risk", riskId, userId, orgId);
        if (!ok) return { success: false, message: "Risk could not be deleted." };
        await logUserActivity(userId, "delete_risk_via_friday", "risk", riskId, {});
        return { success: true, message: `Risk deleted and moved to the Recycle Bin.`, entityId: riskId };
      }

      // ────────────────── Issues ──────────────────
      case "create_issue": {
        if (!action.data.title || typeof action.data.title !== "string") {
          return { success: false, message: "Issue title is required." };
        }
        const limit = await checkAndEnforceLimit(userId, "issues" as any, 1, orgId);
        if (!limit.allowed) {
          return { success: false, message: limit.error || "Issue limit reached." };
        }
        const [newIssue] = await db.insert(issues).values({
          projectId: action.projectId!,
          itemType: "issue",
          title: action.data.title.slice(0, 500),
          description: clipString(action.data.description, 5000),
          priority: pickEnum(action.data.priority, PRIORITIES, "Medium")!,
          severity: pickEnum(action.data.severity, PRIORITIES, "Medium")!,
          status: "Open",
        }).returning();
        await recordResourceUsage(userId, "issues" as any, newIssue.id, 1, orgId);
        await logUserActivity(userId, "create_issue_via_friday", "issue", newIssue.id, { projectId: action.projectId, title: newIssue.title });
        return { success: true, message: `Issue "${newIssue.title}" created successfully.`, entityId: newIssue.id };
      }

      case "update_issue": {
        const issueId = Number(action.data.issueId);
        if (!issueId) return { success: false, message: "issueId is required." };
        const updates: Record<string, any> = {};
        if (action.data.title) updates.title = String(action.data.title).slice(0, 500);
        if (action.data.description !== undefined) updates.description = clipString(action.data.description, 5000);
        if (action.data.priority) updates.priority = pickEnum(action.data.priority, PRIORITIES);
        if (action.data.severity) updates.severity = pickEnum(action.data.severity, PRIORITIES);
        if (action.data.status) updates.status = String(action.data.status).slice(0, 100);
        if (action.data.assignee !== undefined) updates.assignee = clipString(action.data.assignee, 200);
        if (action.data.targetResolutionDate) updates.targetResolutionDate = action.data.targetResolutionDate;
        const updated = await storage.updateIssue(issueId, updates);
        await logUserActivity(userId, "update_issue_via_friday", "issue", issueId, { changes: Object.keys(updates) });
        return { success: true, message: `Issue "${updated.title}" updated successfully.`, entityId: updated.id };
      }

      case "delete_issue": {
        const issueId = Number(action.data.issueId);
        if (!issueId) return { success: false, message: "issueId is required." };
        const ok = await storage.softDeleteItem("issue", issueId, userId, orgId);
        if (!ok) return { success: false, message: "Issue could not be deleted." };
        await logUserActivity(userId, "delete_issue_via_friday", "issue", issueId, {});
        return { success: true, message: `Issue deleted and moved to the Recycle Bin.`, entityId: issueId };
      }

      // ────────────────── Projects ──────────────────
      case "create_project": {
        if (!action.data.name || typeof action.data.name !== "string") {
          return { success: false, message: "Project name is required." };
        }
        const limit = await checkAndEnforceLimit(userId, "projects" as any, 1, orgId);
        if (!limit.allowed) {
          return { success: false, message: limit.error || "Project limit reached." };
        }
        const trimmedName = action.data.name.trim().slice(0, 500);
        const project = await storage.createProject({
          name: trimmedName,
          projectCode: action.data.projectCode?.trim() || null,
          description: clipString(action.data.description, 5000),
          status: pickEnum(action.data.status, PROJECT_STATUSES, "Planning"),
          priority: pickEnum(action.data.priority, PRIORITIES, "Medium"),
          methodology: pickEnum(action.data.methodology, METHODOLOGIES),
          portfolioId: typeof action.data.portfolioId === "number" ? action.data.portfolioId : null,
          startDate: action.data.startDate || null,
          endDate: action.data.endDate || null,
          budget: action.data.budget != null ? String(action.data.budget) : null,
          department: clipString(action.data.department, 200),
          managerId: action.data.managerId || null,
          organizationId: orgId,
          createdBy: userId,
        } as any);
        await recordResourceUsage(userId, "projects" as any, project.id, 1, orgId);
        await logUserActivity(userId, "create_project_via_friday", "project", project.id, { name: project.name });
        return { success: true, message: `Project "${project.name}" created successfully.`, entityId: project.id };
      }

      case "update_project": {
        const updates: Record<string, any> = {};
        if (action.data.name) updates.name = String(action.data.name).trim().slice(0, 500);
        if (action.data.description !== undefined) updates.description = clipString(action.data.description, 5000);
        if (action.data.status) updates.status = pickEnum(action.data.status, PROJECT_STATUSES);
        if (action.data.priority) updates.priority = pickEnum(action.data.priority, PRIORITIES);
        if (action.data.methodology) updates.methodology = pickEnum(action.data.methodology, METHODOLOGIES);
        if (action.data.health) {
          updates.health = pickEnum(action.data.health, HEALTH_VALUES);
          updates.healthReasonUpdatedAt = new Date();
        }
        if (action.data.healthReason !== undefined) updates.healthReason = clipString(action.data.healthReason, 1000);
        if (action.data.portfolioId !== undefined) updates.portfolioId = action.data.portfolioId === null ? null : Number(action.data.portfolioId);
        if (action.data.startDate) updates.startDate = action.data.startDate;
        if (action.data.endDate) updates.endDate = action.data.endDate;
        if (action.data.budget != null) updates.budget = String(action.data.budget);
        if (typeof action.data.completionPercentage === "number") {
          updates.completionPercentage = Math.max(0, Math.min(100, action.data.completionPercentage));
        }
        if (action.data.managerId !== undefined) updates.managerId = action.data.managerId || null;
        updates.updatedBy = userId;
        const updated = await storage.updateProject(action.projectId!, updates as any);
        await logUserActivity(userId, "update_project_via_friday", "project", action.projectId!, { changes: Object.keys(updates) });
        return { success: true, message: `Project "${updated.name}" updated successfully.`, entityId: updated.id };
      }

      case "delete_project": {
        const ok = await storage.softDeleteItem("project", action.projectId!, userId, orgId);
        if (!ok) return { success: false, message: "Project could not be deleted." };
        await logUserActivity(userId, "delete_project_via_friday", "project", action.projectId!, {});
        return { success: true, message: `Project deleted and moved to the Recycle Bin.`, entityId: action.projectId! };
      }

      // ────────────────── Portfolios ──────────────────
      case "create_portfolio": {
        if (!action.data.name || typeof action.data.name !== "string") {
          return { success: false, message: "Portfolio name is required." };
        }
        const limit = await checkAndEnforceLimit(userId, "portfolios" as any, 1, orgId);
        if (!limit.allowed) {
          return { success: false, message: limit.error || "Portfolio limit reached." };
        }
        const trimmedName = action.data.name.trim().slice(0, 500);
        const existing = await storage.getPortfolios(orgId);
        if (existing.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
          return { success: false, message: "A portfolio with this name already exists." };
        }
        const portfolio = await storage.createPortfolio({
          organizationId: orgId,
          name: trimmedName,
          description: clipString(action.data.description, 5000),
          status: clipString(action.data.status, 100) || "Active",
          department: clipString(action.data.department, 200),
          strategicObjective: clipString(action.data.strategicObjective, 5000),
          riskTolerance: clipString(action.data.riskTolerance, 100),
          budgetAllocated: action.data.budgetAllocated != null ? String(action.data.budgetAllocated) : null,
          targetStartDate: action.data.targetStartDate || null,
          targetEndDate: action.data.targetEndDate || null,
          isCustom: !!action.data.isCustom,
          createdBy: userId,
        } as any);
        await recordResourceUsage(userId, "portfolios" as any, portfolio.id, 1, orgId);
        await logUserActivity(userId, "create_portfolio_via_friday", "portfolio", portfolio.id, { name: portfolio.name });
        return { success: true, message: `Portfolio "${portfolio.name}" created successfully.`, entityId: portfolio.id };
      }

      case "update_portfolio": {
        const portfolioId = Number(action.data.portfolioId);
        if (!portfolioId) return { success: false, message: "portfolioId is required." };
        const portfolio = await storage.getPortfolio(portfolioId);
        if (!portfolio || portfolio.organizationId !== orgId) {
          return { success: false, message: "Portfolio not found in this organization." };
        }
        const updates: Record<string, any> = {};
        if (action.data.name) updates.name = String(action.data.name).trim().slice(0, 500);
        if (action.data.description !== undefined) updates.description = clipString(action.data.description, 5000);
        if (action.data.status) updates.status = clipString(action.data.status, 100);
        if (action.data.department !== undefined) updates.department = clipString(action.data.department, 200);
        if (action.data.strategicObjective !== undefined) updates.strategicObjective = clipString(action.data.strategicObjective, 5000);
        if (action.data.riskTolerance) updates.riskTolerance = clipString(action.data.riskTolerance, 100);
        if (action.data.budgetAllocated != null) updates.budgetAllocated = String(action.data.budgetAllocated);
        if (action.data.targetStartDate) updates.targetStartDate = action.data.targetStartDate;
        if (action.data.targetEndDate) updates.targetEndDate = action.data.targetEndDate;
        const updated = await storage.updatePortfolio(portfolioId, updates as any);
        await logUserActivity(userId, "update_portfolio_via_friday", "portfolio", portfolioId, { changes: Object.keys(updates) });
        return { success: true, message: `Portfolio "${updated.name}" updated successfully.`, entityId: updated.id };
      }

      case "delete_portfolio": {
        const portfolioId = Number(action.data.portfolioId);
        if (!portfolioId) return { success: false, message: "portfolioId is required." };
        const portfolio = await storage.getPortfolio(portfolioId);
        if (!portfolio || portfolio.organizationId !== orgId) {
          return { success: false, message: "Portfolio not found in this organization." };
        }
        const ok = await storage.softDeleteItem("portfolio", portfolioId, userId, orgId);
        if (!ok) return { success: false, message: "Portfolio could not be deleted." };
        await logUserActivity(userId, "delete_portfolio_via_friday", "portfolio", portfolioId, {});
        return { success: true, message: `Portfolio "${portfolio.name}" deleted and moved to the Recycle Bin.`, entityId: portfolioId };
      }

      case "add_project_to_portfolio": {
        const portfolioId = Number(action.data.portfolioId);
        const projectId = Number(action.data.projectId ?? action.projectId);
        if (!portfolioId || !projectId) return { success: false, message: "portfolioId and projectId are required." };
        const portfolio = await storage.getPortfolio(portfolioId);
        if (!portfolio || portfolio.organizationId !== orgId) {
          return { success: false, message: "Portfolio not found in this organization." };
        }
        if (!portfolio.isCustom) {
          return { success: false, message: "Only custom portfolios support manual project membership. Use update_project to set portfolioId for non-custom portfolios." };
        }
        const projectInOrg = await verifyProjectBelongsToOrg(projectId, orgId);
        if (!projectInOrg) return { success: false, message: "Project not found in this organization." };
        await storage.addProjectToCustomPortfolio(portfolioId, projectId, userId);
        await logUserActivity(userId, "add_project_to_portfolio_via_friday", "portfolio", portfolioId, { projectId });
        return { success: true, message: `Project added to portfolio "${portfolio.name}".`, entityId: portfolioId };
      }

      case "remove_project_from_portfolio": {
        const portfolioId = Number(action.data.portfolioId);
        const projectId = Number(action.data.projectId ?? action.projectId);
        if (!portfolioId || !projectId) return { success: false, message: "portfolioId and projectId are required." };
        const portfolio = await storage.getPortfolio(portfolioId);
        if (!portfolio || portfolio.organizationId !== orgId) {
          return { success: false, message: "Portfolio not found in this organization." };
        }
        await storage.removeProjectFromCustomPortfolio(portfolioId, projectId);
        await logUserActivity(userId, "remove_project_from_portfolio_via_friday", "portfolio", portfolioId, { projectId });
        return { success: true, message: `Project removed from portfolio "${portfolio.name}".`, entityId: portfolioId };
      }

      // ────────────────── Resources ──────────────────
      case "create_resource": {
        const fields = sanitizeResourceFields(action.data);
        if (!fields.displayName) {
          return { success: false, message: "A display name is required to create a resource." };
        }
        const limit = await checkAndEnforceLimit(userId, "resources" as any, 1, orgId);
        if (!limit.allowed) {
          return { success: false, message: limit.error || "Resource limit reached." };
        }
        const created = await storage.createResource({
          organizationId: orgId,
          ...fields,
          displayName: fields.displayName!,
        } as any);
        await recordResourceUsage(userId, "resources" as any, created.id, 1, orgId);
        await logUserActivity(userId, "create_resource_via_friday", "resource", created.id, { displayName: created.displayName });
        return { success: true, message: `Resource "${created.displayName}" created (ID: ${created.id}).`, entityId: created.id };
      }

      case "update_resource": {
        const resourceId = Number(action.data.resourceId);
        if (!resourceId) return { success: false, message: "resourceId is required." };
        const resource = await storage.getResource(resourceId);
        if (!resource || resource.organizationId !== orgId) {
          return { success: false, message: "Resource not found in this organization." };
        }
        const fields = sanitizeResourceFields(action.data);
        if (Object.keys(fields).length === 0) {
          return { success: false, message: "No valid fields to update." };
        }
        const updated = await storage.updateResource(resourceId, fields as any);
        await logUserActivity(userId, "update_resource_via_friday", "resource", resourceId, { changes: Object.keys(fields) });
        return { success: true, message: `Resource "${updated.displayName}" updated successfully.`, entityId: updated.id };
      }

      case "delete_resource": {
        const resourceId = Number(action.data.resourceId);
        if (!resourceId) return { success: false, message: "resourceId is required." };
        const resource = await storage.getResource(resourceId);
        if (!resource || resource.organizationId !== orgId) {
          return { success: false, message: "Resource not found in this organization." };
        }
        await storage.deleteResource(resourceId);
        await logUserActivity(userId, "delete_resource_via_friday", "resource", resourceId, { displayName: resource.displayName });
        return { success: true, message: `Resource "${resource.displayName}" deleted.`, entityId: resourceId };
      }

      case "assign_resources_to_task": {
        const taskId = Number(action.data.taskId);
        const resourceIds = Array.isArray(action.data.resourceIds)
          ? action.data.resourceIds.map(Number).filter((n: number) => Number.isFinite(n))
          : [];
        if (!taskId) return { success: false, message: "taskId is required." };
        const [taskRow] = await db.select({ id: tasks.id, organizationId: tasks.organizationId, projectId: tasks.projectId })
          .from(tasks).where(eq(tasks.id, taskId));
        if (!taskRow || taskRow.organizationId !== orgId) {
          return { success: false, message: "Task not found in this organization." };
        }
        await storage.updateTaskResourceAssignments(taskId, resourceIds);
        await logUserActivity(userId, "assign_resources_via_friday", "task", taskId, { resourceIds });
        return { success: true, message: `Assigned ${resourceIds.length} resource(s) to task.`, entityId: taskId };
      }

      // ────────────────── Members ──────────────────
      case "invite_member": {
        const email = typeof action.data.email === "string" ? action.data.email.trim().toLowerCase() : "";
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return { success: false, message: "A valid email address is required." };
        }
        const requestedRole = pickEnum(action.data.role, INVITE_ROLES, "member")!;
        // Seat-limit check (member + pending invite count vs maxSeats).
        const seatCheck = await checkSeatLimit(orgId, 1);
        if (!seatCheck.allowed) {
          return { success: false, message: seatCheck.reason || "Seat limit reached. Upgrade your plan to invite more members." };
        }
        // Check existing membership by joining users on email.
        const members = await storage.getOrganizationMembers(orgId);
        const memberUserIds = members.map(m => m.userId);
        if (memberUserIds.length > 0) {
          const matchingUsers = await db.select({ id: users.id, email: users.email })
            .from(users)
            .where(and(inArray(users.id, memberUserIds), eq(sql`lower(${users.email})`, email)));
          if (matchingUsers.length > 0) {
            return { success: false, message: `${email} is already a member of this organization.` };
          }
        }
        // Check & remove any existing pending invite for this email.
        const existingInvites = await storage.getOrganizationInvites(orgId);
        const dup = existingInvites.find(i => i.email.toLowerCase() === email && i.status === "pending");
        if (dup) {
          await db.delete(organizationInvites).where(eq(organizationInvites.id, dup.id));
        }
        const crypto = await import("crypto");
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const invite = await storage.createOrganizationInvite({
          organizationId: orgId,
          email,
          role: requestedRole,
          invitedBy: userId,
          status: "pending",
          token,
          expiresAt,
        } as any);
        // Send invite email (best-effort).
        try {
          const org = await storage.getOrganization(orgId);
          const inviter = await storage.getUser(userId);
          const inviterName = inviter
            ? [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") || inviter.email || "An administrator"
            : "An administrator";
          if (org) {
            await sendOrganizationInviteEmail(email, org.name, inviterName, requestedRole, "https://fridayreport.ai", token);
          }
        } catch {
          // Non-fatal; invite row is still created and user can resend.
        }
        await logUserActivity(userId, "invite_member_via_friday", "organization_invite", invite.id, { email, role: requestedRole });
        return { success: true, message: `Invitation sent to ${email} (role: ${requestedRole}).`, entityId: invite.id };
      }

      case "remove_member": {
        const targetUserId = typeof action.data.userId === "string" ? action.data.userId : "";
        if (!targetUserId) return { success: false, message: "userId is required." };
        if (targetUserId === userId) {
          return { success: false, message: "You cannot remove yourself from the organization." };
        }
        const members = await storage.getOrganizationMembers(orgId);
        const target = members.find(m => m.userId === targetUserId);
        if (!target) return { success: false, message: "User is not a member of this organization." };
        if (target.role === "owner") {
          return { success: false, message: "Owners cannot be removed from the organization." };
        }
        await storage.removeOrganizationMember(orgId, targetUserId);
        await logUserActivity(userId, "remove_member_via_friday", "organization_member", undefined, { removedUserId: targetUserId });
        return { success: true, message: `Member removed from organization.` };
      }

      // ────────────────── Project misc (legacy) ──────────────────
      case "add_note": {
        if (!action.data.note || typeof action.data.note !== "string") {
          return { success: false, message: "Note content is required." };
        }
        await db.update(projects).set({
          notes: action.data.note.slice(0, 10000),
          updatedAt: new Date(),
        }).where(and(eq(projects.id, action.projectId!), eq(projects.organizationId, orgId)));
        await logUserActivity(userId, "add_note_via_friday", "project", action.projectId!, {});
        return { success: true, message: `Note added to project.`, entityId: action.projectId! };
      }

      case "flag_for_review": {
        await db.update(projects).set({
          health: "Red",
          healthReason: (action.data.reason || "Flagged for review by Friday Report").slice(0, 1000),
          healthReasonUpdatedAt: new Date(),
          updatedAt: new Date(),
        }).where(and(eq(projects.id, action.projectId!), eq(projects.organizationId, orgId)));
        await logUserActivity(userId, "flag_for_review_via_friday", "project", action.projectId!, { reason: action.data.reason });
        return { success: true, message: `Project flagged for review with Red health status.`, entityId: action.projectId! };
      }

      case "assign_owner": {
        if (!action.data.userId || typeof action.data.userId !== "string") {
          return { success: false, message: "Valid userId is required for assignment." };
        }
        const [member] = await db.select({ id: organizationMembers.id })
          .from(organizationMembers)
          .where(and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.userId, action.data.userId),
          ));
        if (!member) {
          return { success: false, message: "User is not a member of this organization." };
        }
        await db.update(projects).set({
          managerId: action.data.userId,
          updatedAt: new Date(),
        }).where(and(eq(projects.id, action.projectId!), eq(projects.organizationId, orgId)));
        await logUserActivity(userId, "assign_owner_via_friday", "project", action.projectId!, { managerId: action.data.userId });
        return { success: true, message: `Project manager assigned.`, entityId: action.projectId! };
      }

      default:
        return { success: false, message: "Unknown action type." };
    }
  } catch (err: any) {
    console.error("[JARVIS] executeJarvisAction error:", err);
    return { success: false, message: err?.message || "Action failed unexpectedly." };
  }
}
