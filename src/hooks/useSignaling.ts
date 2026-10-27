import { useEffect, useRef, useState, useCallback } from 'react';

export interface SignalingMessage<T = any> {
  type: string;
  payload?: T;
}

export function useSignaling(
  roomCode: string | null,
  onMessage?: (msg: SignalingMessage) => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const reconnectTimeoutRef = useRef<number | null>(null);

  const send = useCallback((type: string, payload: any = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('[Signaling] WebSocket is not open. Could not send:', type);
    }
  }, []);

  useEffect(() => {
    if (!roomCode) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    let isDisposed = false;

    function connect() {
      if (isDisposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/${roomCode}`;
      console.log(`[Signaling] Connecting to ${wsUrl}`);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isDisposed) {
          ws.close();
          return;
        }
        console.log('[Signaling] Connected to room:', roomCode);
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: SignalingMessage = JSON.parse(event.data);
          onMessageRef.current?.(data);
        } catch (err) {
          console.error('[Signaling] Failed to parse message:', event.data, err);
        }
      };

      ws.onerror = (err) => {
        console.warn('[Signaling] WebSocket error:', err);
      };

      ws.onclose = () => {
        console.log('[Signaling] WebSocket closed');
        setIsConnected(false);
        if (!isDisposed) {
          reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [roomCode]);

  return { isConnected, send };
}