import { db } from "../db";
import {
  projectDocuments, projectComments, billableStatusComments,
  healthStatusHistory, statusReportHistory,
  projectViews, systemProjectViews, notifications,
  userConsents,
  tasks, projects,
  customFieldDefinitions, projectCustomFieldValues, taskCustomFieldValues, resourceCustomFieldValues,
  customProjectTabs, customTabSections, customTabFields,
  projectScoringCriteria, projectScores, portfolioScoringConfig,
  projectBenefits, projectDecisions, lessonsLearned,
  portfolioRiskAssessments, projectRiskAssessments,
  apiTokens, users,
  projectTemplates, projectTemplateItems,
  type ProjectDocument, type InsertProjectDocument, type UpdateProjectDocumentRequest,
  type ProjectComment, type InsertProjectComment,
  type BillableStatusComment, type InsertBillableStatusComment,
  type HealthStatusHistory, type InsertHealthStatusHistory,
  type StatusReportHistory, type InsertStatusReportHistory,
  type ProjectView, type InsertProjectView, type UpdateProjectViewRequest,
  type SystemProjectView, type InsertSystemProjectView, type UpdateSystemProjectViewRequest,
  type Notification, type InsertNotification,
  type UserConsent, type InsertUserConsent,
  type CustomFieldDefinition, type InsertCustomFieldDefinition, type UpdateCustomFieldDefinitionRequest,
  type ProjectCustomFieldValue, type InsertProjectCustomFieldValue,
  type TaskCustomFieldValue, type InsertTaskCustomFieldValue,
  type ResourceCustomFieldValue, type InsertResourceCustomFieldValue,
  type CustomProjectTab, type InsertCustomProjectTab,
  type CustomTabSection, type InsertCustomTabSection,
  type CustomTabField, type InsertCustomTabField,
  type ProjectScoringCriteria, type InsertProjectScoringCriteria,
  type ProjectScore, type InsertProjectScore,
  type PortfolioScoringConfig,
  type ProjectBenefit, type InsertProjectBenefit,
  type ProjectDecision, type InsertProjectDecision,
  type LessonLearned, type InsertLessonLearned,
  type PortfolioRiskAssessment, type InsertPortfolioRiskAssessment,
  type ProjectRiskAssessment, type InsertProjectRiskAssessment,
  type ApiToken, type InsertApiToken,
  type User,
  type ProjectTemplate, type InsertProjectTemplate,
  type ProjectTemplateItem, type InsertProjectTemplateItem,
} from "@shared/schema";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";

export async function getProjectDocuments(projectId: number): Promise<ProjectDocument[]> {
  return await db.select().from(projectDocuments)
    .where(eq(projectDocuments.projectId, projectId))
    .orderBy(desc(projectDocuments.createdAt));
}

export async function getProjectDocument(id: number): Promise<ProjectDocument | undefined> {
  const [document] = await db.select().from(projectDocuments).where(eq(projectDocuments.id, id));
  return document;
}

export async function createProjectDocument(document: InsertProjectDocument): Promise<ProjectDocument> {
  const [created] = await db.insert(projectDocuments).values(document).returning();
  return created;
}

export async function updateProjectDocument(id: number, updates: UpdateProjectDocumentRequest): Promise<ProjectDocument> {
  const [updated] = await db.update(projectDocuments)
    .set(updates)
    .where(eq(projectDocuments.id, id))
    .returning();
  return updated;
}

export async function deleteProjectDocument(id: number): Promise<void> {
  await db.delete(projectDocuments).where(eq(projectDocuments.id, id));
}

export async function getProjectComments(projectId: number): Promise<ProjectComment[]> {
  return await db.select().from(projectComments)
    .where(eq(projectComments.projectId, projectId))
    .orderBy(desc(projectComments.createdAt));
}

export async function getProjectComment(id: number): Promise<ProjectComment | undefined> {
  const [comment] = await db.select().from(projectComments).where(eq(projectComments.id, id));
  return comment;
}

export async function createProjectComment(comment: InsertProjectComment): Promise<ProjectComment> {
  const [created] = await db.insert(projectComments).values(comment).returning();
  return created;
}

export async function deleteProjectComment(id: number): Promise<void> {
  await db.delete(projectComments).where(eq(projectComments.id, id));
}

export async function getBillableStatusComments(projectId: number): Promise<BillableStatusComment[]> {
  return await db.select().from(billableStatusComments)
    .where(eq(billableStatusComments.projectId, projectId))
    .orderBy(desc(billableStatusComments.createdAt));
}

