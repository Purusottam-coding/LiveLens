import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Camera,
  CameraOff,
  FlipHorizontal,
  FlipVertical,
  RotateCw,
  Loader2,
  AlertCircle,
  Wifi,
  Check,
  X,
  Sliders,
  Play,
  Square,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  Plus,
  Minus,
  User,
  SwitchCamera,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';
import { useCamera } from '@/hooks/useCamera';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useSocket } from '@/hooks/useSocket';
import { joinSession } from '@/services/api';
import type { Session, VideoTransform } from '@/types';

type Quality = 'auto' | '480p' | '720p' | '1080p';
type Status = 'idle' | 'pairing' | 'paired' | 'streaming' | 'error';

const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: '1080p', label: '1080p 60fps' },
  { value: '720p', label: '720p 60fps' },
  { value: '480p', label: '480p 30fps' },
  { value: 'auto', label: 'Auto' },
];

export default function CameraPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') ?? '';

  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [quality, setQuality] = useState<Quality>('1080p');
  const [session, setSession] = useState<Session | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showFineZoom, setShowFineZoom] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [videoTransform, setVideoTransform] = useState<VideoTransform>({
    rotation: 0,
    mirrorX: false,
    mirrorY: false,
    zoom: 1,
  });

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const socket = useSocket();

  // ONLY request and access camera when status is 'streaming' (AFTER paired and connected)
  const isCameraEnabled = status === 'streaming';

  const {
    stream,
    devices,
    selectedDeviceId,
    selectCamera,
    refreshDevices,
    switchCamera,
    facingMode,
    setCameraFacing,
    isTorchOn,
    toggleTorch,
    isTorchSupported,
    applyHardwareZoom,
    cameraError,
    currentResolution,
  } = useCamera({ enabled: isCameraEnabled, quality });

  useEffect(() => {
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  const { sendVideoTransform, sendPhonePaired, sendStopBroadcast } = useWebRTC({
    role: 'broadcaster',
    session,
    socket,
    localStream: stream ?? undefined,
    onConnected: () => {
      console.log('[Camera] WebRTC connected to Projector!');
      sendVideoTransform(videoTransform);
    },
    onDisconnected: () => console.log('[Camera] WebRTC disconnected'),
    onPeerJoined: () => {
      sendPhonePaired();
    },
  });

  const handlePair = useCallback(async (codeToUse?: unknown) => {
    const targetCode = (typeof codeToUse === 'string' ? codeToUse : code).trim().toUpperCase();
    if (!targetCode) return;
    setStatus('pairing');
    setError('');
    try {
      const s = await joinSession(targetCode);
      setSession(s);
      setCode(targetCode);
      setStatus('paired'); // Paired step
      try {
        localStorage.setItem('livelens_phone_session', JSON.stringify({ ...s, code: targetCode }));
      } catch (err) {
        // ignore storage error
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to join session';
      setError(msg);
      setStatus('error');
      try {
        localStorage.removeItem('livelens_phone_session');
      } catch (err) {
        // ignore
      }
    }
  }, [code]);

  useEffect(() => {
    if (status === 'paired') {
      sendPhonePaired();
      const t1 = setTimeout(() => sendPhonePaired(), 400);
      const t2 = setTimeout(() => sendPhonePaired(), 1000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [status, sendPhonePaired]);

  useEffect(() => {
    if (initialCode) {
      handlePair(initialCode);
    } else {
      try {
        const saved = localStorage.getItem('livelens_phone_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.code) {
            setCode(parsed.code);
            handlePair(parsed.code);
          }
        }
      } catch (err) {
        localStorage.removeItem('livelens_phone_session');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartBroadcast = () => {
    setStatus('streaming'); // Starts camera & WebRTC transmission
    sendVideoTransform(videoTransform);
  };

  const handleStopBroadcast = () => {
    sendStopBroadcast();
    try {
      localStorage.removeItem('livelens_phone_session');
    } catch (err) {
      // ignore
    }
    setStatus('idle'); // Stops camera and returns to initial pairing screen
  };

  const handleRefreshCameras = async () => {
    setIsRefreshing(true);
    await refreshDevices();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // ── Rotation and Mirror handlers ──
  const handleRotate = (angle?: number) => {
    setVideoTransform((prev) => {
      const nextRotation = typeof angle === 'number' ? angle : (prev.rotation + 90) % 360;
      const next = { ...prev, rotation: nextRotation };
      sendVideoTransform(next);
      return next;
    });
  };

  const handleToggleMirrorX = () => {
    setVideoTransform((prev) => {
      const next = { ...prev, mirrorX: !prev.mirrorX };
      sendVideoTransform(next);
      return next;
    });
  };

  const handleToggleMirrorY = () => {
    setVideoTransform((prev) => {
      const next = { ...prev, mirrorY: !prev.mirrorY };
      sendVideoTransform(next);
      return next;
    });
  };

  const handleSetZoom = (newZoom: number) => {
    const rounded = Math.min(5, Math.max(1, Math.round(newZoom * 10) / 10));
    setVideoTransform((prev) => {
      const next = { ...prev, zoom: rounded };
      sendVideoTransform(next);
      return next;
    });
    applyHardwareZoom(rounded);
  };

  const handleZoomIn = () => {
    const current = videoTransform.zoom || 1;
    handleSetZoom(Math.min(5, current + 0.5));
  };

  const handleZoomOut = () => {
    const current = videoTransform.zoom || 1;
    handleSetZoom(Math.max(1, current - 0.5));
  };

  const handleResetTransform = () => {
    const next: VideoTransform = { rotation: 0, mirrorX: false, mirrorY: false, zoom: 1 };
    setVideoTransform(next);
    sendVideoTransform(next);
    applyHardwareZoom(1);
  };

  // ── Pinch-to-zoom gesture handlers ──
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
      handleSetZoom(touchStartZoomRef.current * ratio);
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  const isLive = status === 'streaming';
  const activeIndex = devices.findIndex((d) => d.deviceId === selectedDeviceId);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="min-h-screen bg-[#080c14] flex flex-col relative overflow-hidden"
    >

      {/* Live camera preview (only visible when streaming) */}
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

      {/* Gradient scrim */}
      {isLive && (
        <div className="fixed inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none" />
      )}

      {/* ── Top bar (Modern Mobile HUD) ── */}
      <header className="relative z-10 flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 gap-2 select-none">
        {/* Status badge */}
        <div className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full backdrop-blur-xl border font-bold text-xs sm:text-sm transition-all shadow-lg shrink-0 ${
          isLive
            ? 'bg-red-500/20 border-red-500/40 text-red-300 shadow-red-500/10'
            : status === 'paired'
            ? 'bg-green-500/25 border-green-400/50 text-green-300 shadow-green-500/10'
            : 'bg-white/10 border-white/15 text-white/70'
        }`}>
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

        {/* Right side HUD actions during live streaming */}
        {isLive && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Flashlight / Torch */}
            {isTorchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                title={isTorchOn ? 'Flashlight On' : 'Flashlight Off'}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all backdrop-blur-xl shadow-lg active:scale-90 ${
                  isTorchOn
                    ? 'bg-amber-400 text-slate-950 shadow-amber-400/40 ring-2 ring-amber-300'
                    : 'bg-black/60 border border-white/15 text-white/90 hover:bg-black/80'
                }`}
              >
                <Zap className={`w-4 h-4 sm:w-5 sm:h-5 ${isTorchOn ? 'fill-current' : ''}`} />
              </button>
            )}

            {/* Quick Rotate 90° */}
            <button
              type="button"
              onClick={() => handleRotate()}
              title="Rotate Video 90°"
              className={`h-9 sm:h-10 px-2.5 sm:px-3 rounded-full flex items-center gap-1 transition-all backdrop-blur-xl shadow-lg active:scale-90 ${
                videoTransform.rotation !== 0
                  ? 'bg-brand-500 text-white font-bold text-xs ring-2 ring-brand-400'
                  : 'bg-black/60 border border-white/15 text-white/90 hover:bg-black/80 text-xs font-semibold'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {videoTransform.rotation !== 0 && <span>{videoTransform.rotation}°</span>}
            </button>

            {/* Quick Mirror */}
            <button
              type="button"
              onClick={handleToggleMirrorX}
              title="Mirror Video"
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all backdrop-blur-xl shadow-lg active:scale-90 ${
                videoTransform.mirrorX
                  ? 'bg-brand-500 text-white ring-2 ring-brand-400'
                  : 'bg-black/60 border border-white/15 text-white/90 hover:bg-black/80'
              }`}
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>

            {/* Stream Quality Selector Pill */}
            <div className="relative">
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as Quality)}
                title="Video Quality"
                className="h-9 sm:h-10 px-2.5 sm:px-3 rounded-full bg-black/60 border border-white/15 text-white text-xs font-bold outline-none cursor-pointer backdrop-blur-xl shadow-lg hover:bg-black/80 transition-all appearance-none pr-6"
              >
                {QUALITY_OPTIONS.map((q) => (
                  <option key={q.value} value={q.value} className="bg-slate-900 text-white">
                    {q.value === 'auto' ? 'Auto' : q.value.toUpperCase()}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/60">
                ▼
              </span>
            </div>
          </div>
        )}
      </header>

      {/* ── 1. UNPAIRED: Enter Pairing Code ── */}
      {status === 'idle' || status === 'pairing' || status === 'error' ? (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8">
          <div className="w-full max-w-sm bg-surface-800/90 backdrop-blur-xl border border-surface-700 rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-5 relative">
            
            {/* Quality selector on card top-right (as indicated by the arrow) */}
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

            {/* Simple Camera Icon */}
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

      {/* ── 2. PAIRED: Show Paired Status & Explicit "Start Broadcast" Button ── */}
      {status === 'paired' && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 sm:p-8">
          <div className="w-full max-w-sm bg-surface-800/90 backdrop-blur-xl border border-surface-700 rounded-3xl p-7 shadow-2xl flex flex-col items-center gap-6 text-center">
            {/* Simple Paired Icon */}
            <img
              src="/paired-icon.png"
              alt="Phone Paired"
              className="w-20 h-20 object-contain"
            />

            <div>
              <h2 className="text-2xl font-bold text-white mb-1.5">Paired Successfully!</h2>
              <p className="text-slate-300 text-sm">
                Connected to Projector Code: <strong className="text-brand-400 font-mono tracking-widest text-base">{code}</strong>
              </p>
              <p className="text-slate-400 text-xs mt-2">
                Click below to start live camera streaming
              </p>
            </div>

            {/* Front / Back selection before starting */}
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

            {/* Compact, balanced start button (no overly long border) */}
            <button
              onClick={handleStartBroadcast}
              className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full bg-green-500 hover:bg-green-600 active:scale-95 text-white font-bold text-base transition-all duration-200 shadow-xl shadow-green-500/25"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Enable Camera & Start Live</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Camera error ── */}
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

      {/* ── Spacer for live view ── */}
      {isLive && !cameraError && <div className="flex-1" />}

      {/* ── Native-Style Zoom Dial (Floating, Non-Intrusive) ── */}
      {isLive && !cameraError && (
        <div className="fixed bottom-24 inset-x-0 z-20 flex flex-col items-center justify-center px-4 pointer-events-none gap-2 select-none">
          {/* Fine-tune zoom slider popup (only visible when toggled) */}
          {showFineZoom && (
            <div className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-full bg-black/85 backdrop-blur-2xl border border-white/20 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={(videoTransform.zoom || 1) <= 1}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white transition-all"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="range"
                min="1"
                max="5"
                step="0.1"
                value={videoTransform.zoom || 1}
                onChange={(e) => handleSetZoom(parseFloat(e.target.value))}
                className="w-32 accent-brand-500 h-2 bg-surface-700 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={(videoTransform.zoom || 1) >= 5}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white transition-all"
              >
                <Plus className="w-4 h-4" />
              </button>
              <span className="font-mono font-black text-brand-400 text-xs w-9 text-right">
                {(videoTransform.zoom || 1).toFixed(1)}x
              </span>
            </div>
          )}

          {/* Quick Zoom Preset Pill */}
          <div className="pointer-events-auto flex items-center p-1 rounded-full bg-black/65 backdrop-blur-xl border border-white/15 shadow-2xl gap-1">
            {[1, 1.5, 2, 3, 5].map((z) => {
              const currentZoom = videoTransform.zoom || 1;
              const isExact = Math.abs(currentZoom - z) < 0.15;
              return (
                <button
                  key={z}
                  type="button"
                  onClick={() => handleSetZoom(z)}
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full font-bold text-xs sm:text-sm flex items-center justify-center transition-all active:scale-95 ${
                    isExact
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/50 scale-105'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {z}x
                </button>
              );
            })}

            {/* Toggle fine slider */}
            <button
              type="button"
              onClick={() => setShowFineZoom((prev) => !prev)}
              title="Fine-tune Zoom Slider"
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                showFineZoom
                  ? 'bg-white/30 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Native Camera Bottom Thumb Deck ── */}
      {isLive && !cameraError && (
        <div className="fixed bottom-0 inset-x-0 z-20 pb-6 pt-3 px-6 pointer-events-auto flex items-center justify-between max-w-sm sm:max-w-md mx-auto select-none">
          {/* Left: Front / Back Camera Flip Button */}
          <button
            type="button"
            onClick={switchCamera}
            className="flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-full bg-black/75 hover:bg-black/90 active:scale-90 backdrop-blur-xl border border-white/20 text-white shadow-2xl transition-all"
            title="Switch Camera (Front / Back)"
          >
            <SwitchCamera className="w-5 h-5 text-brand-400" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300">
              {facingMode === 'user' ? 'Front' : 'Back'}
            </span>
          </button>

          {/* Center: Stop Stream Button */}
          <button
            type="button"
            onClick={handleStopBroadcast}
            className="flex items-center gap-2.5 px-6 sm:px-7 py-3.5 sm:py-4 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 text-white font-extrabold text-sm sm:text-base shadow-2xl shadow-red-600/40 backdrop-blur-xl border border-red-400/40 transition-all"
            title="End Broadcast"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>End Live</span>
          </button>

          {/* Right: More Controls & Settings */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-full bg-black/75 hover:bg-black/90 active:scale-90 backdrop-blur-xl border border-white/20 text-white shadow-2xl transition-all"
            title="More Options & Settings"
          >
            <Sliders className="w-5 h-5 text-slate-200" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300">
              More
            </span>
          </button>
        </div>
      )}

      {/* ── MORE OPTIONS (Modern Mobile Bottom Sheet) ── */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          {/* Backdrop click to dismiss */}
          <div className="flex-1" onClick={() => setIsSettingsOpen(false)} />

          <div className="w-full max-w-lg mx-auto bg-surface-900/98 backdrop-blur-2xl border-t border-surface-700/80 rounded-t-[32px] p-6 shadow-2xl flex flex-col gap-4 text-white max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
            {/* Grab Handle */}
            <div className="w-12 h-1.5 bg-surface-600/80 rounded-full mx-auto -mt-2 mb-1 shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-surface-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-500/20 flex items-center justify-center shrink-0">
                  <Sliders className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">More Options</h3>
                  <p className="text-xs text-slate-400">Stream quality, rotation & screen flip</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="p-2.5 rounded-full bg-surface-800 hover:bg-surface-700 text-slate-300 hover:text-white transition-all active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Section 1: Video Orientation & Mirror ── */}
            <div className="flex flex-col gap-3.5 p-4 sm:p-5 rounded-2xl bg-surface-800/80 border border-surface-700/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCw className="w-4 h-4 text-brand-400" />
                  <span className="text-sm font-bold text-white uppercase tracking-wider">Rotation & Flip</span>
                </div>
                {(videoTransform.rotation !== 0 || videoTransform.mirrorX || videoTransform.mirrorY) && (
                  <button
                    type="button"
                    onClick={handleResetTransform}
                    className="text-xs text-brand-400 hover:text-brand-300 font-bold bg-brand-500/10 px-2.5 py-1 rounded-lg transition"
                  >
                    Reset Normal
                  </button>
                )}
              </div>

              {/* Rotate Angle Pills */}
              <div>
                <span className="text-xs text-slate-400 block mb-2">Rotate View:</span>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => handleRotate(deg)}
                      className={`py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all active:scale-95 ${
                        videoTransform.rotation === deg
                          ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30 ring-1 ring-brand-400'
                          : 'bg-surface-700 text-slate-300 hover:bg-surface-650 hover:text-white'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>

              {/* Mirror Toggles */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleToggleMirrorX}
                  className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all active:scale-95 ${
                    videoTransform.mirrorX
                      ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
                      : 'bg-surface-700 text-slate-300 hover:bg-surface-650 hover:text-white'
                  }`}
                >
                  <FlipHorizontal className="w-4 h-4" />
                  <span>Mirror (H)</span>
                  {videoTransform.mirrorX && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/25 text-white font-black">ON</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleToggleMirrorY}
                  className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all active:scale-95 ${
                    videoTransform.mirrorY
                      ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
                      : 'bg-surface-700 text-slate-300 hover:bg-surface-650 hover:text-white'
                  }`}
                >
                  <FlipVertical className="w-4 h-4" />
                  <span>Flip (V)</span>
                  {videoTransform.mirrorY && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/25 text-white font-black">ON</span>
                  )}
                </button>
              </div>
            </div>

            {/* ── Section 2: Stream Quality ── */}
            <div className="flex flex-col gap-3 p-4 sm:p-5 rounded-2xl bg-surface-800/80 border border-surface-700/60">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white uppercase tracking-wider">Stream Quality</span>
                <span className="text-xs text-brand-400 font-mono font-bold">{quality.toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {QUALITY_OPTIONS.map((q) => {
                  const isSelected = quality === q.value;
                  return (
                    <button
                      key={q.value}
                      type="button"
                      onClick={() => setQuality(q.value)}
                      className={`flex items-center justify-between p-3 rounded-xl text-left transition-all active:scale-95 ${
                        isSelected
                          ? 'bg-brand-500/20 border-2 border-brand-500 text-white shadow-sm'
                          : 'bg-surface-700/80 border border-surface-650 text-slate-300 hover:text-white'
                      }`}
                    >
                      <p className="font-bold text-xs sm:text-sm">{q.label}</p>
                      {isSelected && <Check className="w-4 h-4 text-brand-400 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Section 3: Live Connection & Stream Info ── */}
            <div className="p-4 rounded-2xl bg-surface-800/80 border border-surface-700/60 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Stream Status:</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-green-400">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Broadcasting to Projector
                </span>
              </div>
              {currentResolution && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-surface-700/60">
                  <span className="text-slate-400">Camera Resolution:</span>
                  <span className="font-mono text-white font-bold">
                    {currentResolution.width} × {currentResolution.height}
                    {currentResolution.frameRate ? ` @ ${currentResolution.frameRate}fps` : ''}
                  </span>
                </div>
              )}
              {code && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-surface-700/60">
                  <span className="text-slate-400">Projector Code:</span>
                  <span className="font-mono text-brand-400 font-bold tracking-widest text-sm">
                    {code}
                  </span>
                </div>
              )}
            </div>

            {/* Done button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="w-full py-3.5 rounded-2xl bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-bold text-base transition shadow-xl shadow-brand-500/25"
            >
              Done
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
