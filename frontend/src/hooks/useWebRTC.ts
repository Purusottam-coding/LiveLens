import { useEffect, useRef, useCallback, RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import type { Session, VideoTransform } from '@/types';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

interface UseWebRTCOptions {
  role: 'broadcaster' | 'viewer';
  session: Session | null;
  socket: Socket;
  localStream?: MediaStream;
  remoteVideoRef?: RefObject<HTMLVideoElement | null>;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onPeerJoined?: (peerRole: string) => void;
  onVideoTransform?: (transform: VideoTransform) => void;
  onPhonePaired?: () => void;
  onBroadcastStopped?: () => void;
}

export function useWebRTC({
  role,
  session,
  socket,
  localStream,
  remoteVideoRef,
  onConnected,
  onDisconnected,
  onPeerJoined,
  onVideoTransform,
  onPhonePaired,
  onBroadcastStopped,
}: UseWebRTCOptions) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  // Track whether we have already set up tracks + sent the first offer
  const offeredRef = useRef(false);

  // Keep latest callbacks in refs so closures always see current values
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onPeerJoinedRef = useRef(onPeerJoined);
  const onVideoTransformRef = useRef(onVideoTransform);
  const onPhonePairedRef = useRef(onPhonePaired);
  const onBroadcastStoppedRef = useRef(onBroadcastStopped);

  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;
  onPeerJoinedRef.current = onPeerJoined;
  onVideoTransformRef.current = onVideoTransform;
  onPhonePairedRef.current = onPhonePaired;
  onBroadcastStoppedRef.current = onBroadcastStopped;

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    iceCandidateQueue.current = [];
    offeredRef.current = false;
  }, []);

  const flushIceCandidates = useCallback(async () => {
    while (iceCandidateQueue.current.length > 0) {
      const cand = iceCandidateQueue.current.shift();
      if (cand && pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
      }
    }
  }, []);

  // ── Send offer helper ────────────────────────────────────────────────────
  const sendOffer = useCallback(
    (pc: RTCPeerConnection) => {
      if (!session) return;
      pc.createOffer({ offerToReceiveVideo: false, offerToReceiveAudio: false })
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          console.log('[WebRTC] ▶ Sending offer');
          socket.emit('signal', {
            sessionId: session.id,
            token: session.phoneToken,
            type: 'offer',
            payload: pc.localDescription,
          });
        })
        .catch(console.error);
    },
    [session, socket]
  );

  // ── Send video transform (rotate/mirror) ──────────────────────────────────
  const sendVideoTransform = useCallback(
    (transform: VideoTransform) => {
      if (!session) return;
      socket.emit('signal', {
        sessionId: session.id,
        token: role === 'broadcaster' ? session.phoneToken : session.viewerToken,
        type: 'video-transform',
        payload: transform,
      });
    },
    [session, socket, role]
  );

  // ── Send phone paired notification ───────────────────────────────────────
  const sendPhonePaired = useCallback(() => {
    if (!session) return;
    socket.emit('signal', {
      sessionId: session.id,
      token: role === 'broadcaster' ? session.phoneToken : session.viewerToken,
      type: 'phone-paired',
      payload: {},
    });
  }, [session, socket, role]);

  // ── Send stop broadcast notification ─────────────────────────────────────
  const sendStopBroadcast = useCallback(() => {
    if (!session) return;
    socket.emit('signal', {
      sessionId: session.id,
      token: role === 'broadcaster' ? session.phoneToken : session.viewerToken,
      type: 'stop-broadcast',
      payload: {},
    });
  }, [session, socket, role]);

  // ─────────────────────────────────────────────────────────────────────────
  // EFFECT 1 — build peer connection when session id / socket changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session || !socket) return;

    cleanup();

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] connectionState → ${pc.connectionState}`);
      if (pc.connectionState === 'connected') onConnectedRef.current?.();
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed')
        onDisconnectedRef.current?.();
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] iceState → ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')
        onConnectedRef.current?.();
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')
        onDisconnectedRef.current?.();
    };

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      socket.emit('signal', {
        sessionId: session.id,
        token: role === 'broadcaster' ? session.phoneToken : session.viewerToken,
        type: 'ice-candidate',
        payload: candidate,
      });
    };

    // ── Viewer: receive remote tracks ──
    if (role === 'viewer') {
      pc.ontrack = (event) => {
        console.log('[WebRTC] ▶ Remote track received', event.streams);
        if (remoteVideoRef?.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.play().catch(console.warn);
        }
      };
    }

    // ── Signal handler ──
    const onSignal = async (data: {
      type: 'offer' | 'answer' | 'ice-candidate' | 'video-transform' | 'phone-paired' | 'stop-broadcast';
      payload: RTCSessionDescriptionInit | RTCIceCandidateInit | VideoTransform | Record<string, unknown>;
    }) => {
      const p = pcRef.current;

      try {
        if (data.type === 'stop-broadcast') {
          console.log('[WebRTC] ◀ Received stop-broadcast from peer');
          if (role === 'viewer' && remoteVideoRef?.current) {
            remoteVideoRef.current.srcObject = null;
          }
          onBroadcastStoppedRef.current?.();
          return;
        }

        if (data.type === 'phone-paired') {
          console.log('[WebRTC] ◀ Received phone-paired');
          onPhonePairedRef.current?.();
          return;
        }

        if (data.type === 'video-transform') {
          console.log('[WebRTC] ◀ Received video-transform', data.payload);
          onVideoTransformRef.current?.(data.payload as VideoTransform);
          return;
        }

        if (!p) return;

        if (data.type === 'offer') {
          console.log('[WebRTC] ◀ Received offer → creating answer');
          await p.setRemoteDescription(
            new RTCSessionDescription(data.payload as RTCSessionDescriptionInit)
          );
          await flushIceCandidates();
          const answer = await p.createAnswer();
          await p.setLocalDescription(answer);
          socket.emit('signal', {
            sessionId: session.id,
            token: session.viewerToken,
            type: 'answer',
            payload: p.localDescription,
          });
        } else if (data.type === 'answer') {
          console.log('[WebRTC] ◀ Received answer');
          await p.setRemoteDescription(
            new RTCSessionDescription(data.payload as RTCSessionDescriptionInit)
          );
          await flushIceCandidates();
        } else if (data.type === 'ice-candidate') {
          if (p.remoteDescription?.type) {
            await p.addIceCandidate(new RTCIceCandidate(data.payload as RTCIceCandidateInit))
              .catch(console.warn);
          } else {
            iceCandidateQueue.current.push(data.payload as RTCIceCandidateInit);
          }
        }
      } catch (err) {
        console.warn('[WebRTC] signal error', err);
      }
    };

    // ── peer-joined: viewer has arrived → broadcaster re-sends offer if stream ready ──
    const onPeerJoinedHandler = (data: { role: string }) => {
      console.log('[WebRTC] peer-joined:', data);
      onPeerJoinedRef.current?.(data.role);

      // If viewer sees broadcaster joined, notify that phone is paired
      if (role === 'viewer' && data.role === 'broadcaster') {
        onPhonePairedRef.current?.();
      }

      if (role === 'broadcaster' && offeredRef.current) {
        // Viewer joined AFTER we already set tracks → re-send offer
        sendOffer(pc);
      }
    };

    // ── peer-left: peer disconnected or closed tab ──
    const onPeerLeft = (data: { socketId: string }) => {
      console.log('[WebRTC] peer-left:', data);
      if (role === 'viewer') {
        if (remoteVideoRef?.current) {
          remoteVideoRef.current.srcObject = null;
        }
        onBroadcastStoppedRef.current?.();
        onDisconnectedRef.current?.();
      }
    };

    // Join the signaling room
    socket.emit('join-session', {
      sessionId: session.id,
      token: role === 'broadcaster' ? session.phoneToken : session.viewerToken,
      role,
    });

    socket.on('signal', onSignal);
    socket.on('peer-joined', onPeerJoinedHandler);
    socket.on('peer-left', onPeerLeft);

    return () => {
      socket.off('signal', onSignal);
      socket.off('peer-joined', onPeerJoinedHandler);
      socket.off('peer-left', onPeerLeft);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, role, socket]);

  // ─────────────────────────────────────────────────────────────────────────
  // EFFECT 2 — whenever broadcaster's stream becomes available or changes
  //            add / replace tracks and send (or re-send) an offer
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (role !== 'broadcaster') return;
    const pc = pcRef.current;
    if (!pc || !localStream || localStream.getVideoTracks().length === 0) return;

    const newVideoTrack = localStream.getVideoTracks()[0];
    const senders = pc.getSenders();
    const videoSender = senders.find((s) => s.track?.kind === 'video');

    if (videoSender) {
      // Camera switched — replace track seamlessly (no renegotiation needed)
      console.log('[WebRTC] Replacing video track (camera switch)');
      videoSender.replaceTrack(newVideoTrack).catch(console.warn);
    } else {
      // First time stream is ready — add tracks and send an offer
      console.log('[WebRTC] Adding tracks and sending first offer');
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
      offeredRef.current = true;
      sendOffer(pc);
    }
  }, [localStream, role, sendOffer]);

  return { peerConnection: pcRef.current, sendVideoTransform, sendPhonePaired, sendStopBroadcast };
}
