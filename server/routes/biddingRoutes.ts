import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import {
  vendors, vendorPrequalifications, bidPackages, bidInvitations, bids, bidLineItems,
  projects, users,
} from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  formatZodErrors,
} from "./helpers";
import * as storage from "../storage/miscStorage";
import { organizationMembers } from "@shared/schema";

async function getUserDisplayName(userId: string): Promise<string> {
  const result = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
  if (!result) return "Unknown";
  if (result.firstName && result.lastName) return `${result.firstName} ${result.lastName}`;
  return result.username || result.email || "Unknown";
}

async function getNextBidNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  projectId: number
): Promise<string> {
  await tx.execute(
    sql`SELECT id FROM ${bidPackages} WHERE ${bidPackages.projectId} = ${projectId} ORDER BY id DESC LIMIT 1 FOR UPDATE`
  );
  const result = await tx
    .select({ maxNum: sql<string>`max(substring("number" from 5)::int)` })
    .from(bidPackages)
    .where(eq(bidPackages.projectId, projectId));
  const maxNum = Number(result[0]?.maxNum ?? 0);
  return `BID-${String(maxNum + 1).padStart(4, "0")}`;
}

async function verifyProjectAccess(req: any, res: any): Promise<{ userId: string; projectId: number; project: any } | null> {
  const userId = getUserIdFromRequest(req);
  if (!userId) { res.status(401).json({ message: "Authentication required" }); return null; }
  const projectId = Number(req.params.projectId);
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
  if (!project) { res.status(404).json({ message: "Project not found" }); return null; }
  if (!await userHasOrgAccess(userId, project.organizationId)) {
    res.status(403).json({ message: "Access denied" }); return null;
  }
  return { userId, projectId, project };
}

async function verifyOrgAccess(req: any, res: any): Promise<{ userId: string; orgId: number } | null> {
  const userId = getUserIdFromRequest(req);
  if (!userId) { res.status(401).json({ message: "Authentication required" }); return null; }
  const orgId = Number(req.params.orgId);
  if (!await userHasOrgAccess(userId, orgId)) {
    res.status(403).json({ message: "Access denied" }); return null;
  }
  return { userId, orgId };
}

async function verifyBidPackageOwnership(projectId: number, bidPackageId: number): Promise<boolean> {
  const pkg = await db.select({ id: bidPackages.id }).from(bidPackages)
    .where(and(eq(bidPackages.id, bidPackageId), eq(bidPackages.projectId, projectId), isNull(bidPackages.deletedAt)))
    .then(r => r[0]);
  return !!pkg;
}

async function verifyVendorOrgOwnership(vendorId: number, orgId: number): Promise<boolean> {
  const v = await db.select({ id: vendors.id }).from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, orgId), isNull(vendors.deletedAt)))
    .then(r => r[0]);
  return !!v;
}

async function sendBiddingNotification(
  recipientId: string,
  type: string,
  title: string,
  message: string,
  projectId: number,
  fromUserId?: string,
  fromUserName?: string,
) {
  try {
    await storage.createNotification({
      userId: recipientId,
      type,
      title,
      message,
      severity: "info",
      projectId,
      fromUserId: fromUserId || null,
      fromUserName: fromUserName || null,
    });
  } catch (err) {
    console.error("Error sending bidding notification:", err);
  }
}

async function getOrgMemberUserIds(orgId: number): Promise<string[]> {
  const members = await db.select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, orgId));
  return members.map(m => m.userId);
}

const createVendorSchema = z.object({
  companyName: z.string().min(1).max(500),
  contactName: z.string().max(500).nullable().optional(),
  email: z.string().email().max(500).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
  state: z.string().max(200).nullable().optional(),
  zipCode: z.string().max(20).nullable().optional(),
  website: z.string().max(500).nullable().optional(),
  tradeSpecialty: z.string().max(500).nullable().optional(),
  licenseNumber: z.string().max(200).nullable().optional(),
  insuranceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  bondingCapacity: z.string().max(200).nullable().optional(),
  status: z.enum(["Active", "Inactive", "Suspended", "Blacklisted"]).default("Active"),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
}).strict();

const updateVendorSchema = createVendorSchema.partial();

