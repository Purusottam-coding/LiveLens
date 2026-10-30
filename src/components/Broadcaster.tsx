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
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useSignaling, SignalingMessage } from '../hooks/useSignaling';
import Controls, { Quality, QUALITY_OPTIONS } from './Controls';
import type { VideoTransform } from '../types';
import { ICE_SERVERS, optimizeOpusSdp } from '../config/webrtc';

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
  const videoTransformRef = useRef<VideoTransform>(videoTransform);
  videoTransformRef.current = videoTransform;

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const sendRef = useRef<(type: string, payload?: any) => void>(() => {});
  const incomingAudioRef = useRef<HTMLAudioElement | null>(null);
  const [hasIncomingAudio, setHasIncomingAudio] = useState(false);
  const [isIncomingAudioMuted, setIsIncomingAudioMuted] = useState(false);
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
    isMicMuted,
    toggleMic,
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

  // Send WebRTC offer helper with optimized Opus audio
  const sendOffer = useCallback(async (pc: RTCPeerConnection) => {
    try {
      console.log('[Broadcaster] Creating WebRTC offer');
      const offer = await pc.createOffer({
        offerToReceiveAudio: true, // Enables incoming talkback audio from Projector/Viewer
        offerToReceiveVideo: false,
      });

      // Enhance Opus audio SDP parameters for crystal-clear, low-latency, cutout-free audio
      const optimizedSdp = optimizeOpusSdp(offer.sdp || '');
      const optimizedOffer = new RTCSessionDescription({
        type: offer.type,
        sdp: optimizedSdp,
      });

      await pc.setLocalDescription(optimizedOffer);
      console.log('[Broadcaster] Sending optimized offer to viewer');
      sendRef.current('offer', {
        type: optimizedOffer.type,
        sdp: optimizedOffer.sdp,
      });
    } catch (err) {
      console.error('[Broadcaster] Error sending offer:', err);
    }
  }, []);

  // Create or refresh RTCPeerConnection
  const createPeerConnection = useCallback((currentStream: MediaStream) => {
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {}
      pcRef.current = null;
    }
    iceCandidateQueue.current = [];

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

        // Listen for incoming talkback audio track from Projector/Viewer
    pc.ontrack = (event) => {
      console.log('[Broadcaster] Incoming track from Projector:', event.track.kind);
      if (event.track.kind === 'audio') {
        setHasIncomingAudio(true);
        const incomingStream = (event.streams && event.streams[0])
          ? event.streams[0]
          : new MediaStream([event.track]);
        if (incomingAudioRef.current) {
          incomingAudioRef.current.srcObject = incomingStream;
          incomingAudioRef.current.play().catch(console.warn);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Broadcaster] WebRTC iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.warn('[Broadcaster] WebRTC ICE failed, attempting automatic restart...');
        if (streamRef.current && statusRef.current === 'streaming') {
          createPeerConnection(streamRef.current);
        }
      }
    };

    // Add all tracks from the camera stream with prioritized audio
    currentStream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, currentStream);
      try {
        const params = sender.getParameters?.();
        if (params) {
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          if (track.kind === 'audio') {
            // Prioritize audio packets so heavy video bursts never starve sound
            params.encodings[0].maxBitrate = 96000;
            params.encodings[0].priority = 'high';
            params.encodings[0].networkPriority = 'high';
          } else if (track.kind === 'video') {
            params.encodings[0].maxBitrate = 2500000;
            params.encodings[0].priority = 'medium';
            params.encodings[0].networkPriority = 'medium';
          }
          sender.setParameters?.(params).catch(() => {});
        }
      } catch (e) {}
    });

    // Send initial offer
    sendOffer(pc);
    sendRef.current('video-transform', videoTransformRef.current);

    return pc;
  }, [sendOffer]);

  // Signaling message handler
  const handleSignalingMessage = useCallback(
    async (msg: SignalingMessage) => {
      console.log('[Broadcaster] Received signal:', msg.type);

      try {
        if (msg.type === 'pair-ack') {
          console.log('[Broadcaster] Received pair-ack from Projector!');
          if (statusRef.current === 'pairing') {
            if (pairingTimeoutRef.current) clearTimeout(pairingTimeoutRef.current);
            setStatus('paired');
            setError('');
          }
        } else if (msg.type === 'peer-joined' || msg.type === 'request-stream') {
          console.log('[Broadcaster] Viewer requested stream / joined room:', msg.payload);
          if (statusRef.current === 'pairing') {
            if (pairingTimeoutRef.current) clearTimeout(pairingTimeoutRef.current);
            setStatus('paired');
            setError('');
          }
          // If we are already streaming and have a stream, send offer now
          if (statusRef.current === 'streaming' && streamRef.current) {
            console.log('[Broadcaster] Broadcaster already streaming, creating connection for viewer');
            createPeerConnection(streamRef.current);
          }
        } else if (msg.type === 'answer') {
          const pc = pcRef.current;
          if (!pc) return;
          console.log('[Broadcaster] Received answer from Viewer');
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          await flushIceCandidates();
        } else if (msg.type === 'ice-candidate') {
          if (!msg.payload || !msg.payload.candidate) return;
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

  // Handle pairing action with room pre-check
  const handlePair = async () => {
    const cleanCode = code.trim();
    if (cleanCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      setStatus('error');
      return;
    }
    setError('');
    setStatus('pairing');

    // 1. Verify with server that this room is actively open on a projector screen!
    try {
      const checkRes = await fetch(`/api/rooms/${cleanCode}/check`);
      if (checkRes.ok) {
        const checkData = (await checkRes.json()) as { exists: boolean };
        if (!checkData.exists) {
          setStatus('error');
          setError(`No projector screen found with code ${cleanCode}. Please enter the code currently displayed on your projector screen.`);
          return;
        }
      } else {
        setStatus('error');
        setError(`No projector screen found with code ${cleanCode}. Please enter the code currently displayed on your projector screen.`);
        return;
      }
    } catch (e) {
      console.warn('Room pre-check warning:', e);
      setStatus('error');
      setError('Unable to reach server. Please check your internet connection.');
      return;
    }

    // 2. Connect to room and initiate pairing handshake
    setActiveRoomCode(cleanCode);

    if (pairingTimeoutRef.current) clearTimeout(pairingTimeoutRef.current);
    pairingTimeoutRef.current = window.setTimeout(() => {
      if (statusRef.current === 'pairing') {
        setStatus('error');
        setError(`Projector ${cleanCode} did not respond. Make sure the projector screen is open.`);
      }
    }, 6000);
  };

  // Send pair-request as soon as WebSocket connects
  useEffect(() => {
    if (isConnected && activeRoomCode && status === 'pairing') {
      send('peer-joined', { role: 'broadcaster' });
      send('pair-request', { code: activeRoomCode });
    }
  }, [isConnected, activeRoomCode, status, send]);

  // If initial code was provided (e.g. from QR scan), auto-start pairing
  useEffect(() => {
    if (initialCode && initialCode.length === 6 && status === 'idle') {
      handlePair();
    }
  }, [initialCode]);

  // Start broadcast: transition to 'streaming'
  const handleStartBroadcast = () => {
    statusRef.current = 'streaming';
    setStatus('streaming');
    if (pairingTimeoutRef.current) {
      clearTimeout(pairingTimeoutRef.current);
      pairingTimeoutRef.current = null;
    }
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
      const newAudioTrack = stream.getAudioTracks()[0];
      const audioSender = senders.find((s) => s.track?.kind === 'audio');
      if (audioSender && newAudioTrack) {
        audioSender.replaceTrack(newAudioTrack).catch(console.warn);
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

  // Pinch-to-zoom support (zooms camera/video, not screen)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const preventBrowserPageZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    el.addEventListener('touchmove', preventBrowserPageZoom, { passive: false });
    return () => {
      el.removeEventListener('touchmove', preventBrowserPageZoom);
    };
  }, []);

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
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="min-h-screen bg-[#0a0a0a] flex flex-col relative overflow-hidden touch-none select-none"
    >
      {/* Live camera video element */}
      {/* Incoming talkback audio from Projector/Viewer */}
      <audio ref={incomingAudioRef} autoPlay playsInline />

      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{
          transform: `rotate(${videoTransform.rotation}deg) scaleX(${videoTransform.mirrorX ? -1 : 1}) scaleY(${videoTransform.mirrorY ? -1 : 1}) scale(${videoTransform.zoom || 1})`,
          transition: 'transform 0.1s ease-out',
          transformOrigin: 'center center',
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
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 backdrop-blur-md border border-white/10 text-white/80 hover:text-white text-xs sm:text-sm font-medium transition shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Modes</span>
            </button>
          )}

          <div
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full backdrop-blur-md border font-semibold text-xs sm:text-sm transition-all shrink-0 ${
              isLive
                ? 'bg-black/60 border-white/20 text-white'
                : status === 'paired'
                ? 'bg-black/60 border-white/20 text-white'
                : 'bg-black/60 border-white/10 text-white/70'
            }`}
          >
            {isLive ? (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span>LIVE</span>
                {code && (
                  <>
                    <span className="text-white/30">•</span>
                    <span className="font-mono text-white/90">#{code}</span>
                  </>
                )}
                {hasIncomingAudio && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsIncomingAudioMuted((prev) => {
                        const next = !prev;
                        if (incomingAudioRef.current) incomingAudioRef.current.muted = next;
                        return next;
                      });
                    }}
                    title={isIncomingAudioMuted ? 'Projector Audio Muted (Tap to hear)' : 'Projector Audio Live (Tap to mute)'}
                    className="flex items-center gap-1 text-xs text-white/90 hover:text-white transition ml-1"
                  >
                    {isIncomingAudioMuted ? (
                      <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-white animate-pulse" />
                    )}
                    <span className="text-[11px] font-mono">2-Way</span>
                  </button>
                )}
              </>
            ) : status === 'paired' ? (
              <>
                <ShieldCheck className="w-4 h-4 text-white" />
                <span>Paired</span>
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 text-white/50" />
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
            isMicMuted={isMicMuted}
            onToggleMic={toggleMic}
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
          <div className="w-full max-w-sm bg-[#141414] border border-neutral-800 rounded-3xl p-7 shadow-xl flex flex-col items-center gap-5 relative">
            <div className="w-full flex justify-end -mb-1">
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as Quality)}
                title="Video Quality"
                className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs font-medium outline-none cursor-pointer transition"
              >
                {QUALITY_OPTIONS.map((q) => (
                  <option key={q.value} value={q.value} className="bg-neutral-900 text-white">
                    {q.label}
                  </option>
                ))}
              </select>
            </div>

            <img
              src="/camera-icon.png"
              alt="Camera"
              className="w-14 h-14 object-contain brightness-0 invert opacity-90"
            />

            <div className="text-center">
              <h2 className="text-xl font-bold text-white mb-1">Pair with Projector</h2>
              <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed">
                Enter the 6-digit code shown on the projector screen
              </p>
            </div>

            {status === 'error' && (
              <div className="w-full flex items-start gap-2.5 px-3.5 py-2.5 bg-neutral-900 border border-red-500/40 rounded-xl text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''));
                if (status === 'error') {
                  setStatus('idle');
                  setError('');
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && handlePair()}
              className="w-full text-center text-3xl sm:text-4xl font-mono font-bold tracking-[0.35em] bg-neutral-900 border border-neutral-700 focus:border-white rounded-2xl px-4 py-3.5 text-white outline-none transition placeholder:text-neutral-600 placeholder:tracking-[0.25em]"
            />

            <button
              onClick={handlePair}
              disabled={code.length < 6 || status === 'pairing'}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white hover:bg-neutral-200 active:scale-98 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-black font-semibold text-base transition shadow-sm"
            >
              {status === 'pairing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
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
          <div className="w-full max-w-sm bg-[#141414] border border-neutral-800 rounded-3xl p-7 shadow-xl flex flex-col items-center gap-6 text-center">
            <img
              src="/paired-icon.png"
              alt="Phone Paired"
              className="w-16 h-16 object-contain"
            />

            <div>
              <h2 className="text-xl font-bold text-white mb-1">Paired Successfully</h2>
              <p className="text-neutral-300 text-sm">
                Projector Code:{' '}
                <strong className="text-white font-mono tracking-widest text-base">
                  {code}
                </strong>
              </p>
              <p className="text-neutral-400 text-xs mt-1">
                Ready to stream camera feed
              </p>
            </div>

            {/* Front / Back selection */}
            <div className="inline-flex p-1 rounded-xl bg-neutral-900 border border-neutral-800">
              <button
                type="button"
                onClick={() => setCameraFacing('environment')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-semibold text-xs sm:text-sm transition-all active:scale-95 ${
                  facingMode === 'environment'
                    ? 'bg-white text-black font-bold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Back Cam</span>
              </button>
              <button
                type="button"
                onClick={() => setCameraFacing('user')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-semibold text-xs sm:text-sm transition-all active:scale-95 ${
                  facingMode === 'user'
                    ? 'bg-white text-black font-bold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Front Cam</span>
              </button>
            </div>

            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={handleStartBroadcast}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white hover:bg-neutral-200 active:scale-98 text-black font-bold text-base transition shadow-sm"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Live</span>
              </button>

              <button
                type="button"
                onClick={handleStopBroadcast}
                className="w-full py-2 text-xs text-neutral-400 hover:text-white transition font-medium"
              >
                Disconnect & Enter Different Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Camera error alert ── */}
      {isLive && cameraError && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
            <CameraOff className="w-8 h-8 text-neutral-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Camera Error</h3>
            <p className="text-neutral-400 text-sm max-w-sm">{cameraError}</p>
          </div>
        </div>
      )}
    </div>
  );
}