import { io, Socket } from 'socket.io-client';

export function getSocketUrl(): string {
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/$/, '');
  }
  return '';
}

// Module-level singleton so the socket connection persists cleanly across components and re-renders
let socketSingleton: Socket | null = null;
let currentSocketUrl: string = '';

export function getSocket(): Socket {
  const targetUrl = getSocketUrl();
  if (!socketSingleton || currentSocketUrl !== targetUrl) {
    if (socketSingleton) {
      socketSingleton.disconnect();
    }
    currentSocketUrl = targetUrl;
    socketSingleton = io(targetUrl, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: true,
    });

    socketSingleton.on('connect', () => {
      console.log(`[Socket] Connected to server: ${socketSingleton?.id}`);
    });

    socketSingleton.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${reason}`);
    });
  }
  return socketSingleton;
}

export function useSocket(): Socket {
  return getSocket();
}
