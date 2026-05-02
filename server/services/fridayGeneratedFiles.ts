import { randomUUID } from "node:crypto";

export interface GeneratedFile {
  id: string;
  userId: string;
  orgId: number;
  filename: string;
  contentType: string;
  buffer: Buffer;
  createdAt: number;
}

const TTL_MS = 60 * 60 * 1000;
const MAX_FILES = 200;

const store = new Map<string, GeneratedFile>();

function evictExpired() {
  const now = Date.now();
  for (const [id, f] of store) {
    if (now - f.createdAt > TTL_MS) store.delete(id);
  }
  if (store.size > MAX_FILES) {
    const sorted = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const overflow = sorted.length - MAX_FILES;
    for (let i = 0; i < overflow; i++) store.delete(sorted[i][0]);
  }
}

export function storeGeneratedFile(
  userId: string,
  orgId: number,
  filename: string,
  contentType: string,
  buffer: Buffer,
): GeneratedFile {
  evictExpired();
  const id = randomUUID();
  const file: GeneratedFile = {
    id,
    userId,
    orgId,
    filename,
    contentType,
    buffer,
    createdAt: Date.now(),
  };
  store.set(id, file);
  return file;
}

export function getGeneratedFile(id: string): GeneratedFile | undefined {
  evictExpired();
  return store.get(id);
}

export function getGeneratedFileForUser(
  id: string,
  userId: string,
  orgId: number,
): GeneratedFile | undefined {
  const file = getGeneratedFile(id);
  if (!file) return undefined;
  if (file.userId !== userId || file.orgId !== orgId) return undefined;
  return file;
}
