import { db } from "../db";
import {
  users, organizations, organizationMembers, organizationInvites, organizationAccessRequests,
  organizationIntegrations, externalShares,
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
  customFieldDefinitions, customDashboards, projectViews, systemProjectViews,
  projectScoringCriteria, resourceSkills, resourceAvailability,
  featureUsageLogs, helpTickets, simulationRuns, reportSubscriptions,
  apiTokens, timeCategories,
  legacyRisks, legacyRiskChangeLogs, legacyRiskResourceAssignments,
  portfolioRiskAssessments,
  type Organization, type InsertOrganization,
  type OrganizationMember, type InsertOrganizationMember,
  type OrganizationInvite, type InsertOrganizationInvite,
  type OrganizationAccessRequest, type InsertOrganizationAccessRequest,
  type ExternalShare, type InsertExternalShare,
} from "@shared/schema";
import {
  billingAuditLogs, subscriptions, seatAssignments,
  usageEvents, usageRollups, billingCycles, invoiceRecords,
  billingTransactions as billingTransactionsTable,
} from "@shared/models/billing";
import { eq, and, desc, isNull, isNotNull, inArray } from "drizzle-orm";

export async function getOrganizations(): Promise<Organization[]> {
  return await db.select().from(organizations).where(isNull(organizations.deactivatedAt));
}

export async function getDeactivatedOrganizations(): Promise<Organization[]> {
  return await db.select().from(organizations).where(isNotNull(organizations.deactivatedAt));
}

export async function getAllOrganizations(): Promise<Organization[]> {
  return await db.select().from(organizations);
}

export async function getOrganization(id: number): Promise<Organization | undefined> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
  return org;
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  return org;
}

export async function createOrganization(org: InsertOrganization): Promise<Organization> {
  const [newOrg] = await db.insert(organizations).values(org).returning();
  return newOrg;
}

export async function updateOrganization(id: number, updates: Partial<InsertOrganization>): Promise<Organization> {
  const [updated] = await db.update(organizations)
    .set(updates)
    .where(eq(organizations.id, id))
    .returning();
  return updated;
}

export async function deactivateOrganization(id: number, deactivatedBy: string): Promise<Organization> {
  const [updated] = await db.update(organizations)
    .set({ deactivatedAt: new Date(), deactivatedBy })
    .where(eq(organizations.id, id))
    .returning();
  return updated;
}

export async function reactivateOrganization(id: number): Promise<Organization> {
  const [updated] = await db.update(organizations)
    .set({ deactivatedAt: null, deactivatedBy: null })
    .where(eq(organizations.id, id))
    .returning();
  return updated;
}

