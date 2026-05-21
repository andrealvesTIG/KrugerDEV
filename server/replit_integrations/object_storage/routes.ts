import type { Express } from "express";
import express from "express";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { RequestHandler } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { getUserIdFromRequest } from "../../routes/helpers";
import { recordObjectUpload, canUserAccessObject } from "../../lib/objectAccess";

// Unified auth check that works for both Replit OIDC and email/password
// sessions. The OIDC-only `isAuthenticated` middleware in replitAuth.ts
// rejects email-auth users (they don't have OIDC tokens), which broke uploads
// for everyone signed in via email/password.
const isAuthenticated: RequestHandler = (req, res, next) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  next();
};

// Check if error is a persistent auth/permission issue
function isAuthError(error: any): boolean {
  return (
    error?.status === 401 ||
    error?.status === 403 ||
    error?.response?.status === 401 ||
    error?.response?.status === 403 ||
    error?.message?.includes('no allowed resources') ||
    error?.message?.includes('Unauthorized')
  );
}

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
// Local-fallback filenames are server-generated (uuid + safe extension). The
// regex must reject `..`, leading dots, slashes, NUL etc. so it can never be
// used to escape LOCAL_UPLOAD_DIR.
// Strict shape: `<uuid>.<ext>` only. The fallback generates names via
// `randomUUID()` + a sanitised extension, so any deviation from this pattern
// indicates a client-supplied path we should refuse.
const SAFE_LOCAL_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9]{1,8}$/;

// Extensions allowed on upload. Anything that can execute in a browser
// context (`html`, `svg`, `xhtml`, scripts) is rejected here — and forced to
// `Content-Disposition: attachment` on the off chance one slips through.
const UPLOAD_EXTENSION_ALLOWLIST = new Set([
  '.png','.jpg','.jpeg','.gif','.webp','.bmp','.ico','.tiff',
  '.pdf','.txt','.csv','.json','.md','.log','.rtf',
  '.doc','.docx','.xls','.xlsx','.ppt','.pptx','.odt','.ods','.odp',
  '.zip','.tar','.gz','.7z',
  '.mp3','.wav','.ogg','.mp4','.webm','.mov','.m4a',
  '.mpp','.xer','.xml','.yaml','.yml',
]);

// MIME types that the browser will happily execute against our origin. We
// either reject them at upload time or, when serving, force a download
// disposition plus a restrictive CSP so they cannot run.
const EXECUTABLE_EXTENSIONS = new Set([
  '.html','.htm','.xhtml','.svg','.js','.mjs','.cjs','.css','.wasm','.xsl','.xslt',
]);
const EXECUTABLE_MIMES = new Set([
  'text/html','application/xhtml+xml','image/svg+xml',
  'application/javascript','text/javascript','application/ecmascript','text/css','application/wasm',
]);

function isExecutablePath(p: string): boolean {
  const ext = path.extname(p).toLowerCase();
  return EXECUTABLE_EXTENSIONS.has(ext);
}

function ensureLocalUploadDir(): void {
  if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  }
}

function sanitizeExtension(name: unknown): string {
  if (typeof name !== 'string') return '';
  const ext = path.extname(name).toLowerCase();
  return /^\.[A-Za-z0-9]{1,8}$/.test(ext) ? ext : '';
}

/**
 * Reject path-traversal sequences and other obvious attacks. Returns the
 * normalised path or null if it should not be served. Accepts only paths
 * that begin with `/objects/` and contain a restricted character set.
 */
function safeObjectPath(rawPath: string): string | null {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return null;
  if (rawPath.indexOf('\0') !== -1) return null;
  if (!rawPath.startsWith('/objects/')) return null;
  // Disallow `..`, backslashes, double-slash, leading slash inside segments.
  if (rawPath.includes('..')) return null;
  if (rawPath.includes('\\')) return null;
  if (rawPath.includes('//')) return null;
  // Allow only a safe set of URL-path characters.
  if (!/^\/objects\/[A-Za-z0-9._/-]+$/.test(rawPath)) return null;
  return rawPath;
}

