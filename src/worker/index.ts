import { Hono } from 'hono';
import { DurableObject } from 'cloudflare:workers';

type Bindings = {
  SIGNALING_ROOM: DurableObjectNamespace<SignalingRoom>;
  ASSETS?: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

// Healthcheck REST endpoint
app.get('/api/health', (c) => c.json({ status: 'ok', service: 'livelens' }));

// Check if a room has an active projector screen open
app.get('/api/rooms/:roomCode/check', async (c) => {
  const roomCode = c.req.param('roomCode');
  if (!roomCode || roomCode.length !== 6) {
    return c.json({ exists: false, error: 'Invalid room code format' }, 400);
  }

  const id = c.env.SIGNALING_ROOM.idFromName(roomCode);
  const roomStub = c.env.SIGNALING_ROOM.get(id);
  const response = await roomStub.fetch(new Request('http://internal/check'));
  return response;
});

// WebSocket upgrade route for room pairing
app.get('/ws/:roomCode', async (c) => {
  const roomCode = c.req.param('roomCode');
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  const id = c.env.SIGNALING_ROOM.idFromName(roomCode);
  const roomStub = c.env.SIGNALING_ROOM.get(id);
  return roomStub.fetch(c.req.raw);
});

// Production SPA assets fallback
app.get('*', async (c) => {
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    if (res.status === 404) {
      // Rewrite request path to / to serve index.html for SPA client-side routes (e.g. /camera, /display)
      const url = new URL(c.req.url);
      return c.env.ASSETS.fetch(new Request(url.origin + '/'));
    }
    return res;
  }
  return c.text('Not found', 404);
});

export class SignalingRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // REST check endpoint to verify if viewer is active in room
    if (url.pathname === '/check') {
      const sockets = this.ctx.getWebSockets();
      // Room is active if there is at least one active socket (the viewer/projector)
      const exists = sockets.length > 0;
      return Response.json({
        exists,
        activePeers: sockets.length,
      });
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === 'string') {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
      } catch (e) {}
    }

    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== ws) {
        peer.send(message);
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    ws.close();
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== ws) {
        peer.send(JSON.stringify({ type: 'peer-disconnected' }));
      }
    }
  }
}

export default app;