export async function createBillableStatusComment(comment: InsertBillableStatusComment): Promise<BillableStatusComment> {
  const [created] = await db.insert(billableStatusComments).values(comment).returning();
  return created;
}

export async function getHealthStatusHistory(projectId: number): Promise<HealthStatusHistory[]> {
  return await db.select().from(healthStatusHistory)
    .where(eq(healthStatusHistory.projectId, projectId))
    .orderBy(desc(healthStatusHistory.createdAt));
}

export async function createHealthStatusHistory(entry: InsertHealthStatusHistory): Promise<HealthStatusHistory> {
  const [created] = await db.insert(healthStatusHistory).values(entry).returning();
  return created;
}

export async function getProjectViews(organizationId: number, userId: string, mode: string, portfolioId: number | null = null): Promise<ProjectView[]> {
  return await db.select().from(projectViews)
    .where(and(
      eq(projectViews.organizationId, organizationId),
      eq(projectViews.userId, userId),
      eq(projectViews.mode, mode),
      portfolioId === null
        ? sql`${projectViews.portfolioId} IS NULL`
        : eq(projectViews.portfolioId, portfolioId)
    ))
    .orderBy(desc(projectViews.isSystem), asc(projectViews.name));
}

export async function getProjectView(id: number): Promise<ProjectView | undefined> {
  const [view] = await db.select().from(projectViews).where(eq(projectViews.id, id));
  return view;
}

export async function createProjectView(view: InsertProjectView): Promise<ProjectView> {
  const [created] = await db.insert(projectViews).values(view).returning();
  return created;
}

export async function updateProjectView(id: number, updates: UpdateProjectViewRequest): Promise<ProjectView> {
  const [updated] = await db.update(projectViews)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(projectViews.id, id))
    .returning();
  return updated;
}

export async function deleteProjectView(id: number): Promise<void> {
  await db.delete(projectViews).where(eq(projectViews.id, id));
}

export async function setDefaultProjectView(organizationId: number, userId: string, mode: string, viewId: number, portfolioId: number | null = null): Promise<void> {
  await db.update(projectViews)
    .set({ isDefault: false })
    .where(and(
      eq(projectViews.organizationId, organizationId),
      eq(projectViews.userId, userId),
      eq(projectViews.mode, mode),
      portfolioId === null
        ? sql`${projectViews.portfolioId} IS NULL`
        : eq(projectViews.portfolioId, portfolioId)
    ));
  await db.update(projectViews)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(projectViews.id, viewId));
}

export async function getSystemProjectViews(organizationId: number, mode: string, portfolioId: number | null = null): Promise<SystemProjectView[]> {
  return await db.select().from(systemProjectViews)
    .where(and(
      eq(systemProjectViews.organizationId, organizationId),
      eq(systemProjectViews.mode, mode),
      eq(systemProjectViews.isActive, true),
      portfolioId === null
        ? sql`${systemProjectViews.portfolioId} IS NULL`
        : eq(systemProjectViews.portfolioId, portfolioId)
    ))
    .orderBy(asc(systemProjectViews.displayOrder), asc(systemProjectViews.name));
}

export async function getSystemProjectView(id: number): Promise<SystemProjectView | undefined> {
  const [view] = await db.select().from(systemProjectViews).where(eq(systemProjectViews.id, id));
  return view;
}

export async function createSystemProjectView(view: InsertSystemProjectView): Promise<SystemProjectView> {
  const [created] = await db.insert(systemProjectViews).values(view).returning();
  return created;
}

export async function updateSystemProjectView(id: number, updates: UpdateSystemProjectViewRequest): Promise<SystemProjectView> {
  const [updated] = await db.update(systemProjectViews)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(systemProjectViews.id, id))
    .returning();
  return updated;
}

export async function deleteSystemProjectView(id: number): Promise<void> {
  await db.delete(systemProjectViews).where(eq(systemProjectViews.id, id));
}

export async function getNotifications(userId: string, limit: number = 200, offset: number = 0): Promise<Notification[]> {
  return await db.select().from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return result[0]?.count || 0;
}

export async function createNotification(notification: InsertNotification): Promise<Notification> {
  const [created] = await db.insert(notifications).values(notification).returning();
  return created;
}

export async function markNotificationRead(id: number): Promise<void> {
  await db.update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db.update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId));
}

export async function getStatusReportHistory(projectId: number): Promise<StatusReportHistory[]> {
  return await db.select().from(statusReportHistory)
    .where(eq(statusReportHistory.projectId, projectId))
    .orderBy(desc(statusReportHistory.createdAt));
}

