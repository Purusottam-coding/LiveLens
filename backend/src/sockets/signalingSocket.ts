import { Server, Socket } from 'socket.io';
import { sessionService } from '../services/sessionService';
import type { SignalPayload } from '../types';

export function registerSignalingSocket(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // ── join-session ──────────────────────────────────────────────────────────
    socket.on(
      'join-session',
      async ({
        sessionId,
        token,
        role,
      }: {
        sessionId: string;
        token: string;
        role: 'broadcaster' | 'viewer';
      }) => {
        const session = sessionService.getById(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found.' });
          return;
        }

        const validRole = sessionService.validateToken(session, token);
        if (!validRole || validRole !== role) {
          socket.emit('error', { message: 'Invalid token or role mismatch.' });
          return;
        }

        // Record the socket ID for this role
        if (role === 'viewer') session.viewerSocketId = socket.id;
        if (role === 'broadcaster') session.broadcasterSocketId = socket.id;

        socket.join(sessionId);
        console.log(`[socket] ${socket.id} joined session ${sessionId} as ${role}`);

        // Notify the OTHER peer that this socket joined
        socket.to(sessionId).emit('peer-joined', { role });

        // Check how many sockets are already in the room (including this one)
        const roomSockets = await io.in(sessionId).fetchSockets();
        const othersInRoom = roomSockets.filter((s) => s.id !== socket.id);

        // If there are already other peers in the room, notify THIS socket too
        // so it knows the projector/phone is already waiting
        if (othersInRoom.length > 0) {
          const otherRole = role === 'broadcaster' ? 'viewer' : 'broadcaster';
          socket.emit('peer-joined', { role: otherRole });
          console.log(`[socket] Notifying ${socket.id} that ${otherRole} is already in room`);
        }
      }
    );

    // ── signal ───────────────────────────────────────────────────────────────
    socket.on('signal', ({ sessionId, token, type, payload }: SignalPayload) => {
      const session = sessionService.getById(sessionId);
      if (!session) return;

      const role = sessionService.validateToken(session, token);
      if (!role) {
        socket.emit('error', { message: 'Unauthorized signal.' });
        return;
      }

      // Relay the signal to the other peer in the room (not back to sender)
      socket.to(sessionId).emit('signal', { type, payload });
    });

    // ── disconnecting ────────────────────────────────────────────────────────
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          socket.to(room).emit('peer-left', { socketId: socket.id });
          console.log(`[socket] ${socket.id} left room ${room}`);
        }
      }
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
}
