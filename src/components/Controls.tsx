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
      <div className="fixed bottom-0 inset-x-0 z-20 pb-6 pt-3 px-6 pointer-events-auto flex items-center justify-between max-w-sm sm:max-w-md mx-auto select-none">
        {/* Switch Camera */}
        <button
          type="button"
          onClick={onSwitchCamera}
          className="flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-full bg-black/75 hover:bg-black/90 active:scale-90 backdrop-blur-xl border border-white/20 text-white shadow-2xl transition-all"
          title="Switch Camera (Front / Back)"
        >
          <SwitchCamera className="w-5 h-5 text-brand-400" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300">
            {facingMode === 'user' ? 'Front' : 'Back'}
          </span>
        </button>

        {/* End Live Broadcast */}
        <button
          type="button"
          onClick={onEndLive}
          className="flex items-center gap-2.5 px-6 sm:px-7 py-3.5 sm:py-4 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 text-white font-extrabold text-sm sm:text-base shadow-2xl shadow-red-600/40 backdrop-blur-xl border border-red-400/40 transition-all"
          title="End Live Stream"
        >
          <Square className="w-4 h-4 fill-current" />
          <span>End Live</span>
        </button>

        {/* More Settings */}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-full bg-black/75 hover:bg-black/90 active:scale-90 backdrop-blur-xl border border-white/20 text-white shadow-2xl transition-all"
          title="More Options"
        >
          <Sliders className="w-5 h-5 text-slate-200" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300">
            More
          </span>
        </button>
      </div>

      {/* ── More Options Modal Sheet ── */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex-1" onClick={() => setIsSettingsOpen(false)} />

          <div className="w-full max-w-lg mx-auto bg-surface-900/98 backdrop-blur-2xl border-t border-surface-700/80 rounded-t-[32px] p-6 shadow-2xl flex flex-col gap-4 text-white max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
            <div className="w-12 h-1.5 bg-surface-600/80 rounded-full mx-auto -mt-2 mb-1 shrink-0" />

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

            {/* Rotation & Flip */}
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

            {/* Stream Quality */}
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
                      onClick={() => onQualityChange(q.value)}
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

            {/* Info */}
            <div className="p-4 rounded-2xl bg-surface-800/80 border border-surface-700/60 flex flex-col gap-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Stream Status:</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-green-400">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Broadcasting to Projector
                </span>
              </div>
              {currentResolution && (
                <div className="flex items-center justify-between pt-1 border-t border-surface-700/60">
                  <span className="text-slate-400">Resolution:</span>
                  <span className="font-mono text-white font-bold">
                    {currentResolution.width} × {currentResolution.height}
                    {currentResolution.frameRate ? ` @ ${currentResolution.frameRate}fps` : ''}
                  </span>
                </div>
              )}
              {roomCode && (
                <div className="flex items-center justify-between pt-1 border-t border-surface-700/60">
                  <span className="text-slate-400">Projector Code:</span>
                  <span className="font-mono text-brand-400 font-bold tracking-widest text-sm">
                    {roomCode}
                  </span>
                </div>
              )}
            </div>

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
    </>
  );
}