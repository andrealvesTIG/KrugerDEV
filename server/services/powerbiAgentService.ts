import { db } from "../db";
import { powerbiIntakeRequests, projectIntakes } from "@shared/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SYSTEM_PROMPT = `You are the Power BI Report Request Agent for FridayReport.AI. You help clients submit new Power BI report requests by guiding them through a structured intake conversation. You are professional, friendly, and thorough.

Your job is to gather all the information needed for the internal team to estimate effort and prepare a quote. You do NOT provide the effort estimate to the client.

CONVERSATION FLOW:
1. Greet the client warmly and ask what type of Power BI report they need (e.g., Executive Dashboard, Operational Report, Financial Report, Sales/Marketing Analytics, HR/People Analytics, Supply Chain/Logistics, Custom/Other).
2. Once they describe the report type, gather the following scoping details one or two at a time — do NOT ask all questions at once. Be conversational and ask follow-up questions based on their answers:

   a) Report name / title — What should this report be called?
   b) Brief description — What is the main purpose and audience?
   c) Number of report pages — How many main pages/tabs?
   d) Number of drill-down pages — Any drill-through or detail pages?
   e) Data sources — How many data sources? What systems (SQL Server, Excel, SharePoint, APIs, SAP, Salesforce, etc.)?
   f) Integrations — Any specific system integrations required (e.g., live connection vs import, DirectQuery, dataflows)?
   g) Calculation complexity — Are there complex DAX measures, calculated columns, or time intelligence needed? (Simple, Moderate, Complex, Very Complex)
   h) Refresh frequency — How often should data refresh? (Real-time/DirectQuery, Hourly, Daily, Weekly, Manual)
   i) Filters and slicers — What filtering capabilities are needed? (Date ranges, departments, regions, categories, etc.)
   j) Visual/UX requirements — Any specific chart types, branding/themes, mobile layout, or accessibility requirements?
   k) Security / Row-Level Security (RLS) — Does different data need to be restricted per user/role/department?
   l) Target delivery date — When do you need this delivered?
   m) Additional notes — Anything else the team should know?

3. After gathering enough information, summarize what you've captured and ask the client to confirm.
4. Once confirmed, call the submit_powerbi_request tool to create the intake record. Tell the client their request has been submitted and the team will follow up with a quote.

IMPORTANT RULES:
- Ask questions in a natural, conversational way — 1-2 questions at a time, not a giant form.
- If the client is unsure about something, help them think through it or mark it as "TBD".
- Do NOT provide effort estimates, timelines, or pricing to the client. That's for the internal team.
- Always summarize before submitting and get confirmation.
- Use markdown formatting for the summary.
- Be helpful but focused — keep the conversation on track toward completing the intake.

ANSWER OPTIONS (IMPORTANT):
Whenever you ask a question that has a finite set of likely answers (report type, complexity level, refresh frequency, yes/no confirmations, page counts, common ranges, etc.), append a single marker line at the very end of your message in this exact format:

[OPTIONS]Option one|Option two|Option three[/OPTIONS]

