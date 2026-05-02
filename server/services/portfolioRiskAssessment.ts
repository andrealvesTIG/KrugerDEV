import OpenAI from "openai";
import PDFDocument from "pdfkit";
import { storage } from "../storage";
import { DEFAULT_RISK_ASSESSMENT_CONFIG, type RiskAssessmentConfig } from "@shared/schema";
import { decryptApiKey } from "../routes/helpers";
import { withAiCredits } from "./aiCredits";

const defaultOpenai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function getOpenAIClient(config: RiskAssessmentConfig): { client: OpenAI; model: string } {
  if (config.useCustomLLM && config.customEndpoint && config.customApiKey) {
    const apiKey = decryptApiKey(config.customApiKey);
    return {
      client: new OpenAI({ apiKey, baseURL: config.customEndpoint }),
      model: config.customModel || config.model,
    };
  }
  return { client: defaultOpenai, model: config.model };
}

export interface RiskAssessmentReport {
  riskScore: number;
  summary: string;
  overallRiskLevel: string;
  categories: {
    name: string;
    score: number;
    level: string;
    findings: string[];
    recommendations: string[];
  }[];
  topRisks: {
    title: string;
    severity: string;
    impact: string;
    likelihood: string;
    mitigation: string;
  }[];
  financialRiskAnalysis: {
    budgetVariance: string;
    costRiskLevel: string;
    findings: string[];
  };
  scheduleRiskAnalysis: {
    scheduleVariance: string;
    delayRiskLevel: string;
    findings: string[];
  };
  recommendations: string[];
}

function buildPortfolioSystemPrompt(config: RiskAssessmentConfig): string {
  const t = config.thresholds;
  const cats = config.categories.length > 0 ? config.categories.join(", ") : "Schedule Risk, Budget Risk, Resource Risk, Technical Risk, Scope Risk";
  let prompt = `You are an expert portfolio risk analyst performing a comprehensive risk assessment for a project portfolio. Analyze the provided portfolio data including projects, risks, issues, key dates, and financial information.

Return a JSON object with this exact structure:
{
  "riskScore": <number 1-100, where 1 is lowest risk and 100 is highest risk>,
  "summary": "<2-3 sentence executive summary of overall portfolio risk posture>",
  "overallRiskLevel": "<Critical|High|Medium|Low>",
  "categories": [
    {
      "name": "<category name from: ${cats}>",
      "score": <number 1-100>,
      "level": "<Critical|High|Medium|Low>",
      "findings": ["<finding 1>", "<finding 2>"],
      "recommendations": ["<recommendation 1>"]
    }
  ],
  "topRisks": [
    {
      "title": "<risk title>",
      "severity": "<Critical|High|Medium|Low>",
      "impact": "<description of impact>",
      "likelihood": "<High|Medium|Low>",
      "mitigation": "<recommended mitigation>"
    }
  ],
  "financialRiskAnalysis": {
    "budgetVariance": "<description>",
    "costRiskLevel": "<Critical|High|Medium|Low>",
    "findings": ["<finding>"]
  },
  "scheduleRiskAnalysis": {
    "scheduleVariance": "<description>",
    "delayRiskLevel": "<Critical|High|Medium|Low>",
    "findings": ["<finding>"]
  },
  "recommendations": ["<top-level recommendation 1>", "<recommendation 2>", "<recommendation 3>"]
}

Assessment criteria:
- Score 1-${t.lowMax}: Low risk - portfolio is well-managed with minor concerns
- Score ${t.lowMax + 1}-${t.mediumMax}: Medium risk - some areas need attention but manageable
- Score ${t.mediumMax + 1}-${t.highMax}: High risk - significant issues requiring immediate action
- Score ${t.highMax + 1}-100: Critical risk - portfolio is at serious risk of failure

Evaluate the following categories: ${cats}.
Also evaluate: project health distribution, budget utilization, schedule adherence, open risks and issues, milestone completion rates, resource allocation, and cross-project dependencies.

IMPORTANT: Pay close attention to each risk's current status. Risks with status "Mitigated", "Closed", or "Accepted" have already been addressed and should NOT contribute significantly to the overall risk score. Only risks with status "Open", "Identified", or "In Mitigation" should be treated as active threats. If all or most risks have been mitigated/closed/accepted, the risk score should be significantly lower.`;

  if (config.customInstructions?.trim()) {
    prompt += `\n\nAdditional instructions from the organization:\n${config.customInstructions}`;
  }

  prompt += `\n\nReturn ONLY valid JSON, no markdown formatting.`;
  return prompt;
}

