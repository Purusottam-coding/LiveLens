import React, { useState } from 'react';
import {
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Zap,
  SwitchCamera,
  Square,
  Sliders,
  SlidersHorizontal,
  Plus,
  Minus,
  X,
  Check,
  Mic,
  MicOff,
} from 'lucide-react';
import type { VideoTransform } from '../types';

export type Quality = 'auto' | '480p' | '720p' | '1080p';

export const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: '1080p', label: '1080p 60fps' },
  { value: '720p', label: '720p 60fps' },
  { value: '480p', label: '480p 30fps' },
  { value: 'auto', label: 'Auto' },
];

interface ControlsProps {
  roomCode: string;
  videoTransform: VideoTransform;
  onTransformChange: (newTransform: VideoTransform) => void;
  facingMode: 'user' | 'environment';
  onSwitchCamera: () => void;
  isMicMuted?: boolean;
  onToggleMic?: () => void;
  isTorchSupported: boolean;
  isTorchOn: boolean;
  onToggleTorch: () => void;
  quality: Quality;
  onQualityChange: (quality: Quality) => void;
  onEndLive: () => void;
  currentResolution?: { width: number; height: number; frameRate?: number } | null;
}

export default function Controls({
  roomCode,
  videoTransform,
  onTransformChange,
  facingMode,
  onSwitchCamera,
  isMicMuted = false,
  onToggleMic,
  isTorchSupported,
  isTorchOn,
  quality,
  onQualityChange,
  onToggleTorch,
  onEndLive,
  currentResolution,
}: ControlsProps) {
  const [showFineZoom, setShowFineZoom] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleRotate = (deg?: number) => {
    const nextRotation = deg !== undefined ? deg : (videoTransform.rotation + 90) % 360;
    onTransformChange({ ...videoTransform, rotation: nextRotation });
  };

  const handleToggleMirrorX = () => {
    onTransformChange({ ...videoTransform, mirrorX: !videoTransform.mirrorX });
  };

  const handleToggleMirrorY = () => {
    onTransformChange({ ...videoTransform, mirrorY: !videoTransform.mirrorY });
  };

  const handleSetZoom = (zoomLevel: number) => {
    const rounded = Math.min(5, Math.max(1, Math.round(zoomLevel * 10) / 10));
    onTransformChange({ ...videoTransform, zoom: rounded });
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
    onTransformChange({ rotation: 0, mirrorX: false, mirrorY: false, zoom: 1 });
  };

  return (
    <>
      {/* ── Top Bar Action Pills ── */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Flashlight / Torch */}
        {isTorchSupported && (
          <button
            type="button"
            onClick={onToggleTorch}
            title={isTorchOn ? 'Flashlight On' : 'Flashlight Off'}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all backdrop-blur-md active:scale-90 ${
              isTorchOn
                ? 'bg-white text-black font-bold shadow-md'
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
              ? 'bg-white text-black font-bold text-xs shadow-md'
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
              ? 'bg-white text-black font-bold shadow-md'
              : 'bg-black/60 border border-white/15 text-white/90 hover:bg-black/80'
          }`}
        >
          <FlipHorizontal className="w-4 h-4" />
        </button>

        {/* Stream Quality Selector */}
        <div className="relative">
          <select
            value={quality}
            onChange={(e) => onQualityChange(e.target.value as Quality)}
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

      {/* ── Floating Zoom Dial ── */}
      <div className="fixed bottom-24 inset-x-0 z-20 flex flex-col items-center justify-center px-4 pointer-events-none gap-2 select-none">
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
              className="w-32 accent-white h-2 bg-white/20 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={(videoTransform.zoom || 1) >= 5}
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
            <span className="font-mono font-bold text-white text-xs w-9 text-right">
              {(videoTransform.zoom || 1).toFixed(1)}x
            </span>
          </div>
        )}

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
                    ? 'bg-white text-black font-extrabold shadow-lg scale-105'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {z}x
              </button>
            );
          })}

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

      {/* ── Bottom Deck Controls ── */}
      <div className="fixed bottom-0 inset-x-0 z-20 pb-6 pt-3 px-4 sm:px-6 pointer-events-auto flex items-center justify-between gap-2 max-w-sm sm:max-w-md mx-auto select-none">
        {/* Switch Camera (Rotation/Flip icon only, no text) */}
        <button
          type="button"
          onClick={onSwitchCamera}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/75 hover:bg-black/90 active:scale-90 backdrop-blur-xl border border-white/20 text-white shadow-2xl flex items-center justify-center transition-all shrink-0"
          title={`Switch Camera (Currently: ${facingMode === 'user' ? 'Front' : 'Back'})`}
        >
          <SwitchCamera className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        </button>

        {/* Microphone Mute / Unmute Button (Clean monochrome: cross slash when muted, mic when unmuted) */}
        {onToggleMic && (
          <button
            type="button"
            onClick={() => onToggleMic()}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/75 hover:bg-black/90 active:scale-90 backdrop-blur-xl border border-white/20 text-white shadow-2xl flex items-center justify-center transition-all shrink-0"
            title={isMicMuted ? 'Microphone Muted (Tap to Unmute)' : 'Microphone Live (Tap to Mute)'}
          >
            {isMicMuted ? (
              <MicOff className="w-5 h-5 sm:w-6 sm:h-6 text-white/40" />
            ) : (
              <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            )}
          </button>
        )}

        {/* End Live Broadcast */}
        <button
          type="button"
          onClick={onEndLive}
          className="flex-1 flex items-center justify-center gap-2 px-4 sm:px-6 py-3.5 sm:py-4 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs sm:text-sm transition-all"
          title="End Live Stream"
        >
          <Square className="w-4 h-4 fill-current shrink-0" />
          <span>End Live</span>
        </button>

        {/* More Settings */}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/75 hover:bg-black/90 active:scale-90 backdrop-blur-xl border border-white/20 text-white shadow-2xl flex items-center justify-center transition-all shrink-0"
          title="More Options"
        >
          <Sliders className="w-5 h-5 sm:w-6 sm:h-6 text-slate-200" />
        </button>
      </div>

      {/* ── More Options Modal Sheet (Clean Monochrome Dark UI) ── */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex-1" onClick={() => setIsSettingsOpen(false)} />

          <div className="w-full max-w-lg mx-auto bg-neutral-900 border-t border-white/10 rounded-t-[28px] p-6 shadow-2xl flex flex-col gap-4 text-white max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto -mt-2 mb-1 shrink-0" />

            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <Sliders className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">More Options</h3>
                  <p className="text-xs text-white/50">Stream quality, rotation & screen flip</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Rotation & Flip */}
            <div className="flex flex-col gap-3.5 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCw className="w-4 h-4 text-white/70" />
                  <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">Rotation & Flip</span>
                </div>
                {(videoTransform.rotation !== 0 || videoTransform.mirrorX || videoTransform.mirrorY) && (
                  <button
                    type="button"
                    onClick={handleResetTransform}
                    className="text-xs text-white/70 hover:text-white font-medium bg-white/10 px-2.5 py-1 rounded-lg transition"
                  >
                    Reset Normal
                  </button>
                )}
              </div>

              <div>
                <span className="text-xs text-white/50 block mb-2">Rotate View:</span>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 90, 180, 270].map((deg) => {
                    const isSelected = videoTransform.rotation === deg;
                    return (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => handleRotate(deg)}
                        className={`py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-white text-black shadow-md font-bold'
                            : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {deg}°
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleToggleMirrorX}
                  className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs sm:text-sm font-medium transition-all active:scale-95 ${
                    videoTransform.mirrorX
                      ? 'bg-white text-black font-bold shadow-md'
                      : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <FlipHorizontal className="w-4 h-4" />
                  <span>Mirror (H)</span>
                  {videoTransform.mirrorX && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/20 text-black font-extrabold">ON</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleToggleMirrorY}
                  className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-xs sm:text-sm font-medium transition-all active:scale-95 ${
                    videoTransform.mirrorY
                      ? 'bg-white text-black font-bold shadow-md'
                      : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <FlipVertical className="w-4 h-4" />
                  <span>Flip (V)</span>
                  {videoTransform.mirrorY && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/20 text-black font-extrabold">ON</span>
                  )}
                </button>
              </div>
            </div>

            {/* Stream Quality */}
            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">Stream Quality</span>
                <span className="text-xs text-white/60 font-mono font-medium">{quality.toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {QUALITY_OPTIONS.map((q) => {
                  const isSelected = quality === q.value;
                  return (
                    <button
                      key={q.value}
                      type="button"
                      onClick={() => onQualityChange(q.value)}
                      className={`flex items-center justify-between p-3 rounded-xl text-left transition-all active:scale-95 ${
                        isSelected
                          ? 'bg-white/15 border border-white/40 text-white font-bold'
                          : 'bg-white/5 border border-transparent text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <p className="text-xs sm:text-sm">{q.label}</p>
                      {isSelected && <Check className="w-4 h-4 text-white stroke-[2.5]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Info */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col gap-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white/50">Stream Status:</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-white/90">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  Broadcasting to Projector
                </span>
              </div>
              {currentResolution && (
                <div className="flex items-center justify-between pt-1 border-t border-white/10">
                  <span className="text-white/50">Resolution:</span>
                  <span className="font-mono text-white/90 font-medium">
                    {currentResolution.width} × {currentResolution.height}
                    {currentResolution.frameRate ? ` @ ${currentResolution.frameRate}fps` : ''}
                  </span>
                </div>
              )}
              {roomCode && (
                <div className="flex items-center justify-between pt-1 border-t border-white/10">
                  <span className="text-white/50">Projector Code:</span>
                  <span className="font-mono text-white font-bold tracking-widest text-sm">
                    {roomCode}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="w-full py-3.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-white/90 active:scale-98 transition shadow-lg"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}