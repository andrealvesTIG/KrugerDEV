import path from "path";
import fs from "fs";
import { db } from "../db";
import { resources } from "@shared/schema";
import { eq } from "drizzle-orm";
import { bindObjectToOrganization } from "./objectAccess";

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const SAFE_OBJECT_PATH = /^\/objects\/[A-Za-z0-9._/-]+$/;
// Strict `<uuid>.<ext>` — must mirror the local-fallback pattern in
// server/replit_integrations/object_storage/routes.ts.
const SAFE_LOCAL_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9]{1,8}$/;

const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
};

export class CustomFieldValueError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

/**
 * Re-validate an attachment custom-field value on write. The client supplies
 * a serialized JSON blob with `{path,name,size,type}`. We must never trust
 * `size`/`type` from the client — recompute them from the underlying object
 * when possible. Also re-checks that `path` is shaped like a legal
 * `/objects/...` URL with no traversal sequences.
 *
 * Returns a re-serialized value (or `null` for an empty/cleared field). Does
 * not perform org-membership checks on the underlying object — the upstream
 * `/objects/...` route enforces those at fetch time.
 */
export async function validateAttachmentValue(raw: string | null | undefined, entityOrgId?: number | null): Promise<string | null> {
  if (raw == null || raw === "") return null;
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch {
    throw new CustomFieldValueError(400, "Attachment value must be JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new CustomFieldValueError(400, "Attachment value must be an object");
  }
  const p = parsed.path;
  if (typeof p !== "string" || !SAFE_OBJECT_PATH.test(p) || p.includes("..")) {
    throw new CustomFieldValueError(400, "Attachment path is not a valid /objects/ URL");
  }
  const name = typeof parsed.name === "string" && parsed.name.length > 0
    ? parsed.name
    : p.split("/").pop() || "file";

  // Recompute size/type from authoritative storage metadata rather than
  // trusting the client. Local-fallback files are stat'd from disk; cloud
  // objects are looked up via Replit Object Storage and their reported
  // size + contentType are used. Both paths fail closed if the file is
  // missing — we never persist a dangling reference.
  let size: number | undefined;
  let type: string | undefined;
  const localMatch = p.match(/^\/objects\/uploads\/([^/]+)$/);
  if (localMatch && SAFE_LOCAL_FILENAME.test(localMatch[1])) {
    const localPath = path.join(LOCAL_UPLOAD_DIR, localMatch[1]);
    try {
      const stat = fs.statSync(localPath);
      size = stat.size;
    } catch {
      throw new CustomFieldValueError(400, "Attachment file has not been uploaded yet");
    }
  } else {
    // Cloud-backed path. Resolve through ObjectStorageService — this both
    // confirms the object exists in storage AND lets us pull size +
    // contentType from its server-side metadata.
    try {
      const { ObjectStorageService } = await import("../replit_integrations/object_storage/objectStorage");
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(p);
      const [meta] = await file.getMetadata();
      if (meta?.size != null) {
        const s = typeof meta.size === "string" ? Number(meta.size) : (meta.size as number);
        if (Number.isFinite(s)) size = s;
      }
      if (typeof meta?.contentType === "string" && meta.contentType) {
        type = meta.contentType;
      }
    } catch (err) {
      // Either the object doesn't exist or storage is unreachable. Either
      // way we refuse to persist the attachment value — a saved row that
      // 404s on read is worse than a 400 here.
      throw new CustomFieldValueError(400, "Attachment object could not be verified in storage");
    }
  }
  const ext = path.extname(name || p).toLowerCase();
  if (!type && EXT_TO_MIME[ext]) type = EXT_TO_MIME[ext];
  return JSON.stringify({ path: p, name, ...(size !== undefined ? { size } : {}), ...(type ? { type } : {}) });
}

/**
 * Validate that a resource custom-field value (a numeric resource id) points
 * to a resource in the same organisation as the entity being edited. Rejects
 * cross-org references silently with a 400.
 */
export async function validateResourceValue(raw: string | null | undefined, entityOrgId: number | null): Promise<string | null> {
  if (raw == null || raw === "") return null;
  const idStr = String(raw).trim();
  if (!/^\d+$/.test(idStr)) {
    throw new CustomFieldValueError(400, "Resource value must be a numeric id");
  }
  const resourceId = Number(idStr);
  if (!entityOrgId) {
    throw new CustomFieldValueError(400, "Entity has no organization to validate against");
  }
  const [resource] = await db.select({ orgId: resources.organizationId }).from(resources).where(eq(resources.id, resourceId));
  if (!resource) {
    throw new CustomFieldValueError(400, "Referenced resource does not exist");
  }
  if (resource.orgId !== entityOrgId) {
    throw new CustomFieldValueError(403, "Cross-organisation resource reference is not allowed");
  }
  return idStr;
}

/**
 * Re-validate a single custom-field value based on the field definition's
 * type. For `attachment` fields, recomputes size/type from storage. For
 * `resource` fields, asserts the referenced resource lives in the same org
 * as the entity. Other field types pass through unchanged.
 */
// Field types whose values are always derived at read time and must never be
// persisted to the value tables. Writes to these fields are rejected with a
// 400. `autonumber` is intentionally NOT in this set — it is server-assigned,
// but the value IS stored in the value table by the auto-numbering pipeline.
const COMPUTED_READONLY_FIELD_TYPES = new Set([
  "days_since_updated",
  "days_since_created",
  "effort_completed_hours",
  "effort_remaining_hours",
  "days_between_dates",
  "roi",
  "rag_rollup",
  "threshold_check",
  "formula",
  "rollup",
]);

export async function validateCustomFieldValue(
  fieldType: string | null | undefined,
  rawValue: string | null | undefined,
  entityOrgId: number | null,
): Promise<string | null | undefined> {
  if (fieldType && COMPUTED_READONLY_FIELD_TYPES.has(fieldType)) {
    throw new CustomFieldValueError(
      400,
      `Computed field type "${fieldType}" is read-only and cannot be written`,
    );
  }
  if (fieldType === "attachment") {
    const out = await validateAttachmentValue(rawValue, entityOrgId);
    if (out && entityOrgId) {
      // Bind the object to the entity's organisation on first use, and
      // reject attempts to attach a file owned by a different tenant.
      const parsed = JSON.parse(out);
      if (parsed?.path) {
        const result = await bindObjectToOrganization(parsed.path, entityOrgId);
        if (!result.ok) {
          if (result.reason === "cross_org") {
            throw new CustomFieldValueError(403, "Cannot attach a file owned by another organisation");
          }
          if (result.reason === "missing") {
            // A new write must reference a known upload. Refusing here
            // forces every attachment to flow through /api/uploads/request-url
            // where ownership gets recorded.
            throw new CustomFieldValueError(400, "Attachment references an unknown object — re-upload the file");
          }
        }
      }
    }
    return out;
  }
  if (fieldType === "resource") return await validateResourceValue(rawValue, entityOrgId);
  return rawValue;
}