export async function deleteOrganization(id: number): Promise<void> {
  const orgProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.organizationId, id));
  const projectIds = orgProjects.map(p => p.id);

  if (projectIds.length > 0) {
    for (const projectId of projectIds) {
      const projectTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
      const taskIds = projectTasks.map(t => t.id);
      if (taskIds.length > 0) {
        await db.delete(timesheetEntries).where(inArray(timesheetEntries.taskId, taskIds));
        await db.delete(taskDependencies).where(inArray(taskDependencies.taskId, taskIds));
        await db.delete(taskDependencies).where(inArray(taskDependencies.dependsOnTaskId, taskIds));
        await db.delete(taskChangeLogs).where(inArray(taskChangeLogs.taskId, taskIds));
        await db.delete(taskResourceAssignments).where(inArray(taskResourceAssignments.taskId, taskIds));
        await db.delete(notifications).where(inArray(notifications.taskId, taskIds));
        await db.update(issues).set({ relatedTaskId: null }).where(inArray(issues.relatedTaskId, taskIds));
      }
      await db.delete(tasks).where(eq(tasks.projectId, projectId));

      const projectIssueRows = await db.select({ id: issues.id }).from(issues).where(eq(issues.projectId, projectId));
      const issueIds = projectIssueRows.map(i => i.id);
      if (issueIds.length > 0) {
        await db.delete(issueChangeLogs).where(inArray(issueChangeLogs.issueId, issueIds));
        await db.delete(issueResourceAssignments).where(inArray(issueResourceAssignments.issueId, issueIds));
      }
      await db.delete(issues).where(eq(issues.projectId, projectId));

      const milestoneTaskRows = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone')));
      const milestoneIds = milestoneTaskRows.map(m => m.id);
      if (milestoneIds.length > 0) {
        await db.delete(notifications).where(inArray(notifications.milestoneId, milestoneIds));
      }
      await db.delete(milestones).where(eq(milestones.projectId, projectId));

      await db.delete(projectFinancials).where(eq(projectFinancials.projectId, projectId));
      await db.delete(changeRequests).where(eq(changeRequests.projectId, projectId));
      await db.delete(projectDocuments).where(eq(projectDocuments.projectId, projectId));
      await db.delete(projectBenefits).where(eq(projectBenefits.projectId, projectId));
      await db.delete(projectDecisions).where(eq(projectDecisions.projectId, projectId));
      await db.delete(lessonsLearned).where(eq(lessonsLearned.projectId, projectId));
      await db.delete(projectChangeLogs).where(eq(projectChangeLogs.projectId, projectId));
      await db.delete(healthStatusHistory).where(eq(healthStatusHistory.projectId, projectId));
      await db.delete(statusReportHistory).where(eq(statusReportHistory.projectId, projectId));
      await db.delete(billableStatusComments).where(eq(billableStatusComments.projectId, projectId));
      await db.delete(costItems).where(eq(costItems.projectId, projectId));
      await db.delete(projectCustomFieldValues).where(eq(projectCustomFieldValues.projectId, projectId));
      await db.delete(projectScores).where(eq(projectScores.projectId, projectId));
      await db.delete(projectRiskAssessments).where(eq(projectRiskAssessments.projectId, projectId));
      await db.delete(customPortfolioProjects).where(eq(customPortfolioProjects.projectId, projectId));
      await db.delete(simulationEvents).where(eq(simulationEvents.projectId, projectId));
      await db.update(mppImports).set({ projectId: null }).where(eq(mppImports.projectId, projectId));
      await db.update(projectIntakes).set({ createdProjectId: null }).where(eq(projectIntakes.createdProjectId, projectId));
      await db.delete(notifications).where(eq(notifications.projectId, projectId));
      const invoiceRows = await db.select({ id: projectInvoices.id }).from(projectInvoices).where(eq(projectInvoices.projectId, projectId));
      for (const inv of invoiceRows) {
        await db.delete(invoiceNotes).where(eq(invoiceNotes.invoiceId, inv.id));
      }
      await db.delete(projectInvoices).where(eq(projectInvoices.projectId, projectId));
      const commentRows = await db.select({ id: projectComments.id }).from(projectComments).where(eq(projectComments.projectId, projectId));
      for (const c of commentRows) {
        await db.delete(notifications).where(eq(notifications.commentId, c.id));
      }
      await db.delete(projectComments).where(eq(projectComments.projectId, projectId));
      const legacyRiskRows = await db.select({ id: legacyRisks.id }).from(legacyRisks).where(eq(legacyRisks.projectId, projectId));
      for (const lr of legacyRiskRows) {
        await db.delete(legacyRiskChangeLogs).where(eq(legacyRiskChangeLogs.riskId, lr.id));
        await db.delete(legacyRiskResourceAssignments).where(eq(legacyRiskResourceAssignments.riskId, lr.id));
      }
      await db.delete(legacyRisks).where(eq(legacyRisks.projectId, projectId));
    }
    await db.delete(projects).where(eq(projects.organizationId, id));
  }

  const orgPortfolios = await db.select({ id: portfolios.id }).from(portfolios).where(eq(portfolios.organizationId, id));
  for (const portfolio of orgPortfolios) {
    await db.delete(portfolioRiskAssessments).where(eq(portfolioRiskAssessments.portfolioId, portfolio.id));
    await db.delete(notifications).where(eq(notifications.portfolioId, portfolio.id));
  }
  await db.delete(portfolios).where(eq(portfolios.organizationId, id));

  const orgResources = await db.select({ id: resources.id }).from(resources).where(eq(resources.organizationId, id));
  const resourceIds = orgResources.map(r => r.id);
  if (resourceIds.length > 0) {
    await db.delete(resourceSkills).where(inArray(resourceSkills.resourceId, resourceIds));
    await db.delete(resourceAvailability).where(inArray(resourceAvailability.resourceId, resourceIds));
    await db.delete(taskResourceAssignments).where(inArray(taskResourceAssignments.resourceId, resourceIds));
    await db.delete(issueResourceAssignments).where(inArray(issueResourceAssignments.resourceId, resourceIds));
    await db.delete(timesheetEntries).where(inArray(timesheetEntries.resourceId, resourceIds));
  }
  await db.delete(resources).where(eq(resources.organizationId, id));

  await db.delete(projectIntakes).where(eq(projectIntakes.organizationId, id));
  await db.delete(organizationInvites).where(eq(organizationInvites.organizationId, id));
  await db.delete(organizationAccessRequests).where(eq(organizationAccessRequests.organizationId, id));
  await db.delete(organizationIntegrations).where(eq(organizationIntegrations.organizationId, id));
  await db.delete(notifications).where(eq(notifications.organizationId, id));
  await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.organizationId, id));
  await db.delete(customDashboards).where(eq(customDashboards.organizationId, id));
  await db.delete(helpTickets).where(eq(helpTickets.organizationId, id));
  await db.delete(featureUsageLogs).where(eq(featureUsageLogs.organizationId, id));
  await db.delete(simulationRuns).where(eq(simulationRuns.organizationId, id));
  await db.delete(reportSubscriptions).where(eq(reportSubscriptions.organizationId, id));
  await db.delete(apiTokens).where(eq(apiTokens.organizationId, id));
  await db.delete(mppImports).where(eq(mppImports.organizationId, id));
  await db.delete(projectViews).where(eq(projectViews.organizationId, id));
  await db.delete(systemProjectViews).where(eq(systemProjectViews.organizationId, id));
  await db.delete(projectScoringCriteria).where(eq(projectScoringCriteria.organizationId, id));
  await db.delete(nonProjectTimeEntries).where(eq(nonProjectTimeEntries.organizationId, id));
  await db.delete(timeCategories).where(eq(timeCategories.organizationId, id));
  await db.delete(timesheetPeriods).where(eq(timesheetPeriods.organizationId, id));
  await db.delete(statusReportHistory).where(eq(statusReportHistory.organizationId, id));
  const orgSubscriptions = await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.orgId, id));
  const subscriptionIds = orgSubscriptions.map(s => s.id);
  if (subscriptionIds.length > 0) {
    for (const subId of subscriptionIds) {
      const subCycles = await db.select({ id: billingCycles.id }).from(billingCycles).where(eq(billingCycles.subscriptionId, subId));
      const cycleIds = subCycles.map(c => c.id);
      if (cycleIds.length > 0) {
        await db.delete(usageRollups).where(inArray(usageRollups.billingCycleId, cycleIds));
        await db.delete(usageEvents).where(inArray(usageEvents.billingCycleId, cycleIds));
      }
      await db.delete(billingCycles).where(eq(billingCycles.subscriptionId, subId));
      await db.delete(invoiceRecords).where(eq(invoiceRecords.subscriptionId, subId));
    }
    await db.delete(billingTransactionsTable).where(inArray(billingTransactionsTable.subscriptionId, subscriptionIds));
    await db.delete(subscriptions).where(eq(subscriptions.orgId, id));
  }
  await db.delete(seatAssignments).where(eq(seatAssignments.orgId, id));
  await db.delete(billingAuditLogs).where(eq(billingAuditLogs.orgId, id));
  await db.delete(usageEvents).where(eq(usageEvents.orgId, id));
  await db.delete(billingTransactionsTable).where(eq(billingTransactionsTable.orgId, id));

  await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, id));
  await db.delete(organizations).where(eq(organizations.id, id));
}

