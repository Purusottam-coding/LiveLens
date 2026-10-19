import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export function getSocketUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const envUrl = import.meta.env.VITE_SOCKET_URL;
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl;
    }
    return `${protocol}//${hostname}:3001`;
  }
  return import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
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
