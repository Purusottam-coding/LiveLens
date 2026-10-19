import type { Session } from '@/types';

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
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

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12-second timeout

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || `HTTP ${res.status}`);
    }
    return json as T;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Connection timed out contacting backend at ${baseUrl}. Backend might be asleep or unreachable.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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
