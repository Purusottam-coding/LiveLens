export interface Session {
  id: string;
  code: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'waiting' | 'connected' | 'ended';
  viewerToken: string;
  phoneToken: string | null;
  viewerSocketId: string | null;
  broadcasterSocketId: string | null;
}

export interface SignalPayload {
  sessionId: string;
  token: string;
  type: string;
  payload: unknown;
}
