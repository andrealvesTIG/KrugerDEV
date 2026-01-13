import pptxgenjs from "pptxgenjs";
const PptxGenJS = pptxgenjs.default || pptxgenjs;
import { storage } from "../storage";
import type { Project, Portfolio, Risk, Issue, Resource } from "@shared/schema";

interface DashboardData {
  type: "executive" | "portfolios" | "risks-issues" | "resource" | "resource-management" | "timesheet";
  organizationId: number;
  title: string;
  generatedAt: string;
  metrics: Record<string, number | string>;
  items?: Array<Record<string, any>>;
}

const COLORS = {
  primary: "2563eb",
  green: "22c55e",
  yellow: "eab308",
  red: "ef4444",
  gray: "6b7280",
  lightGray: "f3f4f6",
  white: "ffffff",
  dark: "1f2937",
};

export async function generateDashboardPowerPoint(data: DashboardData): Promise<Buffer> {
  const pptx = new PptxGenJS();
  
  pptx.author = "FridayReport.AI";
  pptx.title = data.title;
  pptx.subject = `${data.title} Dashboard Report`;
  pptx.company = "FridayReport.AI";
  
  const slide = pptx.addSlide();
  
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.7,
    fill: { color: COLORS.primary },
  });
  
  slide.addText(data.title, {
    x: 0.3,
    y: 0.15,
    w: 6,
    h: 0.4,
    fontSize: 20,
    bold: true,
    color: COLORS.white,
    fontFace: "Arial",
  });
  
  slide.addText(`Generated: ${data.generatedAt}`, {
    x: 6.5,
    y: 0.2,
    w: 3,
    h: 0.3,
    fontSize: 9,
    color: COLORS.white,
    fontFace: "Arial",
    align: "right",
  });
  
  const metrics = Object.entries(data.metrics);
  const metricsPerRow = 6;
  const boxWidth = 1.5;
  const boxHeight = 0.55;
  const startY = 0.85;
  const gapX = 0.08;
  const gapY = 0.08;
  
  metrics.slice(0, 12).forEach(([label, value], index) => {
    const row = Math.floor(index / metricsPerRow);
    const col = index % metricsPerRow;
    const x = 0.3 + col * (boxWidth + gapX);
    const y = startY + row * (boxHeight + gapY);
    
    slide.addShape("roundRect", {
      x,
      y,
      w: boxWidth,
      h: boxHeight,
      fill: { color: COLORS.lightGray },
      line: { color: "e5e7eb", pt: 0.5 },
    });
    
    slide.addText(String(value), {
      x,
      y: y + 0.05,
      w: boxWidth,
      h: 0.25,
      fontSize: 14,
      bold: true,
      color: COLORS.dark,
      fontFace: "Arial",
      align: "center",
    });
    
    slide.addText(label.length > 15 ? label.slice(0, 14) + "…" : label, {
      x,
      y: y + 0.3,
      w: boxWidth,
      h: 0.2,
      fontSize: 7,
      color: COLORS.gray,
      fontFace: "Arial",
      align: "center",
    });
  });
  
  const metricsRows = Math.ceil(Math.min(metrics.length, 12) / metricsPerRow);
  const tableStartY = startY + metricsRows * (boxHeight + gapY) + 0.15;
  
  if (data.items && data.items.length > 0) {
    const tableData: pptxgenjs.TableRow[] = [];
    const headers = Object.keys(data.items[0]).slice(0, 6);
    
    tableData.push(
      headers.map((h) => ({
        text: h.replace(/([A-Z])/g, " $1").trim(),
        options: {
          bold: true,
          fill: { color: COLORS.primary },
          color: COLORS.white,
          fontSize: 7,
          fontFace: "Arial",
        },
      }))
    );
    
    const maxRows = Math.min(data.items.length, 8);
    data.items.slice(0, maxRows).forEach((item) => {
      tableData.push(
        headers.map((h) => {
          const val = String(item[h] ?? "-");
          return {
            text: val.length > 20 ? val.slice(0, 18) + "…" : val,
            options: {
              fontSize: 6,
              fontFace: "Arial",
              color: COLORS.dark,
            },
          };
        })
      );
    });
    
    slide.addTable(tableData, {
      x: 0.3,
      y: tableStartY,
      w: 9.4,
      colW: headers.map(() => 9.4 / headers.length),
      border: { pt: 0.3, color: "e5e7eb" },
      fill: { color: COLORS.white },
      rowH: 0.22,
    });
  }
  
  slide.addText("FridayReport.AI", {
    x: 0.3,
    y: 5.1,
    w: 3,
    h: 0.2,
    fontSize: 8,
    color: COLORS.gray,
    fontFace: "Arial",
  });
  
  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output as ArrayBuffer);
}

