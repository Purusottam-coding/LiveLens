import { generateToken } from '../utils/generateCode';
import { pairingService } from './pairingService';
import type { Session } from '../types';

class SessionService {
  private sessions = new Map<string, Session>();
  private timers = new Map<string, NodeJS.Timeout>();

  public createSession(): Session {
    const code = pairingService.generateUniqueCode();
    const now = new Date();
    const session: Session = {
      id: crypto.randomUUID(),
      code,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      status: 'waiting',
      viewerToken: generateToken(),
      phoneToken: null,
      viewerSocketId: null,
      broadcasterSocketId: null,
    };

    this.sessions.set(session.id, session);

    // Also index by code for fast lookup during join
    this.sessions.set(code, session);

    // Schedule TTL cleanup
    const timer = pairingService.scheduleExpiry(session, () => this.removeSession(session.id));
    this.timers.set(session.id, timer);

    return session;
  }

  /** Join by code: assigns a phoneToken and returns the session. */
  public joinByCode(code: string): Session | null {
    const session = this.sessions.get(code);
    if (!session || session.status === 'ended') return null;

    if (!session.phoneToken) {
      session.phoneToken = generateToken();
    }
    session.status = 'connected';
    return session;
  }

  public getById(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  public getByCode(code: string): Session | undefined {
    return this.sessions.get(code);
  }

  public removeSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.status = 'ended';
    pairingService.revokeCode(session.code);
    this.sessions.delete(session.id);
    this.sessions.delete(session.code);
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  /** Validate that the given token matches either role for the session. */
  public validateToken(session: Session, token: string): 'viewer' | 'broadcaster' | null {
    if (session.viewerToken === token) return 'viewer';
    if (session.phoneToken === token) return 'broadcaster';
    return null;
  }
}

export const sessionService = new SessionService();
