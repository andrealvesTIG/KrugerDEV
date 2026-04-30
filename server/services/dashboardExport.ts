import pptxgenjs from "pptxgenjs";
type PptxTableRow = pptxgenjs.TableRow;
const PptxGenJS = (pptxgenjs as any).default || pptxgenjs;
import PDFDocument from "pdfkit";
import { storage } from "../storage";
import type { Project, Portfolio, Risk, Issue, Resource, CostItem } from "@shared/schema";

interface DashboardData {
  type: "executive" | "portfolios" | "risks-issues" | "resource" | "resource-management" | "timesheet" | "intake"
    | "financials-overview" | "financials-scurves" | "financials-ev" | "financials-forecasting"
    | "financials-cashflow" | "financials-variance" | "financials-portfolio";
  organizationId: number;
  title: string;
  generatedAt: string;
  metrics: Record<string, number | string>;
  items?: Array<Record<string, any>>;
  charts?: {
    health?: { healthy: number; atRisk: number; critical: number };
    status?: { planning: number; execution: number; closing: number; initiation: number; billing?: number };
    priorities?: { critical: number; high: number; medium: number; low: number };
    allocation?: { available: number; assigned: number; overallocated: number };
    departments?: Array<{ name: string; count: number }>;
    timesheetStatus?: { approved: number; pending: number; rejected: number; submitted: number };
    intakeStatus?: { draft: number; submitted: number; approved: number; rejected: number };
  };
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
  