export async function getDashboardDataForExport(
  type: string,
  organizationId: number
): Promise<DashboardData> {
  const generatedAt = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  switch (type) {
    case "executive": {
      const projects: Project[] = await storage.getProjects(organizationId);
      const healthyCount = projects.filter((p: Project) => p.health === "Green").length;
      const atRiskCount = projects.filter((p: Project) => p.health === "Yellow").length;
      const criticalCount = projects.filter((p: Project) => p.health === "Red").length;
      const totalBudget = projects.reduce((sum: number, p: Project) => sum + Number(p.budget || 0), 0);
      
      return {
        type: "executive",
        organizationId,
        title: "Executive Dashboard",
        generatedAt,
        metrics: {
          "Total Projects": projects.length,
          "Healthy": healthyCount,
          "At Risk": atRiskCount,
          "Critical": criticalCount,
          "Total Budget": `$${(totalBudget / 1000000).toFixed(1)}M`,
          "Avg Completion": `${Math.round(projects.reduce((sum: number, p: Project) => sum + (p.completionPercentage || 0), 0) / (projects.length || 1))}%`,
        },
        items: projects.slice(0, 10).map((p: Project) => ({
          Name: p.name,
          Status: p.status,
          Health: p.health,
          Completion: `${p.completionPercentage || 0}%`,
          Budget: p.budget ? `$${Number(p.budget).toLocaleString()}` : "-",
        })),
      };
    }
    
    case "portfolios": {
      const portfolios: Portfolio[] = await storage.getPortfolios(organizationId);
      const projects: Project[] = await storage.getProjects(organizationId);
      
      return {
        type: "portfolios",
        organizationId,
        title: "Portfolios Dashboard",
        generatedAt,
        metrics: {
          "Total Portfolios": portfolios.length,
          "Total Projects": projects.length,
          "Avg Projects/Portfolio": portfolios.length ? Math.round(projects.length / portfolios.length) : 0,
        },
        items: portfolios.map((p: Portfolio) => ({
          Name: p.name,
          Description: p.description || "-",
          Projects: projects.filter((proj: Project) => proj.portfolioId === p.id).length,
        })),
      };
    }
    
    case "risks-issues": {
      const projects: Project[] = await storage.getProjects(organizationId);
      let allRisks: Risk[] = [];
      let allIssues: Issue[] = [];
      
      for (const project of projects) {
        const projectRisks = await storage.getRisks(project.id);
        const projectIssues = await storage.getIssues(project.id);
        allRisks = allRisks.concat(projectRisks);
        allIssues = allIssues.concat(projectIssues);
      }
      
      const highRisks = allRisks.filter((r: Risk) => r.probability === "High" || r.impact === "High").length;
      const openIssues = allIssues.filter((i: Issue) => i.status !== "Closed" && i.status !== "Resolved").length;
      
      return {
        type: "risks-issues",
        organizationId,
        title: "Risks & Issues Dashboard",
        generatedAt,
        metrics: {
          "Total Risks": allRisks.length,
          "High Priority Risks": highRisks,
          "Total Issues": allIssues.length,
          "Open Issues": openIssues,
          "Blockers": allIssues.filter((i: Issue) => i.priority === "Critical").length,
        },
        items: [
          ...allRisks.slice(0, 5).map((r: Risk) => ({
            Type: "Risk",
            Title: r.title,
            Status: r.status,
            Impact: r.impact,
            Probability: r.probability,
          })),
          ...allIssues.slice(0, 5).map((i: Issue) => ({
            Type: "Issue",
            Title: i.title,
            Status: i.status,
            Priority: i.priority,
            Probability: "-",
          })),
        ],
      };
    }
    
    case "resource":
    case "resource-management": {
      const resources: Resource[] = await storage.getResources(organizationId);
      const activeResources = resources.filter((r: Resource) => r.isActive);
      
      return {
        type: type as "resource" | "resource-management",
        organizationId,
        title: type === "resource" ? "Resource Dashboard" : "Resource Management Dashboard",
        generatedAt,
        metrics: {
          "Total Resources": resources.length,
          "Active Resources": activeResources.length,
          "Inactive Resources": resources.length - activeResources.length,
          "Approvers": resources.filter((r: Resource) => r.isApprover).length,
        },
        items: resources.slice(0, 10).map((r: Resource) => ({
          Name: r.displayName,
          Title: r.title || "-",
          Department: r.department || "-",
          Active: r.isActive ? "Yes" : "No",
        })),
      };
    }
    
    case "timesheet": {
      const resources: Resource[] = await storage.getResources(organizationId);
      const timesheets = await storage.getTimesheetEntriesForApproval(organizationId);
      
      const totalHours = timesheets.reduce((sum: number, t) => sum + Number(t.hours || 0), 0);
      
      return {
        type: "timesheet",
        organizationId,
        title: "Timesheet Report Dashboard",
        generatedAt,
        metrics: {
          "Total Resources": resources.length,
          "Total Entries": timesheets.length,
          "Total Hours": totalHours.toFixed(1),
          "Avg Hours/Entry": timesheets.length ? (totalHours / timesheets.length).toFixed(1) : "0",
        },
        items: timesheets.slice(0, 10).map((t) => ({
          Resource: resources.find((r: Resource) => r.id === t.resourceId)?.displayName || "-",
          Date: t.entryDate ? new Date(t.entryDate).toLocaleDateString() : "-",
          Hours: Number(t.hours) || 0,
          Status: t.status || "-",
        })),
      };
    }
    
    default:
      throw new Error(`Unknown dashboard type: ${type}`);
  }
}