export async function getStatusReportHistoryByOrg(organizationId: number): Promise<StatusReportHistory[]> {
  return await db.select().from(statusReportHistory)
    .where(eq(statusReportHistory.organizationId, organizationId))
    .orderBy(desc(statusReportHistory.createdAt));
}

export async function createStatusReportHistory(report: InsertStatusReportHistory): Promise<StatusReportHistory> {
  const [created] = await db.insert(statusReportHistory).values(report).returning();
  return created;
}

export async function getUserConsents(userId: string): Promise<UserConsent[]> {
  return await db.select().from(userConsents)
    .where(and(eq(userConsents.userId, userId), eq(userConsents.revoked, false)))
    .orderBy(desc(userConsents.acceptedAt));
}

export async function getUserConsentByType(userId: string, consentType: string): Promise<UserConsent | undefined> {
  const [consent] = await db.select().from(userConsents)
    .where(and(
      eq(userConsents.userId, userId),
      eq(userConsents.consentType, consentType),
      eq(userConsents.revoked, false)
    ))
    .orderBy(desc(userConsents.acceptedAt))
    .limit(1);
  return consent;
}

export async function createUserConsent(consent: InsertUserConsent): Promise<UserConsent> {
  const [created] = await db.insert(userConsents).values(consent).returning();
  return created;
}

export async function revokeUserConsent(id: number): Promise<UserConsent> {
  const [updated] = await db.update(userConsents)
    .set({ revoked: true, revokedAt: new Date() })
    .where(eq(userConsents.id, id))
    .returning();
  return updated;
}

export async function getAllUserConsents(limit: number = 100, offset: number = 0): Promise<UserConsent[]> {
  return await db.select().from(userConsents)
    .orderBy(desc(userConsents.acceptedAt))
    .limit(limit)
    .offset(offset);
}

export async function getUserConsentStats(): Promise<{ consentType: string; version: string; count: number }[]> {
  const stats = await db.select({
    consentType: userConsents.consentType,
    version: userConsents.version,
    count: sql<number>`count(*)::int`
  })
    .from(userConsents)
    .where(eq(userConsents.revoked, false))
    .groupBy(userConsents.consentType, userConsents.version);
  return stats;
}

export async function getCustomFieldDefinitions(organizationId: number): Promise<CustomFieldDefinition[]> {
  return await db.select().from(customFieldDefinitions)
    .where(and(
      eq(customFieldDefinitions.organizationId, organizationId),
      eq(customFieldDefinitions.isActive, true)
    ))
    .orderBy(asc(customFieldDefinitions.displayOrder), asc(customFieldDefinitions.name));
}

export async function getCustomFieldDefinition(id: number): Promise<CustomFieldDefinition | undefined> {
  const [field] = await db.select().from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.id, id));
  return field;
}

export async function createCustomFieldDefinition(field: InsertCustomFieldDefinition): Promise<CustomFieldDefinition> {
  const [created] = await db.insert(customFieldDefinitions).values(field).returning();
  return created;
}

export async function updateCustomFieldDefinition(id: number, updates: UpdateCustomFieldDefinitionRequest): Promise<CustomFieldDefinition> {
  const [updated] = await db.update(customFieldDefinitions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(customFieldDefinitions.id, id))
    .returning();
  return updated;
}

export async function deleteCustomFieldDefinition(id: number): Promise<void> {
  await db.update(customFieldDefinitions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(customFieldDefinitions.id, id));
}

export async function getProjectCustomFieldValues(projectId: number): Promise<ProjectCustomFieldValue[]> {
  return await db.select().from(projectCustomFieldValues)
    .where(eq(projectCustomFieldValues.projectId, projectId));
}

export async function getOrganizationProjectCustomFieldValues(organizationId: number): Promise<ProjectCustomFieldValue[]> {
  return await db.select({
    id: projectCustomFieldValues.id,
    projectId: projectCustomFieldValues.projectId,
    fieldDefinitionId: projectCustomFieldValues.fieldDefinitionId,
    value: projectCustomFieldValues.value,
    textValue: projectCustomFieldValues.textValue,
    numberValue: projectCustomFieldValues.numberValue,
    dateValue: projectCustomFieldValues.dateValue,
    booleanValue: projectCustomFieldValues.booleanValue,
    updatedAt: projectCustomFieldValues.updatedAt,
  }).from(projectCustomFieldValues)
    .innerJoin(projects, eq(projectCustomFieldValues.projectId, projects.id))
    .where(eq(projects.organizationId, organizationId));
}

