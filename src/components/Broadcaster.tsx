import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  Loader2,
  AlertCircle,
  Wifi,
  ShieldCheck,
  Play,
  User,
  ArrowLeft,
} from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useSignaling, SignalingMessage } from '../hooks/useSignaling';
import Controls, { Quality, QUALITY_OPTIONS } from './Controls';
import type { VideoTransform } from '../types';
import { ICE_SERVERS } from '../config/webrtc';

interface BroadcasterProps {
  initialCode?: string;
  onExit?: () => void;
}

type Status = 'idle' | 'pairing' | 'paired' | 'streaming' | 'error';

export default function Broadcaster({ initialCode = '', onExit }: BroadcasterProps) {
  const [code, setCode] = useState(initialCode);
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [quality, setQuality] = useState<Quality>('auto');

  const [videoTransform, setVideoTransform] = useState<VideoTransform>({
    rotation: 0,
    mirrorX: false,
    mirrorY: false,
    zoom: 1,
  });

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const sendRef = useRef<(type: string, payload?: any) => void>(() => {});
  const statusRef = useRef<Status>(status);
  statusRef.current = status;
  const pairingTimeoutRef = useRef<number | null>(null);

  // Camera only enabled during 'streaming'
  const isCameraEnabled = status === 'streaming';

  const {
    stream,
    facingMode,
    setCameraFacing,
    switchCamera,
    isTorchOn,
    toggleTorch,
    isTorchSupported,
    applyHardwareZoom,
    cameraError,
    currentResolution,
  } = useCamera({ enabled: isCameraEnabled, quality });

  const streamRef = useRef<MediaStream | null>(null);
  streamRef.current = stream;

  // Attach stream to local preview
  useEffect(() => {
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Clean up WebRTC peer connection
  const cleanupPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    iceCandidateQueue.current = [];
  }, []);

  // Flush queued candidates
  const flushIceCandidates = useCallback(async () => {
    while (iceCandidateQueue.current.length > 0) {
      const cand = iceCandidateQueue.current.shift();
      if (cand && pcRef.current && pcRef.current.remoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn('[Broadcaster] Could not add queued ICE candidate:', err);
        }
      }
    }
  }, []);

  // Send WebRTC offer helper
  const sendOffer = useCallback(async (pc: RTCPeerConnection) => {
    try {
      console.log('[Broadcaster] Creating WebRTC offer');
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);
      console.log('[Broadcaster] Sending offer to viewer');
      const desc = pc.localDescription?.toJSON
        ? pc.localDescription.toJSON()
        : { type: pc.localDescription?.type, sdp: pc.localDescription?.sdp };
      sendRef.current('offer', desc);
    } catch (err) {
      console.error('[Broadcaster] Error sending offer:', err);
    }
  }, []);

  // Create or refresh RTCPeerConnection
  const createPeerConnection = useCallback((currentStream: MediaStream) => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    console.log('[Broadcaster] Creating new RTCPeerConnection');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        const cand = candidate.toJSON ? candidate.toJSON() : {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        };
        sendRef.current('ice-candidate', cand);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Broadcaster] WebRTC connectionState:', pc.connectionState);
    };

    // Add all tracks from the camera stream
    currentStream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, currentStream);
      try {
        const params = sender.getParameters?.();
        if (params && params.encodings && params.encodings.length > 0) {
          params.encodings[0].maxBitrate = 2500000;
          sender.setParameters?.(params).catch(() => {});
        }
      } catch (e) {}
    });

    // Send initial offer
    sendOffer(pc);
    sendRef.current('video-transform', videoTransform);

    return pc;
  }, [sendOffer, videoTransform]);

  // Signaling message handler
  const handleSignalingMessage = useCallback(
    async (msg: SignalingMessage) => {
      console.log('[Broadcaster] Received signal:', msg.type);

      try {
        if (msg.type === 'peer-joined') {
          console.log('[Broadcaster] Viewer is in signaling room');
          // If we are already streaming and have a stream, send offer now
          if (statusRef.current === 'streaming' && streamRef.current) {
            if (msg.payload?.restart || !pcRef.current || pcRef.current.signalingState === 'closed') {
              createPeerConnection(streamRef.current);
            } else {
              sendOffer(pcRef.current);
            }
          }
        } else if (msg.type === 'answer') {
          const pc = pcRef.current;
          if (!pc) return;
          console.log('[Broadcaster] Received answer from Viewer');
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          await flushIceCandidates();
        } else if (msg.type === 'ice-candidate') {
          const pc = pcRef.current;
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
            } catch (err) {
              console.warn('[Broadcaster] addIceCandidate error:', err);
            }
          } else {
            iceCandidateQueue.current.push(msg.payload);
          }
        } else if (msg.type === 'peer-disconnected') {
          console.log('[Broadcaster] Viewer disconnected');
        }
      } catch (err) {
        console.warn('[Broadcaster] Error handling signal message:', err);
      }
    },
    [sendOffer, createPeerConnection, flushIceCandidates]
  );

  const { isConnected, send } = useSignaling(activeRoomCode, handleSignalingMessage);
  sendRef.current = send;

  // Handle pairing action
  const handlePair = () => {
    const cleanCode = code.trim();
    if (cleanCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      setStatus('error');
      return;
    }
    setError('');
    setStatus('pairing');
    setActiveRoomCode(cleanCode);

    if (pairingTimeoutRef.current) clearTimeout(pairingTimeoutRef.current);
    pairingTimeoutRef.current = window.setTimeout(() => {
      if (statusRef.current === 'pairing') {
        setStatus('error');
        setError('Connection timed out. Check that the projector screen is open with code ' + cleanCode);
      }
    }, 8000);
  };

  // When WebSocket connects to room, mark as paired
  useEffect(() => {
    if (isConnected && activeRoomCode && status === 'pairing') {
      if (pairingTimeoutRef.current) clearTimeout(pairingTimeoutRef.current);
      setStatus('paired');
      send('phone-paired', {});
      send('peer-joined', { role: 'broadcaster' });
    }
  }, [isConnected, activeRoomCode, status, send]);

  // Start broadcast: transition to 'streaming'
  const handleStartBroadcast = () => {
    setStatus('streaming');
    statusRef.current = 'streaming';
    send('phone-paired', {});
    send('peer-joined', { role: 'broadcaster' });
  };

  // Setup PeerConnection when stream becomes available during streaming
  useEffect(() => {
    if (status !== 'streaming' || !stream || stream.getVideoTracks().length === 0) return;

    if (!pcRef.current || pcRef.current.signalingState === 'closed') {
      createPeerConnection(stream);
    } else {
      // Stream changed (e.g. camera switch front/back) -> replace track
      const newVideoTrack = stream.getVideoTracks()[0];
      const senders = pcRef.current.getSenders();
      const videoSender = senders.find((s) => s.track?.kind === 'video');
      if (videoSender && newVideoTrack) {
        console.log('[Broadcaster] Replacing video track');
        videoSender.replaceTrack(newVideoTrack).catch(console.warn);
      }
    }
  }, [status, stream, createPeerConnection]);

  // Transform update handler
  const handleTransformChange = (newTransform: VideoTransform) => {
    setVideoTransform(newTransform);
    if (newTransform.zoom !== undefined) {
      applyHardwareZoom(newTransform.zoom);
    }
    send('video-transform', newTransform);
  };

  // Stop broadcast - takes phone back to code entry screen directly
  const handleStopBroadcast = () => {
    send('stop-broadcast', {});
    cleanupPeerConnection();
    setActiveRoomCode(null);
    setStatus('idle');
  };

  // Pinch-to-zoom support
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = videoTransform.zoom || 1;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = currentDist / touchStartDistRef.current;
      const targetZoom = Math.min(5, Math.max(1, Math.round(touchStartZoomRef.current * ratio * 10) / 10));
      handleTransformChange({ ...videoTransform, zoom: targetZoom });
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  const isLive = status === 'streaming';

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="min-h-screen bg-[#080c14] flex flex-col relative overflow-hidden"
    >
      {/* Live camera video element */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{
          transform: `rotate(${videoTransform.rotation}deg) scaleX(${videoTransform.mirrorX ? -1 : 1}) scaleY(${videoTransform.mirrorY ? -1 : 1}) scale(${videoTransform.zoom || 1})`,
          transition: 'transform 0.2s ease-out',
        }}
        className={`fixed inset-0 w-full h-full object-cover transition-opacity duration-700 ${
          isLive ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* ── Top Bar HUD ── */}
      <header className="relative z-10 flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 gap-2 select-none">
        <div className="flex items-center gap-2">
          {!isLive && onExit && (
            <button
              onClick={onExit}
              title="Return to mode selection"
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 backdrop-blur-xl border border-white/15 text-white/80 hover:text-white text-xs sm:text-sm font-semibold transition shadow-lg shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Modes</span>
            </button>
          )}

          <div
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full backdrop-blur-xl border font-bold text-xs sm:text-sm transition-all shadow-lg shrink-0 ${
              isLive
                ? 'bg-red-500/20 border-red-500/40 text-red-300 shadow-red-500/10'
                : status === 'paired'
                ? 'bg-green-500/25 border-green-400/50 text-green-300 shadow-green-500/10'
                : 'bg-white/10 border-white/15 text-white/70'
            }`}
          >
            {isLive ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse shadow-[0_0_8px_#f87171]" />
                <span>LIVE</span>
                {code && (
                  <>
                    <span className="text-white/30">•</span>
                    <span className="font-mono text-white/90">#{code}</span>
                  </>
                )}
              </>
            ) : status === 'paired' ? (
              <>
                <ShieldCheck className="w-4 h-4 text-green-400" />
                <span>Paired</span>
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 text-white/60" />
                <span>Not Paired</span>
              </>
            )}
          </div>
        </div>

        {/* Live Controls on Top Bar */}
        {isLive && (
          <Controls
            roomCode={code}
            videoTransform={videoTransform}
            onTransformChange={handleTransformChange}
            facingMode={facingMode}
            onSwitchCamera={switchCamera}
            isTorchSupported={isTorchSupported}
            isTorchOn={isTorchOn}
            onToggleTorch={toggleTorch}
            quality={quality}
            onQualityChange={setQuality}
            onEndLive={handleStopBroadcast}
            currentResolution={currentResolution}
          />
        )}
      </header>

      {/* ── UNPAIRED VIEW: Code input ── */}
      {status === 'idle' || status === 'pairing' || status === 'error' ? (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 sm:p-8">
          <div className="w-full max-w-sm bg-surface-800/90 backdrop-blur-xl border border-surface-700 rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-5 relative">
            <div className="w-full flex justify-end -mb-1">
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as Quality)}
                title="Video Quality"
                className="px-3.5 py-1.5 rounded-xl bg-surface-900/90 hover:bg-surface-700/80 backdrop-blur-md border border-surface-600 text-slate-200 text-xs sm:text-sm font-semibold outline-none cursor-pointer transition-all shadow-md"
              >
                {QUALITY_OPTIONS.map((q) => (
                  <option key={q.value} value={q.value} className="bg-slate-900 text-white">
                    {q.label}
                  </option>
                ))}
              </select>
            </div>

            <img
              src="/camera-icon.png"
              alt="Camera"
              className="w-16 h-16 object-contain brightness-0 invert"
            />

            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Pair with Projector</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Enter the 6-digit code shown on the projector screen
              </p>
            </div>

            {status === 'error' && (
              <div className="w-full flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handlePair()}
              className="w-full text-center text-4xl font-mono font-bold tracking-[0.4em] bg-surface-900 border-2 border-surface-700 focus:border-brand-500 rounded-2xl px-4 py-4 text-white outline-none transition-all placeholder:text-surface-600 placeholder:tracking-[0.3em]"
            />

            <button
              onClick={handlePair}
              disabled={code.length < 6 || status === 'pairing'}
              className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl bg-brand-500 hover:bg-brand-600 active:scale-95 disabled:bg-surface-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold text-lg transition-all duration-200 shadow-xl shadow-brand-500/30"
            >
              {status === 'pairing' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Pairing with Projector…
                </>
              ) : (
                'Pair with Projector'
              )}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── PAIRED VIEW: Confirm and start broadcast ── */}
      {status === 'paired' && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 sm:p-8">
          <div className="w-full max-w-sm bg-surface-800/90 backdrop-blur-xl border border-surface-700 rounded-3xl p-7 shadow-2xl flex flex-col items-center gap-6 text-center">
            <img
              src="/paired-icon.png"
              alt="Phone Paired"
              className="w-20 h-20 object-contain"
            />

            <div>
              <h2 className="text-2xl font-bold text-white mb-1.5">Paired Successfully!</h2>
              <p className="text-slate-300 text-sm">
                Connected to Projector Code:{' '}
                <strong className="text-brand-400 font-mono tracking-widest text-base">
                  {code}
                </strong>
              </p>
              <p className="text-slate-400 text-xs mt-2">
                Click below to start live camera streaming
              </p>
            </div>

            {/* Front / Back selection */}
            <div className="inline-flex p-1 rounded-2xl bg-surface-900 border border-surface-700/80 shadow-inner">
              <button
                type="button"
                onClick={() => setCameraFacing('environment')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all active:scale-95 ${
                  facingMode === 'environment'
                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Back Cam</span>
              </button>
              <button
                type="button"
                onClick={() => setCameraFacing('user')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all active:scale-95 ${
                  facingMode === 'user'
                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Front Cam</span>
              </button>
            </div>

            <div className="flex flex-col gap-2.5 w-full">
              <button
                onClick={handleStartBroadcast}
                className="w-full inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full bg-green-500 hover:bg-green-600 active:scale-95 text-white font-bold text-base transition-all duration-200 shadow-xl shadow-green-500/25"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Enable Camera & Start Live</span>
              </button>

              <button
                type="button"
                onClick={handleStopBroadcast}
                className="w-full py-2 text-xs text-slate-400 hover:text-white transition font-medium"
              >
                Disconnect & Enter Different Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Camera error alert ── */}
      {isLive && cameraError && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-5 text-center p-8">
          <div className="w-20 h-20 rounded-3xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
            <CameraOff className="w-10 h-10 text-red-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white mb-1">Camera Permission / Error</h3>
            <p className="text-red-400 text-sm max-w-sm">{cameraError}</p>
          </div>
        </div>
      )}
    </div>
  );
}