export async function generatePortfolioRiskAssessment(
  portfolioId: number,
  organizationId: number,
  userId: string,
): Promise<RiskAssessmentReport> {
  const portfolio = await storage.getPortfolio(portfolioId);
  if (!portfolio) throw new Error("Portfolio not found");

  const org = await storage.getOrganization(organizationId);
  const config: RiskAssessmentConfig = { ...DEFAULT_RISK_ASSESSMENT_CONFIG, ...(org?.riskAssessmentConfig || {}) };

  const allProjects = await storage.getProjects(organizationId);
  const portfolioProjects = allProjects.filter(p => p.portfolioId === portfolioId);

  const risks = await storage.getPortfolioRisks(portfolioId);
  const issues = await storage.getPortfolioIssues(portfolioId);
  const keyDates = await storage.getPortfolioKeyDates(portfolioId);

  const tasksByProject: Record<number, any[]> = {};
  for (const project of portfolioProjects) {
    const tasks = await storage.getTasks(project.id);
    tasksByProject[project.id] = tasks;
  }

  const dataPayload = {
    portfolio: {
      name: portfolio.name,
      description: portfolio.description,
      status: portfolio.status,
      healthScore: portfolio.healthScore,
      strategy: portfolio.strategy,
      riskTolerance: portfolio.riskTolerance,
      budgetAllocated: portfolio.budgetAllocated,
      budgetSpent: portfolio.budgetSpent,
      targetStartDate: portfolio.targetStartDate,
      targetEndDate: portfolio.targetEndDate,
    },
    projects: portfolioProjects.map(p => ({
      name: p.name,
      status: p.status,
      health: p.health,
      priority: p.priority,
      budget: p.budget,
      actualCost: p.actualCost,
      forecastCost: p.forecastCost,
      startDate: p.startDate,
      endDate: p.endDate,
      completionPercentage: p.completionPercentage,
      taskCount: tasksByProject[p.id]?.length || 0,
      completedTasks: tasksByProject[p.id]?.filter((t: any) => t.status === 'Completed').length || 0,
    })),
    risks: risks.map(r => ({
      title: r.title,
      priority: r.priority,
      status: r.status,
      probability: r.probability,
      impact: r.impact,
      mitigationPlan: r.mitigationPlan,
      responseStrategy: (r as any).responseStrategy,
      residualRisk: (r as any).residualRisk,
      projectName: r.projectName,
    })),
    issues: issues.map(i => ({
      title: i.title,
      priority: i.priority,
      severity: i.severity,
      status: i.status,
      projectName: i.projectName,
    })),
    keyDates: keyDates.map(kd => ({
      title: kd.title,
      date: kd.date,
      keyDateType: kd.keyDateType,
      status: kd.status,
      completed: kd.completed,
    })),
    summary: {
      totalProjects: portfolioProjects.length,
      projectsByHealth: {
        green: portfolioProjects.filter(p => p.health === 'Green').length,
        yellow: portfolioProjects.filter(p => p.health === 'Yellow').length,
        red: portfolioProjects.filter(p => p.health === 'Red').length,
      },
      totalBudget: portfolioProjects.reduce((s, p) => s + Number(p.budget || 0), 0),
      totalSpent: portfolioProjects.reduce((s, p) => s + Number(p.actualCost || 0), 0),
      totalRisks: risks.length,
      openRisks: risks.filter(r => r.status === 'Open' || r.status === 'Identified' || r.status === 'In Mitigation').length,
      mitigatedRisks: risks.filter(r => r.status === 'Mitigated' || r.status === 'Closed' || r.status === 'Accepted').length,
      openIssues: issues.filter(i => i.status === 'Open' || i.status === 'In Progress').length,
      overdueKeyDates: keyDates.filter(kd => !kd.completed && kd.date && new Date(kd.date) < new Date()).length,
    },
  };

  const { client, model } = getOpenAIClient(config);
  const response = await withAiCredits(
    { userId, orgId: organizationId, action: "portfolio_risk_assessment", entityId: portfolioId },
    () => client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: buildPortfolioSystemPrompt(config) },
        { role: "user", content: JSON.stringify(dataPayload) },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }),
  );

  const content = response.choices[0]?.message?.content || "{}";
  const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const report: RiskAssessmentReport = JSON.parse(cleanedContent);

  if (!report.riskScore || report.riskScore < 1) report.riskScore = 1;
  if (report.riskScore > 100) report.riskScore = 100;

  return report;
}