export function generateDashboardHTML(data: DashboardData): string {
  const metricsHtml = Object.entries(data.metrics)
    .map(
      ([label, value]) => `
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; text-align: center; min-width: 120px;">
        <div style="font-size: 24px; font-weight: bold; color: #1f2937;">${value}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${label}</div>
      </div>
    `
    )
    .join("");

  let itemsHtml = "";
  if (data.items && data.items.length > 0) {
    const headers = Object.keys(data.items[0]);
    itemsHtml = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 24px;">
        <thead>
          <tr style="background: #2563eb;">
            ${headers.map((h) => `<th style="padding: 12px; text-align: left; color: white; font-size: 12px;">${h.replace(/([A-Z])/g, " $1").trim()}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${data.items
            .map(
              (item, i) => `
            <tr style="background: ${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">
              ${headers.map((h) => `<td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${item[h] ?? "-"}</td>`).join("")}
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${data.title}</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 14px;">Generated: ${data.generatedAt}</p>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="margin-top: 0; color: #1f2937; font-size: 18px;">Key Metrics</h2>
    
    <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px;">
      ${metricsHtml}
    </div>
    
    ${itemsHtml}
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0; text-align: center;">
      This report was generated by FridayReport.AI
    </p>
  </div>
</body>
</html>
`;
}
