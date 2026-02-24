import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const ENCRYPTED_PREFIX = "enc:v1:";

let _cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (_cachedKey) return _cachedKey;
  
  const key = process.env.TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY or SESSION_SECRET must be set for token encryption"
    );
  }
  _cachedKey = crypto.createHash("sha256").update(key).digest();
  return _cachedKey;
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  
  return `${ENCRYPTED_PREFIX}${iv.toString("hex")}.${authTag.toString("hex")}.${encrypted}`;
}

export function decryptToken(ciphertext: string): string {
  if (!isEncryptedFormat(ciphertext)) {
    throw new Error("Value is not in encrypted format");
  }
  
  const key = getEncryptionKey();
  const payload = ciphertext.slice(ENCRYPTED_PREFIX.length);
  const parts = payload.split(".");
  
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token payload");
  }
  
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

export function isEncryptedFormat(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}