const createPrequalificationSchema = z.object({
  vendorId: z.number().int(),
  safetyRating: z.number().int().min(1).max(5).nullable().optional(),
  financialRating: z.number().int().min(1).max(5).nullable().optional(),
  qualityRating: z.number().int().min(1).max(5).nullable().optional(),
  experienceYears: z.number().int().min(0).nullable().optional(),
  emrRate: z.string().max(50).nullable().optional(),
  osha300Log: z.boolean().default(false),
  insuranceCertificate: z.boolean().default(false),
  bondingLetter: z.boolean().default(false),
  references: z.any().nullable().optional(),
  overallScore: z.number().int().min(0).max(100).nullable().optional(),
  qualificationStatus: z.enum(["Pending", "Qualified", "Conditionally Qualified", "Disqualified"]).default("Pending"),
  notes: z.string().max(5000).nullable().optional(),
}).strict();

const updatePrequalificationSchema = createPrequalificationSchema.omit({ vendorId: true }).partial();

const createBidPackageSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  tradeCategory: z.string().max(200).nullable().optional(),
  scope: z.string().max(10000).nullable().optional(),
  estimatedBudget: z.string().max(50).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  prebidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["Draft", "Open", "Closed", "Under Review", "Awarded", "Cancelled"]).default("Draft"),
  documents: z.string().max(10000).nullable().optional(),
}).strict();