/**
 * Register object storage routes for file uploads.
 *
 * This provides example routes for the presigned URL upload flow:
 * 1. POST /api/uploads/request-url - Get a presigned URL for uploading
 * 2. The client then uploads directly to the presigned URL
 *
 * IMPORTANT: These are example routes. Customize based on your use case:
 * - Add authentication middleware for protected uploads
 * - Add file metadata storage (save to database after upload)
 * - Add ACL policies for access control
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "https://storage.googleapis.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file directly to uploadURL.
   *
   * If object storage is unavailable in this environment, falls back to a
   * same-origin local upload endpoint that writes to public/uploads/.
   */
  app.post("/api/uploads/request-url", isAuthenticated, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const { name, size, contentType, allowExecutable } = req.body || {};

    if (!name) {
      return res.status(400).json({
        error: "Missing required field: name",
      });
    }

    // Reject executable MIME types / extensions. The `allowExecutable`
    // escape hatch is restricted to platform super_admins so a regular
    // tenant user can't bypass the block by flipping a boolean in the
    // request body. Anything that gets through still gets a forced
    // download disposition + sandbox CSP on serve.
    const ext = path.extname(String(name)).toLowerCase();
    const mime = typeof contentType === "string" ? contentType.toLowerCase() : "";
    const isExecutable = EXECUTABLE_EXTENSIONS.has(ext) || EXECUTABLE_MIMES.has(mime);
    let executableOptIn = false;
    if (isExecutable && allowExecutable) {
      try {
        const { db } = await import("../../db");
        const { users } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
        executableOptIn = u?.role === "super_admin";
      } catch { executableOptIn = false; }
    }
    if (isExecutable && !executableOptIn) {
      return res.status(400).json({
        error: "Executable file types (.html, .svg, .xhtml, scripts) are not allowed",
      });
    }
    // Allowlist-gate non-empty extensions. Files with no extension are
    // permitted because some legitimate uploads (binary blobs, e.g. .mpp
    // exports) come through without one and the upstream code paths
    // already restrict by content type.
    if (ext && !UPLOAD_EXTENSION_ALLOWLIST.has(ext) && !isExecutable) {
      return res.status(400).json({ error: `File extension ${ext} is not allowed` });
    }

    // Optional client-supplied org binding. We can't always know which org
    // the upload is for at request time, so we accept `orgId` as a hint and
    // verify membership before recording it. Without it the row is stored
    // with a null org and gets stamped on first attachment-bind.
    const reqOrgId = typeof (req.body || {}).orgId === "number" ? (req.body as any).orgId : null;
    let boundOrgId: number | null = null;
    if (reqOrgId !== null) {
      const { enforceMembership } = await import("../../services/authorizationService");
      if (await enforceMembership(req, res, userId, reqOrgId)) return;
      boundOrgId = reqOrgId;
    }

    let uploadURL: string;
    let objectPath: string;
    try {
      uploadURL = await objectStorageService.getObjectEntityUploadURL();
      objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    } catch (error) {
      // Object storage unavailable in this environment — fall back to local disk.
      console.warn(
        "Object storage unavailable for upload, using local storage fallback:",
        (error as Error)?.message
      );
      try {
        ensureLocalUploadDir();
        const filename = `${randomUUID()}${sanitizeExtension(name)}`;
        uploadURL = `/api/uploads/local/${filename}`;
        objectPath = `/objects/uploads/${filename}`;
      } catch (fallbackErr) {
        console.error("Error generating local upload URL:", fallbackErr);
        return res.status(500).json({ error: "Failed to generate upload URL" });
      }
    }
    // Persist ownership BEFORE returning the URL. If this throws the upload
    // is refused — otherwise we'd hand the caller a path that
    // `canUserAccessObject` will deny-by-default for everyone (no metadata
    // row means no readable file).
    try {
      await recordObjectUpload({ objectPath, uploadedBy: userId, organizationId: boundOrgId });
    } catch (recordErr) {
      console.error("Error recording object upload metadata:", recordErr);
      return res.status(500).json({ error: "Failed to record upload metadata" });
    }
    return res.json({
      uploadURL,
      objectPath,
      metadata: { name, size, contentType },
    });
  });

  /**
   * Receive a file uploaded via the local-storage fallback PUT URL.
   * The client PUTs the raw file body here; we write it to public/uploads/.
   */
  app.put(
    "/api/uploads/local/:filename",
    isAuthenticated,
    express.raw({ type: "*/*", limit: "25mb" }),
    async (req, res) => {
      try {
        const userId = getUserIdFromRequest(req);
        if (!userId) return res.status(401).json({ error: "Authentication required" });
        const { filename } = req.params;
        if (!SAFE_LOCAL_FILENAME.test(filename) || filename.includes("..")) {
          return res.status(400).json({ error: "Invalid filename" });
        }
        const body = req.body as Buffer | undefined;
        if (!body || !Buffer.isBuffer(body) || body.length === 0) {
          return res.status(400).json({ error: "Empty upload body" });
        }
        ensureLocalUploadDir();
        const filePath = path.join(LOCAL_UPLOAD_DIR, filename);
        fs.writeFileSync(filePath, body);
        return res.status(200).json({ ok: true });
      } catch (error) {
        console.error("Error writing local upload:", error);
        return res.status(500).json({ error: "Failed to store upload" });
      }
    }
  );

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * Tries object storage first, then falls back to the local upload directory
   * (used when object storage is unavailable in this environment).
   */
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req, res) => {
    // Reject path traversal / NUL / backslash / `..` before doing any IO.
    if (!safeObjectPath(req.path)) {
      return res.status(400).json({ error: "Invalid object path" });
    }

    // Tenant-scoped access control. If we recorded ownership for this
    // object, only the uploader or members of the bound organisation may
    // read it. Legacy (unrecorded) uploads remain readable by any
    // authenticated caller so pre-existing attachments don't break.
    const callerId = getUserIdFromRequest(req);
    if (!callerId) return res.status(401).json({ error: "Authentication required" });
    if (!(await canUserAccessObject(callerId, req.path))) {
      return res.status(403).json({ error: "Access denied to this object" });
    }

    // Force a download disposition + restrictive CSP whenever the served
    // path looks executable. This stops a stored HTML/SVG/JS file from
    // running scripts against our own origin even if it makes it through
    // the upload allow-list.
    const harden = () => {
      if (isExecutablePath(req.path)) {
        const filename = req.path.split("/").pop() || "file";
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
        res.setHeader("X-Content-Type-Options", "nosniff");
      }
    };

    const tryServeLocal = (): boolean => {
      // Only the /objects/uploads/<file> shape is backed by the local fallback.
      const m = req.path.match(/^\/objects\/uploads\/([^/]+)$/);
      if (!m) return false;
      const filename = m[1];
      if (!SAFE_LOCAL_FILENAME.test(filename) || filename.includes("..")) return false;
      // Final containment check — resolve the joined path and make sure it
      // still lives under LOCAL_UPLOAD_DIR.
      const filePath = path.join(LOCAL_UPLOAD_DIR, filename);
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(LOCAL_UPLOAD_DIR) + path.sep)) return false;
      if (!fs.existsSync(resolved)) return false;
      harden();
      res.sendFile(resolved);
      return true;
    };

    harden();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      // Auth errors indicate storage is not accessible — try local fallback first.
      if (isAuthError(error)) {
        if (tryServeLocal()) return;
        console.warn("[ObjectStorage] Auth error accessing object:", req.path);
        return res.status(503).json({
          error: "Object storage temporarily unavailable",
          message: "The storage service is not accessible in this environment"
        });
      }

      if (error instanceof ObjectNotFoundError) {
        if (tryServeLocal()) return;
        return res.status(404).json({ error: "Object not found" });
      }

      if (tryServeLocal()) return;
      console.error("Error serving object:", error);
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}
