import type { Session } from '@/types';

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/$/, '');
  }
  return '';
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const fullUrl = baseUrl ? `${baseUrl}${path}` : path;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12-second timeout

  try {
    const res = await fetch(fullUrl, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // response is not JSON (e.g. 404 HTML or empty)
    }

    if (!res.ok) {
      const errorMsg = json?.message || (res.status === 404 
        ? `Backend API not found (${res.status}) at ${fullUrl || window.location.origin + path}. Is backend running?`
        : `HTTP ${res.status}: ${text.slice(0, 100)}`);
      throw new Error(errorMsg);
    }

    if (!json) {
      throw new Error(`Server returned empty response from ${fullUrl || window.location.origin + path}`);
    }

    return json as T;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Connection timed out contacting backend at ${baseUrl || window.location.origin}.`);
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

/** Fetch session status by ID. */
export async function getSession(sessionId: string): Promise<Session> {
  const data = await apiFetch<{ success: boolean; session: Session }>(`/api/sessions/${sessionId}`, {
    method: 'GET',
  });
  return data.session;
}

/** End a session (called on unmount if needed). */
export async function endSession(sessionId: string): Promise<void> {
  await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
}