  // Header with gradient-like background
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.6,
    fill: { color: COLORS.primary },
  });
  
  slide.addText(data.title, {
    x: 0.3,
    y: 0.12,
    w: 6,
    h: 0.36,
    fontSize: 18,
    bold: true,
    color: COLORS.white,
    fontFace: "Arial",
  });
  
  slide.addText(`Generated: ${data.generatedAt}`, {
    x: 6.5,
    y: 0.18,
    w: 3,
    h: 0.24,
    fontSize: 8,
    color: COLORS.white,
    fontFace: "Arial",
    align: "right",
  });
  
  // KPI Cards Row - styled like web dashboard
  const metrics = Object.entries(data.metrics);
  const metricsPerRow = 6;
  const boxWidth = 1.5;
  const boxHeight = 0.6;
  const startY = 0.72;
  const gapX = 0.1;
  
  const metricColors = [COLORS.primary, COLORS.red, "9333ea", COLORS.green, "f59e0b", "06b6d4"];
  
  metrics.slice(0, 6).forEach(([label, value], index) => {
    const col = index % metricsPerRow;
    const x = 0.3 + col * (boxWidth + gapX);
    const y = startY;
    
    // Card background
    slide.addShape("roundRect", {
      x,
      y,
      w: boxWidth,
      h: boxHeight,
      fill: { color: COLORS.white },
      line: { color: "e5e7eb", pt: 0.5 },
      rectRadius: 0.05,
    });
    
    // Color accent bar
    slide.addShape("rect", {
      x,
      y,
      w: 0.04,
      h: boxHeight,
      fill: { color: metricColors[index] || COLORS.primary },
    });
    
    slide.addText(String(value), {
      x: x + 0.08,
      y: y + 0.08,
      w: boxWidth - 0.12,
      h: 0.28,
      fontSize: 16,
      bold: true,
      color: COLORS.dark,
      fontFace: "Arial",
    });
    
    slide.addText(label.length > 18 ? label.slice(0, 17) + "…" : label, {
      x: x + 0.08,
      y: y + 0.36,
      w: boxWidth - 0.12,
      h: 0.18,
      fontSize: 7,
      color: COLORS.gray,
      fontFace: "Arial",
    });
  });
  
  const chartStartY = startY + boxHeight + 0.18;
  
  // Add charts section if chart data is available
  if (data.charts) {
    const chartWidth = 3.1;
    const chartHeight = 1.8;
    
    // Health Overview Pie Chart
    if (data.charts.health) {
      const { healthy, atRisk, critical } = data.charts.health;
      const total = healthy + atRisk + critical;
      
      if (total > 0) {
        // Chart card background
        slide.addShape("roundRect", {
          x: 0.3,
          y: chartStartY,
          w: chartWidth,
          h: chartHeight,
          fill: { color: COLORS.white },
          line: { color: "e5e7eb", pt: 0.5 },
          rectRadius: 0.05,
        });
        
        slide.addText("Health Overview", {
          x: 0.42,
          y: chartStartY + 0.08,
          w: chartWidth - 0.24,
          h: 0.24,
          fontSize: 10,
          bold: true,
          color: COLORS.dark,
          fontFace: "Arial",
        });
        
        // Pie chart
        slide.addChart("pie", [
          {
            name: "Health",
            labels: ["Healthy", "At Risk", "Critical"],
            values: [healthy, atRisk, critical],
          },
        ], {
          x: 0.4,
          y: chartStartY + 0.35,
          w: 1.5,
          h: 1.3,
          chartColors: [COLORS.green, COLORS.yellow, COLORS.red],
          showLegend: false,
          showValue: false,
          showPercent: true,
          showTitle: false,
          holeSize: 50,
        });
        
        // Legend
        const legendItems = [
          { label: "Healthy", value: healthy, color: COLORS.green },
          { label: "At Risk", value: atRisk, color: COLORS.yellow },
          { label: "Critical", value: critical, color: COLORS.red },
        ];
        
        legendItems.forEach((item, i) => {
          slide.addShape("rect", {
            x: 2.0,
            y: chartStartY + 0.5 + i * 0.35,
            w: 0.15,
            h: 0.15,
            fill: { color: item.color },
          });
          slide.addText(`${item.label}: ${item.value}`, {
            x: 2.2,
            y: chartStartY + 0.48 + i * 0.35,
            w: 1,
            h: 0.2,
            fontSize: 8,
            color: COLORS.dark,
            fontFace: "Arial",
          });
        });
      }
    }
    
    // Status Bar Chart
    if (data.charts.status) {
      const { planning, execution, closing, initiation, billing = 0 } = data.charts.status;
      
      slide.addShape("roundRect", {
        x: 0.3 + chartWidth + 0.12,
        y: chartStartY,
        w: chartWidth,
        h: chartHeight,
        fill: { color: COLORS.white },
        line: { color: "e5e7eb", pt: 0.5 },
        rectRadius: 0.05,
      });
      
      slide.addText("Project Pipeline", {
        x: 0.3 + chartWidth + 0.24,
        y: chartStartY + 0.08,
        w: chartWidth - 0.24,
        h: 0.24,
        fontSize: 10,
        bold: true,
        color: COLORS.dark,
        fontFace: "Arial",
      });
      
      slide.addChart("bar", [
        {
          name: "Projects",
          labels: ["Initiation", "Planning", "Execution", "Closing", "Billing"],
          values: [initiation, planning, execution, closing, billing],
        },
      ], {
        x: 0.3 + chartWidth + 0.2,
        y: chartStartY + 0.35,
        w: chartWidth - 0.3,
        h: 1.3,
        barDir: "bar",
        chartColors: [COLORS.primary],
        showLegend: false,
        showValue: true,
        valAxisHidden: true,
        catAxisHidden: false,
        showTitle: false,
        valGridLine: { style: "none" },
        catAxisLineShow: false,
      });
    }
    
    // Priorities Chart
    if (data.charts.priorities) {
      const { critical, high, medium, low } = data.charts.priorities;
      
      slide.addShape("roundRect", {
        x: 0.3 + (chartWidth + 0.12) * 2,
        y: chartStartY,
        w: chartWidth,
        h: chartHeight,
        fill: { color: COLORS.white },
        line: { color: "e5e7eb", pt: 0.5 },
        rectRadius: 0.05,
      });
      
      slide.addText("Risks by Priority", {
        x: 0.3 + (chartWidth + 0.12) * 2 + 0.12,
        y: chartStartY + 0.08,
        w: chartWidth - 0.24,
        h: 0.24,
        fontSize: 10,
        bold: true,
        color: COLORS.dark,
        fontFace: "Arial",
      });
      
      slide.addChart("doughnut", [
        {
          name: "Priority",
          labels: ["Critical", "High", "Medium", "Low"],
          values: [critical, high, medium, low],
        },
      ], {
        x: 0.3 + (chartWidth + 0.12) * 2 + 0.1,
        y: chartStartY + 0.35,
        w: 1.4,
        h: 1.3,
        chartColors: [COLORS.red, "f97316", COLORS.yellow, COLORS.green],
        showLegend: false,
        showValue: false,
        showPercent: true,
        holeSize: 50,
      });
      
      // Legend
      const priorityItems = [
        { label: "Critical", value: critical, color: COLORS.red },
        { label: "High", value: high, color: "f97316" },
        { label: "Medium", value: medium, color: COLORS.yellow },
        { label: "Low", value: low, color: COLORS.green },
      ];
      
      priorityItems.forEach((item, i) => {
        slide.addShape("rect", {
          x: 0.3 + (chartWidth + 0.12) * 2 + 1.7,
          y: chartStartY + 0.42 + i * 0.28,
          w: 0.12,
          h: 0.12,
          fill: { color: item.color },
        });
        slide.addText(`${item.label}: ${item.value}`, {
          x: 0.3 + (chartWidth + 0.12) * 2 + 1.88,
          y: chartStartY + 0.4 + i * 0.28,
          w: 1,
          h: 0.16,
          fontSize: 7,
          color: COLORS.dark,
          fontFace: "Arial",
        });
      });
    }
    
    // Resource Allocation Chart
    if (data.charts.allocation) {
      const { available, assigned, overallocated } = data.charts.allocation;
      const total = available + assigned + overallocated;
      
      if (total > 0) {
        slide.addShape("roundRect", {
          x: 0.3,
          y: chartStartY,
          w: chartWidth,
          h: chartHeight,
          fill: { color: COLORS.white },
          line: { color: "e5e7eb", pt: 0.5 },
          rectRadius: 0.05,
        });
        
        slide.addText("Resource Allocation", {
          x: 0.42,
          y: chartStartY + 0.08,
          w: chartWidth - 0.24,
          h: 0.24,
          fontSize: 10,
          bold: true,
          color: COLORS.dark,
          fontFace: "Arial",
        });
        
        slide.addChart("pie", [
          {
            name: "Allocation",
            labels: ["Available", "Assigned", "Overallocated"],
            values: [available, assigned, overallocated],
          },
        ], {
          x: 0.4,
          y: chartStartY + 0.35,
          w: 1.5,
          h: 1.3,
          chartColors: [COLORS.green, COLORS.primary, COLORS.red],
          showLegend: false,
          showValue: false,
          showPercent: true,
          showTitle: false,
          holeSize: 50,
        });
        
        const allocItems = [
          { label: "Available", value: available, color: COLORS.green },
          { label: "Assigned", value: assigned, color: COLORS.primary },
          { label: "Overallocated", value: overallocated, color: COLORS.red },
        ];
        
        allocItems.forEach((item, i) => {
          slide.addShape("rect", {
            x: 2.0,
            y: chartStartY + 0.5 + i * 0.35,
            w: 0.15,
            h: 0.15,
            fill: { color: item.color },
          });
          slide.addText(`${item.label}: ${item.value}`, {
            x: 2.2,
            y: chartStartY + 0.48 + i * 0.35,
            w: 1,
            h: 0.2,
            fontSize: 8,
            color: COLORS.dark,
            fontFace: "Arial",
          });
        });
      }
    }
    
    // Department Distribution Bar Chart
    if (data.charts.departments && data.charts.departments.length > 0) {
      slide.addShape("roundRect", {
        x: 0.3 + chartWidth + 0.12,
        y: chartStartY,
        w: chartWidth,
        h: chartHeight,
        fill: { color: COLORS.white },
        line: { color: "e5e7eb", pt: 0.5 },
        rectRadius: 0.05,
      });
      
      slide.addText("By Department", {
        x: 0.3 + chartWidth + 0.24,
        y: chartStartY + 0.08,
        w: chartWidth - 0.24,
        h: 0.24,
        fontSize: 10,
        bold: true,
        color: COLORS.dark,
        fontFace: "Arial",
      });
      
      slide.addChart("bar", [
        {
          name: "Resources",
          labels: data.charts.departments.map(d => d.name.slice(0, 12)),
          values: data.charts.departments.map(d => d.count),
        },
      ], {
        x: 0.3 + chartWidth + 0.2,
        y: chartStartY + 0.35,
        w: chartWidth - 0.3,
        h: 1.3,
        barDir: "bar",
        chartColors: ["9333ea"],
        showLegend: false,
        showValue: true,
        valAxisHidden: true,
        catAxisHidden: false,
        showTitle: false,
        valGridLine: { style: "none" },
        catAxisLineShow: false,
      });
    }
    
    // Timesheet Status Chart
    if (data.charts.timesheetStatus) {
      const { approved, pending, rejected, submitted } = data.charts.timesheetStatus;
      const total = approved + pending + rejected + submitted;
      
      if (total > 0) {
        slide.addShape("roundRect", {
          x: 0.3,
          y: chartStartY,
          w: chartWidth,
          h: chartHeight,
          fill: { color: COLORS.white },
          line: { color: "e5e7eb", pt: 0.5 },
          rectRadius: 0.05,
        });
        
        slide.addText("Timesheet Status", {
          x: 0.42,
          y: chartStartY + 0.08,
          w: chartWidth - 0.24,
          h: 0.24,
          fontSize: 10,
          bold: true,
          color: COLORS.dark,
          fontFace: "Arial",
        });
        
        slide.addChart("doughnut", [
          {
            name: "Status",
            labels: ["Approved", "Submitted", "Pending", "Rejected"],
            values: [approved, submitted, pending, rejected],
          },
        ], {
          x: 0.4,
          y: chartStartY + 0.35,
          w: 1.4,
          h: 1.3,
          chartColors: [COLORS.green, COLORS.primary, COLORS.yellow, COLORS.red],
          showLegend: false,
          showValue: false,
          showPercent: true,
          holeSize: 50,
        });
        
        const statusItems = [
          { label: "Approved", value: approved, color: COLORS.green },
          { label: "Submitted", value: submitted, color: COLORS.primary },
          { label: "Pending", value: pending, color: COLORS.yellow },
          { label: "Rejected", value: rejected, color: COLORS.red },
        ];
        
        statusItems.forEach((item, i) => {
          slide.addShape("rect", {
            x: 2.0,
            y: chartStartY + 0.42 + i * 0.28,
            w: 0.12,
            h: 0.12,
            fill: { color: item.color },
          });
          slide.addText(`${item.label}: ${item.value}`, {
            x: 2.18,
            y: chartStartY + 0.4 + i * 0.28,
            w: 1,
            h: 0.16,
            fontSize: 7,
            color: COLORS.dark,
            fontFace: "Arial",
          });
        });
      }
    }
    
    // Intake Status Chart
    if (data.charts.intakeStatus) {
      const { draft, submitted, approved, rejected } = data.charts.intakeStatus;
      const total = draft + submitted + approved + rejected;
      
      if (total > 0) {
        slide.addShape("roundRect", {
          x: 0.3,
          y: chartStartY,
          w: chartWidth,
          h: chartHeight,
          fill: { color: COLORS.white },
          line: { color: "e5e7eb", pt: 0.5 },
          rectRadius: 0.05,
        });
        
        slide.addText("Intake Pipeline", {
          x: 0.42,
          y: chartStartY + 0.08,
          w: chartWidth - 0.24,
          h: 0.24,
          fontSize: 10,
          bold: true,
          color: COLORS.dark,
          fontFace: "Arial",
        });
        
        slide.addChart("bar", [
          {
            name: "Requests",
            labels: ["Draft", "Submitted", "Approved", "Rejected"],
            values: [draft, submitted, approved, rejected],
          },
        ], {
          x: 0.4,
          y: chartStartY + 0.35,
          w: chartWidth - 0.3,
          h: 1.3,
          barDir: "bar",
          chartColors: [COLORS.gray, COLORS.primary, COLORS.green, COLORS.red],
          showLegend: false,
          showValue: true,
          valAxisHidden: true,
          catAxisHidden: false,
          showTitle: false,
          valGridLine: { style: "none" },
          catAxisLineShow: false,
        });
      }
    }
  }
  
  // Data Table
  const tableStartY = data.charts ? chartStartY + 1.95 : chartStartY;
  
  if (data.items && data.items.length > 0) {
    const tableData: PptxTableRow[] = [];
    const headers = Object.keys(data.items[0]).slice(0, 6);
    
    slide.addText("Top Items", {
      x: 0.3,
      y: tableStartY,
      w: 3,
      h: 0.22,
      fontSize: 10,
      bold: true,
      color: COLORS.dark,
      fontFace: "Arial",
    });
    
    tableData.push(
      headers.map((h) => ({
        text: h.replace(/([A-Z])/g, " $1").trim(),
        options: {
          bold: true,
          fill: { color: COLORS.primary },
          color: COLORS.white,
          fontSize: 7,
          fontFace: "Arial",
          valign: "middle" as const,
        },
      }))
    );
    
    const maxRows = Math.min(data.items.length, 6);
    data.items.slice(0, maxRows).forEach((item, rowIndex) => {
      tableData.push(
        headers.map((h) => {
          const val = String(item[h] ?? "-");
          return {
            text: val.length > 22 ? val.slice(0, 20) + "…" : val,
            options: {
              fontSize: 6,
              fontFace: "Arial",
              color: COLORS.dark,
              fill: { color: rowIndex % 2 === 0 ? COLORS.white : COLORS.lightGray },
              valign: "middle" as const,
            },
          };
        })
      );
    });
    
    slide.addTable(tableData, {
      x: 0.3,
      y: tableStartY + 0.24,
      w: 9.4,
      colW: headers.map(() => 9.4 / headers.length),
      border: { pt: 0.3, color: "e5e7eb" },
      rowH: 0.2,
    });
  }
  
  // Footer
  slide.addShape("rect", {
    x: 0,
    y: 5.35,
    w: "100%",
    h: 0.15,
    fill: { color: COLORS.lightGray },
  });
  
  slide.addText("FridayReport.AI  |  https://fridayreport.ai", {
    x: 0.3,
    y: 5.35,
    w: 5,
    h: 0.15,
    fontSize: 6,
    color: COLORS.gray,
    fontFace: "Arial",
  });
  
  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output as ArrayBuffer);
}

