import React, { useState, useEffect } from 'react';
import { Camera, Monitor, ArrowRight, Video } from 'lucide-react';
import Broadcaster from './components/Broadcaster';
import Viewer from './components/Viewer';

type ViewMode = 'home' | 'viewer' | 'broadcaster';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const path = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const role = params.get('role');

    // If explicit camera path or code is provided -> Broadcaster
    if (path.includes('/camera') || role === 'broadcaster' || role === 'camera' || (code && code.length === 6)) {
      return 'broadcaster';
    }
    // If explicit display path or role is provided -> Viewer
    if (path.includes('/display') || role === 'viewer' || role === 'display') {
      return 'viewer';
    }
    // Default to mode selection home screen
    return 'home';
  });

  const [initialCode, setInitialCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('code') || '';
  });

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const role = params.get('role');

      if (path.includes('/camera') || role === 'broadcaster' || role === 'camera' || (code && code.length === 6)) {
        setViewMode('broadcaster');
        if (code) setInitialCode(code);
      } else if (path.includes('/display') || role === 'viewer' || role === 'display') {
        setViewMode('viewer');
      } else {
        setViewMode('home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (mode: ViewMode, path: string) => {
    window.history.pushState({}, '', path);
    setViewMode(mode);
  };

  if (viewMode === 'broadcaster') {
    return (
      <Broadcaster
        initialCode={initialCode}
        onExit={() => navigateTo('home', '/')}
      />
    );
  }

  if (viewMode === 'viewer') {
    return (
      <Viewer
        onExit={() => navigateTo('home', '/')}
      />
    );
  }

  // ── Mode Selection Screen (Choose between Projector and Phone Camera) ──
  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col justify-center items-center p-4 sm:p-6 text-white select-none">
      <div className="w-full max-w-lg flex flex-col items-center gap-8">
        {/* App Title & Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-3xl bg-surface-800 border border-surface-700 flex items-center justify-center shadow-lg">
            <Video className="w-8 h-8 text-brand-400" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              LiveLens
            </h1>
            <p className="text-slate-400 text-sm sm:text-base mt-1.5 max-w-sm">
              Choose your device mode to start streaming
            </p>
          </div>
        </div>

        {/* Mode Selector Cards */}
        <div className="flex flex-col gap-4 w-full">
          {/* Card 1: Projector / Display Screen Mode */}
          <button
            type="button"
            onClick={() => navigateTo('viewer', '/display')}
            className="group relative flex items-center justify-between p-6 rounded-3xl bg-surface-800 hover:bg-surface-700/80 active:scale-[0.98] border border-surface-700 hover:border-slate-500 transition-all duration-200 shadow-xl text-left"
          >
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="w-14 h-14 rounded-2xl bg-surface-700/80 border border-surface-600 flex items-center justify-center shrink-0 transition">
                <Monitor className="w-7 h-7 text-brand-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-lg sm:text-xl text-white">
                    Projector / Screen
                  </h2>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-slate-300">
                    Display
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                  Display pairing code & stream live video on projector
                </p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-700 group-hover:bg-brand-500 flex items-center justify-center shrink-0 transition-all ml-2">
              <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>

          {/* Card 2: Phone Camera Broadcaster Mode */}
          <button
            type="button"
            onClick={() => navigateTo('broadcaster', '/camera')}
            className="group relative flex items-center justify-between p-6 rounded-3xl bg-surface-800 hover:bg-surface-700/80 active:scale-[0.98] border border-surface-700 hover:border-slate-500 transition-all duration-200 shadow-xl text-left"
          >
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="w-14 h-14 rounded-2xl bg-surface-700/80 border border-surface-600 flex items-center justify-center shrink-0 transition">
                <Camera className="w-7 h-7 text-green-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-lg sm:text-xl text-white">
                    Phone Camera
                  </h2>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-slate-300">
                    Camera
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                  Pair with 6-digit code & broadcast live camera feed
                </p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-700 group-hover:bg-green-500 flex items-center justify-center shrink-0 transition-all ml-2">
              <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
