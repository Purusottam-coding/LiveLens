import crypto from 'crypto';

/**
 * Generates a cryptographically random 6-digit numeric pairing code.
 * Uses crypto.randomInt for uniform distribution (no modulo bias).
 */
export function generatePairingCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generates a secure random token (hex string) for session authentication.
 */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
