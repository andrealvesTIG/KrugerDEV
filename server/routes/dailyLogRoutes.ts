import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNull, gte, lte, desc, sql } from "drizzle-orm";
import { dailyLogs, dailyLogLabor, dailyLogEquipment, projects } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  formatZodErrors,
  logUserActivity,
} from "./helpers";

const laborEntrySchema = z.object({
  company: z.string().max(500).nullable().optional(),
  trade: z.string().max(500).nullable().optional(),
  headcount: z.number().int().min(0).max(10000).default(0),
  hoursWorked: z.number().min(0).max(24).default(0),
  notes: z.string().max(2000).nullable().optional(),
}).strict();

const equipmentEntrySchema = z.object({
  equipmentName: z.string().min(1).max(500),
  quantity: z.number().int().min(1).max(10000).default(1),
  hoursUsed: z.number().min(0).max(24).default(0),
  status: z.enum(["Active", "Idle", "Maintenance", "Breakdown"]).default("Active"),
  notes: z.string().max(2000).nullable().optional(),
}).strict();

const createDailyLogSchema = z.object({
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weatherCondition: z.string().max(100).nullable().optional(),
  temperature: z.string().max(50).nullable().optional(),
  windSpeed: z.string().max(50).nullable().optional(),
  precipitation: z.string().max(100).nullable().optional(),
  visitors: z.string().max(5000).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  labor: z.array(laborEntrySchema).max(100).optional(),
  equipment: z.array(equipmentEntrySchema).max(100).optional(),
}).strict();

const updateDailyLogSchema = createDailyLogSchema.partial();

