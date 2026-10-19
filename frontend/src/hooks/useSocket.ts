import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export function getSocketUrl(): string {
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    return `${protocol}//${hostname}:3001`;
  }
  return 'http://localhost:3001';
}

// Module-level singleton map by URL so it survives component re-renders
let socketSingleton: Socket | null = null;
let currentSocketUrl: string = '';

function getSocket(): Socket {
  const targetUrl = getSocketUrl();
  if (!socketSingleton || currentSocketUrl !== targetUrl || !socketSingleton.connected) {
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
  }
  return socketSingleton;
}

export function useSocket(): Socket {
  const socketRef = useRef<Socket>(getSocket());

  useEffect(() => {
    // Keep socket alive across routes
  }, []);

  return socketRef.current;
}
