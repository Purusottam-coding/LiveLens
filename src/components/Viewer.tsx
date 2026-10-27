import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Monitor,
  Loader2,
  Copy,
  Check,
  Maximize2,
  RefreshCw,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useSignaling, SignalingMessage } from '../hooks/useSignaling';
import type { VideoTransform } from '../types';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

const STORAGE_KEY = 'livelens_viewer_room_code';

function generateRandomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default function Viewer() {
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

  // Regenerate new room code
  const handleGenerateNewCode = () => {
    const newCode = generateRandomCode();
    localStorage.setItem(STORAGE_KEY, newCode);
    setRoomCode(newCode);
    setIsPhonePaired(false);
    setStatus('waiting');
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  };

  const cleanupPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    iceCandidateQueue.current = [];
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const flushIceCandidates = useCallback(async () => {
    while (iceCandidateQueue.current.length > 0) {
      const cand = iceCandidateQueue.current.shift();
      if (cand && pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
      }
    }
  }, []);

  // WebRTC setup helper
  const setupPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    console.log('[Viewer] Setting up new RTCPeerConnection');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        send('ice-candidate', candidate);
      }
    };

    pc.ontrack = (event) => {
      console.log('[Viewer] Remote track received:', event.streams);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch(console.warn);
        setStatus('connected');
        setIsPhonePaired(true);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Viewer] WebRTC connectionState:', pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setStatus('waiting');
        setIsPhonePaired(false);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      }
    };

    return pc;
  }, []);

  // Message handler
  const handleSignalingMessage = useCallback(
    async (msg: SignalingMessage) => {
      console.log('[Viewer] Received signal:', msg.type);

      try {
        if (msg.type === 'phone-paired') {
          console.log('[Viewer] Phone paired notification');
          setIsPhonePaired(true);
        } else if (msg.type === 'peer-joined') {
          if (msg.payload?.role === 'broadcaster') {
            console.log('[Viewer] Broadcaster joined room');
            setIsPhonePaired(true);
            // Notify broadcaster that viewer is here
            send('peer-joined', { role: 'viewer' });
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
          setStatus('waiting');
          setIsPhonePaired(false);
          cleanupPeerConnection();
        } else if (msg.type === 'offer') {
          console.log('[Viewer] Handling offer from broadcaster');
          let pc = pcRef.current;
          if (!pc || pc.signalingState === 'closed') {
            pc = setupPeerConnection();
          }

          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          await flushIceCandidates();

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          console.log('[Viewer] Sending answer to broadcaster');
          send('answer', pc.localDescription);
        } else if (msg.type === 'ice-candidate') {
          const pc = pcRef.current;
          if (pc && pc.remoteDescription?.type) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload)).catch(console.warn);
          } else {
            iceCandidateQueue.current.push(msg.payload);
          }
        }
      } catch (err) {
        console.warn('[Viewer] Error handling message:', err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setupPeerConnection, flushIceCandidates, cleanupPeerConnection]
  );

  const { isConnected, send } = useSignaling(roomCode, handleSignalingMessage);

  // Announce presence when connected
  useEffect(() => {
    if (isConnected && roomCode) {
      send('peer-joined', { role: 'viewer' });
    }
  }, [isConnected, roomCode, send]);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [roomCode]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const cameraUrl = `${window.location.origin}/camera?code=${roomCode}`;

  return (
    <div ref={containerRef} className="min-h-screen bg-[#080c14] flex flex-col relative select-none">
      {/* ── Remote Fullscreen Video (connected) ── */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        muted
        style={{
          transform: `rotate(${videoTransform.rotation}deg) scaleX(${videoTransform.mirrorX ? -1 : 1}) scaleY(${videoTransform.mirrorY ? -1 : 1}) scale(${videoTransform.zoom || 1})`,
          transition: 'transform 0.2s ease-out',
        }}
        className={`fixed inset-0 w-full h-full object-contain bg-black transition-opacity duration-700 ${
          status === 'connected' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* ── Top Bar ── */}
      <header className="relative z-20 flex items-center justify-between px-6 sm:px-8 py-4 sm:py-5 gap-3">
        <div className="flex items-center gap-3 px-5 sm:px-6 py-3 rounded-2xl bg-white/12 backdrop-blur-md border border-white/20 text-white font-bold text-base sm:text-lg shadow-lg">
          <Monitor className="w-5 h-5 text-brand-400" />
          <span>Projector Display</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateNewCode}
            title="Generate new pairing code"
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/15 text-white/90 text-sm font-semibold transition shadow-lg"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">New Code</span>
          </button>

          <button
            onClick={toggleFullscreen}
            title="Toggle fullscreen"
            className="flex items-center gap-2.5 px-5 sm:px-6 py-3 rounded-2xl bg-white/12 hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/20 text-white font-semibold text-base transition-all shadow-lg"
          >
            <Maximize2 className="w-5 h-5" />
            <span>Fullscreen</span>
          </button>
        </div>
      </header>

      {/* ── Waiting Screen (Pairing Card & QR Code) ── */}
      {status === 'waiting' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
          <div className="w-full max-w-lg bg-surface-800/90 backdrop-blur-xl border border-surface-700 rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-7">
            {/* Phone paired indicator banner */}
            {isPhonePaired ? (
              <div className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-2xl bg-green-500/20 border border-green-500/40 text-green-300 shadow-lg shadow-green-500/10">
                <ShieldCheck className="w-5 h-5 text-green-400 animate-pulse" />
                <span className="font-bold text-sm sm:text-base">
                  Phone connected! Waiting for broadcast to start…
                </span>
              </div>
            ) : (
              <div className="text-center">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
                  Connect Phone Camera
                </h2>
                <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
                  Scan QR code or visit on your phone and enter the pairing code
                </p>
              </div>
            )}

            {/* 6-Digit Pairing Code Display */}
            <div className="flex flex-col items-center gap-2 w-full">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Pairing Code
              </span>
              <div className="flex items-center justify-center gap-3 bg-surface-900 border-2 border-surface-700 rounded-2xl px-6 py-4 w-full">
                <span className="text-4xl sm:text-5xl font-mono font-black text-brand-400 tracking-[0.3em]">
                  {roomCode}
                </span>
                <button
                  onClick={copyCode}
                  title="Copy code"
                  className="p-2.5 rounded-xl bg-surface-700/80 hover:bg-surface-600 text-slate-300 hover:text-white transition active:scale-95"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-green-400" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* QR Code */}
            <div className="p-4 bg-white rounded-2xl shadow-xl flex items-center justify-center">
              <QRCodeSVG
                value={cameraUrl}
                size={200}
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Connection Link */}
            <p className="text-slate-400 text-xs font-mono text-center break-all px-4">
              Direct Link: <a href={cameraUrl} className="text-brand-400 underline">{cameraUrl}</a>
            </p>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-ping" />
              <span>Waiting for phone connection…</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}