export async function getProjectCustomFieldValue(projectId: number, fieldDefinitionId: number): Promise<ProjectCustomFieldValue | undefined> {
  const [value] = await db.select().from(projectCustomFieldValues)
    .where(and(
      eq(projectCustomFieldValues.projectId, projectId),
      eq(projectCustomFieldValues.fieldDefinitionId, fieldDefinitionId)
    ));
  return value;
}

export async function upsertProjectCustomFieldValue(value: InsertProjectCustomFieldValue): Promise<ProjectCustomFieldValue> {
  const [result] = await db.insert(projectCustomFieldValues)
    .values(value)
    .onConflictDoUpdate({
      target: [projectCustomFieldValues.projectId, projectCustomFieldValues.fieldDefinitionId],
      set: { value: value.value, updatedAt: new Date() },
    })
    .returning();
  return result;
}

export async function deleteProjectCustomFieldValue(projectId: number, fieldDefinitionId: number): Promise<void> {
  await db.delete(projectCustomFieldValues)
    .where(and(
      eq(projectCustomFieldValues.projectId, projectId),
      eq(projectCustomFieldValues.fieldDefinitionId, fieldDefinitionId)
    ));
}

export async function getTaskCustomFieldValues(taskId: number): Promise<TaskCustomFieldValue[]> {
  return await db.select().from(taskCustomFieldValues)
    .where(eq(taskCustomFieldValues.taskId, taskId));
}

export async function upsertTaskCustomFieldValue(value: InsertTaskCustomFieldValue): Promise<TaskCustomFieldValue> {
  const [result] = await db.insert(taskCustomFieldValues)
    .values(value)
    .onConflictDoUpdate({
      target: [taskCustomFieldValues.taskId, taskCustomFieldValues.fieldDefinitionId],
      set: { value: value.value, updatedAt: new Date() },
    })
    .returning();
  return result;
}

export async function deleteTaskCustomFieldValue(taskId: number, fieldDefinitionId: number): Promise<void> {
  await db.delete(taskCustomFieldValues)
    .where(and(
      eq(taskCustomFieldValues.taskId, taskId),
      eq(taskCustomFieldValues.fieldDefinitionId, fieldDefinitionId)
    ));
}

export async function getProjectTaskCustomFieldValues(projectId: number): Promise<TaskCustomFieldValue[]> {
  const projectTaskIds = await db.select({ id: tasks.id }).from(tasks)
    .where(eq(tasks.projectId, projectId));
  if (projectTaskIds.length === 0) return [];
  return await db.select().from(taskCustomFieldValues)
    .where(inArray(taskCustomFieldValues.taskId, projectTaskIds.map(t => t.id)));
}

export async function getResourceCustomFieldValues(resourceId: number): Promise<ResourceCustomFieldValue[]> {
  return await db.select().from(resourceCustomFieldValues)
    .where(eq(resourceCustomFieldValues.resourceId, resourceId));
}

export async function upsertResourceCustomFieldValue(value: InsertResourceCustomFieldValue): Promise<ResourceCustomFieldValue> {
  const [result] = await db.insert(resourceCustomFieldValues)
    .values(value)
    .onConflictDoUpdate({
      target: [resourceCustomFieldValues.resourceId, resourceCustomFieldValues.fieldDefinitionId],
      set: { value: value.value, updatedAt: new Date() },
    })
    .returning();
  return result;
}

export async function deleteResourceCustomFieldValue(resourceId: number, fieldDefinitionId: number): Promise<void> {
  await db.delete(resourceCustomFieldValues)
    .where(and(
      eq(resourceCustomFieldValues.resourceId, resourceId),
      eq(resourceCustomFieldValues.fieldDefinitionId, fieldDefinitionId)
    ));
}

export async function getCustomProjectTabs(organizationId: number): Promise<CustomProjectTab[]> {
  return await db.select().from(customProjectTabs)
    .where(and(
      eq(customProjectTabs.organizationId, organizationId),
      eq(customProjectTabs.isActive, true)
    ))
    .orderBy(asc(customProjectTabs.displayOrder), asc(customProjectTabs.name));
}

export async function getCustomProjectTab(id: number): Promise<CustomProjectTab | undefined> {
  const [tab] = await db.select().from(customProjectTabs)
    .where(eq(customProjectTabs.id, id));
  return tab;
}

