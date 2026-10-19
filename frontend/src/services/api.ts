import type { Session } from '@/types';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const envUrl = import.meta.env.VITE_API_URL;
    // If accessing from another device (like 192.168.x.x), use that host on port 3001
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl;
    }
    return `${protocol}//${hostname}:3001`;
  }
  return import.meta.env.VITE_API_URL || 'http://localhost:3001';
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || `HTTP ${res.status}`);
  }
  return json as T;
}

/** Called by DisplayPage: creates a new session and returns it (with viewerToken). */
export async function createSession(): Promise<Session> {
  const data = await apiFetch<{ success: boolean; session: Session }>('/api/sessions', {
    method: 'POST',
  });
  return data.session;
}

/** Called by CameraPage: joins an existing session by pairing code, returns session (with phoneToken). */
export async function joinSession(code: string): Promise<Session> {
  const data = await apiFetch<{ success: boolean; session: Session }>('/api/sessions/join', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  return data.session;
}

/** End a session (called on unmount if needed). */
export async function endSession(sessionId: string): Promise<void> {
  await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
}
