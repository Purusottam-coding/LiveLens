export interface Session {
  id: string;
  code: string;
  createdAt: string;
  status: 'waiting' | 'connected' | 'ended';
  /** Returned only to the projector (viewer) when the session is created */
  viewerToken?: string;
  /** Returned only to the phone when it joins */
  phoneToken?: string;
}

export type Role = 'broadcaster' | 'viewer';

export interface VideoTransform {
  rotation: number; // 0, 90, 180, 270
  mirrorX: boolean; // flip horizontal
  mirrorY: boolean; // flip vertical
}

export interface SignalPayload {
  sessionId: string;
  token: string;
  type: 'offer' | 'answer' | 'ice-candidate' | 'video-transform' | 'phone-paired' | 'stop-broadcast';
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit | VideoTransform | Record<string, unknown>;
}
