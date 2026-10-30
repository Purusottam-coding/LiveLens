import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Monitor,
  Loader2,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  RefreshCw,
  ShieldCheck,
  Play,
  ArrowLeft,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useSignaling, SignalingMessage } from '../hooks/useSignaling';
import type { VideoTransform } from '../types';
import { ICE_SERVERS } from '../config/webrtc';

const STORAGE_KEY = 'livelens_viewer_room_code';

function generateRandomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function fallbackCopy(text: string, onSuccess?: () => void) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.select();
    textArea.setSelectionRange(0, 99999);
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) {
      onSuccess?.();
    }
  } catch (err) {
    console.warn('Fallback copy failed:', err);
  }
}

interface ViewerProps {
  onExit?: () => void;
}

export default function Viewer({ onExit }: ViewerProps = {}) {
  const [roomCode, setRoomCode] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && /^\d{6}$/.test(saved)) {
      return saved;
    }
    const newCode = generateRandomCode();
    localStorage.setItem(STORAGE_KEY, newCode);
    return newCode;
  });

  const [status, setStatus] = useState<'waiting' | 'connected'>('waiting');
  const [isPhonePaired, setIsPhonePaired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const [videoTransform, setVideoTransform] = useState<VideoTransform>({
    rotation: 0,
    mirrorX: false,
    mirrorY: false,
    zoom: 1,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const sendRef = useRef<(type: string, payload?: any) => void>(() => {});

  // Regenerate new room code
  const handleGenerateNewCode = () => {
    const newCode = generateRandomCode();
    localStorage.setItem(STORAGE_KEY, newCode);
    setRoomCode(newCode);
    setIsPhonePaired(false);
    setStatus('waiting');
    setHasVideoTrack(false);
    setIsVideoPlaying(false);
    setNeedsUserInteraction(false);
    cleanupPeerConnection();
  };

  const cleanupPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    iceCandidateQueue.current = [];
    setRemoteStream(null);
    setIsVideoPlaying(false);
    setHasVideoTrack(false);
    setNeedsUserInteraction(false);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const flushIceCandidates = useCallback(async () => {
    while (iceCandidateQueue.current.length > 0) {
      const cand = iceCandidateQueue.current.shift();
      if (cand && pcRef.current && pcRef.current.remoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn('[Viewer] Could not add queued ICE candidate:', err);
        }
      }
    }
  }, []);

  // WebRTC setup helper
  const setupPeerConnection = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {}
      pcRef.current = null;
    }
    iceCandidateQueue.current = [];

    console.log('[Viewer] Setting up new RTCPeerConnection with STUN & TURN');
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

    pc.ontrack = (event) => {
      console.log('[Viewer] Remote track received:', event.track.kind);
      if (event.track.kind === 'video') {
        setHasVideoTrack(true);
      }

      setRemoteStream((prevStream) => {
        if (event.streams && event.streams[0]) {
          return event.streams[0];
        }
        if (prevStream) {
          prevStream.addTrack(event.track);
          return new MediaStream(prevStream.getTracks());
        }
        return new MediaStream([event.track]);
      });

      setStatus('connected');
      setIsPhonePaired(true);

      // Listen for un-mute when media frames start arriving
      event.track.onunmute = () => {
        console.log(`[Viewer] Remote ${event.track.kind} track unmuted`);
        if (event.track.kind === 'video') {
          setHasVideoTrack(true);
          if (remoteVideoRef.current && remoteVideoRef.current.videoWidth > 0) {
            setIsVideoPlaying(true);
            setNeedsUserInteraction(false);
          }
        }
        if (remoteVideoRef.current) {
          remoteVideoRef.current.play().catch(() => setNeedsUserInteraction(true));
        }
      };
    };

    pc.onconnectionstatechange = () => {
      console.log('[Viewer] WebRTC connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setStatus('connected');
        setIsPhonePaired(true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setStatus('waiting');
        setIsPhonePaired(false);
        setHasVideoTrack(false);
        setIsVideoPlaying(false);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Viewer] WebRTC iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setStatus('connected');
        setIsPhonePaired(true);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.play().then(() => {
            if (remoteVideoRef.current && remoteVideoRef.current.videoWidth > 0) {
              setIsVideoPlaying(true);
              setNeedsUserInteraction(false);
            }
          }).catch(() => setNeedsUserInteraction(true));
        }
      } else if (pc.iceConnectionState === 'failed') {
        console.warn('[Viewer] ICE connection failed. Requesting restart from phone camera...');
        sendRef.current('request-stream', { role: 'viewer', restart: true });
        sendRef.current('peer-joined', { role: 'viewer', restart: true });
      }
    };

    return pc;
  }, []);

  const checkVideoFramePlaying = useCallback((video: HTMLVideoElement | null) => {
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      setIsVideoPlaying(true);
      setNeedsUserInteraction(false);
    }
  }, []);

  // Poll for decoded video frame dimensions while waiting for playback
  useEffect(() => {
    if (!hasVideoTrack || isVideoPlaying) return;
    const interval = window.setInterval(() => {
      const v = remoteVideoRef.current;
      if (v && v.videoWidth > 0 && v.videoHeight > 0) {
        setIsVideoPlaying(true);
        setNeedsUserInteraction(false);
      }
    }, 400);
    return () => clearInterval(interval);
  }, [hasVideoTrack, isVideoPlaying]);

  // Bind remote stream to HTML5 video element with mobile-friendly attributes
  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;

    if (remoteStream) {
      if (video.srcObject !== remoteStream) {
        video.srcObject = remoteStream;
      }
      video.muted = isAudioMuted;
      video.defaultMuted = isAudioMuted;
      video.volume = isAudioMuted ? 0 : 1;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('x5-playsinline', 'true');
      video.setAttribute('x5-video-player-type', 'h5');

      video.play().then(() => {
        checkVideoFramePlaying(video);
      }).catch((err) => {
        console.warn('[Viewer] Unmuted play blocked, trying muted play:', err);
        video.muted = true;
        setIsAudioMuted(true);
        video.play().then(() => {
          checkVideoFramePlaying(video);
        }).catch(() => setNeedsUserInteraction(true));
      });
    } else {
      video.srcObject = null;
      setIsVideoPlaying(false);
    }
  }, [remoteStream, isAudioMuted, checkVideoFramePlaying]);

  // Message handler
  const handleSignalingMessage = useCallback(
    async (msg: SignalingMessage) => {
      console.log('[Viewer] Received signal:', msg.type);

      try {
        if (msg.type === 'phone-paired' || msg.type === 'pair-request') {
          console.log('[Viewer] Phone pair request received');
          setIsPhonePaired(true);
          // Acknowledge presence to phone
          sendRef.current('pair-ack', { code: roomCode });
          sendRef.current('peer-joined', { role: 'viewer' });
        } else if (msg.type === 'peer-joined') {
          if (msg.payload?.role === 'broadcaster') {
            console.log('[Viewer] Broadcaster joined room');
            setIsPhonePaired(true);
            sendRef.current('peer-joined', { role: 'viewer' });
          }
        } else if (msg.type === 'video-transform') {
          console.log('[Viewer] Received video-transform:', msg.payload);
          setVideoTransform(msg.payload as VideoTransform);
        } else if (msg.type === 'stop-broadcast') {
          console.log('[Viewer] Broadcaster stopped streaming');
          setStatus('waiting');
          setIsPhonePaired(false);
          cleanupPeerConnection();
        } else if (msg.type === 'peer-disconnected') {
          console.log('[Viewer] Peer disconnected');
          // If WebRTC is actively streaming video, do not teardown feed on momentary signaling socket reconnect
          const isWebRTCAlive = pcRef.current && (
            pcRef.current.connectionState === 'connected' ||
            pcRef.current.iceConnectionState === 'connected' ||
            pcRef.current.iceConnectionState === 'completed'
          );
          if (!isWebRTCAlive) {
            setStatus('waiting');
            setIsPhonePaired(false);
            cleanupPeerConnection();
          }
        } else if (msg.type === 'offer') {
          console.log('[Viewer] Handling offer from broadcaster');
          // Always create a clean peer connection for each new broadcast offer
          if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
          }
          const pc = setupPeerConnection();

          const offerDesc = new RTCSessionDescription(msg.payload);
          await pc.setRemoteDescription(offerDesc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await flushIceCandidates();

          console.log('[Viewer] Sending answer to broadcaster');
          const answerPayload = pc.localDescription?.toJSON
            ? pc.localDescription.toJSON()
            : { type: pc.localDescription?.type, sdp: pc.localDescription?.sdp };
          sendRef.current('answer', answerPayload);
        } else if (msg.type === 'ice-candidate') {
          if (!msg.payload || !msg.payload.candidate) return;
          const pc = pcRef.current;
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
            } catch (err) {
              console.warn('[Viewer] addIceCandidate error:', err);
            }
          } else {
            iceCandidateQueue.current.push(msg.payload);
          }
        }
      } catch (err) {
        console.warn('[Viewer] Error handling message:', err);
      }
    },
    [setupPeerConnection, flushIceCandidates, cleanupPeerConnection]
  );

  const { isConnected, send } = useSignaling(roomCode, handleSignalingMessage);
  sendRef.current = send;

  // Announce presence when connected
  useEffect(() => {
    if (isConnected && roomCode) {
      send('peer-joined', { role: 'viewer' });
    }
  }, [isConnected, roomCode, send]);

  const copyCode = useCallback(() => {
    const handleSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(roomCode)
        .then(handleSuccess)
        .catch(() => fallbackCopy(roomCode, handleSuccess));
    } else {
      fallbackCopy(roomCode, handleSuccess);
    }
  }, [roomCode]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track fullscreen changes across all browsers
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  // Prevent browser viewport/page zoom on multi-touch
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

  // Pinch-to-zoom video on projector screen (zooms video, not screen)
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
      setVideoTransform((prev) => ({ ...prev, zoom: targetZoom }));
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen();
      } else if ((remoteVideoRef.current as any)?.webkitRequestFullscreen) {
        (remoteVideoRef.current as any).webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
    }
  }, []);

  const toggleAudioMute = useCallback(() => {
    const video = remoteVideoRef.current;
    if (video) {
      const nextMuted = !video.muted;
      video.muted = nextMuted;
      video.defaultMuted = nextMuted;
      video.volume = nextMuted ? 0 : 1;
      if (!nextMuted) {
        video.play().catch(console.warn);
      }
      setIsAudioMuted(nextMuted);
    } else {
      setIsAudioMuted((prev) => !prev);
    }
  }, []);

  const handleManualPlay = useCallback(() => {
    const video = remoteVideoRef.current;
    if (video) {
      // User tapped: we have user gesture, so try unmuted playback!
      video.muted = false;
      video.defaultMuted = false;
      video.volume = 1;
      video.play().then(() => {
        setIsAudioMuted(false);
        checkVideoFramePlaying(video);
      }).catch(() => {
        video.muted = true;
        setIsAudioMuted(true);
        video.play().then(() => {
          checkVideoFramePlaying(video);
        }).catch(console.warn);
      });
    }
    setNeedsUserInteraction(false);
    // Also re-request fresh stream from broadcaster
    sendRef.current('request-stream', { role: 'viewer', restart: true });
    sendRef.current('peer-joined', { role: 'viewer', restart: true });
  }, [checkVideoFramePlaying]);

  const cameraUrl = `${window.location.origin}/?role=camera&code=${roomCode}`;
  const isVideoLive = status === 'connected' || hasVideoTrack;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={isFullscreen ? toggleFullscreen : undefined}
      className="min-h-screen bg-[#0a0a0a] flex flex-col relative select-none overflow-hidden touch-none"
    >
      {/* ── Remote Fullscreen Video (Universal Mobile & Desktop Support) ── */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        muted
        onLoadedData={(e) => checkVideoFramePlaying(e.currentTarget)}
        onLoadedMetadata={(e) => {
          e.currentTarget.play().catch(() => setNeedsUserInteraction(true));
          checkVideoFramePlaying(e.currentTarget);
        }}
        onCanPlay={(e) => {
          e.currentTarget.play().catch(() => setNeedsUserInteraction(true));
          checkVideoFramePlaying(e.currentTarget);
        }}
        onPlaying={(e) => checkVideoFramePlaying(e.currentTarget)}
        onTimeUpdate={(e) => checkVideoFramePlaying(e.currentTarget)}
        onResize={(e) => checkVideoFramePlaying(e.currentTarget)}
        style={{
          transform: `rotate(${videoTransform.rotation}deg) scaleX(${videoTransform.mirrorX ? -1 : 1}) scaleY(${videoTransform.mirrorY ? -1 : 1}) scale(${videoTransform.zoom || 1})`,
          transition: 'transform 0.1s ease-out',
          transformOrigin: 'center center',
        }}
        className={`fixed inset-0 w-full h-full object-contain bg-black transition-opacity duration-300 ${
          isVideoLive ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* ── Video Loading / Autoplay Interaction Overlay ── */}
      {isVideoLive && (!isVideoPlaying || needsUserInteraction) && (
        <div
          onClick={handleManualPlay}
          className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-6 text-center cursor-pointer select-none transition-all"
        >
          <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4">
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            Connecting Video Feed…
          </h3>
          <p className="text-neutral-400 text-sm max-w-sm mb-6 leading-relaxed">
            Connected to phone camera. Tap below if video doesn't appear immediately.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleManualPlay();
            }}
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white hover:bg-neutral-200 active:scale-98 text-black font-semibold text-sm transition shadow-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Tap to Display Live Video</span>
          </button>
        </div>
      )}

      {/* ── Subtle Floating Fullscreen Controls (Hover to show, zero obstruction) ── */}
      {isFullscreen && isVideoLive && (
        <div className="fixed top-4 right-4 z-40 flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity duration-300">
          <button
            onClick={toggleAudioMute}
            title={isAudioMuted ? 'Unmute Audio' : 'Mute Audio'}
            className="p-3 rounded-xl bg-black/75 hover:bg-black/90 text-white backdrop-blur-md border border-white/20 transition-all active:scale-95"
          >
            {isAudioMuted ? (
              <VolumeX className="w-5 h-5 text-neutral-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </button>
          <button
            onClick={toggleFullscreen}
            title="Exit Fullscreen (ESC or Double-Click anywhere)"
            className="p-3 rounded-xl bg-black/75 hover:bg-black/90 text-white backdrop-blur-md border border-white/20 transition-all active:scale-95"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ── Top Bar (Completely hidden in Fullscreen when live video is playing for 100% clean display) ── */}
      {(!isFullscreen || !isVideoLive) && (
        <header className="relative z-20 flex items-center justify-between px-6 sm:px-8 py-4 sm:py-5 gap-3 transition-opacity duration-300">
          <div className="flex items-center gap-2">
            {onExit && (
              <button
                onClick={onExit}
                title="Return to mode selection"
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 backdrop-blur-md border border-white/10 text-white/80 hover:text-white text-xs sm:text-sm font-medium transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Modes</span>
              </button>
            )}

            <div className="flex items-center gap-2.5 sm:gap-3 px-4 sm:px-5 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-white font-semibold text-sm sm:text-base">
              <Monitor className="w-4 h-4 text-white" />
              <span>Projector Display</span>
              {isVideoLive && (
                <span className="flex items-center gap-1.5 text-xs font-mono text-white bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  LIVE
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Speaker Audio Mute / Unmute Toggle */}
            {isVideoLive && (
              <button
                type="button"
                onClick={toggleAudioMute}
                title={isAudioMuted ? 'Audio Muted (Click to Hear Phone Audio)' : 'Audio Live (Click to Mute)'}
                className="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl backdrop-blur-md border border-white/10 bg-white/10 hover:bg-white/15 text-white text-xs sm:text-sm font-medium transition active:scale-95"
              >
                {isAudioMuted ? <VolumeX className="w-4 h-4 text-neutral-400" /> : <Volume2 className="w-4 h-4 text-white" />}
                <span className="hidden sm:inline">{isAudioMuted ? 'Unmute Audio' : 'Audio Live'}</span>
              </button>
            )}

            <button
              onClick={handleGenerateNewCode}
              title="Generate new pairing code"
              className="flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 backdrop-blur-md border border-white/10 text-white text-xs sm:text-sm font-medium transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">New Code</span>
            </button>

            <button
              onClick={toggleFullscreen}
              title="Toggle fullscreen"
              className="flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-200 active:scale-95 text-black font-semibold text-xs sm:text-sm transition shadow-sm"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Fullscreen</span>
            </button>
          </div>
        </header>
      )}

      {/* ── Waiting Screen (Pairing Card & QR Code) ── */}
      {!isVideoLive && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
          <div className="w-full max-w-lg bg-[#141414] border border-neutral-800 rounded-3xl p-7 sm:p-8 shadow-xl flex flex-col items-center gap-6">
            {/* Phone paired indicator banner */}
            {isPhonePaired ? (
              <div className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-white font-medium text-sm">
                <ShieldCheck className="w-4 h-4 text-white" />
                <span>Phone connected! Waiting for broadcast to start…</span>
              </div>
            ) : (
              <div className="text-center">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1.5">
                  Connect Phone Camera
                </h2>
                <p className="text-neutral-400 text-sm leading-relaxed">
                  Scan QR code or open URL on your phone and enter pairing code
                </p>
              </div>
            )}

            {/* 6-Digit Pairing Code Display */}
            <div className="flex flex-col items-center gap-2 w-full">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Pairing Code (Click to Copy)
              </span>
              <div
                onClick={copyCode}
                title="Click to copy code"
                className="flex items-center justify-center gap-3 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-2xl px-6 py-4 w-full cursor-pointer transition group"
              >
                <span className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-[0.25em] select-all">
                  {roomCode}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyCode();
                  }}
                  title="Copy code"
                  className="p-2.5 rounded-xl bg-neutral-800 group-hover:bg-white group-hover:text-black text-neutral-300 transition active:scale-95"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-white group-hover:text-black" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              {copied && (
                <span className="text-xs font-medium text-white">
                  Code copied to clipboard!
                </span>
              )}
            </div>

            {/* QR Code */}
            <div className="p-4 bg-white rounded-2xl shadow-md flex items-center justify-center">
              <QRCodeSVG
                value={cameraUrl}
                size={190}
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Connection Link */}
            <p className="text-neutral-400 text-xs font-mono text-center break-all px-4">
              Direct Link: <a href={cameraUrl} className="text-white underline">{cameraUrl}</a>
            </p>

            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
              <span>
                {isPhonePaired ? 'Starting camera broadcast…' : 'Waiting for phone connection…'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