export function generateRiskAssessmentPDF(
  report: RiskAssessmentReport,
  portfolioName: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(22).font('Helvetica-Bold').text('Portfolio Risk Assessment Report', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(14).font('Helvetica').fillColor('#666666').text(portfolioName, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
      doc.moveDown(1);

      const scoreColor = report.riskScore <= 25 ? '#22c55e' : report.riskScore <= 50 ? '#eab308' : report.riskScore <= 75 ? '#f97316' : '#ef4444';
      doc.roundedRect(50, doc.y, 495, 80, 8).fill('#f8fafc').stroke();
      const boxY = doc.y + 15;
      doc.fillColor(scoreColor).fontSize(36).font('Helvetica-Bold').text(`${report.riskScore}`, 70, boxY, { width: 80 });
      doc.fillColor('#333').fontSize(10).font('Helvetica').text('/100', 70 + 50, boxY + 25, { width: 40 });
      doc.fillColor('#333').fontSize(14).font('Helvetica-Bold').text(`Risk Level: ${report.overallRiskLevel}`, 180, boxY);
      doc.fontSize(10).font('Helvetica').fillColor('#555').text(report.summary, 180, boxY + 22, { width: 350 });
      doc.y = boxY + 65;
      doc.moveDown(1);

      doc.fillColor('#2563eb').fontSize(16).font('Helvetica-Bold').text('Risk Categories');
      doc.moveDown(0.5);
      for (const cat of report.categories || []) {
        const catColor = cat.score <= 25 ? '#22c55e' : cat.score <= 50 ? '#eab308' : cat.score <= 75 ? '#f97316' : '#ef4444';
        doc.fillColor('#333').fontSize(12).font('Helvetica-Bold').text(`${cat.name}`, { continued: true });
        doc.fillColor(catColor).text(` — Score: ${cat.score} (${cat.level})`);
        for (const finding of cat.findings || []) {
          doc.fillColor('#555').fontSize(10).font('Helvetica').text(`  • ${finding}`, { indent: 15 });
        }
        for (const rec of cat.recommendations || []) {
          doc.fillColor('#2563eb').fontSize(10).font('Helvetica-Oblique').text(`  → ${rec}`, { indent: 15 });
        }
        doc.moveDown(0.5);
      }

      if (report.topRisks?.length) {
        doc.addPage();
        doc.fillColor('#2563eb').fontSize(16).font('Helvetica-Bold').text('Top Risks');
        doc.moveDown(0.5);
        for (const risk of report.topRisks) {
          const sevColor = risk.severity === 'Critical' ? '#ef4444' : risk.severity === 'High' ? '#f97316' : risk.severity === 'Medium' ? '#eab308' : '#22c55e';
          doc.fillColor(sevColor).fontSize(11).font('Helvetica-Bold').text(`[${risk.severity}] ${risk.title}`);
          doc.fillColor('#555').fontSize(10).font('Helvetica');
          doc.text(`Impact: ${risk.impact}`, { indent: 15 });
          doc.text(`Likelihood: ${risk.likelihood}`, { indent: 15 });
          doc.fillColor('#2563eb').font('Helvetica-Oblique').text(`Mitigation: ${risk.mitigation}`, { indent: 15 });
          doc.moveDown(0.5);
        }
      }

      doc.moveDown(1);
      doc.fillColor('#2563eb').fontSize(16).font('Helvetica-Bold').text('Financial Risk Analysis');
      doc.moveDown(0.3);
      doc.fillColor('#333').fontSize(11).font('Helvetica-Bold').text(`Cost Risk Level: ${report.financialRiskAnalysis?.costRiskLevel || 'N/A'}`);
      doc.fillColor('#555').fontSize(10).font('Helvetica').text(report.financialRiskAnalysis?.budgetVariance || '');
      for (const f of report.financialRiskAnalysis?.findings || []) {
        doc.text(`  • ${f}`, { indent: 15 });
      }

      doc.moveDown(1);
      doc.fillColor('#2563eb').fontSize(16).font('Helvetica-Bold').text('Schedule Risk Analysis');
      doc.moveDown(0.3);
      doc.fillColor('#333').fontSize(11).font('Helvetica-Bold').text(`Delay Risk Level: ${report.scheduleRiskAnalysis?.delayRiskLevel || 'N/A'}`);
      doc.fillColor('#555').fontSize(10).font('Helvetica').text(report.scheduleRiskAnalysis?.scheduleVariance || '');
      for (const f of report.scheduleRiskAnalysis?.findings || []) {
        doc.text(`  • ${f}`, { indent: 15 });
      }

      if (report.recommendations?.length) {
        doc.moveDown(1);
        doc.fillColor('#2563eb').fontSize(16).font('Helvetica-Bold').text('Recommendations');
        doc.moveDown(0.3);
        for (const rec of report.recommendations) {
          doc.fillColor('#333').fontSize(10).font('Helvetica').text(`  • ${rec}`, { indent: 15 });
        }
      }

      doc.moveDown(2);
      doc.fillColor('#999').fontSize(8).font('Helvetica').text('This report was generated by AI analysis and should be reviewed by stakeholders.', { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
