import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Monitor,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Maximize2,
  Wifi,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useSocket } from '@/hooks/useSocket';
import { createSession, getSession, getApiBaseUrl } from '@/services/api';
import type { Session, VideoTransform } from '@/types';

type Status = 'creating' | 'waiting' | 'connected' | 'error';

export default function DisplayPage() {
  const navigate = useNavigate();
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('creating');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isPhonePaired, setIsPhonePaired] = useState(false);
  const [videoTransform, setVideoTransform] = useState<VideoTransform>({
    rotation: 0,
    mirrorX: false,
    mirrorY: false,
    zoom: 1,
  });

  const socket = useSocket();

  useWebRTC({
    role: 'viewer',
    session,
    socket,
    remoteVideoRef,
    onConnected: () => {
      setStatus('connected');
      setIsPhonePaired(false);
    },
    onDisconnected: () => {
      setStatus('waiting');
      setIsPhonePaired(false);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    },
    onPeerJoined: (peerRole) => {
      if (peerRole === 'broadcaster') {
        setIsPhonePaired(true);
      }
    },
    onPhonePaired: () => {
      setIsPhonePaired(true);
    },
    onBroadcastStopped: () => {
      console.log('[Display] Broadcaster stopped broadcast → returning to waiting screen');
      setStatus('waiting');
      setIsPhonePaired(false);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    },
    onVideoTransform: setVideoTransform,
  });

  const initSession = useCallback(async (forceNew = false) => {
    setStatus('creating');
    setError('');

    const STORAGE_KEY = 'livelens_viewer_session';

    if (!forceNew) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: Session = JSON.parse(saved);
          if (parsed && parsed.id && parsed.viewerToken) {
            // Check if backend still has this session active
            const remote = await getSession(parsed.id);
            if (remote && remote.status !== 'ended') {
              console.log('[Display] Restoring active session across refresh:', parsed.code);
              setSession(parsed);
              setStatus('waiting');
              if (remote.status === 'connected') {
                setIsPhonePaired(true);
              }
              return;
            }
          }
        }
      } catch (err) {
        console.warn('[Display] Session check failed, creating new one', err);
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    try {
      const s = await createSession();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      setSession(s);
      setStatus('waiting');
      setIsPhonePaired(false);
    } catch (err: any) {
      console.error('Session creation failed:', err);
      setError(err.message || 'Failed to create session. Is the backend running?');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    initSession(false);
  }, [initSession]);

  // Guarantee pairing detection: check session status every 2 seconds while waiting
  useEffect(() => {
    if (!session || status !== 'waiting' || isPhonePaired) return;

    const interval = setInterval(async () => {
      try {
        const s = await getSession(session.id);
        if (s.status === 'connected') {
          console.log('[Display] Detected phone paired via session check');
          setIsPhonePaired(true);
        }
      } catch (err) {
        // Silently retry
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [session, status, isPhonePaired]);

  // Direct socket event listeners for instant pairing popup
  useEffect(() => {
    if (!socket || !session) return;

    const handleSignal = (data: { type: string }) => {
      if (data.type === 'phone-paired') {
        console.log('[Display] Received phone-paired signal directly');
        setIsPhonePaired(true);
      }
    };

    const handlePeerJoined = (data: { role: string }) => {
      if (data.role === 'broadcaster') {
        console.log('[Display] Broadcaster peer joined directly');
        setIsPhonePaired(true);
      }
    };

    socket.on('signal', handleSignal);
    socket.on('peer-joined', handlePeerJoined);
    socket.on('phone-paired', () => setIsPhonePaired(true));

    return () => {
      socket.off('signal', handleSignal);
      socket.off('peer-joined', handlePeerJoined);
      socket.off('phone-paired');
    };
  }, [socket, session]);

  const copyCode = useCallback(() => {
    if (!session) return;
    navigator.clipboard.writeText(session.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [session]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const cameraUrl = session ? `${window.location.origin}/camera?code=${session.code}` : '';

  return (
    <div ref={containerRef} className="min-h-screen bg-[#080c14] flex flex-col">

      {/* ── Fullscreen video (when connected) ── */}
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

      {/* ── Top bar ── */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-8 py-4 sm:py-5 gap-3">
        <div className="flex items-center gap-3 px-5 sm:px-6 py-3 rounded-2xl bg-white/12 backdrop-blur-md border border-white/20 text-white font-bold text-base sm:text-lg shadow-lg">
          <Monitor className="w-5 h-5 text-brand-400" />
          <span>Projector Display</span>
        </div>

        <button
          onClick={toggleFullscreen}
          title="Toggle fullscreen"
          className="flex items-center gap-2.5 px-5 sm:px-6 py-3 rounded-2xl bg-white/12 hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/20 text-white font-semibold text-base transition-all shadow-lg"
        >
          <Maximize2 className="w-5 h-5" />
          <span>Fullscreen</span>
        </button>
      </header>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">

        {/* Creating */}
        {status === 'creating' && (
          <div className="flex flex-col items-center gap-5">
            <Loader2 className="w-12 h-12 text-brand-400 animate-spin" />
            <p className="text-slate-400 text-lg">Creating session…</p>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-6 max-w-md text-center px-4">
            <div className="w-20 h-20 rounded-3xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-red-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">Backend Connection Error</h3>
              <p className="text-red-400 text-sm mb-3 leading-relaxed">{error}</p>
              <p className="text-slate-400 text-xs">
                Backend target: <code className="text-slate-300 font-mono bg-surface-800 px-2 py-0.5 rounded border border-surface-700">{getApiBaseUrl() || `${window.location.origin} (current domain)`}</code>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => initSession(true)}
                className="px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-medium transition"
              >
                Retry
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-3 rounded-xl bg-surface-700 text-white font-medium hover:bg-surface-600 active:scale-95 transition"
              >
                Go Home
              </button>
            </div>
          </div>
        )}

        {/* Waiting — main projector UI, must be very readable */}
        {status === 'waiting' && session && (
          <div className="flex flex-col lg:flex-row items-center justify-center gap-12 w-full max-w-4xl">

            {/* Left: Code section */}
            <div className="flex flex-col items-center gap-6 text-center">

              {/* Waiting status */}
              <p className="text-slate-300 text-lg font-medium">
                Waiting for phone to connect…
              </p>

              {/* Instruction */}
              <p className="text-slate-400 text-base">
                Open LiveLens on your phone and enter this code
              </p>

              {/* Big pairing code — must be legible from across the room */}
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-4">
                  <span className="text-8xl font-mono font-black tracking-[0.3em] text-white drop-shadow-2xl select-all">
                    {session.code}
                  </span>
                  <button
                    onClick={copyCode}
                    title="Copy code"
                    className="p-3 rounded-2xl bg-surface-700 hover:bg-surface-600 border border-surface-600 text-slate-400 hover:text-white transition-all"
                  >
                    {copied
                      ? <Check className="w-6 h-6 text-green-400" />
                      : <Copy className="w-6 h-6" />
                    }
                  </button>
                  <button
                    onClick={() => initSession(true)}
                    title="Generate New Code"
                    className="p-3 rounded-2xl bg-surface-700 hover:bg-surface-600 border border-surface-600 text-slate-400 hover:text-white transition-all active:scale-95"
                  >
                    <RefreshCw className="w-6 h-6" />
                  </button>
                </div>
                <p className="text-slate-600 text-sm tracking-widest uppercase">
                  Pairing Code
                </p>
              </div>

              {/* URL hint */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-800 border border-surface-700">
                <Wifi className="w-4 h-4 text-brand-400 flex-shrink-0" />
                <span className="text-slate-400 text-sm font-mono break-all">
                  {window.location.origin}/camera
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden lg:flex flex-col items-center gap-3 self-stretch justify-center">
              <div className="flex-1 w-px bg-surface-700" />
              <span className="text-slate-600 text-sm font-medium px-2">or</span>
              <div className="flex-1 w-px bg-surface-700" />
            </div>
            <div className="lg:hidden w-full max-w-xs h-px bg-surface-700" />

            {/* Right: QR code */}
            <div className="flex flex-col items-center gap-4">
              <div className="p-5 bg-white rounded-3xl shadow-2xl">
                <QRCodeSVG value={cameraUrl} size={200} />
              </div>
              <p className="text-slate-500 text-sm text-center">
                Scan with your phone camera
              </p>
            </div>
          </div>
        )}

        {/* ── Pairing Popup Modal on Projector ── */}
        {isPhonePaired && status !== 'connected' && (
          <div className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-black/75 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300">
            <div className="w-full max-w-lg bg-surface-800/95 border-2 border-green-500/50 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-green-500/10 flex flex-col items-center gap-6 text-center">
              {/* Simple Paired Icon */}
              <img
                src="/paired-icon.png"
                alt="Phone Paired"
                className="w-24 h-24 object-contain"
              />

              {/* Badge & Title */}
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/30 text-xs font-bold uppercase tracking-wider mb-3">
                  <ShieldCheck className="w-4 h-4 text-green-400" />
                  <span>Device Paired</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">
                  Phone Paired!
                </h2>
                <p className="text-slate-300 text-base sm:text-lg max-w-sm mx-auto leading-relaxed">
                  Phone successfully connected to this projector screen.
                </p>
              </div>

              {/* Waiting for camera to start */}
              <div className="w-full py-4 px-6 rounded-2xl bg-surface-900/90 border border-surface-700 flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-brand-400 shrink-0" />
                <span className="text-slate-300 text-sm font-medium">
                  Waiting for phone camera broadcast to start…
                </span>
              </div>

              {/* Session code reminder */}
              <p className="text-slate-500 text-xs font-mono">
                Session Code: <span className="text-slate-400 font-bold">{session?.code}</span>
              </p>
            </div>
          </div>
        )}

        {/* Connected — Live badge overlay */}
        {status === 'connected' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-green-500/20 border border-green-500/40 backdrop-blur-md shadow-xl shadow-green-500/10">
              <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_#4ade80]" />
              <span className="text-green-300 font-bold text-lg tracking-wide">LIVE</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
