import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * AES-256-GCM encryption for message content and files.
 *
 * Text format: "enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 * File format: [12 bytes IV][16 bytes AuthTag][...ciphertext...]
 *
 * The "enc:v1:" prefix allows detecting encrypted vs plain-text content
 * for backward compatibility with existing unencrypted messages.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16;
const PREFIX = 'enc:v1:';

let encryptionKey: Buffer | null = null;

/** Initialise encryption with a 64-char hex key (32 bytes). */
export function initEncryption(hexKey: string): void {
  if (!hexKey || hexKey.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  encryptionKey = Buffer.from(hexKey, 'hex');
}

/** Returns true if encryption is enabled (key configured). */
export function isEncryptionEnabled(): boolean {
  return encryptionKey !== null;
}

/** Encrypt a plain-text string. Returns the encrypted string or the original if encryption is disabled. */
export function encryptText(plaintext: string): string {
  if (!encryptionKey || !plaintext) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Decrypt an encrypted string. Returns the plain text, or the original string if it's not encrypted. */
export function decryptText(ciphertext: string): string {
  if (!ciphertext || !ciphertext.startsWith(PREFIX)) {
    // Not encrypted (legacy data or null) — return as-is
    return ciphertext;
  }
  if (!encryptionKey) {
    console.error('Cannot decrypt: ENCRYPTION_KEY not configured');
    return '[зашифровано]';
  }

  try {
    const payload = ciphertext.slice(PREFIX.length);
    const [ivHex, tagHex, dataHex] = payload.split(':');
    if (!ivHex || !tagHex || !dataHex) return '[повреждённые данные]';

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(dataHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    console.error('Decryption failed:', e);
    return '[ошибка расшифровки]';
  }
}

// ─── File encryption ─────────────────────────────────────────────────

const FILE_MAGIC = Buffer.from('VRTX'); // 4-byte magic header for encrypted files
const ENCRYPTED_HEADER_LENGTH = FILE_MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH; // 32 bytes

/**
 * Encrypt a file in-place on disk.
 * Format: [MAGIC 4B][IV 12B][AuthTag 16B][ciphertext...]
 */
export function encryptFileInPlace(filePath: string): void {
  if (!encryptionKey) return;

  const plainData = fs.readFileSync(filePath);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plainData), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Write: MAGIC + IV + AuthTag + Ciphertext
  const output = Buffer.concat([FILE_MAGIC, iv, authTag, encrypted]);
  fs.writeFileSync(filePath, output);
}

/**
 * Reliably check if a file was encrypted by us (magic bytes check).
 */
export function isFileEncrypted(filePath: string): boolean {
  if (!encryptionKey) return false;
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(FILE_MAGIC.length);
    const read = fs.readSync(fd, header, 0, FILE_MAGIC.length, 0);
    fs.closeSync(fd);
    return read === FILE_MAGIC.length && header.equals(FILE_MAGIC);
  } catch {
    return false;
  }
}

/**
 * Decrypt a file and return the plain-text Buffer.
 * Returns null if file is not encrypted or decryption fails.
 */
export function decryptFileToBuffer(filePath: string): Buffer | null {
  if (!encryptionKey) return null;

  try {
    const data = fs.readFileSync(filePath);
    if (data.length < ENCRYPTED_HEADER_LENGTH) return null;

    // Verify magic bytes
    if (!data.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)) return null;

    const iv = data.subarray(FILE_MAGIC.length, FILE_MAGIC.length + IV_LENGTH);
    const authTag = data.subarray(FILE_MAGIC.length + IV_LENGTH, ENCRYPTED_HEADER_LENGTH);
    const ciphertext = data.subarray(ENCRYPTED_HEADER_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Resolve a URL path like '/uploads/avatars/abc.jpg' to an absolute file path.
 */
export function resolveUploadPath(urlPath: string, uploadsRoot: string): string | null {
  if (!urlPath) return null;
  const filename = urlPath.replace(/^\/uploads\//, '');
  const filePath = path.resolve(uploadsRoot, filename);
  // Path containment check
  if (!filePath.startsWith(uploadsRoot)) return null;
  return filePath;
}