export async function createCustomProjectTab(tab: InsertCustomProjectTab): Promise<CustomProjectTab> {
  const [created] = await db.insert(customProjectTabs).values(tab).returning();
  return created;
}

export async function updateCustomProjectTab(id: number, updates: Partial<InsertCustomProjectTab>): Promise<CustomProjectTab> {
  const [updated] = await db.update(customProjectTabs)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(customProjectTabs.id, id))
    .returning();
  return updated;
}

export async function deleteCustomProjectTab(id: number): Promise<void> {
  const sections = await getCustomTabSections(id);
  for (const section of sections) {
    await db.delete(customTabFields).where(eq(customTabFields.sectionId, section.id));
  }
  await db.delete(customTabSections).where(eq(customTabSections.tabId, id));
  await db.update(customProjectTabs)
    .set({ isActive: false })
    .where(eq(customProjectTabs.id, id));
}

export async function getCustomTabSections(tabId: number): Promise<CustomTabSection[]> {
  return await db.select().from(customTabSections)
    .where(eq(customTabSections.tabId, tabId))
    .orderBy(asc(customTabSections.displayOrder));
}

export async function getCustomTabSection(id: number): Promise<CustomTabSection | undefined> {
  const [section] = await db.select().from(customTabSections)
    .where(eq(customTabSections.id, id));
  return section;
}

export async function createCustomTabSection(section: InsertCustomTabSection): Promise<CustomTabSection> {
  const [created] = await db.insert(customTabSections).values(section).returning();
  return created;
}

export async function updateCustomTabSection(id: number, updates: Partial<InsertCustomTabSection>): Promise<CustomTabSection> {
  const [updated] = await db.update(customTabSections)
    .set(updates)
    .where(eq(customTabSections.id, id))
    .returning();
  return updated;
}

export async function deleteCustomTabSection(id: number): Promise<void> {
  await db.delete(customTabFields).where(eq(customTabFields.sectionId, id));
  await db.delete(customTabSections).where(eq(customTabSections.id, id));
}

export async function getCustomTabFields(sectionId: number): Promise<CustomTabField[]> {
  return await db.select().from(customTabFields)
    .where(eq(customTabFields.sectionId, sectionId))
    .orderBy(asc(customTabFields.displayOrder));
}

export async function getCustomTabField(id: number): Promise<CustomTabField | undefined> {
  const [field] = await db.select().from(customTabFields)
    .where(eq(customTabFields.id, id));
  return field;
}

export async function createCustomTabField(field: InsertCustomTabField): Promise<CustomTabField> {
  const [created] = await db.insert(customTabFields).values(field).returning();
  return created;
}

export async function updateCustomTabField(id: number, updates: Partial<InsertCustomTabField>): Promise<CustomTabField> {
  const [updated] = await db.update(customTabFields)
    .set(updates)
    .where(eq(customTabFields.id, id))
    .returning();
  return updated;
}

export async function deleteCustomTabField(id: number): Promise<void> {
  await db.delete(customTabFields).where(eq(customTabFields.id, id));
}

export async function getFullCustomProjectTab(tabId: number): Promise<{ tab: CustomProjectTab; sections: (CustomTabSection & { fields: CustomTabField[] })[] } | undefined> {
  const tab = await getCustomProjectTab(tabId);
  if (!tab) return undefined;

  const sections = await getCustomTabSections(tabId);
  const sectionsWithFields = await Promise.all(
    sections.map(async (section) => {
      const fields = await getCustomTabFields(section.id);
      return { ...section, fields };
    })
  );

  return { tab, sections: sectionsWithFields };
}

export async function getProjectScoringCriteria(organizationId: number): Promise<ProjectScoringCriteria[]> {
  return await db.select().from(projectScoringCriteria)
    .where(and(
      eq(projectScoringCriteria.organizationId, organizationId),
      eq(projectScoringCriteria.isActive, true)
    ))
    .orderBy(asc(projectScoringCriteria.displayOrder), asc(projectScoringCriteria.name));
}

export async function getProjectScoringCriterion(id: number): Promise<ProjectScoringCriteria | undefined> {
  const [criteria] = await db.select().from(projectScoringCriteria)
    .where(eq(projectScoringCriteria.id, id));
  return criteria;
}

export async function createProjectScoringCriteria(criteria: InsertProjectScoringCriteria): Promise<ProjectScoringCriteria> {
  const [created] = await db.insert(projectScoringCriteria).values(criteria).returning();
  return created;
}