export async function getOrganizationMembers(organizationId: number): Promise<OrganizationMember[]> {
  return await db.select().from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));
}

export async function getUserOrganizations(userId: string): Promise<OrganizationMember[]> {
  return await db.select().from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));
}

export async function getUserOrganizationsWithDetails(userId: string): Promise<Organization[]> {
  const rows = await db.select({ org: organizations })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(
      eq(organizationMembers.userId, userId),
      isNull(organizations.deactivatedAt)
    ))
    .orderBy(organizations.name);
  return rows.map(r => r.org);
}

export async function addOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember> {
  const [newMember] = await db.insert(organizationMembers).values(member).returning();
  return newMember;
}

export async function updateOrganizationMemberRole(organizationId: number, userId: string, role: string): Promise<OrganizationMember> {
  const [updated] = await db.update(organizationMembers)
    .set({ role })
    .where(and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, userId)
    ))
    .returning();
  return updated;
}

export async function removeOrganizationMember(organizationId: number, userId: string): Promise<void> {
  await db.delete(organizationMembers)
    .where(and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, userId)
    ));
}

export async function getOrganizationInvites(organizationId: number): Promise<OrganizationInvite[]> {
  return await db.select().from(organizationInvites)
    .where(eq(organizationInvites.organizationId, organizationId))
    .orderBy(desc(organizationInvites.createdAt));
}