Rules for the marker:
- Use the literal tags [OPTIONS] and [/OPTIONS] on a single line, separated by the pipe character "|".
- Provide 2 to 6 short options (each a few words max).
- Do NOT include an "I don't know" option — the UI adds that automatically.
- Only include the marker when the question genuinely has discrete answer choices. For free-form questions (e.g., "What should we name the report?"), omit the marker.
- Never reference the marker in the visible text — just place it on its own final line.`;

export interface PowerBIAgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const powerbiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "submit_powerbi_request",
      description: "Submit the completed Power BI report intake request. Call this ONLY after presenting a summary to the client and receiving their explicit confirmation. This creates the intake record and generates an internal effort estimate.",
      parameters: {
        type: "object",
        properties: {
          reportType: { type: "string", description: "Type of report (e.g., Executive Dashboard, Financial Report, etc.)" },
          reportName: { type: "string", description: "Name/title of the report" },
          description: { type: "string", description: "Brief description of purpose and audience" },
          numberOfPages: { type: "number", description: "Number of main report pages" },
          numberOfDrillDownPages: { type: "number", description: "Number of drill-down/detail pages" },
          numberOfDataSources: { type: "number", description: "Number of data sources" },
          dataSources: { type: "string", description: "Description of data sources (systems, types)" },
          integrations: { type: "string", description: "Integration requirements" },
          calculationComplexity: { type: "string", enum: ["Simple", "Moderate", "Complex", "Very Complex"], description: "Complexity level of calculations/DAX" },
          refreshFrequency: { type: "string", description: "Data refresh frequency" },
          filtersAndSlicers: { type: "string", description: "Filter and slicer requirements" },
          visualRequirements: { type: "string", description: "Visual and UX requirements" },
          securityRequirements: { type: "string", description: "RLS and security requirements" },
          targetDeliveryDate: { type: "string", description: "Desired delivery date" },
          additionalNotes: { type: "string", description: "Any additional notes" },
        },
        required: ["reportType", "reportName", "description"],
      },
    },
  },
];

function calculateEffortEstimate(args: Record<string, any>): { totalHours: number; breakdown: Record<string, number> } {
  let breakdown: Record<string, number> = {};

  const pages = (args.numberOfPages || 1);
  const drillDownPages = (args.numberOfDrillDownPages || 0);
  const dataSources = (args.numberOfDataSources || 1);

  breakdown["Requirements & Design"] = Math.max(4, Math.ceil(pages * 1.5));
  breakdown["Data Model & ETL"] = Math.max(4, dataSources * 4);

  const complexityMultiplier: Record<string, number> = {
    "Simple": 1,
    "Moderate": 1.5,
    "Complex": 2.5,
    "Very Complex": 4,
  };
  const cMult = complexityMultiplier[args.calculationComplexity] || 1.5;
  breakdown["DAX Measures & Calculations"] = Math.ceil(pages * 2 * cMult);

  breakdown["Report Pages Development"] = Math.ceil(pages * 4 + drillDownPages * 3);

  const visualReqs = (args.visualRequirements || "").toLowerCase();
  let visualExtra = 0;
  if (visualReqs.includes("mobile")) visualExtra += 4;
  if (visualReqs.includes("brand") || visualReqs.includes("theme") || visualReqs.includes("custom")) visualExtra += 3;
  if (visualReqs.includes("accessible") || visualReqs.includes("accessibility")) visualExtra += 2;
  breakdown["Visual Design & Branding"] = Math.max(2, visualExtra + Math.ceil(pages * 0.5));

  const secReqs = (args.securityRequirements || "").toLowerCase();
  if (secReqs && secReqs !== "none" && secReqs !== "n/a" && secReqs !== "no") {
    breakdown["Row-Level Security (RLS)"] = Math.max(4, dataSources * 2);
  }

  const refreshReq = (args.refreshFrequency || "").toLowerCase();
  if (refreshReq.includes("real") || refreshReq.includes("direct") || refreshReq.includes("hourly")) {
    breakdown["Data Refresh & Gateway Configuration"] = 6;
  } else {
    breakdown["Data Refresh & Gateway Configuration"] = 3;
  }

  breakdown["Testing & QA"] = Math.max(4, Math.ceil((pages + drillDownPages) * 1.5));
  breakdown["Documentation & Handover"] = Math.max(2, Math.ceil(pages * 0.5));

  const totalHours = Object.values(breakdown).reduce((sum, h) => sum + h, 0);

  return { totalHours, breakdown };
}

async function generateRequestNumber(orgId: number): Promise<string> {
  const year = new Date().getFullYear();
  const [countResult] = await db.select({ 
    count: sql<number>`count(*)::int` 
  }).from(powerbiIntakeRequests).where(eq(powerbiIntakeRequests.organizationId, orgId));
  const seq = (countResult?.count || 0) + 1;
  return `PBI-${year}-${String(seq).padStart(3, "0")}`;
}

async function handlePowerBIToolCall(
  orgId: number,
  userId: string,
  toolName: string,
  args: Record<string, any>,
  conversationLog: string,
): Promise<string> {
  if (toolName !== "submit_powerbi_request") {
    return JSON.stringify({ success: false, message: "Unknown tool." });
  }

  const requestNumber = await generateRequestNumber(orgId);
  const effort = calculateEffortEstimate(args);

  const descriptionParts: string[] = [];
  if (args.description) descriptionParts.push(args.description);
  descriptionParts.push(`\n--- Power BI Scoping Details ---`);
  descriptionParts.push(`Report Type: ${args.reportType || "N/A"}`);
  if (args.numberOfPages) descriptionParts.push(`Pages: ${args.numberOfPages} main${args.numberOfDrillDownPages ? ` + ${args.numberOfDrillDownPages} drill-down` : ""}`);
  if (args.numberOfDataSources) descriptionParts.push(`Data Sources (${args.numberOfDataSources}): ${args.dataSources || "N/A"}`);
  if (args.integrations) descriptionParts.push(`Integrations: ${args.integrations}`);
  if (args.calculationComplexity) descriptionParts.push(`Calculation Complexity: ${args.calculationComplexity}`);
  if (args.refreshFrequency) descriptionParts.push(`Refresh Frequency: ${args.refreshFrequency}`);
  if (args.filtersAndSlicers) descriptionParts.push(`Filters & Slicers: ${args.filtersAndSlicers}`);
  if (args.visualRequirements) descriptionParts.push(`Visual/UX Requirements: ${args.visualRequirements}`);
  if (args.securityRequirements) descriptionParts.push(`Security / RLS: ${args.securityRequirements}`);
  if (args.targetDeliveryDate) descriptionParts.push(`Target Delivery: ${args.targetDeliveryDate}`);
  if (args.additionalNotes) descriptionParts.push(`Additional Notes: ${args.additionalNotes}`);
  descriptionParts.push(`\nPower BI Request Ref: ${requestNumber}`);

  const result = await db.transaction(async (tx) => {
    const year = new Date().getFullYear();
    const existingCount = await tx.select({ count: sql<number>`count(*)` })
      .from(projectIntakes)
      .where(sql`EXTRACT(YEAR FROM ${projectIntakes.createdAt}) = ${year}`);
    const intakeSeq = Number(existingCount[0]?.count || 0) + 1;
    const intakeNumber = `INT-${year}-${String(intakeSeq).padStart(3, '0')}`;

    const [projectIntake] = await tx.insert(projectIntakes).values({
      organizationId: orgId,
      intakeNumber,
      projectName: args.reportName || "Untitled Power BI Report",
      submitterId: userId,
      description: descriptionParts.join("\n"),
      status: "draft",
      currentStep: "intake_capture",
      resourceRequirements: `Estimated effort: ${effort.totalHours} hours\n${Object.entries(effort.breakdown).map(([k, v]) => `${k}: ${v}h`).join("\n")}`,
      implementationTimeline: args.targetDeliveryDate || null,
    }).returning();

    const [pbiRecord] = await tx.insert(powerbiIntakeRequests).values({
      organizationId: orgId,
      requestNumber,
      submittedBy: userId,
      status: "new",
      reportType: args.reportType?.slice(0, 200) || null,
      reportName: args.reportName?.slice(0, 500) || "Untitled Report",
      description: args.description?.slice(0, 5000) || null,
      numberOfPages: args.numberOfPages || null,
      numberOfDrillDownPages: args.numberOfDrillDownPages || null,
      numberOfDataSources: args.numberOfDataSources || null,
      dataSources: args.dataSources?.slice(0, 2000) || null,
      integrations: args.integrations?.slice(0, 2000) || null,
      calculationComplexity: args.calculationComplexity || null,
      refreshFrequency: args.refreshFrequency?.slice(0, 500) || null,
      filtersAndSlicers: args.filtersAndSlicers?.slice(0, 2000) || null,
      visualRequirements: args.visualRequirements?.slice(0, 2000) || null,
      securityRequirements: args.securityRequirements?.slice(0, 2000) || null,
      targetDeliveryDate: args.targetDeliveryDate?.slice(0, 200) || null,
      additionalNotes: args.additionalNotes?.slice(0, 5000) || null,
      conversationLog: conversationLog.slice(0, 50000),
      estimatedEffortHours: effort.totalHours,
      effortBreakdown: effort.breakdown,
      projectIntakeId: projectIntake.id,
    }).returning();

    console.log(`[PowerBI Agent] Created project intake ${projectIntake.intakeNumber} + Power BI request ${requestNumber}`);

    return { pbiRecord, projectIntake };
  });

  return JSON.stringify({
    success: true,
    message: `Power BI report request "${result.pbiRecord.reportName}" submitted successfully with reference number ${requestNumber}. A project intake (${result.projectIntake.intakeNumber}) has also been created and will go through the governance approval workflow. The project team will review the requirements and follow up with a quote and timeline.`,
    requestNumber,
    requestId: result.pbiRecord.id,
    intakeNumber: result.projectIntake.intakeNumber,
    intakeId: result.projectIntake.id,
  });
}

export async function streamPowerBIAgentResponse(
  orgId: number,
  userId: string,
  messages: PowerBIAgentMessage[],
  onChunk: (content: string) => void,
  onDone: (fullResponse: string) => void,
  onError: (error: Error) => void,
) {
  try {
    const conversationLog = messages.map(m => `${m.role}: ${m.content}`).join("\n\n");

    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    let fullResponse = "";
    const MAX_TOOL_ROUNDS = 3;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: apiMessages,
        stream: true,
        max_completion_tokens: 4096,
        temperature: 0.4,
        tools: powerbiTools,
      });

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
          const result = await handlePowerBIToolCall(orgId, userId, tc.name, args, conversationLog);
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

    onDone(fullResponse);
  } catch (err: any) {
    onError(err);
  }
}

export async function getPowerBIIntakeRequests(orgId: number) {
  return db.select().from(powerbiIntakeRequests)
    .where(eq(powerbiIntakeRequests.organizationId, orgId))
    .orderBy(desc(powerbiIntakeRequests.createdAt));
}

export async function getPowerBIIntakeRequest(id: number, orgId: number) {
  const [request] = await db.select().from(powerbiIntakeRequests)
    .where(and(eq(powerbiIntakeRequests.id, id), eq(powerbiIntakeRequests.organizationId, orgId)));
  return request;
}

export async function convertPowerBIRequestToIntake(id: number, orgId: number, userId: string) {
  const result = await db.transaction(async (tx) => {
    const [request] = await tx.execute(
      sql`SELECT * FROM ${powerbiIntakeRequests} WHERE ${powerbiIntakeRequests.id} = ${id} AND ${powerbiIntakeRequests.organizationId} = ${orgId} FOR UPDATE`
    ) as any[];

    if (!request) {
      throw new Error("Power BI request not found");
    }

    if (request.project_intake_id) {
      throw new Error("This request already has a linked project intake");
    }

    const descriptionParts: string[] = [];
    if (request.description) descriptionParts.push(request.description);
    descriptionParts.push(`\n--- Power BI Scoping Details ---`);
    descriptionParts.push(`Report Type: ${request.report_type || "N/A"}`);
    if (request.number_of_pages) descriptionParts.push(`Pages: ${request.number_of_pages} main${request.number_of_drill_down_pages ? ` + ${request.number_of_drill_down_pages} drill-down` : ""}`);
    if (request.number_of_data_sources) descriptionParts.push(`Data Sources (${request.number_of_data_sources}): ${request.data_sources || "N/A"}`);
    if (request.integrations) descriptionParts.push(`Integrations: ${request.integrations}`);
    if (request.calculation_complexity) descriptionParts.push(`Calculation Complexity: ${request.calculation_complexity}`);
    if (request.refresh_frequency) descriptionParts.push(`Refresh Frequency: ${request.refresh_frequency}`);
    if (request.filters_and_slicers) descriptionParts.push(`Filters & Slicers: ${request.filters_and_slicers}`);
    if (request.visual_requirements) descriptionParts.push(`Visual/UX Requirements: ${request.visual_requirements}`);
    if (request.security_requirements) descriptionParts.push(`Security / RLS: ${request.security_requirements}`);
    if (request.target_delivery_date) descriptionParts.push(`Target Delivery: ${request.target_delivery_date}`);
    if (request.additional_notes) descriptionParts.push(`Additional Notes: ${request.additional_notes}`);
    descriptionParts.push(`\nPower BI Request Ref: ${request.request_number}`);

    const effortBreakdown = request.effort_breakdown as Record<string, number> | null;
    const resourceReqs = request.estimated_effort_hours
      ? `Estimated effort: ${request.estimated_effort_hours} hours${effortBreakdown ? "\n" + Object.entries(effortBreakdown).map(([k, v]) => `${k}: ${v}h`).join("\n") : ""}`
      : null;

    const year = new Date().getFullYear();
    const existingCount = await tx.select({ count: sql<number>`count(*)` })
      .from(projectIntakes)
      .where(sql`EXTRACT(YEAR FROM ${projectIntakes.createdAt}) = ${year}`);
    const intakeSeq = Number(existingCount[0]?.count || 0) + 1;
    const intakeNumber = `INT-${year}-${String(intakeSeq).padStart(3, '0')}`;

    const [projectIntake] = await tx.insert(projectIntakes).values({
      organizationId: orgId,
      intakeNumber,
      projectName: request.report_name || "Untitled Power BI Report",
      submitterId: userId,
      description: descriptionParts.join("\n"),
      status: "draft",
      currentStep: "intake_capture",
      resourceRequirements: resourceReqs,
      implementationTimeline: request.target_delivery_date || null,
    }).returning();

    await tx.update(powerbiIntakeRequests)
      .set({ projectIntakeId: projectIntake.id })
      .where(eq(powerbiIntakeRequests.id, id));

    console.log(`[PowerBI Agent] Converted PBI request ${request.request_number} -> intake ${projectIntake.intakeNumber}`);

    return projectIntake;
  });

  return result;
}

export async function deletePowerBIIntakeRequest(id: number, orgId: number) {
  const [request] = await db.select().from(powerbiIntakeRequests)
    .where(and(eq(powerbiIntakeRequests.id, id), eq(powerbiIntakeRequests.organizationId, orgId)));

  if (!request) {
    throw new Error("Power BI request not found");
  }

  await db.delete(powerbiIntakeRequests)
    .where(and(eq(powerbiIntakeRequests.id, id), eq(powerbiIntakeRequests.organizationId, orgId)));

  console.log(`[PowerBI Agent] Deleted PBI request ${request.requestNumber} (id: ${id})`);
  return request;
}