export function registerDailyLogRoutes(app: Express) {
  app.get("/api/projects/:projectId/daily-logs", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const fromDate = req.query.from as string | undefined;
      const toDate = req.query.to as string | undefined;

      let conditions = [
        eq(dailyLogs.projectId, projectId),
        isNull(dailyLogs.deletedAt),
      ];
      if (fromDate) conditions.push(gte(dailyLogs.logDate, fromDate));
      if (toDate) conditions.push(lte(dailyLogs.logDate, toDate));

      const logs = await db
        .select()
        .from(dailyLogs)
        .where(and(...conditions))
        .orderBy(desc(dailyLogs.logDate));

      res.json(logs);
    } catch (err) {
      console.error("Error fetching daily logs:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/daily-logs/summary", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const fromDate = req.query.from as string | undefined;
      const toDate = req.query.to as string | undefined;

      let logConditions = [
        eq(dailyLogs.projectId, projectId),
        isNull(dailyLogs.deletedAt),
      ];
      if (fromDate) logConditions.push(gte(dailyLogs.logDate, fromDate));
      if (toDate) logConditions.push(lte(dailyLogs.logDate, toDate));

      const logs = await db
        .select()
        .from(dailyLogs)
        .where(and(...logConditions));

      const logIds = logs.map(l => l.id);

      let totalLaborHeadcount = 0;
      let totalLaborHours = 0;
      let totalEquipmentCount = 0;
      let totalEquipmentHours = 0;

      if (logIds.length > 0) {
        for (const logId of logIds) {
          const laborEntries = await db.select().from(dailyLogLabor).where(eq(dailyLogLabor.dailyLogId, logId));
          for (const entry of laborEntries) {
            totalLaborHeadcount += entry.headcount || 0;
            totalLaborHours += Number(entry.hoursWorked) || 0;
          }

          const equipEntries = await db.select().from(dailyLogEquipment).where(eq(dailyLogEquipment.dailyLogId, logId));
          for (const entry of equipEntries) {
            totalEquipmentCount += entry.quantity || 0;
            totalEquipmentHours += Number(entry.hoursUsed) || 0;
          }
        }
      }

      res.json({
        totalDays: logs.length,
        totalLaborHeadcount,
        totalLaborHours,
        totalEquipmentCount,
        totalEquipmentHours,
      });
    } catch (err) {
      console.error("Error fetching daily log summary:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/daily-logs/:logId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const logId = Number(req.params.logId);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const log = await db
        .select()
        .from(dailyLogs)
        .where(and(eq(dailyLogs.id, logId), eq(dailyLogs.projectId, projectId), isNull(dailyLogs.deletedAt)))
        .then(r => r[0]);

      if (!log) return res.status(404).json({ message: "Daily log not found" });

      const [labor, equipment] = await Promise.all([
        db.select().from(dailyLogLabor).where(eq(dailyLogLabor.dailyLogId, logId)),
        db.select().from(dailyLogEquipment).where(eq(dailyLogEquipment.dailyLogId, logId)),
      ]);

      res.json({ ...log, labor, equipment });
    } catch (err) {
      console.error("Error fetching daily log:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post("/api/projects/:projectId/daily-logs", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parsed = createDailyLogSchema.parse(req.body);
      const { labor, equipment, ...logFields } = parsed;

      const result = await db.transaction(async (tx) => {
        const [log] = await tx.insert(dailyLogs).values({
          logDate: logFields.logDate,
          weatherCondition: logFields.weatherCondition || null,
          temperature: logFields.temperature || null,
          windSpeed: logFields.windSpeed || null,
          precipitation: logFields.precipitation || null,
          visitors: logFields.visitors || null,
          notes: logFields.notes || null,
          projectId,
          organizationId: project.organizationId,
          createdBy: userId,
        }).returning();

        if (labor && labor.length > 0) {
          for (const entry of labor) {
            await tx.insert(dailyLogLabor).values({
              dailyLogId: log.id,
              company: entry.company || null,
              trade: entry.trade || null,
              headcount: entry.headcount || 0,
              hoursWorked: entry.hoursWorked || 0,
              notes: entry.notes || null,
            });
          }
        }

        if (equipment && equipment.length > 0) {
          for (const entry of equipment) {
            await tx.insert(dailyLogEquipment).values({
              dailyLogId: log.id,
              equipmentName: entry.equipmentName,
              quantity: entry.quantity || 1,
              hoursUsed: entry.hoursUsed || 0,
              status: entry.status || "Active",
              notes: entry.notes || null,
            });
          }
        }

        const [laborEntries, equipEntries] = await Promise.all([
          tx.select().from(dailyLogLabor).where(eq(dailyLogLabor.dailyLogId, log.id)),
          tx.select().from(dailyLogEquipment).where(eq(dailyLogEquipment.dailyLogId, log.id)),
        ]);

        return { ...log, labor: laborEntries, equipment: equipEntries };
      });

      logUserActivity(userId, "create_daily_log", "daily_log", result.id, { projectId, logDate: result.logDate }, req);

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      console.error("Error creating daily log:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create daily log" : classified.message });
    }
  });

  app.patch("/api/projects/:projectId/daily-logs/:logId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const logId = Number(req.params.logId);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existing = await db
        .select()
        .from(dailyLogs)
        .where(and(eq(dailyLogs.id, logId), eq(dailyLogs.projectId, projectId), isNull(dailyLogs.deletedAt)))
        .then(r => r[0]);

      if (!existing) return res.status(404).json({ message: "Daily log not found" });

      const parsed = updateDailyLogSchema.parse(req.body);
      const { labor, equipment, ...logFields } = parsed;

      const result = await db.transaction(async (tx) => {
        const updateData: Partial<typeof dailyLogs.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
        if (logFields.logDate !== undefined) updateData.logDate = logFields.logDate;
        if (logFields.weatherCondition !== undefined) updateData.weatherCondition = logFields.weatherCondition || null;
        if (logFields.temperature !== undefined) updateData.temperature = logFields.temperature || null;
        if (logFields.windSpeed !== undefined) updateData.windSpeed = logFields.windSpeed || null;
        if (logFields.precipitation !== undefined) updateData.precipitation = logFields.precipitation || null;
        if (logFields.visitors !== undefined) updateData.visitors = logFields.visitors || null;
        if (logFields.notes !== undefined) updateData.notes = logFields.notes || null;

        const [updated] = await tx
          .update(dailyLogs)
          .set(updateData)
          .where(and(eq(dailyLogs.id, logId), eq(dailyLogs.projectId, projectId), isNull(dailyLogs.deletedAt)))
          .returning();

        if (!updated) throw new Error("Daily log not found during update");

        if (labor !== undefined) {
          await tx.delete(dailyLogLabor).where(eq(dailyLogLabor.dailyLogId, logId));
          for (const entry of labor) {
            await tx.insert(dailyLogLabor).values({
              dailyLogId: logId,
              company: entry.company || null,
              trade: entry.trade || null,
              headcount: entry.headcount || 0,
              hoursWorked: entry.hoursWorked || 0,
              notes: entry.notes || null,
            });
          }
        }

        if (equipment !== undefined) {
          await tx.delete(dailyLogEquipment).where(eq(dailyLogEquipment.dailyLogId, logId));
          for (const entry of equipment) {
            await tx.insert(dailyLogEquipment).values({
              dailyLogId: logId,
              equipmentName: entry.equipmentName,
              quantity: entry.quantity || 1,
              hoursUsed: entry.hoursUsed || 0,
              status: entry.status || "Active",
              notes: entry.notes || null,
            });
          }
        }

        const [laborEntries, equipEntries] = await Promise.all([
          tx.select().from(dailyLogLabor).where(eq(dailyLogLabor.dailyLogId, logId)),
          tx.select().from(dailyLogEquipment).where(eq(dailyLogEquipment.dailyLogId, logId)),
        ]);

        return { ...updated, labor: laborEntries, equipment: equipEntries };
      });

      logUserActivity(userId, "update_daily_log", "daily_log", logId, { projectId, logDate: result.logDate }, req);

      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      console.error("Error updating daily log:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to update daily log" : classified.message });
    }
  });

  app.delete("/api/projects/:projectId/daily-logs/:logId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const logId = Number(req.params.logId);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existing = await db
        .select()
        .from(dailyLogs)
        .where(and(eq(dailyLogs.id, logId), eq(dailyLogs.projectId, projectId), isNull(dailyLogs.deletedAt)))
        .then(r => r[0]);

      if (!existing) return res.status(404).json({ message: "Daily log not found" });

      await db
        .update(dailyLogs)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(eq(dailyLogs.id, logId));

      logUserActivity(userId, "delete_daily_log", "daily_log", logId, { projectId, logDate: existing.logDate }, req);

      res.json({ message: "Daily log deleted" });
    } catch (err) {
      console.error("Error deleting daily log:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });
}
