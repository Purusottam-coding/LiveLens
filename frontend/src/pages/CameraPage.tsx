import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Camera,
  CameraOff,
  FlipHorizontal2,
  FlipHorizontal,
  FlipVertical,
  RotateCw,
  Loader2,
  AlertCircle,
  RadioTower,
  Wifi,
  Settings,
  Check,
  RefreshCw,
  X,
  Sliders,
  Play,
  Square,
  ShieldCheck,
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [videoTransform, setVideoTransform] = useState<VideoTransform>({
    rotation: 0,
    mirrorX: true,
    mirrorY: false,
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
    isTorchOn,
    toggleTorch,
    isTorchSupported,
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

  const handlePair = useCallback(async () => {
    if (!code.trim()) return;
    setStatus('pairing');
    setError('');
    try {
      const s = await joinSession(code.trim().toUpperCase());
      setSession(s);
      setStatus('paired'); // Paired step
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to join session';
      setError(msg);
      setStatus('error');
    }
  }, [code]);

  useEffect(() => {
    if (status === 'paired') {
      sendPhonePaired();
    }
  }, [status, sendPhonePaired]);

  useEffect(() => {
    if (initialCode) handlePair();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartBroadcast = () => {
    setStatus('streaming'); // Starts camera & WebRTC transmission
    sendVideoTransform(videoTransform);
  };

  const handleStopBroadcast = () => {
    sendStopBroadcast();
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

  const handleResetTransform = () => {
    const next: VideoTransform = { rotation: 0, mirrorX: true, mirrorY: false };
    setVideoTransform(next);
    sendVideoTransform(next);
  };

  const isLive = status === 'streaming';
  const activeIndex = devices.findIndex((d) => d.deviceId === selectedDeviceId);

  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col relative overflow-hidden">

      {/* Live camera preview (only visible when streaming) */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{
          transform: `rotate(${videoTransform.rotation}deg) scaleX(${videoTransform.mirrorX ? -1 : 1}) scaleY(${videoTransform.mirrorY ? -1 : 1})`,
          transition: 'transform 0.3s ease',
        }}
        className={`fixed inset-0 w-full h-full object-cover transition-opacity duration-700 ${
          isLive ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Gradient scrim */}
      {isLive && (
        <div className="fixed inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none" />
      )}

      {/* ── Top bar ── */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 gap-3">
        {/* Status badge */}
        <div className={`flex items-center gap-2.5 px-5 sm:px-6 py-3 rounded-2xl backdrop-blur-md border font-bold text-base sm:text-lg transition-all shadow-lg shrink-0 ${
          isLive
            ? 'bg-red-500/30 border-red-400/60 text-red-300 shadow-red-500/10'
            : status === 'paired'
            ? 'bg-green-500/25 border-green-400/50 text-green-300 shadow-green-500/10'
            : 'bg-white/12 border-white/20 text-white/70'
        }`}>
          {isLive ? (
            <>
              <span className="w-3 h-3 rounded-full bg-red-400 animate-pulse shadow-[0_0_10px_#f87171]" />
              LIVE
            </>
          ) : status === 'paired' ? (
            <>
              <ShieldCheck className="w-5 h-5 text-green-400" />
              <span>Paired</span>
            </>
          ) : (
            <>
              <Wifi className="w-5 h-5 text-white/60" />
              <span>Not Paired</span>
            </>
          )}
        </div>

        {/* Right side: during streaming show Settings + Quality */}
        {isLive && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-4 sm:px-5 py-3 rounded-2xl bg-white/12 hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/20 text-white text-sm sm:text-base font-semibold transition-all shadow-lg"
              title="Camera Settings"
            >
              <Settings className="w-5 h-5 text-brand-400 shrink-0" />
              <span className="max-w-[100px] sm:max-w-[140px] truncate">
                {devices.length > 0 && activeIndex >= 0 ? `Cam ${activeIndex + 1}` : 'Camera'}
              </span>
              {devices.length > 1 && (
                <span className="px-2 py-0.5 rounded-full bg-brand-500/40 text-brand-300 text-xs font-bold">
                  {devices.length}
                </span>
              )}
            </button>

            {/* Quality selector */}
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as Quality)}
              title="Video Quality"
              className="px-4 sm:px-5 py-3 rounded-2xl bg-white/12 hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/20 text-white text-sm sm:text-base font-semibold outline-none cursor-pointer transition-all shadow-lg"
            >
              {QUALITY_OPTIONS.map((q) => (
                <option key={q.value} value={q.value} className="bg-slate-900 text-white">
                  {q.label}
                </option>
              ))}
            </select>
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
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8">
          <div className="w-full max-w-sm bg-surface-800/90 backdrop-blur-xl border border-green-500/30 rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-6 text-center">
            <div className="w-20 h-20 rounded-3xl bg-green-500/20 border border-green-500/40 flex items-center justify-center shadow-lg shadow-green-500/20">
              <ShieldCheck className="w-10 h-10 text-green-400" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Paired Successfully!</h2>
              <p className="text-slate-400 text-sm">
                Connected to Projector Code: <strong className="text-brand-400 font-mono tracking-widest">{code}</strong>
              </p>
              <p className="text-slate-500 text-xs mt-2">
                Click below to start live camera streaming
              </p>
            </div>

            <button
              onClick={handleStartBroadcast}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-green-500 hover:bg-green-600 active:scale-95 text-white font-bold text-lg transition-all duration-200 shadow-xl shadow-green-500/30"
            >
              <Play className="w-5 h-5 fill-current" />
              Enable Camera & Start Live
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

      {/* ── 3. STREAMING: Bottom Controls ── */}
      {isLive && !cameraError && (
        <div className="fixed bottom-6 inset-x-0 z-20 flex items-center justify-center gap-2 sm:gap-3 px-3 pointer-events-auto flex-wrap">
          {/* Torch */}
          {isTorchSupported && (
            <button
              onClick={toggleTorch}
              title="Toggle flashlight"
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl font-semibold text-xs sm:text-sm backdrop-blur-md border shadow-lg transition-all ${
                isTorchOn
                  ? 'bg-amber-400/20 border-amber-400/50 text-amber-300 shadow-amber-400/10'
                  : 'bg-black/60 border-white/20 text-white/80 hover:bg-black/80'
              }`}
            >
              <span className="text-sm">🔦</span>
              <span className="hidden sm:inline">{isTorchOn ? 'Flash On' : 'Flash Off'}</span>
            </button>
          )}

          {/* Quick Rotate Button */}
          <button
            onClick={() => handleRotate()}
            title="Rotate Video 90°"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/20 text-white/90 font-semibold text-xs sm:text-sm hover:bg-black/80 hover:text-white shadow-lg transition-all"
          >
            <RotateCw className="w-4 h-4 text-brand-400" />
            <span>{videoTransform.rotation !== 0 ? `${videoTransform.rotation}°` : 'Rotate'}</span>
          </button>

          {/* Quick Mirror Button */}
          <button
            onClick={handleToggleMirrorX}
            title="Mirror / Flip Video"
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl backdrop-blur-md border shadow-lg transition-all text-xs sm:text-sm font-semibold ${
              videoTransform.mirrorX
                ? 'bg-brand-500/25 border-brand-500 text-brand-300'
                : 'bg-black/60 border-white/20 text-white/90 hover:bg-black/80'
            }`}
          >
            <FlipHorizontal className="w-4 h-4 text-brand-400" />
            <span>{videoTransform.mirrorX ? 'Mirrored' : 'Mirror'}</span>
          </button>

          {/* Camera Settings / Switch button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            title="Camera Settings"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/20 text-white/90 font-semibold text-xs sm:text-sm hover:bg-black/80 hover:text-white shadow-lg transition-all"
          >
            <Settings className="w-4 h-4 text-brand-400" />
            <span>Settings</span>
          </button>

          {/* Stop Broadcast */}
          <button
            onClick={handleStopBroadcast}
            title="Stop Broadcast"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-red-500/80 hover:bg-red-600 text-white font-semibold text-xs sm:text-sm shadow-lg transition-all"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </button>
        </div>
      )}

      {/* ── CAMERA SETTINGS MODAL ── */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-surface-900 border border-surface-700 rounded-3xl p-6 shadow-2xl flex flex-col gap-5 text-white max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-surface-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
                  <Sliders className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Camera Settings</h3>
                  <p className="text-xs text-slate-400">Select source, orientation & mirror</p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-slate-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Video Orientation & Mirror Section ── */}
            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-surface-800/60 border border-surface-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCw className="w-4 h-4 text-brand-400" />
                  <span className="text-sm font-semibold text-white">Rotation & Mirror</span>
                </div>
                {(videoTransform.rotation !== 0 || videoTransform.mirrorX || videoTransform.mirrorY) && (
                  <button
                    onClick={handleResetTransform}
                    className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                  >
                    Reset Normal
                  </button>
                )}
              </div>

              {/* Rotation angles: 0, 90, 180, 270 */}
              <div>
                <span className="text-xs text-slate-400 block mb-2">Rotate Angle:</span>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      onClick={() => handleRotate(deg)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        videoTransform.rotation === deg
                          ? 'bg-brand-500 border-brand-400 text-white shadow-md shadow-brand-500/20'
                          : 'bg-surface-700/80 border-surface-600 text-slate-300 hover:bg-surface-700 hover:text-white'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>

              {/* Mirror Horizontal & Vertical toggles */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleToggleMirrorX}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    videoTransform.mirrorX
                      ? 'bg-brand-500/25 border-brand-500 text-brand-300'
                      : 'bg-surface-700/80 border-surface-600 text-slate-300 hover:bg-surface-700 hover:text-white'
                  }`}
                >
                  <FlipHorizontal className="w-4 h-4" />
                  <span>Mirror (Flip H)</span>
                  {videoTransform.mirrorX && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-brand-500 text-white font-bold">ON</span>
                  )}
                </button>

                <button
                  onClick={handleToggleMirrorY}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    videoTransform.mirrorY
                      ? 'bg-brand-500/25 border-brand-500 text-brand-300'
                      : 'bg-surface-700/80 border-surface-600 text-slate-300 hover:bg-surface-700 hover:text-white'
                  }`}
                >
                  <FlipVertical className="w-4 h-4" />
                  <span>Flip Vertical</span>
                  {videoTransform.mirrorY && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-brand-500 text-white font-bold">ON</span>
                  )}
                </button>
              </div>
            </div>

            {/* ── Camera Source Selection ── */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
                <span>Select Camera Source ({devices.length})</span>
                <button
                  onClick={handleRefreshCameras}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 text-brand-400 hover:text-brand-300 normal-case font-medium text-xs transition"
                  title="Rescan cameras"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {devices.length === 0 ? (
                <div className="p-4 rounded-2xl bg-surface-800/60 border border-surface-700 text-center text-sm text-slate-400">
                  <Camera className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p>No external cameras detected yet.</p>
                  <p className="text-xs text-slate-500 mt-1">If using Iriun Webcam, make sure it is open and click Refresh.</p>
                </div>
              ) : (
                devices.map((device, idx) => {
                  const isCurrent = device.deviceId === selectedDeviceId;
                  const camNumber = idx + 1;
                  return (
                    <button
                      key={device.deviceId || idx}
                      onClick={() => {
                        selectCamera(device.deviceId);
                        setIsSettingsOpen(false);
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${
                        isCurrent
                          ? 'bg-brand-500/15 border-brand-500 shadow-md shadow-brand-500/10'
                          : 'bg-surface-800 hover:bg-surface-750 border-surface-700 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isCurrent
                              ? 'bg-brand-500 text-white'
                              : 'bg-surface-700 text-slate-300'
                          }`}
                        >
                          {camNumber}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-white truncate">
                            {device.label || `Camera ${camNumber}`}
                          </p>
                          <p className="text-xs text-slate-400">
                            {isCurrent ? 'Currently Connected' : 'Click to switch'}
                          </p>
                        </div>
                      </div>

                      {isCurrent ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-semibold shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 group-hover:text-white shrink-0">
                          Switch →
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Stream info */}
            {currentResolution && (
              <div className="p-3 rounded-2xl bg-surface-800/60 border border-surface-700 text-xs text-slate-400 flex items-center justify-between">
                <span>Active Resolution:</span>
                <span className="font-mono text-white font-medium">
                  {currentResolution.width} × {currentResolution.height}
                  {currentResolution.frameRate ? ` @ ${currentResolution.frameRate}fps` : ''}
                </span>
              </div>
            )}

            {/* Quick Switch Action */}
            {devices.length > 1 && (
              <button
                onClick={() => {
                  switchCamera();
                  setIsSettingsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-surface-800 hover:bg-surface-700 border border-surface-700 text-white text-sm font-semibold transition"
              >
                <FlipHorizontal2 className="w-4 h-4 text-brand-400" />
                Cycle to Next Camera
              </button>
            )}

            <button
              onClick={() => setIsSettingsOpen(false)}
              className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm transition"
            >
              Done
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
