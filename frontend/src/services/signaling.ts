import { io, Socket } from 'socket.io-client';

export class SignalingClient {
  private socket: Socket;

  constructor(
    private sessionId: string,
    private role: 'broadcaster' | 'viewer',
    url: string = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'
  ) {
    this.socket = io(url);
    this.init();
  }

  private init() {
    this.socket.emit('join-session', { sessionId: this.sessionId, role: this.role });
  }

  public onSignal(callback: (data: unknown) => void) {
    this.socket.on('signal', callback);
  }

  public sendSignal(data: unknown) {
    this.socket.emit('signal', { sessionId: this.sessionId, data });
  }

  public disconnect() {
    this.socket.disconnect();
  }
}
