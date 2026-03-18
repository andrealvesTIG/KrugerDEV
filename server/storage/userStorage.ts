import { db } from "../db";
import {
  users,
  organizations, organizationMembers, organizationAccessRequests, organizationInvites, organizationIntegrations,
  portfolios, projects, tasks, issues, milestones,
  resources, taskResourceAssignments, issueResourceAssignments,
  taskDependencies, taskChangeLogs, issueChangeLogs,
  projectFinancials, changeRequests, projectDocuments, projectComments,
  projectBenefits, projectDecisions, lessonsLearned,
  projectChangeLogs, healthStatusHistory, statusReportHistory,
  billableStatusComments, costItems, projectCustomFieldValues,
  projectScores, projectRiskAssessments, customPortfolioProjects,
  simulationEvents, mppImports, projectIntakes,
  notifications, projectInvoices, invoiceNotes,
  timesheetEntries, nonProjectTimeEntries, timesheetPeriods,
  billingTransactions, customDashboards, projectViews, systemProjectViews,
  userConsents, customProjectTabs, projectScoringCriteria,
  resourceSkills, resourceAvailability,
  apiRequestLogs, userActivityLogs, featureUsageLogs, errorLogs,
  helpTickets, simulationRuns, reportSubscriptions,
  legacyRisks, legacyRiskChangeLogs, legacyRiskResourceAssignments,
  apiTokens, externalShares, magicLinkTokens,
  type User, type UpsertUser,
} from "@shared/schema";
import {
  billingAuditLogs, subscriptions, seatAssignments,
  usageEvents, usageRollups, billingCycles, invoiceRecords,
  referralCodes,
} from "@shared/models/billing";
import { eq, or } from "drizzle-orm";

export async function getUser(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.username, username));
  return user;
}

export async function getUserByApiKey(apiKey: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.apiKey, apiKey));
  return user;
}

export async function createUser(insertUser: UpsertUser): Promise<User> {
  const [user] = await db.insert(users).values(insertUser).returning();
  return user;
}

export async function updateUser(id: string, updates: Partial<UpsertUser>): Promise<User> {
  const [user] = await db.update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return user;
}

export async function getAllUsers(): Promise<User[]> {
  return await db.select().from(users);
}