export async function updateProjectScoringCriteria(id: number, updates: Partial<InsertProjectScoringCriteria>): Promise<ProjectScoringCriteria> {
  const [updated] = await db.update(projectScoringCriteria)
    .set(updates)
    .where(eq(projectScoringCriteria.id, id))
    .returning();
  return updated;
}

export async function deleteProjectScoringCriteria(id: number): Promise<void> {
  await db.update(projectScoringCriteria)
    .set({ isActive: false })
    .where(eq(projectScoringCriteria.id, id));
}

export async function getProjectScores(projectId: number): Promise<ProjectScore[]> {
  return await db.select().from(projectScores)
    .where(eq(projectScores.projectId, projectId))
    .orderBy(desc(projectScores.scoredAt));
}

export async function getProjectScore(id: number): Promise<ProjectScore | undefined> {
  const [score] = await db.select().from(projectScores)
    .where(eq(projectScores.id, id));
  return score;
}

export async function createProjectScore(score: InsertProjectScore): Promise<ProjectScore> {
  const [created] = await db.insert(projectScores).values(score).returning();
  return created;
}

export async function updateProjectScore(id: number, updates: Partial<InsertProjectScore>): Promise<ProjectScore> {
  const [updated] = await db.update(projectScores)
    .set(updates)
    .where(eq(projectScores.id, id))
    .returning();
  return updated;
}

export async function deleteProjectScore(id: number): Promise<void> {
  await db.delete(projectScores).where(eq(projectScores.id, id));
}

export async function upsertProjectScore(projectId: number, criteriaId: number, score: number, justification: string | null, scoredBy: string | null): Promise<ProjectScore> {
  const [result] = await db.insert(projectScores)
    .values({ projectId, criteriaId, score, justification, scoredBy })
    .onConflictDoUpdate({
      target: [projectScores.projectId, projectScores.criteriaId],
      set: { score, justification, scoredBy, scoredAt: new Date() },
    })
    .returning();
  return result;
}

export async function getProjectBenefits(projectId: number): Promise<ProjectBenefit[]> {
  return await db.select().from(projectBenefits)
    .where(eq(projectBenefits.projectId, projectId))
    .orderBy(desc(projectBenefits.createdAt));
}

export async function getProjectBenefit(id: number): Promise<ProjectBenefit | undefined> {
  const [benefit] = await db.select().from(projectBenefits)
    .where(eq(projectBenefits.id, id));
  return benefit;
}

export async function createProjectBenefit(benefit: InsertProjectBenefit): Promise<ProjectBenefit> {
  const [created] = await db.insert(projectBenefits).values(benefit).returning();
  return created;
}

export async function updateProjectBenefit(id: number, updates: Partial<InsertProjectBenefit>): Promise<ProjectBenefit> {
  const [updated] = await db.update(projectBenefits)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(projectBenefits.id, id))
    .returning();
  return updated;
}

export async function deleteProjectBenefit(id: number): Promise<void> {
  await db.delete(projectBenefits).where(eq(projectBenefits.id, id));
}

export async function getProjectDecisions(projectId: number): Promise<ProjectDecision[]> {
  return await db.select().from(projectDecisions)
    .where(eq(projectDecisions.projectId, projectId))
    .orderBy(desc(projectDecisions.createdAt));
}

export async function getProjectDecision(id: number): Promise<ProjectDecision | undefined> {
  const [decision] = await db.select().from(projectDecisions)
    .where(eq(projectDecisions.id, id));
  return decision;
}

export async function createProjectDecision(decision: InsertProjectDecision): Promise<ProjectDecision> {
  const [created] = await db.insert(projectDecisions).values(decision).returning();
  return created;
}

export async function updateProjectDecision(id: number, updates: Partial<InsertProjectDecision>): Promise<ProjectDecision> {
  const [updated] = await db.update(projectDecisions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(projectDecisions.id, id))
    .returning();
  return updated;
}

export async function deleteProjectDecision(id: number): Promise<void> {
  await db.delete(projectDecisions).where(eq(projectDecisions.id, id));
}

export async function getLessonsLearned(projectId: number): Promise<LessonLearned[]> {
  return await db.select().from(lessonsLearned)
    .where(eq(lessonsLearned.projectId, projectId))
    .orderBy(desc(lessonsLearned.createdAt));
}

export async function getAllLessonsLearned(organizationId: number): Promise<LessonLearned[]> {
  return await db.select().from(lessonsLearned)
    .where(eq(lessonsLearned.organizationId, organizationId))
    .orderBy(desc(lessonsLearned.createdAt));
}

