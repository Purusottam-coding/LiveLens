import { Request, Response } from 'express';
import { sessionService } from '../services/sessionService';

export const sessionController = {
  /** POST /api/sessions — create a new session (called by projector). */
  create(req: Request, res: Response) {
    const session = sessionService.createSession();
    return res.status(201).json({
      success: true,
      session: {
        id: session.id,
        code: session.code,
        createdAt: session.createdAt,
        status: session.status,
        viewerToken: session.viewerToken, // only the viewer (projector) receives this
      },
    });
  },

  /** POST /api/sessions/join — join by pairing code (called by phone). */
  join(req: Request, res: Response) {
    const { code } = req.body as { code?: string };
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Invalid pairing code. Must be 6 digits.' });
    }

    const session = sessionService.joinByCode(code);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found or already ended.' });
    }

    return res.json({
      success: true,
      session: {
        id: session.id,
        code: session.code,
        status: session.status,
        phoneToken: session.phoneToken, // only the broadcaster (phone) receives this
      },
    });
  },

  /** DELETE /api/sessions/:id — end a session. */
  end(req: Request, res: Response) {
    const { id } = req.params;
    sessionService.removeSession(id);
    return res.json({ success: true });
  },
};