// Helper function to draw a simple pie chart in PDF
function drawPieChart(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  radius: number,
  data: Array<{ value: number; color: string; label: string }>
) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return;
  
  let startAngle = -Math.PI / 2;
  
  data.forEach((segment) => {
    if (segment.value <= 0) return;
    const sliceAngle = (segment.value / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;
    
    // Draw pie segment
    doc.save();
    doc.fillColor(segment.color);
    doc.moveTo(x, y);
    doc.lineTo(x + radius * Math.cos(startAngle), y + radius * Math.sin(startAngle));
    
    // Draw arc
    for (let angle = startAngle; angle <= endAngle; angle += 0.05) {
      doc.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
    }
    doc.lineTo(x + radius * Math.cos(endAngle), y + radius * Math.sin(endAngle));
    doc.lineTo(x, y);
    doc.fill();
    doc.restore();
    
    startAngle = endAngle;
  });
}

// Helper function to draw bar chart in PDF
function drawBarChart(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Array<{ value: number; label: string; color: string }>
) {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  const barHeight = (height - 10) / data.length - 5;
  const labelWidth = 55;
  const chartWidth = width - labelWidth - 30;
  
  data.forEach((item, i) => {
    const barY = y + i * (barHeight + 5);
    const barWidth = (item.value / maxValue) * chartWidth;
    
    // Label
    doc.fontSize(7).fillColor("#1f2937").text(item.label, x, barY + 3, { width: labelWidth });
    
    // Bar background
    doc.roundedRect(x + labelWidth, barY, chartWidth, barHeight, 2).fill("#e5e7eb");
    
    // Bar fill
    if (barWidth > 0) {
      doc.roundedRect(x + labelWidth, barY, barWidth, barHeight, 2).fill(item.color);
    }
    
    // Value
    doc.fontSize(7).fillColor("#1f2937").text(String(item.value), x + labelWidth + chartWidth + 4, barY + 3);
  });
}

