import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/*
 * File tokens. Anonymous users have no account, so each upload gets a token: whoever holds it can
 * read, download and delete that file, and nobody else can. Only a hash is stored, so a leaked
 * database can't be used to reach anyone's files.
 */

/** A new random token: 32 bytes, URL-safe. */
export function createFileToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What gets stored instead of the token. */
export function hashFileToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Whether `token` is the one `storedHash` was made from. Constant-time, so timing reveals nothing. */
export function fileTokenMatches(token: string | undefined, storedHash: string): boolean {
  if (!token || !storedHash) return false;
  const given = Buffer.from(hashFileToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return given.length === stored.length && timingSafeEqual(given, stored);
}