export async function getPendingInvitesByEmail(email: string): Promise<OrganizationInvite[]> {
  return await db.select().from(organizationInvites)
    .where(and(
      eq(organizationInvites.email, email.toLowerCase()),
      eq(organizationInvites.status, "pending")
    ));
}

export async function createOrganizationInvite(invite: InsertOrganizationInvite): Promise<OrganizationInvite> {
  const [created] = await db.insert(organizationInvites)
    .values({ ...invite, email: invite.email.toLowerCase() })
    .returning();
  return created;
}

export async function cancelOrganizationInvite(id: number): Promise<void> {
  await db.update(organizationInvites)
    .set({ status: "cancelled" })
    .where(eq(organizationInvites.id, id));
}

export async function getOrganizationInviteByToken(token: string): Promise<OrganizationInvite | undefined> {
  const [invite] = await db.select().from(organizationInvites)
    .where(eq(organizationInvites.token, token));
  return invite;
}

export async function getOrganizationInviteById(id: number): Promise<OrganizationInvite | undefined> {
  const [invite] = await db.select().from(organizationInvites)
    .where(eq(organizationInvites.id, id));
  return invite;
}

export async function acceptOrganizationInvite(id: number, userId: string): Promise<OrganizationMember | null> {
  const invite = await getOrganizationInviteById(id);
  if (!invite || invite.status !== "pending") {
    return null;
  }

  const existingMember = await db.select().from(organizationMembers)
    .where(and(
      eq(organizationMembers.organizationId, invite.organizationId),
      eq(organizationMembers.userId, userId)
    ));

  if (existingMember.length > 0) {
    await db.update(organizationInvites)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(organizationInvites.id, id));
    return existingMember[0];
  }

  const [member] = await db.insert(organizationMembers)
    .values({
      organizationId: invite.organizationId,
      userId: userId,
      role: invite.role
    })
    .returning();

  await db.update(organizationInvites)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(organizationInvites.id, id));

  return member;
}

export async function resendOrganizationInvite(id: number, newToken: string, newExpiresAt: Date): Promise<OrganizationInvite | null> {
  const [updated] = await db.update(organizationInvites)
    .set({ token: newToken, expiresAt: newExpiresAt })
    .where(eq(organizationInvites.id, id))
    .returning();
  return updated || null;
}

