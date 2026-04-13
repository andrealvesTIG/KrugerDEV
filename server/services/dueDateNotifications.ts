import { db } from "../db";
import { rfis, submittals } from "@shared/schema";
import { and, eq, isNull, lte, isNotNull, or } from "drizzle-orm";
import { storage } from "../storage";

export async function checkDueDateNotifications(): Promise<number> {
  let notificationCount = 0;

  const now = new Date();
  const twoDaysFromNow = new Date(now);
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
  const today = now.toISOString().split("T")[0];
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const overdueFloor = sevenDaysAgo.toISOString().split("T")[0];
  const threshold = twoDaysFromNow.toISOString().split("T")[0];

  const dueRfis = await db.select().from(rfis).where(
    and(
      isNull(rfis.deletedAt),
      isNull(rfis.closedAt),
      isNotNull(rfis.dueDate),
      lte(rfis.dueDate, threshold),
      or(eq(rfis.status, "Open"), eq(rfis.status, "Answered"))
    )
  );

  for (const rfi of dueRfis) {
    if (rfi.dueDate! < overdueFloor) continue;

    const targetUserId = rfi.assignedTo || rfi.createdBy;
    if (!targetUserId) continue;

    const isOverdue = rfi.dueDate! < today;
    const title = isOverdue
      ? `RFI Overdue: ${rfi.rfiNumber}`
      : `RFI Due Soon: ${rfi.rfiNumber}`;
    const message = isOverdue
      ? `RFI ${rfi.rfiNumber}: "${rfi.subject}" is overdue (was due ${rfi.dueDate})`
      : `RFI ${rfi.rfiNumber}: "${rfi.subject}" is due on ${rfi.dueDate}`;

    try {
      await storage.createNotification({
        userId: targetUserId,
        type: "rfi_due_date",
        title,
        message,
        severity: isOverdue ? "warning" : "info",
        organizationId: rfi.organizationId,
        projectId: rfi.projectId,
        actionUrl: `/projects/${rfi.projectId}?tab=rfis`,
        metadata: { rfiId: rfi.id, rfiNumber: rfi.rfiNumber, dueDate: rfi.dueDate },
      });
      notificationCount++;
    } catch {
    }
  }

  const dueSubmittals = await db.select().from(submittals).where(
    and(
      isNull(submittals.deletedAt),
      isNull(submittals.closedAt),
      isNotNull(submittals.requiredDate),
      lte(submittals.requiredDate, threshold),
      or(eq(submittals.status, "Pending"), eq(submittals.status, "Under Review"))
    )
  );

  for (const sub of dueSubmittals) {
    if (sub.requiredDate! < overdueFloor) continue;

    const targetUserId = sub.reviewerId || sub.submittedBy || sub.createdBy;
    if (!targetUserId) continue;

    const isOverdue = sub.requiredDate! < today;
    const title = isOverdue
      ? `Submittal Overdue: ${sub.submittalNumber}`
      : `Submittal Due Soon: ${sub.submittalNumber}`;
    const message = isOverdue
      ? `Submittal ${sub.submittalNumber}: "${sub.title}" is overdue (was required by ${sub.requiredDate})`
      : `Submittal ${sub.submittalNumber}: "${sub.title}" is required by ${sub.requiredDate}`;

    try {
      await storage.createNotification({
        userId: targetUserId,
        type: "submittal_due_date",
        title,
        message,
        severity: isOverdue ? "warning" : "info",
        organizationId: sub.organizationId,
        projectId: sub.projectId,
        actionUrl: `/projects/${sub.projectId}?tab=submittals`,
        metadata: { submittalId: sub.id, submittalNumber: sub.submittalNumber, requiredDate: sub.requiredDate },
      });
      notificationCount++;
    } catch {
    }
  }

  return notificationCount;
}