export async function getLessonLearned(id: number): Promise<LessonLearned | undefined> {
  const [lesson] = await db.select().from(lessonsLearned)
    .where(eq(lessonsLearned.id, id));
  return lesson;
}

export async function createLessonLearned(lesson: InsertLessonLearned): Promise<LessonLearned> {
  const [created] = await db.insert(lessonsLearned).values(lesson).returning();
  return created;
}

export async function updateLessonLearned(id: number, updates: Partial<InsertLessonLearned>): Promise<LessonLearned> {
  const [updated] = await db.update(lessonsLearned)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(lessonsLearned.id, id))
    .returning();
  return updated;
}

export async function deleteLessonLearned(id: number): Promise<void> {
  await db.delete(lessonsLearned).where(eq(lessonsLearned.id, id));
}

export async function createPortfolioRiskAssessment(assessment: InsertPortfolioRiskAssessment): Promise<PortfolioRiskAssessment> {
  const [created] = await db.insert(portfolioRiskAssessments).values(assessment).returning();
  return created;
}

export async function getLatestPortfolioRiskAssessment(portfolioId: number): Promise<PortfolioRiskAssessment | undefined> {
  const [result] = await db.select().from(portfolioRiskAssessments)
    .where(eq(portfolioRiskAssessments.portfolioId, portfolioId))
    .orderBy(desc(portfolioRiskAssessments.generatedAt))
    .limit(1);
  return result;
}

export async function getLatestRiskAssessmentsForOrg(organizationId: number): Promise<PortfolioRiskAssessment[]> {
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  return await db.select().from(portfolioRiskAssessments)
    .where(and(
      eq(portfolioRiskAssessments.organizationId, organizationId),
      sql`${portfolioRiskAssessments.generatedAt} >= ${fiveDaysAgo}`
    ))
    .orderBy(desc(portfolioRiskAssessments.generatedAt));
}

export async function getPortfolioRiskAssessmentByShareToken(shareToken: string): Promise<PortfolioRiskAssessment | undefined> {
  const [result] = await db.select().from(portfolioRiskAssessments)
    .where(eq(portfolioRiskAssessments.shareToken, shareToken));
  return result;
}

export async function getPortfolioRiskAssessmentHistory(portfolioId: number): Promise<Pick<PortfolioRiskAssessment, 'id' | 'riskScore' | 'generatedAt'>[]> {
  return await db.select({
    id: portfolioRiskAssessments.id,
    riskScore: portfolioRiskAssessments.riskScore,
    generatedAt: portfolioRiskAssessments.generatedAt,
  }).from(portfolioRiskAssessments)
    .where(eq(portfolioRiskAssessments.portfolioId, portfolioId))
    .orderBy(portfolioRiskAssessments.generatedAt);
}

export async function createProjectRiskAssessment(assessment: InsertProjectRiskAssessment): Promise<ProjectRiskAssessment> {
  const [created] = await db.insert(projectRiskAssessments).values(assessment).returning();
  return created;
}

export async function getLatestProjectRiskAssessmentsForOrg(organizationId: number): Promise<ProjectRiskAssessment[]> {
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  return await db.select().from(projectRiskAssessments)
    .where(and(
      eq(projectRiskAssessments.organizationId, organizationId),
      sql`${projectRiskAssessments.generatedAt} >= ${fiveDaysAgo}`
    ))
    .orderBy(desc(projectRiskAssessments.generatedAt));
}

export async function getLatestProjectRiskAssessment(projectId: number): Promise<ProjectRiskAssessment | undefined> {
  const [result] = await db.select().from(projectRiskAssessments)
    .where(eq(projectRiskAssessments.projectId, projectId))
    .orderBy(desc(projectRiskAssessments.generatedAt))
    .limit(1);
  return result;
}

export async function getProjectRiskAssessmentByShareToken(shareToken: string): Promise<ProjectRiskAssessment | undefined> {
  const [result] = await db.select().from(projectRiskAssessments)
    .where(eq(projectRiskAssessments.shareToken, shareToken));
  return result;
}

export async function getProjectRiskAssessmentHistory(projectId: number): Promise<Pick<ProjectRiskAssessment, 'id' | 'riskScore' | 'generatedAt'>[]> {
  return await db.select({
    id: projectRiskAssessments.id,
    riskScore: projectRiskAssessments.riskScore,
    generatedAt: projectRiskAssessments.generatedAt,
  }).from(projectRiskAssessments)
    .where(eq(projectRiskAssessments.projectId, projectId))
    .orderBy(projectRiskAssessments.generatedAt);
}

