import type { Express } from "express";
import express from "express";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { RequestHandler } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { getUserIdFromRequest } from "../../routes/helpers";

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
// Allow only safe filenames the server itself generated (uuid + optional extension)
const SAFE_LOCAL_FILENAME = /^[A-Za-z0-9._-]+$/;

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

    const { name, size, contentType } = req.body || {};

    if (!name) {
      return res.status(400).json({
        error: "Missing required field: name",
      });
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      return res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      // Object storage unavailable in this environment — fall back to local disk.
      console.warn(
        "Object storage unavailable for upload, using local storage fallback:",
        (error as Error)?.message
      );
      try {
        ensureLocalUploadDir();
        const filename = `${randomUUID()}${sanitizeExtension(name)}`;
        const uploadURL = `/api/uploads/local/${filename}`;
        const objectPath = `/objects/uploads/${filename}`;
        return res.json({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        });
      } catch (fallbackErr) {
        console.error("Error generating local upload URL:", fallbackErr);
        return res.status(500).json({ error: "Failed to generate upload URL" });
      }
    }
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
  app.get("/objects/:objectPath(*)", async (req, res) => {
    const tryServeLocal = (): boolean => {
      // Only the /objects/uploads/<file> shape is backed by the local fallback.
      const m = req.path.match(/^\/objects\/uploads\/([^/]+)$/);
      if (!m) return false;
      const filename = m[1];
      if (!SAFE_LOCAL_FILENAME.test(filename) || filename.includes("..")) return false;
      const filePath = path.join(LOCAL_UPLOAD_DIR, filename);
      if (!fs.existsSync(filePath)) return false;
      res.sendFile(filePath);
      return true;
    };

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
