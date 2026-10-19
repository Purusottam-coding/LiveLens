import { generatePairingCode } from '../utils/generateCode';
import type { Session } from '../types';

const ACTIVE_CODES = new Set<string>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class PairingService {
  /** Create a unique pairing code and reserve it. */
  public generateUniqueCode(): string {
    let code: string;
    let attempts = 0;
    do {
      code = generatePairingCode();
      if (++attempts > 100) throw new Error('Could not generate unique code');
    } while (ACTIVE_CODES.has(code));

    ACTIVE_CODES.add(code);
    return code;
  }

  /** Revoke a code when a session ends or expires. */
  public revokeCode(code: string): void {
    ACTIVE_CODES.delete(code);
  }

  /** Schedule automatic code revocation after TTL. */
  public scheduleExpiry(session: Session, onExpire: () => void): NodeJS.Timeout {
    return setTimeout(onExpire, SESSION_TTL_MS);
  }
}

export const pairingService = new PairingService();