export async function deleteUser(id: string): Promise<void> {
  await db.update(resources).set({ userId: null }).where(eq(resources.userId, id));
  await db.update(resources).set({ managerId: null }).where(eq(resources.managerId, id));
  await db.update(resources).set({ deletedBy: null }).where(eq(resources.deletedBy, id));
  await db.delete(notifications).where(or(eq(notifications.userId, id), eq(notifications.fromUserId, id)));
  await db.delete(organizationAccessRequests).where(eq(organizationAccessRequests.userId, id));
  await db.delete(organizationMembers).where(eq(organizationMembers.userId, id));
  await db.update(organizations).set({ ownerId: null }).where(eq(organizations.ownerId, id));
  await db.update(organizations).set({ deactivatedBy: null }).where(eq(organizations.deactivatedBy, id));
  await db.update(portfolios).set({ managerId: null }).where(eq(portfolios.managerId, id));
  await db.update(portfolios).set({ businessOwnerId: null }).where(eq(portfolios.businessOwnerId, id));
  await db.update(portfolios).set({ createdBy: null }).where(eq(portfolios.createdBy, id));
  await db.update(portfolios).set({ deletedBy: null }).where(eq(portfolios.deletedBy, id));
  await db.update(projects).set({ managerId: null }).where(eq(projects.managerId, id));
  await db.update(projects).set({ businessSponsorId: null }).where(eq(projects.businessSponsorId, id));
  await db.update(projects).set({ businessOwnerId: null }).where(eq(projects.businessOwnerId, id));
  await db.update(projects).set({ technicalLeadId: null }).where(eq(projects.technicalLeadId, id));
  await db.update(projects).set({ deletedBy: null }).where(eq(projects.deletedBy, id));
  await db.update(projects).set({ createdBy: null }).where(eq(projects.createdBy, id));
  await db.update(tasks).set({ ownerId: null }).where(eq(tasks.ownerId, id));
  await db.update(tasks).set({ deletedBy: null }).where(eq(tasks.deletedBy, id));
  await db.update(issues).set({ assigneeId: null }).where(eq(issues.assigneeId, id));
  await db.update(issues).set({ deletedBy: null }).where(eq(issues.deletedBy, id));
  await db.update(issues).set({ ownerId: null }).where(eq(issues.ownerId, id));
  await db.update(issues).set({ reviewerId: null }).where(eq(issues.reviewerId, id));
  await db.update(milestones).set({ deletedBy: null }).where(eq(milestones.deletedBy, id));
  await db.delete(timesheetEntries).where(eq(timesheetEntries.userId, id));
  await db.update(timesheetEntries).set({ approvedBy: null }).where(eq(timesheetEntries.approvedBy, id));
  await db.update(projectChangeLogs).set({ changedByName: null }).where(eq(projectChangeLogs.changedBy, id));
  await db.update(taskChangeLogs).set({ changedByName: null }).where(eq(taskChangeLogs.changedBy, id));
  await db.update(issueChangeLogs).set({ changedByName: null }).where(eq(issueChangeLogs.changedBy, id));
  await db.update(changeRequests).set({ requestedBy: null }).where(eq(changeRequests.requestedBy, id));
  await db.update(changeRequests).set({ approvedBy: null }).where(eq(changeRequests.approvedBy, id));
  await db.update(projectDocuments).set({ uploadedBy: null }).where(eq(projectDocuments.uploadedBy, id));
  await db.update(projectComments).set({ userId: null }).where(eq(projectComments.userId, id));
  await db.update(billableStatusComments).set({ userId: null }).where(eq(billableStatusComments.userId, id));
  await db.update(healthStatusHistory).set({ changedBy: null }).where(eq(healthStatusHistory.changedBy, id));
  await db.update(statusReportHistory).set({ generatedBy: null }).where(eq(statusReportHistory.generatedBy, id));
  await db.update(projectIntakes).set({ submittedBy: null }).where(eq(projectIntakes.submittedBy, id));
  await db.update(projectIntakes).set({ approvedBy: null }).where(eq(projectIntakes.approvedBy, id));
  await db.update(mppImports).set({ uploadedBy: null }).where(eq(mppImports.uploadedBy, id));
  await db.update(organizationInvites).set({ invitedBy: null }).where(eq(organizationInvites.invitedBy, id));
  await db.delete(referralCodes).where(eq(referralCodes.userId, id));
  await db.update(billingTransactions).set({ userId: null }).where(eq(billingTransactions.userId, id));
  const user = await getUser(id);
  if (user) {
    await db.delete(magicLinkTokens).where(eq(magicLinkTokens.email, user.email));
  }
  try {
    await db.delete(externalShares).where(eq(externalShares.sharedWithUserId, id));
    await db.delete(externalShares).where(eq(externalShares.sharedBy, id));
  } catch (err) {
  }
  await db.delete(nonProjectTimeEntries).where(eq(nonProjectTimeEntries.userId, id));
  await db.update(nonProjectTimeEntries).set({ approvedBy: null }).where(eq(nonProjectTimeEntries.approvedBy, id));
  await db.update(nonProjectTimeEntries).set({ deletedBy: null }).where(eq(nonProjectTimeEntries.deletedBy, id));
  await db.update(timesheetPeriods).set({ closedBy: null }).where(eq(timesheetPeriods.closedBy, id));
  await db.update(timesheetPeriods).set({ reopenedBy: null }).where(eq(timesheetPeriods.reopenedBy, id));
  await db.update(timesheetPeriods).set({ createdBy: null }).where(eq(timesheetPeriods.createdBy, id));
  await db.update(projectInvoices).set({ createdBy: null }).where(eq(projectInvoices.createdBy, id));
  await db.update(projectInvoices).set({ deletedBy: null }).where(eq(projectInvoices.deletedBy, id));
  await db.update(invoiceNotes).set({ userId: null }).where(eq(invoiceNotes.userId, id));
  await db.delete(customDashboards).where(eq(customDashboards.userId, id));
  await db.delete(projectViews).where(eq(projectViews.userId, id));
  await db.update(systemProjectViews).set({ createdBy: null }).where(eq(systemProjectViews.createdBy, id));
  await db.update(systemProjectViews).set({ updatedBy: null }).where(eq(systemProjectViews.updatedBy, id));
  await db.delete(userConsents).where(eq(userConsents.userId, id));
  await db.update(customProjectTabs).set({ createdBy: null }).where(eq(customProjectTabs.createdBy, id));
  await db.update(projectScoringCriteria).set({ createdBy: null }).where(eq(projectScoringCriteria.createdBy, id));
  await db.update(projectScores).set({ scoredBy: null }).where(eq(projectScores.scoredBy, id));
  await db.update(projectBenefits).set({ owner: null }).where(eq(projectBenefits.owner, id));
  await db.update(projectBenefits).set({ createdBy: null }).where(eq(projectBenefits.createdBy, id));
  await db.update(projectDecisions).set({ decisionMaker: null }).where(eq(projectDecisions.decisionMaker, id));
  await db.update(projectDecisions).set({ createdBy: null }).where(eq(projectDecisions.createdBy, id));
  await db.update(lessonsLearned).set({ identifiedBy: null }).where(eq(lessonsLearned.identifiedBy, id));
  await db.update(lessonsLearned).set({ reviewedBy: null }).where(eq(lessonsLearned.reviewedBy, id));
  await db.update(lessonsLearned).set({ createdBy: null }).where(eq(lessonsLearned.createdBy, id));
  await db.update(apiRequestLogs).set({ userId: null }).where(eq(apiRequestLogs.userId, id));
  await db.delete(userActivityLogs).where(eq(userActivityLogs.userId, id));
  await db.update(featureUsageLogs).set({ userId: null }).where(eq(featureUsageLogs.userId, id));
  await db.update(errorLogs).set({ userId: null }).where(eq(errorLogs.userId, id));
  await db.delete(helpTickets).where(eq(helpTickets.userId, id));
  await db.update(helpTickets).set({ assignedTo: null }).where(eq(helpTickets.assignedTo, id));
  await db.update(simulationRuns).set({ createdBy: null }).where(eq(simulationRuns.createdBy, id));
  await db.delete(reportSubscriptions).where(eq(reportSubscriptions.userId, id));
  await db.update(resourceAvailability).set({ createdBy: null }).where(eq(resourceAvailability.createdBy, id));
  await db.delete(users).where(eq(users.id, id));
}
