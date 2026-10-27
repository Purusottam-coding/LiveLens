export type Role = 'broadcaster' | 'viewer';

export interface VideoTransform {
  rotation: number; // 0, 90, 180, 270
  mirrorX: boolean; // flip horizontal
  mirrorY: boolean; // flip vertical
  zoom?: number; // 1 to 5
}

export interface SignalingMessage<T = any> {
  type: string;
  payload?: T;
}