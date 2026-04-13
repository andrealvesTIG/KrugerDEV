import sharp from "sharp";
import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { drawingRevisions } from "@shared/schema";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const objectStorageClient = new Storage({
  apiEndpoint: "https://storage.googleapis.com",
  credentials: {
    client_email: "object_storage@replit.com",
    private_key: "replit_object_storage",
    type: "external_account",
    audience: "",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/object-storage/token`,
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/object-storage/token`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error("Invalid path");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  return dir;
}

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 300;

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/tiff",
]);

export async function generateThumbnailForRevision(
  revisionId: number,
  fileUrl: string,
  fileType: string | null
): Promise<void> {
  try {
    if (!fileType || !IMAGE_TYPES.has(fileType.toLowerCase())) {
      return;
    }

    let entityDir = getPrivateObjectDir();
    if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;

    let objectEntityPath: string;
    if (fileUrl.startsWith("/objects/")) {
      const parts = fileUrl.slice(1).split("/");
      const entityId = parts.slice(1).join("/");
      objectEntityPath = `${entityDir}${entityId}`;
    } else {
      return;
    }

    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const sourceFile = bucket.file(objectName);

    const [exists] = await sourceFile.exists();
    if (!exists) {
      console.log(`[thumbnail] Source file not found for revision ${revisionId}`);
      return;
    }

    const [sourceBuffer] = await sourceFile.download();

    const thumbnailBuffer = await sharp(sourceBuffer)
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const thumbId = randomUUID();
    const thumbObjectName = `${entityDir}thumbnails/${thumbId}.jpg`.replace(/^\//, "");
    const { bucketName: thumbBucket, objectName: thumbObjName } = parseObjectPath(`/${thumbObjectName}`);
    const thumbFile = objectStorageClient.bucket(thumbBucket).file(thumbObjName);

    await thumbFile.save(thumbnailBuffer, {
      metadata: { contentType: "image/jpeg" },
    });

    const thumbnailUrl = `/objects/thumbnails/${thumbId}.jpg`;

    await db.update(drawingRevisions)
      .set({ thumbnailUrl })
      .where(eq(drawingRevisions.id, revisionId));

    console.log(`[thumbnail] Generated thumbnail for revision ${revisionId}`);
  } catch (err) {
    console.error(`[thumbnail] Failed to generate thumbnail for revision ${revisionId}:`, err);
  }
}
