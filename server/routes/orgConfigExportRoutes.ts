import type { Express } from "express";
import multer from "multer";
import { storage } from "../storage";
import { getUserIdFromRequest, hasAdminAccess } from "./helpers";
import {
  exportOrganizationConfig,
  importOrganizationConfig,
  ImportBlockedError,
  getImportBlockers,
  ORG_CONFIG_SCHEMA_VERSION,
  type OrgConfigBundle,
} from "../storage/orgConfigExportStorage";

const jsonUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap on config bundles
});

async function ensureOrgAdmin(req: any, res: any, orgId: number): Promise<boolean> {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return false;
  }
  const user = await storage.getUser(userId);
  if (hasAdminAccess(user)) return true;
  const memberships = await storage.getUserOrganizations(userId);
  const role = memberships.find((m: any) => m.organizationId === orgId)?.role;
  if (role !== "org_admin" && role !== "owner") {
    res.status(403).json({ message: "Only organization admins can export/import configuration" });
    return false;
  }
  return true;
}

export function registerOrgConfigExportRoutes(app: Express): void {
  app.get("/api/organizations/:id/export-config", async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      if (!Number.isFinite(orgId)) return res.status(400).json({ message: "Invalid organization id" });
      if (!(await ensureOrgAdmin(req, res, orgId))) return;

      const bundle = await exportOrganizationConfig(orgId);
      const safeName = (bundle.sourceOrganizationName || "org").replace(/[^a-zA-Z0-9_-]+/g, "_").toLowerCase();
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}-config-${date}.json"`);
      res.send(JSON.stringify(bundle, null, 2));
    } catch (err: any) {
      console.error("Export org config failed:", err);
      res.status(500).json({ message: err?.message || "Failed to export configuration" });
    }
  });

  // Lightweight preflight so the UI can warn before the user clicks Import.
  app.get("/api/organizations/:id/import-config/blockers", async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      if (!Number.isFinite(orgId)) return res.status(400).json({ message: "Invalid organization id" });
      if (!(await ensureOrgAdmin(req, res, orgId))) return;
      const blockers = await getImportBlockers(orgId);
      res.json({ blockers, schemaVersion: ORG_CONFIG_SCHEMA_VERSION });
    } catch (err: any) {
      console.error("Preflight blockers failed:", err);
      res.status(500).json({ message: err?.message || "Failed to check import preconditions" });
    }
  });

  app.post(
    "/api/organizations/:id/import-config",
    jsonUpload.single("file"),
    async (req, res) => {
      try {
        const orgId = Number(req.params.id);
        if (!Number.isFinite(orgId)) return res.status(400).json({ message: "Invalid organization id" });
        if (!(await ensureOrgAdmin(req, res, orgId))) return;

        const force = String(req.query.force ?? req.body?.force ?? "").toLowerCase() === "true";

        let bundle: OrgConfigBundle | null = null;
        if (req.file?.buffer) {
          try { bundle = JSON.parse(req.file.buffer.toString("utf8")); }
          catch { return res.status(400).json({ message: "Uploaded file is not valid JSON" }); }
        } else if (req.body && typeof req.body === "object" && req.body.schemaVersion) {
          bundle = req.body as OrgConfigBundle;
        } else {
          return res.status(400).json({ message: "Missing config bundle (upload as 'file' multipart field or JSON body)" });
        }

        if (!bundle || !/^1\.\d+\.\d+$/.test(bundle.schemaVersion ?? "")) {
          return res.status(400).json({
            message: `Unsupported schema version "${bundle?.schemaVersion ?? "unknown"}" (expected 1.x)`,
          });
        }

        const result = await importOrganizationConfig(orgId, bundle, { force });
        res.json({
          message: "Configuration imported successfully",
          sourceOrganization: bundle.sourceOrganizationName,
          exportedAt: bundle.exportedAt,
          ...result,
        });
      } catch (err: any) {
        if (err instanceof ImportBlockedError) {
          return res.status(409).json({
            message: "Import blocked: target organization has data that references existing configuration",
            blockers: err.blockers,
            hint: "Re-run with force=true only if you understand that affected rows will fail or be orphaned.",
          });
        }
        console.error("Import org config failed:", err);
        res.status(500).json({ message: err?.message || "Failed to import configuration" });
      }
    },
  );
}
