import { createHash, timingSafeEqual } from 'node:crypto';

const MIN_ADMIN_TOKEN_LENGTH = 32;

export function isAdminTokenConfigured(token: string | null | undefined): boolean {
  return Boolean(token && token.length >= MIN_ADMIN_TOKEN_LENGTH);
}

export function verifyAdminAuthorization(
  authorizationHeader: string | undefined,
  expectedToken: string | null | undefined,
): boolean {
  if (!isAdminTokenConfigured(expectedToken) || !authorizationHeader) return false;

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorizationHeader.trim());
  if (!match) return false;

  const expectedHash = createHash('sha256').update(expectedToken, 'utf8').digest();
  const suppliedHash = createHash('sha256').update(match[1], 'utf8').digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}