export async function createApiToken(data: InsertApiToken): Promise<ApiToken> {
  const [token] = await db.insert(apiTokens).values(data).returning();
  return token;
}

export async function getApiTokenByToken(token: string): Promise<(ApiToken & { user: User }) | undefined> {
  const results = await db.select({
    id: apiTokens.id,
    token: apiTokens.token,
    userId: apiTokens.userId,
    organizationId: apiTokens.organizationId,
    name: apiTokens.name,
    lastUsedAt: apiTokens.lastUsedAt,
    expiresAt: apiTokens.expiresAt,
    createdAt: apiTokens.createdAt,
    user: users,
  }).from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(eq(apiTokens.token, token));
  if (results.length === 0) return undefined;
  const row = results[0];
  return {
    id: row.id,
    token: row.token,
    userId: row.userId,
    organizationId: row.organizationId,
    name: row.name,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    user: row.user,
  };
}

export async function getApiTokensByUserAndOrg(userId: string, organizationId: number): Promise<ApiToken[]> {
  return await db.select().from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), eq(apiTokens.organizationId, organizationId)))
    .orderBy(desc(apiTokens.createdAt));
}

export async function deleteApiToken(id: number): Promise<void> {
  await db.delete(apiTokens).where(eq(apiTokens.id, id));
}

export async function updateApiTokenLastUsed(id: number): Promise<void> {
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, id));
}

export async function getProjectTemplates(organizationId: number): Promise<ProjectTemplate[]> {
  return db.select().from(projectTemplates)
    .where(eq(projectTemplates.organizationId, organizationId))
    .orderBy(desc(projectTemplates.createdAt));
}

export async function getProjectTemplate(id: number): Promise<ProjectTemplate | undefined> {
  const [template] = await db.select().from(projectTemplates).where(eq(projectTemplates.id, id));
  return template;
}

export async function createProjectTemplate(template: InsertProjectTemplate): Promise<ProjectTemplate> {
  const [created] = await db.insert(projectTemplates).values(template).returning();
  return created;
}

export async function updateProjectTemplate(id: number, updates: Partial<InsertProjectTemplate>): Promise<ProjectTemplate> {
  const [updated] = await db.update(projectTemplates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(projectTemplates.id, id))
    .returning();
  return updated;
}

export async function deleteProjectTemplate(id: number): Promise<void> {
  await db.delete(projectTemplateItems).where(eq(projectTemplateItems.templateId, id));
  await db.delete(projectTemplates).where(eq(projectTemplates.id, id));
}

export async function getProjectTemplateItems(templateId: number): Promise<ProjectTemplateItem[]> {
  return db.select().from(projectTemplateItems)
    .where(eq(projectTemplateItems.templateId, templateId))
    .orderBy(asc(projectTemplateItems.id));
}

export async function createProjectTemplateItems(items: InsertProjectTemplateItem[]): Promise<ProjectTemplateItem[]> {
  if (items.length === 0) return [];
  return db.insert(projectTemplateItems).values(items).returning();
}

export async function deleteProjectTemplateItems(templateId: number): Promise<void> {
  await db.delete(projectTemplateItems).where(eq(projectTemplateItems.templateId, templateId));
}

export async function getPortfolioScoringConfig(portfolioId: number): Promise<PortfolioScoringConfig[]> {
  return await db.select().from(portfolioScoringConfig)
    .where(eq(portfolioScoringConfig.portfolioId, portfolioId));
}

export async function upsertPortfolioScoringConfig(
  portfolioId: number, criteriaId: number, aggregationMethod: string
): Promise<PortfolioScoringConfig> {
  const existing = await db.select().from(portfolioScoringConfig)
    .where(and(
      eq(portfolioScoringConfig.portfolioId, portfolioId),
      eq(portfolioScoringConfig.criteriaId, criteriaId)
    ));

  if (existing.length > 0) {
    const [updated] = await db.update(portfolioScoringConfig)
      .set({ aggregationMethod, updatedAt: new Date() })
      .where(eq(portfolioScoringConfig.id, existing[0].id))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(portfolioScoringConfig)
      .values({ portfolioId, criteriaId, aggregationMethod })
      .returning();
    return created;
  }
}

export async function getAllProjectScoresForProjects(projectIds: number[]): Promise<ProjectScore[]> {
  if (projectIds.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  return await db.select().from(projectScores)
    .where(inArray(projectScores.projectId, projectIds));
}
