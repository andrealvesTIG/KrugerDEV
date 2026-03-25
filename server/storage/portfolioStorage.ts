import { db } from "../db";
import {
  portfolios, projects, issues, tasks, customPortfolioProjects, portfolioKeyDates,
  type Portfolio, type InsertPortfolio, type UpdatePortfolioRequest,
  type Risk, type Issue, type Milestone,
  type PortfolioKeyDate, type InsertPortfolioKeyDate, type UpdatePortfolioKeyDateRequest,
} from "@shared/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";

export async function getPortfolios(organizationId?: number): Promise<Portfolio[]> {
  if (organizationId) {
    return await db.select().from(portfolios).where(
      and(eq(portfolios.organizationId, organizationId), isNull(portfolios.deletedAt))
    );
  }
  return await db.select().from(portfolios).where(isNull(portfolios.deletedAt));
}

export async function getPortfolio(id: number): Promise<Portfolio | undefined> {
  const [portfolio] = await db.select().from(portfolios).where(
    and(eq(portfolios.id, id), isNull(portfolios.deletedAt))
  );
  return portfolio;
}

export async function createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio> {
  const [newPortfolio] = await db.insert(portfolios).values(portfolio).returning();
  return newPortfolio;
}

export async function updatePortfolio(id: number, updates: UpdatePortfolioRequest): Promise<Portfolio> {
  const [updated] = await db.update(portfolios)
    .set(updates)
    .where(eq(portfolios.id, id))
    .returning();
  return updated;
}

export async function deletePortfolio(id: number): Promise<void> {
  await db.delete(portfolios).where(eq(portfolios.id, id));
}

export async function getPortfolioProjects(portfolioId: number): Promise<(typeof projects.$inferSelect)[]> {
  const portfolio = await getPortfolio(portfolioId);
  if (portfolio?.isCustom) {
    const customLinks = await db.select().from(customPortfolioProjects).where(
      eq(customPortfolioProjects.portfolioId, portfolioId)
    );
    if (customLinks.length === 0) return [];
    const projectIds = customLinks.map(l => l.projectId);
    return await db.select().from(projects).where(
      and(inArray(projects.id, projectIds), isNull(projects.deletedAt))
    );
  }
  return await db.select().from(projects).where(
    and(eq(projects.portfolioId, portfolioId), isNull(projects.deletedAt))
  );
}

export async function addProjectToCustomPortfolio(portfolioId: number, projectId: number, addedBy?: string): Promise<void> {
  await db.insert(customPortfolioProjects).values({ portfolioId, projectId, addedBy }).onConflictDoNothing();
}

export async function removeProjectFromCustomPortfolio(portfolioId: number, projectId: number): Promise<void> {
  await db.delete(customPortfolioProjects).where(
    and(eq(customPortfolioProjects.portfolioId, portfolioId), eq(customPortfolioProjects.projectId, projectId))
  );
}

export async function getCustomPortfolioProjectIds(portfolioId: number): Promise<number[]> {
  const links = await db.select().from(customPortfolioProjects).where(
    eq(customPortfolioProjects.portfolioId, portfolioId)
  );
  return links.map(l => l.projectId);
}

export async function getPortfolioRisks(portfolioId: number): Promise<(Risk & { projectName: string })[]> {
  const portfolioProjs = await getPortfolioProjects(portfolioId);
  const projectIds = portfolioProjs.map(p => p.id);
  if (projectIds.length === 0) return [];
  
  const projectMap = new Map(portfolioProjs.map(p => [p.id, p.name]));
  const allRisks = await db.select().from(issues).where(
    and(inArray(issues.projectId, projectIds), eq(issues.itemType, 'risk'), isNull(issues.deletedAt))
  );
  return allRisks.map(r => ({ ...r, projectName: projectMap.get(r.projectId!) || '' }));
}

export async function getPortfolioIssues(portfolioId: number): Promise<(Issue & { projectName: string })[]> {
  const portfolioProjs = await getPortfolioProjects(portfolioId);
  const projectIds = portfolioProjs.map(p => p.id);
  if (projectIds.length === 0) return [];
  
  const projectMap = new Map(portfolioProjs.map(p => [p.id, p.name]));
  const allIssues = await db.select().from(issues).where(
    and(inArray(issues.projectId, projectIds), eq(issues.itemType, 'issue'), isNull(issues.deletedAt))
  );
  return allIssues.map(i => ({ ...i, projectName: projectMap.get(i.projectId!) || '' }));
}

export async function getPortfolioKeyDates(portfolioId: number): Promise<PortfolioKeyDate[]> {
  return await db.select().from(portfolioKeyDates).where(
    and(eq(portfolioKeyDates.portfolioId, portfolioId), isNull(portfolioKeyDates.deletedAt))
  );
}

export async function getPortfolioKeyDate(id: number): Promise<PortfolioKeyDate | undefined> {
  const [keyDate] = await db.select().from(portfolioKeyDates).where(
    and(eq(portfolioKeyDates.id, id), isNull(portfolioKeyDates.deletedAt))
  );
  return keyDate;
}

export async function createPortfolioKeyDate(data: InsertPortfolioKeyDate): Promise<PortfolioKeyDate> {
  const [created] = await db.insert(portfolioKeyDates).values(data).returning();
  return created;
}

export async function updatePortfolioKeyDate(id: number, updates: UpdatePortfolioKeyDateRequest): Promise<PortfolioKeyDate> {
  const [updated] = await db.update(portfolioKeyDates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(portfolioKeyDates.id, id))
    .returning();
  return updated;
}

export async function deletePortfolioKeyDate(id: number, deletedBy?: string): Promise<void> {
  await db.update(portfolioKeyDates)
    .set({ deletedAt: new Date(), deletedBy: deletedBy || null })
    .where(eq(portfolioKeyDates.id, id));
}

/** @deprecated Use getPortfolioKeyDates instead. This function reads task milestones from the tasks table for backward compatibility. */
export async function getPortfolioMilestones(portfolioId: number): Promise<(Milestone & { projectName: string })[]> {
  const portfolioProjs = await getPortfolioProjects(portfolioId);
  const projectIds = portfolioProjs.map(p => p.id);
  if (projectIds.length === 0) return [];
  
  const projectMap = new Map(portfolioProjs.map(p => [p.id, p.name]));
  const milestoneTasks = await db.select().from(tasks).where(
    and(inArray(tasks.projectId, projectIds), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone'), isNull(tasks.deletedAt))
  );
  return milestoneTasks.map(t => ({
    id: t.id,
    projectId: t.projectId,
    milestoneNumber: t.milestoneNumber ?? null,
    title: t.name,
    description: t.description,
    milestoneType: t.milestoneType ?? null,
    dueDate: t.endDate ?? '',
    baselineDueDate: t.baselineEndDate ?? null,
    actualCompletionDate: t.actualEndDate ?? null,
    startDate: t.startDate ?? null,
    completed: t.status === 'Done' || t.status === 'Completed' || t.progress === 100,
    status: t.status,
    priority: t.priority,
    ownerId: t.ownerId ?? null,
    assignee: t.assignee ?? null,
    deliverables: t.deliverables ?? null,
    acceptanceCriteria: t.acceptanceCriteria ?? null,
    dependencies: null,
    successMetrics: t.successMetrics ?? null,
    stakeholders: t.stakeholders ?? null,
    phase: t.phase ?? null,
    notes: t.notes ?? null,
    organizationId: t.organizationId ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt ?? t.createdAt,
    deletedAt: t.deletedAt,
    deletedBy: t.deletedBy,
    isDemo: t.isDemo,
    projectName: projectMap.get(t.projectId) || '',
  }));
}
