import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function encryptionKey() {
  const text = process.env.TOTP_ENCRYPTION_KEY ?? '';
  if (!/^[a-f0-9]{64}$/i.test(text)) throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes in hex');
  return Buffer.from(text, 'hex');
}
export function encrypt(secret: string, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}
export function decrypt(value: string, userId: string) {
  const data = Buffer.from(value, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12));
  cipher.setAAD(Buffer.from(userId));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8');
}
