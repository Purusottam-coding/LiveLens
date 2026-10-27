import { Hono } from 'hono';
import { DurableObject } from 'cloudflare:workers';

type Bindings = {
  SIGNALING_ROOM: DurableObjectNamespace<SignalingRoom>;
};

const app = new Hono<{ Bindings: Bindings }>();

// Healthcheck REST endpoint
app.get('/api/health', (c) => c.json({ status: 'ok', service: 'livelens' }));

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

export class SignalingRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
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