export async function claimInvitesForUser(email: string, userId: string): Promise<OrganizationMember[]> {
  const pendingInvites = await getPendingInvitesByEmail(email);
  const claimedMembers: OrganizationMember[] = [];

  for (const invite of pendingInvites) {
    const existingMember = await db.select().from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, invite.organizationId),
        eq(organizationMembers.userId, userId)
      ));

    if (existingMember.length === 0) {
      const [member] = await db.insert(organizationMembers)
        .values({
          organizationId: invite.organizationId,
          userId: userId,
          role: invite.role
        })
        .returning();
      claimedMembers.push(member);
    }

    await db.update(organizationInvites)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(organizationInvites.id, invite.id));
  }

  return claimedMembers;
}

export async function getOrganizationAccessRequests(organizationId: number): Promise<OrganizationAccessRequest[]> {
  return await db.select().from(organizationAccessRequests)
    .where(eq(organizationAccessRequests.organizationId, organizationId))
    .orderBy(desc(organizationAccessRequests.createdAt));
}

export async function getOrganizationIntegrations(organizationId: number) {
  return await db.select().from(organizationIntegrations)
    .where(eq(organizationIntegrations.organizationId, organizationId));
}

export async function getPendingAccessRequestByUser(organizationId: number, userId: string): Promise<OrganizationAccessRequest | undefined> {
  const [request] = await db.select().from(organizationAccessRequests)
    .where(and(
      eq(organizationAccessRequests.organizationId, organizationId),
      eq(organizationAccessRequests.userId, userId),
      eq(organizationAccessRequests.status, "pending")
    ));
  return request;
}

export async function createOrganizationAccessRequest(request: InsertOrganizationAccessRequest): Promise<OrganizationAccessRequest> {
  const [created] = await db.insert(organizationAccessRequests)
    .values(request)
    .returning();
  return created;
}

export async function updateAccessRequestStatus(id: number, status: string, reviewedBy: string): Promise<OrganizationAccessRequest> {
  const [updated] = await db.update(organizationAccessRequests)
    .set({ status, reviewedBy, reviewedAt: new Date() })
    .where(eq(organizationAccessRequests.id, id))
    .returning();
  return updated;
}

export async function getExternalSharesForUser(userId: string): Promise<ExternalShare[]> {
  return await db.select().from(externalShares).where(
    and(
      eq(externalShares.sharedWithUserId, userId),
      isNull(externalShares.revokedAt)
    )
  );
}

export async function getExternalSharesForObject(objectType: string, objectId: number): Promise<ExternalShare[]> {
  return await db.select().from(externalShares).where(
    and(
      eq(externalShares.objectType, objectType),
      eq(externalShares.objectId, objectId),
      isNull(externalShares.revokedAt)
    )
  );
}

export async function getExternalShare(objectType: string, objectId: number, userId: string): Promise<ExternalShare | undefined> {
  const [share] = await db.select().from(externalShares).where(
    and(
      eq(externalShares.objectType, objectType),
      eq(externalShares.objectId, objectId),
      eq(externalShares.sharedWithUserId, userId)
    )
  );
  return share;
}

export async function createExternalShare(share: InsertExternalShare): Promise<ExternalShare> {
  const existing = await getExternalShare(
    share.objectType,
    share.objectId,
    share.sharedWithUserId
  );
  if (existing) {
    if (existing.revokedAt) {
      const [updated] = await db.update(externalShares)
        .set({ revokedAt: null, accessRole: share.accessRole, sharedBy: share.sharedBy })
        .where(eq(externalShares.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }
  const [created] = await db.insert(externalShares).values(share).returning();
  return created;
}

export async function revokeExternalShare(id: number): Promise<void> {
  await db.update(externalShares)
    .set({ revokedAt: new Date() })
    .where(eq(externalShares.id, id));
}