const updateBidPackageSchema = createBidPackageSchema.partial().extend({
  awardedVendorId: z.number().int().nullable().optional(),
  awardedAmount: z.string().max(50).nullable().optional(),
  awardedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict();

const createBidSchema = z.object({
  vendorId: z.number().int(),
  totalAmount: z.string().min(1).max(50),
  alternateAmount: z.string().max(50).nullable().optional(),
  bondIncluded: z.boolean().default(false),
  notes: z.string().max(5000).nullable().optional(),
  exclusions: z.string().max(5000).nullable().optional(),
  clarifications: z.string().max(5000).nullable().optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  lineItems: z.array(z.object({
    description: z.string().min(1).max(1000),
    quantity: z.string().max(50).nullable().optional(),
    unit: z.string().max(50).nullable().optional(),
    unitPrice: z.string().max(50).nullable().optional(),
    totalPrice: z.string().max(50).nullable().optional(),
    category: z.string().max(200).nullable().optional(),
    sortOrder: z.number().int().default(0),
  })).optional(),
}).strict();

const updateBidSchema = z.object({
  totalAmount: z.string().min(1).max(50).optional(),
  alternateAmount: z.string().max(50).nullable().optional(),
  bondIncluded: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
  exclusions: z.string().max(5000).nullable().optional(),
  clarifications: z.string().max(5000).nullable().optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["Submitted", "Under Review", "Accepted", "Rejected", "Withdrawn"]).optional(),
  evaluationScore: z.number().int().min(0).max(100).nullable().optional(),
  evaluationNotes: z.string().max(5000).nullable().optional(),
  isRecommended: z.boolean().optional(),
  lineItems: z.array(z.object({
    description: z.string().min(1).max(1000),
    quantity: z.string().max(50).nullable().optional(),
    unit: z.string().max(50).nullable().optional(),
    unitPrice: z.string().max(50).nullable().optional(),
    totalPrice: z.string().max(50).nullable().optional(),
    category: z.string().max(200).nullable().optional(),
    sortOrder: z.number().int().default(0),
  })).optional(),
}).strict();

export function registerBiddingRoutes(app: Express) {

  // ── VENDORS (org-level) ──

  app.get("/api/organizations/:orgId/vendors", async (req, res) => {
    try {
      const ctx = await verifyOrgAccess(req, res);
      if (!ctx) return;
      const items = await db.select().from(vendors)
        .where(and(eq(vendors.organizationId, ctx.orgId), isNull(vendors.deletedAt)))
        .orderBy(desc(vendors.createdAt));
      const allPrequals = await db.select().from(vendorPrequalifications)
        .where(eq(vendorPrequalifications.organizationId, ctx.orgId))
        .orderBy(desc(vendorPrequalifications.createdAt));
      const latestPrequalByVendor = new Map<number, typeof vendorPrequalifications.$inferSelect>();
      for (const pq of allPrequals) {
        if (!latestPrequalByVendor.has(pq.vendorId)) {
          latestPrequalByVendor.set(pq.vendorId, pq);
        }
      }
      const enriched = items.map(v => ({
        ...v,
        latestPrequalification: latestPrequalByVendor.get(v.id) || null,
      }));
      res.json(enriched);
    } catch (err: unknown) {
      console.error("Error fetching vendors:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.get("/api/organizations/:orgId/vendors/:vendorId", async (req, res) => {
    try {
      const ctx = await verifyOrgAccess(req, res);
      if (!ctx) return;
      const vendorId = Number(req.params.vendorId);
      const vendor = await db.select().from(vendors)
        .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, ctx.orgId), isNull(vendors.deletedAt)))
        .then(r => r[0]);
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });
      res.json(vendor);
    } catch (err: unknown) {
      console.error("Error fetching vendor:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.post("/api/organizations/:orgId/vendors", async (req, res) => {
    try {
      const ctx = await verifyOrgAccess(req, res);
      if (!ctx) return;
      const parsed = createVendorSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });
      const [vendor] = await db.insert(vendors).values({
        ...parsed.data,
        organizationId: ctx.orgId,
        createdBy: ctx.userId,
      }).returning();
      res.status(201).json(vendor);
    } catch (err: unknown) {
      console.error("Error creating vendor:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.patch("/api/organizations/:orgId/vendors/:vendorId", async (req, res) => {
    try {
      const ctx = await verifyOrgAccess(req, res);
      if (!ctx) return;
      const vendorId = Number(req.params.vendorId);
      const parsed = updateVendorSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });
      const [updated] = await db.update(vendors)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, ctx.orgId)))
        .returning();
      if (!updated) return res.status(404).json({ message: "Vendor not found" });
      res.json(updated);
    } catch (err: unknown) {
      console.error("Error updating vendor:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.delete("/api/organizations/:orgId/vendors/:vendorId", async (req, res) => {
    try {
      const ctx = await verifyOrgAccess(req, res);
      if (!ctx) return;
      const vendorId = Number(req.params.vendorId);
      const [deleted] = await db.update(vendors)
        .set({ deletedAt: new Date() })
        .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, ctx.orgId)))
        .returning();
      if (!deleted) return res.status(404).json({ message: "Vendor not found" });
      res.json({ message: "Vendor deleted" });
    } catch (err: unknown) {
      console.error("Error deleting vendor:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  // ── VENDOR PREQUALIFICATIONS ──

  app.get("/api/organizations/:orgId/vendors/:vendorId/prequalifications", async (req, res) => {
    try {
      const ctx = await verifyOrgAccess(req, res);
      if (!ctx) return;
      const vendorId = Number(req.params.vendorId);
      const items = await db.select().from(vendorPrequalifications)
        .where(and(eq(vendorPrequalifications.vendorId, vendorId), eq(vendorPrequalifications.organizationId, ctx.orgId)))
        .orderBy(desc(vendorPrequalifications.createdAt));
      res.json(items);
    } catch (err: unknown) {
      console.error("Error fetching prequalifications:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.post("/api/organizations/:orgId/vendors/:vendorId/prequalifications", async (req, res) => {
    try {
      const ctx = await verifyOrgAccess(req, res);
      if (!ctx) return;
      const vendorId = Number(req.params.vendorId);
      if (!await verifyVendorOrgOwnership(vendorId, ctx.orgId)) {
        return res.status(400).json({ message: "Vendor does not belong to this organization" });
      }
      const parsed = createPrequalificationSchema.safeParse({ ...req.body, vendorId });
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });
      const [prequal] = await db.insert(vendorPrequalifications).values({
        ...parsed.data,
        organizationId: ctx.orgId,
        createdBy: ctx.userId,
      }).returning();
      res.status(201).json(prequal);
    } catch (err: unknown) {
      console.error("Error creating prequalification:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.patch("/api/organizations/:orgId/vendors/:vendorId/prequalifications/:prequalId", async (req, res) => {
    try {
      const ctx = await verifyOrgAccess(req, res);
      if (!ctx) return;
      const prequalId = Number(req.params.prequalId);
      const parsed = updatePrequalificationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });
      const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
      if (parsed.data.qualificationStatus && parsed.data.qualificationStatus !== "Pending") {
        updateData.reviewedBy = ctx.userId;
        updateData.reviewedAt = new Date();
      }
      const [updated] = await db.update(vendorPrequalifications)
        .set(updateData)
        .where(and(eq(vendorPrequalifications.id, prequalId), eq(vendorPrequalifications.organizationId, ctx.orgId)))
        .returning();
      if (!updated) return res.status(404).json({ message: "Prequalification not found" });
      res.json(updated);
    } catch (err: unknown) {
      console.error("Error updating prequalification:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  // ── BID PACKAGES (project-level) ──

  app.get("/api/projects/:projectId/bid-packages", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const items = await db.select().from(bidPackages)
        .where(and(eq(bidPackages.projectId, ctx.projectId), isNull(bidPackages.deletedAt)))
        .orderBy(desc(bidPackages.createdAt));
      res.json(items);
    } catch (err: unknown) {
      console.error("Error fetching bid packages:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.get("/api/projects/:projectId/bid-packages/:bidPackageId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      const pkg = await db.select().from(bidPackages)
        .where(and(eq(bidPackages.id, bidPackageId), eq(bidPackages.projectId, ctx.projectId), isNull(bidPackages.deletedAt)))
        .then(r => r[0]);
      if (!pkg) return res.status(404).json({ message: "Bid package not found" });
      res.json(pkg);
    } catch (err: unknown) {
      console.error("Error fetching bid package:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.post("/api/projects/:projectId/bid-packages", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const parsed = createBidPackageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });
      const displayName = await getUserDisplayName(ctx.userId);
      const pkg = await db.transaction(async (tx) => {
        const number = await getNextBidNumber(tx, ctx.projectId);
        const [created] = await tx.insert(bidPackages).values({
          ...parsed.data,
          number,
          projectId: ctx.projectId,
          organizationId: ctx.project.organizationId,
          createdBy: ctx.userId,
          createdByName: displayName,
        }).returning();
        return created;
      });
      res.status(201).json(pkg);
    } catch (err: unknown) {
      console.error("Error creating bid package:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.patch("/api/projects/:projectId/bid-packages/:bidPackageId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      const parsed = updateBidPackageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });
      const [updated] = await db.update(bidPackages)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(bidPackages.id, bidPackageId), eq(bidPackages.projectId, ctx.projectId)))
        .returning();
      if (!updated) return res.status(404).json({ message: "Bid package not found" });
      if (parsed.data.status === "Awarded" && parsed.data.awardedVendorId) {
        const vendorInfo = await db.select().from(vendors).where(eq(vendors.id, parsed.data.awardedVendorId)).then(r => r[0]);
        const senderName = await getUserDisplayName(ctx.userId);
        const memberIds = await getOrgMemberUserIds(ctx.project.organizationId);
        for (const memberId of memberIds) {
          if (memberId !== ctx.userId) {
            await sendBiddingNotification(
              memberId, "bid_awarded", "Bid Package Awarded",
              `"${updated.title}" has been awarded to ${vendorInfo?.companyName || "a vendor"}${parsed.data.awardedAmount ? ` for $${parsed.data.awardedAmount}` : ""}`,
              ctx.projectId, ctx.userId, senderName,
            );
          }
        }
      }
      res.json(updated);
    } catch (err: unknown) {
      console.error("Error updating bid package:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.delete("/api/projects/:projectId/bid-packages/:bidPackageId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      const [deleted] = await db.update(bidPackages)
        .set({ deletedAt: new Date() })
        .where(and(eq(bidPackages.id, bidPackageId), eq(bidPackages.projectId, ctx.projectId)))
        .returning();
      if (!deleted) return res.status(404).json({ message: "Bid package not found" });
      res.json({ message: "Bid package deleted" });
    } catch (err: unknown) {
      console.error("Error deleting bid package:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  // ── BID INVITATIONS ──

  app.get("/api/projects/:projectId/bid-packages/:bidPackageId/invitations", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      if (!await verifyBidPackageOwnership(ctx.projectId, bidPackageId)) {
        return res.status(404).json({ message: "Bid package not found" });
      }
      const items = await db.select().from(bidInvitations)
        .where(eq(bidInvitations.bidPackageId, bidPackageId))
        .orderBy(desc(bidInvitations.createdAt));
      const vendorIds = items.map(i => i.vendorId);
      let vendorMap = new Map<number, typeof vendors.$inferSelect>();
      if (vendorIds.length > 0) {
        const vendorList = await db.select().from(vendors)
          .where(and(eq(vendors.organizationId, ctx.project.organizationId), isNull(vendors.deletedAt)));
        vendorMap = new Map(vendorList.map(v => [v.id, v]));
      }
      const enriched = items.map(inv => ({
        ...inv,
        vendor: vendorMap.get(inv.vendorId) || null,
      }));
      res.json(enriched);
    } catch (err: unknown) {
      console.error("Error fetching bid invitations:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.post("/api/projects/:projectId/bid-packages/:bidPackageId/invitations", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      if (!await verifyBidPackageOwnership(ctx.projectId, bidPackageId)) {
        return res.status(404).json({ message: "Bid package not found" });
      }
      const { vendorIds } = req.body as { vendorIds: number[] };
      if (!Array.isArray(vendorIds) || vendorIds.length === 0) {
        return res.status(400).json({ message: "vendorIds array is required" });
      }
      for (const vid of vendorIds) {
        if (!await verifyVendorOrgOwnership(vid, ctx.project.organizationId)) {
          return res.status(400).json({ message: `Vendor ${vid} does not belong to this organization` });
        }
      }
      const created = [];
      for (const vendorId of vendorIds) {
        try {
          const [inv] = await db.insert(bidInvitations).values({
            bidPackageId,
            vendorId,
            createdBy: ctx.userId,
          }).returning();
          created.push(inv);
        } catch (err: unknown) {
          if (err instanceof Error && err.message.includes("duplicate")) continue;
          throw err;
        }
      }
      const pkg = await db.select().from(bidPackages).where(eq(bidPackages.id, bidPackageId)).then(r => r[0]);
      const senderName = await getUserDisplayName(ctx.userId);
      const memberIds = await getOrgMemberUserIds(ctx.project.organizationId);
      for (const memberId of memberIds) {
        if (memberId !== ctx.userId) {
          await sendBiddingNotification(
            memberId, "bid_invitation_sent", "Bid Invitations Sent",
            `${senderName} invited ${created.length} vendor(s) to bid on "${pkg?.title || "a bid package"}"`,
            ctx.projectId, ctx.userId, senderName,
          );
        }
      }
      res.status(201).json(created);
    } catch (err: unknown) {
      console.error("Error creating bid invitations:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.patch("/api/projects/:projectId/bid-packages/:bidPackageId/invitations/:invitationId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      if (!await verifyBidPackageOwnership(ctx.projectId, bidPackageId)) {
        return res.status(404).json({ message: "Bid package not found" });
      }
      const invitationId = Number(req.params.invitationId);
      const { status, declineReason } = req.body as { status?: string; declineReason?: string };
      const updateData: Record<string, unknown> = {};
      if (status) updateData.status = status;
      if (declineReason !== undefined) updateData.declineReason = declineReason;
      if (status === "Accepted" || status === "Declined") updateData.respondedAt = new Date();
      const [updated] = await db.update(bidInvitations)
        .set(updateData)
        .where(and(eq(bidInvitations.id, invitationId), eq(bidInvitations.bidPackageId, bidPackageId)))
        .returning();
      if (!updated) return res.status(404).json({ message: "Invitation not found" });
      res.json(updated);
    } catch (err: unknown) {
      console.error("Error updating bid invitation:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.delete("/api/projects/:projectId/bid-packages/:bidPackageId/invitations/:invitationId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      if (!await verifyBidPackageOwnership(ctx.projectId, bidPackageId)) {
        return res.status(404).json({ message: "Bid package not found" });
      }
      const invitationId = Number(req.params.invitationId);
      const deleted = await db.delete(bidInvitations)
        .where(and(eq(bidInvitations.id, invitationId), eq(bidInvitations.bidPackageId, bidPackageId)))
        .returning();
      if (deleted.length === 0) return res.status(404).json({ message: "Invitation not found" });
      res.json({ message: "Invitation removed" });
    } catch (err: unknown) {
      console.error("Error deleting bid invitation:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  // ── BIDS ──

  app.get("/api/projects/:projectId/bid-packages/:bidPackageId/bids", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      if (!await verifyBidPackageOwnership(ctx.projectId, bidPackageId)) {
        return res.status(404).json({ message: "Bid package not found" });
      }
      const bidList = await db.select().from(bids)
        .where(eq(bids.bidPackageId, bidPackageId))
        .orderBy(desc(bids.submittedAt));
      const vendorIds = bidList.map(b => b.vendorId);
      let vendorMap = new Map<number, typeof vendors.$inferSelect>();
      if (vendorIds.length > 0) {
        const vendorList = await db.select().from(vendors)
          .where(and(eq(vendors.organizationId, ctx.project.organizationId), isNull(vendors.deletedAt)));
        vendorMap = new Map(vendorList.map(v => [v.id, v]));
      }
      const allLineItems = await db.select().from(bidLineItems)
        .where(eq(bidLineItems.bidPackageId, bidPackageId));
      const lineItemsByBid = new Map<number, (typeof bidLineItems.$inferSelect)[]>();
      for (const li of allLineItems) {
        if (!lineItemsByBid.has(li.bidId)) lineItemsByBid.set(li.bidId, []);
        lineItemsByBid.get(li.bidId)!.push(li);
      }
      const enriched = bidList.map(bid => ({
        ...bid,
        vendor: vendorMap.get(bid.vendorId) || null,
        lineItems: lineItemsByBid.get(bid.id) || [],
      }));
      res.json(enriched);
    } catch (err: unknown) {
      console.error("Error fetching bids:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.post("/api/projects/:projectId/bid-packages/:bidPackageId/bids", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      if (!await verifyBidPackageOwnership(ctx.projectId, bidPackageId)) {
        return res.status(404).json({ message: "Bid package not found" });
      }
      const parsed = createBidSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });
      if (!await verifyVendorOrgOwnership(parsed.data.vendorId, ctx.project.organizationId)) {
        return res.status(400).json({ message: "Vendor does not belong to this organization" });
      }
      const { lineItems, ...bidData } = parsed.data;
      const result = await db.transaction(async (tx) => {
        const [bid] = await tx.insert(bids).values({
          ...bidData,
          bidPackageId,
          createdBy: ctx.userId,
        }).returning();
        if (lineItems && lineItems.length > 0) {
          await tx.insert(bidLineItems).values(
            lineItems.map((li, idx) => ({
              ...li,
              bidId: bid.id,
              bidPackageId,
              sortOrder: li.sortOrder ?? idx,
            }))
          );
        }
        return bid;
      });
      const pkg = await db.select().from(bidPackages).where(eq(bidPackages.id, bidPackageId)).then(r => r[0]);
      const vendorInfo = await db.select().from(vendors).where(eq(vendors.id, parsed.data.vendorId)).then(r => r[0]);
      const senderName = await getUserDisplayName(ctx.userId);
      const memberIds = await getOrgMemberUserIds(ctx.project.organizationId);
      for (const memberId of memberIds) {
        if (memberId !== ctx.userId) {
          await sendBiddingNotification(
            memberId, "bid_submitted", "New Bid Submitted",
            `${vendorInfo?.companyName || "A vendor"} submitted a bid of $${parsed.data.totalAmount} on "${pkg?.title || "a bid package"}"`,
            ctx.projectId, ctx.userId, senderName,
          );
        }
      }
      res.status(201).json(result);
    } catch (err: unknown) {
      console.error("Error creating bid:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.patch("/api/projects/:projectId/bid-packages/:bidPackageId/bids/:bidId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      if (!await verifyBidPackageOwnership(ctx.projectId, bidPackageId)) {
        return res.status(404).json({ message: "Bid package not found" });
      }
      const bidId = Number(req.params.bidId);
      const parsed = updateBidSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });
      const { lineItems, ...bidData } = parsed.data;
      const result = await db.transaction(async (tx) => {
        const [updated] = await tx.update(bids)
          .set({ ...bidData, updatedAt: new Date() })
          .where(and(eq(bids.id, bidId), eq(bids.bidPackageId, bidPackageId)))
          .returning();
        if (!updated) return null;
        if (lineItems !== undefined) {
          await tx.delete(bidLineItems).where(eq(bidLineItems.bidId, bidId));
          if (lineItems.length > 0) {
            await tx.insert(bidLineItems).values(
              lineItems.map((li, idx) => ({
                ...li,
                bidId,
                bidPackageId: updated.bidPackageId,
                sortOrder: li.sortOrder ?? idx,
              }))
            );
          }
        }
        return updated;
      });
      if (!result) return res.status(404).json({ message: "Bid not found" });
      res.json(result);
    } catch (err: unknown) {
      console.error("Error updating bid:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.delete("/api/projects/:projectId/bid-packages/:bidPackageId/bids/:bidId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      if (!await verifyBidPackageOwnership(ctx.projectId, bidPackageId)) {
        return res.status(404).json({ message: "Bid package not found" });
      }
      const bidId = Number(req.params.bidId);
      const bidExists = await db.select({ id: bids.id }).from(bids)
        .where(and(eq(bids.id, bidId), eq(bids.bidPackageId, bidPackageId)))
        .then(r => r[0]);
      if (!bidExists) return res.status(404).json({ message: "Bid not found" });
      await db.transaction(async (tx) => {
        await tx.delete(bidLineItems).where(eq(bidLineItems.bidId, bidId));
        await tx.delete(bids).where(and(eq(bids.id, bidId), eq(bids.bidPackageId, bidPackageId)));
      });
      res.json({ message: "Bid deleted" });
    } catch (err: unknown) {
      console.error("Error deleting bid:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  // ── BID LEVELING (comparison view) ──

  app.get("/api/projects/:projectId/bid-packages/:bidPackageId/leveling", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const bidPackageId = Number(req.params.bidPackageId);
      const pkg = await db.select().from(bidPackages)
        .where(and(eq(bidPackages.id, bidPackageId), eq(bidPackages.projectId, ctx.projectId)))
        .then(r => r[0]);
      if (!pkg) return res.status(404).json({ message: "Bid package not found" });
      const bidList = await db.select().from(bids)
        .where(eq(bids.bidPackageId, bidPackageId))
        .orderBy(bids.totalAmount);
      const vendorIds = bidList.map(b => b.vendorId);
      let vendorMap = new Map<number, typeof vendors.$inferSelect>();
      if (vendorIds.length > 0) {
        const vendorList = await db.select().from(vendors)
          .where(eq(vendors.organizationId, ctx.project.organizationId));
        vendorMap = new Map(vendorList.map(v => [v.id, v]));
      }
      const allLineItems = await db.select().from(bidLineItems)
        .where(eq(bidLineItems.bidPackageId, bidPackageId));
      const lineItemsByBid = new Map<number, (typeof bidLineItems.$inferSelect)[]>();
      for (const li of allLineItems) {
        if (!lineItemsByBid.has(li.bidId)) lineItemsByBid.set(li.bidId, []);
        lineItemsByBid.get(li.bidId)!.push(li);
      }
      const enrichedBids = bidList.map(bid => ({
        ...bid,
        vendor: vendorMap.get(bid.vendorId) || null,
        lineItems: (lineItemsByBid.get(bid.id) || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      }));
      const allCategories = [...new Set(allLineItems.map(li => li.category).filter(Boolean))];
      res.json({
        bidPackage: pkg,
        bids: enrichedBids,
        categories: allCategories,
        summary: {
          totalBids: enrichedBids.length,
          lowestBid: enrichedBids.length > 0 ? Math.min(...enrichedBids.map(b => Number(b.totalAmount) || 0)) : null,
          highestBid: enrichedBids.length > 0 ? Math.max(...enrichedBids.map(b => Number(b.totalAmount) || 0)) : null,
          averageBid: enrichedBids.length > 0 ? enrichedBids.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0) / enrichedBids.length : null,
          recommendedBid: enrichedBids.find(b => b.isRecommended) || null,
        },
      });
    } catch (err: unknown) {
      console.error("Error fetching bid leveling:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });
}