export async function generateDashboardPdf(data: DashboardData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    
    const pageWidth = doc.page.width;
    const startX = 40;
    
    // Header
    doc.rect(0, 0, pageWidth, 55).fill("#2563eb");
    doc.fontSize(18).fillColor("#ffffff").text(data.title, 40, 18, { width: 350 });
    doc.fontSize(8).fillColor("#ffffff").text(`Generated: ${data.generatedAt}`, 400, 22, { align: "right", width: 155 });
    
    let yPos = 70;
    
    // KPI Cards - styled like web dashboard
    const metrics = Object.entries(data.metrics);
    const boxWidth = 82;
    const boxHeight = 50;
    const boxesPerRow = 6;
    const boxGap = 5;
    
    const metricColors = ["#2563eb", "#ef4444", "#9333ea", "#22c55e", "#f59e0b", "#06b6d4"];
    
    metrics.slice(0, 6).forEach(([label, value], index) => {
      const col = index % boxesPerRow;
      const x = startX + col * (boxWidth + boxGap);
      const boxY = yPos;
      
      // Card background with border
      doc.roundedRect(x, boxY, boxWidth, boxHeight, 4).fillAndStroke("#ffffff", "#e5e7eb");
      
      // Color accent bar on left
      doc.rect(x, boxY, 3, boxHeight).fill(metricColors[index] || "#2563eb");
      
      // Value
      doc.fontSize(14).fillColor("#1f2937").text(String(value), x + 6, boxY + 10, { width: boxWidth - 10 });
      
      // Label
      const shortLabel = label.length > 14 ? label.slice(0, 13) + "…" : label;
      doc.fontSize(7).fillColor("#6b7280").text(shortLabel, x + 6, boxY + 32, { width: boxWidth - 10 });
    });
    
    yPos += boxHeight + 15;
    
    // Charts Section
    if (data.charts) {
      const chartBoxWidth = 170;
      const chartBoxHeight = 120;
      
      // Health Overview Chart
      if (data.charts.health) {
        const { healthy, atRisk, critical } = data.charts.health;
        const total = healthy + atRisk + critical;
        
        if (total > 0) {
          // Chart card
          doc.roundedRect(startX, yPos, chartBoxWidth, chartBoxHeight, 4).fillAndStroke("#ffffff", "#e5e7eb");
          doc.fontSize(9).fillColor("#1f2937").text("Health Overview", startX + 10, yPos + 8);
          
          // Pie chart
          drawPieChart(doc, startX + 55, yPos + 65, 35, [
            { value: healthy, color: "#22c55e", label: "Healthy" },
            { value: atRisk, color: "#eab308", label: "At Risk" },
            { value: critical, color: "#ef4444", label: "Critical" },
          ]);
          
          // Legend
          const legendItems = [
            { label: "Healthy", value: healthy, color: "#22c55e" },
            { label: "At Risk", value: atRisk, color: "#eab308" },
            { label: "Critical", value: critical, color: "#ef4444" },
          ];
          
          legendItems.forEach((item, i) => {
            doc.rect(startX + 105, yPos + 35 + i * 18, 10, 10).fill(item.color);
            doc.fontSize(7).fillColor("#1f2937").text(`${item.label}: ${item.value}`, startX + 120, yPos + 37 + i * 18);
          });
        }
      }
      
      // Status Bar Chart
      if (data.charts.status) {
        const { planning, execution, closing, initiation } = data.charts.status;
        const chartX = startX + chartBoxWidth + 8;
        
        doc.roundedRect(chartX, yPos, chartBoxWidth, chartBoxHeight, 4).fillAndStroke("#ffffff", "#e5e7eb");
        doc.fontSize(9).fillColor("#1f2937").text("Project Pipeline", chartX + 10, yPos + 8);
        
        drawBarChart(doc, chartX + 8, yPos + 25, chartBoxWidth - 16, chartBoxHeight - 35, [
          { value: initiation, label: "Initiation", color: "#2563eb" },
          { value: planning, label: "Planning", color: "#2563eb" },
          { value: execution, label: "Execution", color: "#2563eb" },
          { value: closing, label: "Closing", color: "#2563eb" },
        ]);
      }
      
      // Priorities Chart
      if (data.charts.priorities) {
        const { critical, high, medium, low } = data.charts.priorities;
        const total = critical + high + medium + low;
        const chartX = startX + (chartBoxWidth + 8) * 2;
        
        if (total > 0) {
          doc.roundedRect(chartX, yPos, chartBoxWidth, chartBoxHeight, 4).fillAndStroke("#ffffff", "#e5e7eb");
          doc.fontSize(9).fillColor("#1f2937").text("Risks by Priority", chartX + 10, yPos + 8);
          
          drawPieChart(doc, chartX + 55, yPos + 65, 35, [
            { value: critical, color: "#ef4444", label: "Critical" },
            { value: high, color: "#f97316", label: "High" },
            { value: medium, color: "#eab308", label: "Medium" },
            { value: low, color: "#22c55e", label: "Low" },
          ]);
          
          const priorityItems = [
            { label: "Critical", value: critical, color: "#ef4444" },
            { label: "High", value: high, color: "#f97316" },
            { label: "Medium", value: medium, color: "#eab308" },
            { label: "Low", value: low, color: "#22c55e" },
          ];
          
          priorityItems.forEach((item, i) => {
            doc.rect(chartX + 105, yPos + 28 + i * 16, 8, 8).fill(item.color);
            doc.fontSize(6).fillColor("#1f2937").text(`${item.label}: ${item.value}`, chartX + 118, yPos + 29 + i * 16);
          });
        }
      }
      
      // Resource Allocation Chart
      if (data.charts.allocation) {
        const { available, assigned, overallocated } = data.charts.allocation;
        const total = available + assigned + overallocated;
        
        if (total > 0) {
          doc.roundedRect(startX, yPos, chartBoxWidth, chartBoxHeight, 4).fillAndStroke("#ffffff", "#e5e7eb");
          doc.fontSize(9).fillColor("#1f2937").text("Resource Allocation", startX + 10, yPos + 8);
          
          drawPieChart(doc, startX + 55, yPos + 65, 35, [
            { value: available, color: "#22c55e", label: "Available" },
            { value: assigned, color: "#2563eb", label: "Assigned" },
            { value: overallocated, color: "#ef4444", label: "Overallocated" },
          ]);
          
          const allocItems = [
            { label: "Available", value: available, color: "#22c55e" },
            { label: "Assigned", value: assigned, color: "#2563eb" },
            { label: "Overallocated", value: overallocated, color: "#ef4444" },
          ];
          
          allocItems.forEach((item, i) => {
            doc.rect(startX + 105, yPos + 35 + i * 18, 10, 10).fill(item.color);
            doc.fontSize(7).fillColor("#1f2937").text(`${item.label}: ${item.value}`, startX + 120, yPos + 37 + i * 18);
          });
        }
      }
      
      // Department Distribution Chart
      if (data.charts.departments && data.charts.departments.length > 0) {
        const chartX = startX + chartBoxWidth + 8;
        
        doc.roundedRect(chartX, yPos, chartBoxWidth, chartBoxHeight, 4).fillAndStroke("#ffffff", "#e5e7eb");
        doc.fontSize(9).fillColor("#1f2937").text("By Department", chartX + 10, yPos + 8);
        
        drawBarChart(doc, chartX + 8, yPos + 25, chartBoxWidth - 16, chartBoxHeight - 35, 
          data.charts.departments.map(d => ({ 
            value: d.count, 
            label: d.name.slice(0, 10), 
            color: "#9333ea" 
          }))
        );
      }
      
      // Timesheet Status Chart
      if (data.charts.timesheetStatus) {
        const { approved, pending, rejected, submitted } = data.charts.timesheetStatus;
        const total = approved + pending + rejected + submitted;
        
        if (total > 0) {
          doc.roundedRect(startX, yPos, chartBoxWidth, chartBoxHeight, 4).fillAndStroke("#ffffff", "#e5e7eb");
          doc.fontSize(9).fillColor("#1f2937").text("Timesheet Status", startX + 10, yPos + 8);
          
          drawPieChart(doc, startX + 55, yPos + 65, 35, [
            { value: approved, color: "#22c55e", label: "Approved" },
            { value: submitted, color: "#2563eb", label: "Submitted" },
            { value: pending, color: "#eab308", label: "Pending" },
            { value: rejected, color: "#ef4444", label: "Rejected" },
          ]);
          
          const statusItems = [
            { label: "Approved", value: approved, color: "#22c55e" },
            { label: "Submitted", value: submitted, color: "#2563eb" },
            { label: "Pending", value: pending, color: "#eab308" },
            { label: "Rejected", value: rejected, color: "#ef4444" },
          ];
          
          statusItems.forEach((item, i) => {
            doc.rect(startX + 105, yPos + 28 + i * 16, 8, 8).fill(item.color);
            doc.fontSize(6).fillColor("#1f2937").text(`${item.label}: ${item.value}`, startX + 118, yPos + 29 + i * 16);
          });
        }
      }
      
      // Intake Status Chart
      if (data.charts.intakeStatus) {
        const { draft, submitted, approved, rejected } = data.charts.intakeStatus;
        const total = draft + submitted + approved + rejected;
        
        if (total > 0) {
          doc.roundedRect(startX, yPos, chartBoxWidth, chartBoxHeight, 4).fillAndStroke("#ffffff", "#e5e7eb");
          doc.fontSize(9).fillColor("#1f2937").text("Intake Pipeline", startX + 10, yPos + 8);
          
          drawBarChart(doc, startX + 8, yPos + 25, chartBoxWidth - 16, chartBoxHeight - 35, [
            { value: draft, label: "Draft", color: "#6b7280" },
            { value: submitted, label: "Submitted", color: "#2563eb" },
            { value: approved, label: "Approved", color: "#22c55e" },
            { value: rejected, label: "Rejected", color: "#ef4444" },
          ]);
        }
      }
      
      yPos += chartBoxHeight + 15;
    }
    
    // Data Table
    if (data.items && data.items.length > 0) {
      doc.fontSize(10).fillColor("#1f2937").text("Top Items", startX, yPos);
      yPos += 15;
      
      const headers = Object.keys(data.items[0]).slice(0, 6);
      const colWidth = (pageWidth - 80) / headers.length;
      
      // Table header
      doc.roundedRect(startX, yPos, pageWidth - 80, 18, 2).fill("#2563eb");
      headers.forEach((h, i) => {
        const headerText = h.replace(/([A-Z])/g, " $1").trim();
        doc.fontSize(8).fillColor("#ffffff").text(headerText.slice(0, 14), startX + i * colWidth + 4, yPos + 5, { width: colWidth - 8 });
      });
      yPos += 18;
      
      // Table rows
      const maxRows = Math.min(data.items.length, 12);
      data.items.slice(0, maxRows).forEach((item, rowIdx) => {
        const bgColor = rowIdx % 2 === 0 ? "#ffffff" : "#f9fafb";
        doc.rect(startX, yPos, pageWidth - 80, 16).fill(bgColor);
        doc.rect(startX, yPos, pageWidth - 80, 16).stroke("#e5e7eb");
        
        headers.forEach((h, i) => {
          const val = String(item[h] ?? "-");
          const displayVal = val.length > 20 ? val.slice(0, 18) + "…" : val;
          doc.fontSize(7).fillColor("#1f2937").text(displayVal, startX + i * colWidth + 4, yPos + 5, { width: colWidth - 8 });
        });
        yPos += 16;
      });
    }
    
    // Footer
    doc.rect(0, doc.page.height - 25, pageWidth, 25).fill("#f3f4f6");
    doc.fontSize(7).fillColor("#6b7280").text("FridayReport.AI  |  https://fridayreport.ai", 40, doc.page.height - 17);
    
    doc.end();
  });
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
      
      // Get status counts for pipeline chart
      const initiationCount = projects.filter((p: Project) => p.status === "Initiation").length;
      const planningCount = projects.filter((p: Project) => p.status === "Planning").length;
      const executionCount = projects.filter((p: Project) => p.status === "Execution").length;
      const closingCount = projects.filter((p: Project) => p.status === "Closing").length;
      const billingCount = projects.filter((p: Project) => p.status === "Billing").length;
      
      // Get risks for priority chart
      let allRisks: Risk[] = [];
      for (const project of projects.slice(0, 20)) {
        try {
          const projectRisks = await storage.getRisks(project.id);
          allRisks = allRisks.concat(projectRisks);
        } catch (e) { /* ignore */ }
      }
      
      // Each risk goes into exactly one bucket based on highest severity
      let criticalRisks = 0, highRisks = 0, mediumRisks = 0, lowRisks = 0;
      allRisks.forEach((r: Risk) => {
        if (r.probability === "High" && r.impact === "High") {
          criticalRisks++;
        } else if (r.probability === "High" || r.impact === "High") {
          highRisks++;
        } else if (r.probability === "Medium" || r.impact === "Medium") {
          mediumRisks++;
        } else {
          lowRisks++;
        }
      });
      
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
        charts: {
          health: { healthy: healthyCount, atRisk: atRiskCount, critical: criticalCount },
          status: { initiation: initiationCount, planning: planningCount, execution: executionCount, closing: closingCount, billing: billingCount },
          priorities: { critical: criticalRisks, high: highRisks, medium: mediumRisks, low: lowRisks },
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
      
      // Health distribution across all projects
      const healthyCount = projects.filter((p: Project) => p.health === "Green").length;
      const atRiskCount = projects.filter((p: Project) => p.health === "Yellow").length;
      const criticalCount = projects.filter((p: Project) => p.health === "Red").length;
      
      // Status distribution
      const initiationCount = projects.filter((p: Project) => p.status === "Initiation").length;
      const planningCount = projects.filter((p: Project) => p.status === "Planning").length;
      const executionCount = projects.filter((p: Project) => p.status === "Execution").length;
      const closingCount = projects.filter((p: Project) => p.status === "Closing").length;
      const billingCount = projects.filter((p: Project) => p.status === "Billing").length;
      
      return {
        type: "portfolios",
        organizationId,
        title: "Portfolios Dashboard",
        generatedAt,
        metrics: {
          "Total Portfolios": portfolios.length,
          "Total Projects": projects.length,
          "Healthy": healthyCount,
          "At Risk": atRiskCount,
          "Critical": criticalCount,
          "Avg Projects": portfolios.length ? Math.round(projects.length / portfolios.length) : 0,
        },
        charts: {
          health: { healthy: healthyCount, atRisk: atRiskCount, critical: criticalCount },
          status: { initiation: initiationCount, planning: planningCount, execution: executionCount, closing: closingCount, billing: billingCount },
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
        try {
          const projectRisks = await storage.getRisks(project.id);
          const projectIssues = await storage.getIssues(project.id);
          allRisks = allRisks.concat(projectRisks);
          allIssues = allIssues.concat(projectIssues);
        } catch (e) { /* ignore */ }
      }
      
      // Each risk goes into exactly one bucket based on highest severity
      let criticalRisks = 0, highRisks = 0, mediumRisks = 0, lowRisks = 0;
      allRisks.forEach((r: Risk) => {
        if (r.probability === "High" && r.impact === "High") {
          criticalRisks++;
        } else if (r.probability === "High" || r.impact === "High") {
          highRisks++;
        } else if (r.probability === "Medium" || r.impact === "Medium") {
          mediumRisks++;
        } else {
          lowRisks++;
        }
      });
      
      const openIssues = allIssues.filter((i: Issue) => i.status !== "Closed" && i.status !== "Resolved").length;
      
      // Health counts for context
      const healthyCount = projects.filter((p: Project) => p.health === "Green").length;
      const atRiskCount = projects.filter((p: Project) => p.health === "Yellow").length;
      const criticalProjects = projects.filter((p: Project) => p.health === "Red").length;
      
      return {
        type: "risks-issues",
        organizationId,
        title: "Risks & Issues Dashboard",
        generatedAt,
        metrics: {
          "Total Risks": allRisks.length,
          "High Priority": criticalRisks + highRisks,
          "Total Issues": allIssues.length,
          "Open Issues": openIssues,
          "Blockers": allIssues.filter((i: Issue) => i.priority === "Critical").length,
          "Projects": projects.length,
        },
        charts: {
          health: { healthy: healthyCount, atRisk: atRiskCount, critical: criticalProjects },
          priorities: { critical: criticalRisks, high: highRisks, medium: mediumRisks, low: lowRisks },
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
      let resources: Resource[] = [];
      try {
        resources = await storage.getResources(organizationId);
      } catch (e) {
        console.error("Error fetching resources for export:", e);
      }
      const activeResources = resources.filter((r: Resource) => r.isActive);
      
      // Get department distribution for chart
      const deptCounts = activeResources.reduce((acc, r) => {
        const dept = r.department || "Unassigned";
        acc[dept] = (acc[dept] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const departments = Object.entries(deptCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
      
      // Calculate allocation (simplified - based on active/inactive)
      const assigned = Math.round(activeResources.length * 0.7);
      const available = Math.round(activeResources.length * 0.2);
      const overallocated = activeResources.length - assigned - available;
      
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
          "Departments": Object.keys(deptCounts).length,
          "Utilization": `${activeResources.length > 0 ? Math.round((assigned / activeResources.length) * 100) : 0}%`,
        },
        charts: {
          allocation: { available, assigned, overallocated: overallocated > 0 ? overallocated : 0 },
          departments,
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
      let resources: Resource[] = [];
      let timesheets: any[] = [];
      try {
        resources = await storage.getResources(organizationId);
      } catch (e) {
        console.error("Error fetching resources for export:", e);
      }
      try {
        timesheets = await storage.getTimesheetEntriesForApproval(organizationId);
      } catch (e) {
        console.error("Error fetching timesheets for export:", e);
      }
      
      const totalHours = timesheets.reduce((sum: number, t) => sum + Number(t.hours || 0), 0);
      
      // Calculate status distribution for chart
      const approved = timesheets.filter(t => t.status === "approved").length;
      const pending = timesheets.filter(t => t.status === "pending").length;
      const rejected = timesheets.filter(t => t.status === "rejected").length;
      const submitted = timesheets.filter(t => t.status === "submitted").length;
      
      // Compliance rate
      const activeResources = resources.filter(r => r.isActive);
      const complianceRate = activeResources.length > 0 
        ? Math.round((timesheets.length / (activeResources.length * 5)) * 100) 
        : 0;
      
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
          "Compliance": `${Math.min(complianceRate, 100)}%`,
          "Approval Rate": `${timesheets.length ? Math.round((approved / timesheets.length) * 100) : 0}%`,
        },
        charts: {
          timesheetStatus: { approved, pending, rejected, submitted },
        },
        items: timesheets.slice(0, 10).map((t) => ({
          Resource: resources.find((r: Resource) => r.id === t.resourceId)?.displayName || "-",
          Date: t.entryDate ? new Date(t.entryDate).toLocaleDateString() : "-",
          Hours: Number(t.hours) || 0,
          Status: t.status || "-",
        })),
      };
    }
    
    case "intake": {
      const intakes = await storage.getProjectIntakes(organizationId);
      
      const draft = intakes.filter(i => i.status === "draft").length;
      const inProgress = intakes.filter(i => i.status === "in_progress").length;
      const approved = intakes.filter(i => i.status === "approved").length;
      const rejected = intakes.filter(i => i.status === "rejected").length;
      
      const totalEstimate = intakes.reduce((sum, i) => sum + Number(i.estimatedBudget || 0), 0);
      
      return {
        type: "intake",
        organizationId,
        title: "Intake Dashboard",
        generatedAt,
        metrics: {
          "Total Requests": intakes.length,
          "Pending Review": inProgress,
          "Approved": approved,
          "Rejected": rejected,
          "Draft": draft,
          "Est. Budget": `$${(totalEstimate / 1000000).toFixed(1)}M`,
        },
        charts: {
          // The chart-data shape uses `submitted` as the bucket label that the
          // PPT/PDF renderers consume. The canonical intake enum has no
          // 'submitted' value, so we source the count from 'in_progress'
          // (the closest "pending review" state) without renaming the key.
          intakeStatus: { draft, submitted: inProgress, approved, rejected },
        },
        items: intakes.slice(0, 10).map(i => ({
          Title: i.projectName,
          Status: i.status || "-",
          "Business Unit": i.businessUnit || "-",
          "Funding Source": i.fundingSource || "-",
          "Est. Budget": i.estimatedBudget ? `$${Number(i.estimatedBudget).toLocaleString()}` : "-",
        })),
      };
    }
    
    case "financials-overview":
    case "financials-scurves":
    case "financials-ev":
    case "financials-forecasting":
    case "financials-cashflow":
    case "financials-variance":
    case "financials-portfolio": {
      // Financials sub-dashboards share the same /financial-analytics payload.
      // We compute high-level BAC / AC / EV (project-level % complete) totals
      // directly from cost_items + project completion to keep the export
      // service self-contained — the in-app dashboards still use the richer
      // /financial-analytics endpoint.
      const projects: Project[] = await storage.getProjects(organizationId);
      const titleMap: Record<string, string> = {
        "financials-overview": "Financials Overview",
        "financials-scurves": "S-Curve Analysis",
        "financials-ev": "Earned Value Analysis",
        "financials-forecasting": "Forecasting & EAC",
        "financials-cashflow": "Cash Flow Forecast",
        "financials-variance": "Variance & Trends",
        "financials-portfolio": "Portfolio Rollup",
      };
      const fmtM = (n: number) => `$${(n / 1_000_000).toFixed(2)}M`;
      const rows = await Promise.all(projects.map(async (p: Project) => {
        const items = await storage.getCostItems(p.id).catch((): CostItem[] => []);
        const bac = items.reduce((s: number, it: CostItem) => s + Number(it.aopTotal || 0), 0);
        const ac  = items.reduce((s: number, it: CostItem) => s + Number(it.actTotal || 0), 0);
        const pc = Math.max(0, Math.min(1, Number(p.completionPercentage ?? 0) / 100));
        const ev = bac * pc;
        const cpi = ac > 0 ? ev / ac : 1;
        const eac = cpi > 0 ? bac / cpi : bac;
        return { name: p.name, bac, ac, ev, cpi, eac, vac: bac - eac };
      }));
      const tot = rows.reduce((acc, r) => {
        acc.bac += r.bac; acc.ac += r.ac; acc.ev += r.ev; acc.eac += r.eac;
        return acc;
      }, { bac: 0, ac: 0, ev: 0, eac: 0 });
      const cpiTot = tot.ac > 0 ? tot.ev / tot.ac : 1;
      return {
        type,
        organizationId,
        title: titleMap[type] || "Financials Dashboard",
        generatedAt,
        metrics: {
          BAC: fmtM(tot.bac),
          AC: fmtM(tot.ac),
          EV: fmtM(tot.ev),
          EAC: fmtM(tot.eac),
          CPI: cpiTot.toFixed(2),
          VAC: fmtM(tot.bac - tot.eac),
        },
        charts: {},
        items: rows.slice(0, 25).map(r => ({
          Project: r.name,
          BAC: fmtM(r.bac),
          AC: fmtM(r.ac),
          EV: fmtM(r.ev),
          CPI: r.cpi.toFixed(2),
          EAC: fmtM(r.eac),
          VAC: fmtM(r.vac),
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
    
    <div style="text-align: center; margin-top: 20px;">
      <p style="font-size: 14px; font-weight: 600; color: #2563eb; margin-bottom: 4px;">FridayReport.AI</p>
      <a href="https://fridayreport.ai" style="font-size: 12px; color: #2563eb; text-decoration: none;">https://fridayreport.ai</a>
      <p style="font-size: 11px; color: #9ca3af; margin-top: 12px;">
        This report was generated automatically by FridayReport.AI
      </p>
    </div>
  </div>
</body>
</html>
`;
}
