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
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col justify-center items-center p-4 sm:p-6 text-white select-none">
      <div className="w-full max-w-lg flex flex-col items-center gap-8">
        {/* App Title & Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center shadow-md">
            <Video className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              LiveLens
            </h1>
            <p className="text-neutral-400 text-sm sm:text-base mt-1.5 max-w-sm">
              Choose your device mode to start streaming
            </p>
          </div>
        </div>

        {/* Mode Selector Cards */}
        <div className="flex flex-col gap-3 w-full">
          {/* Card 1: Projector / Display Screen Mode */}
          <button
            type="button"
            onClick={() => navigateTo('viewer', '/display')}
            className="group relative flex items-center justify-between p-5 sm:p-6 rounded-2xl bg-[#141414] hover:bg-[#1a1a1a] active:scale-[0.99] border border-neutral-800 hover:border-neutral-700 transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-neutral-800/80 border border-neutral-700 flex items-center justify-center shrink-0">
                <Monitor className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-base sm:text-lg text-white">
                    Projector / Screen
                  </h2>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-white/10 text-neutral-300">
                    Display
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-neutral-400 mt-0.5 leading-relaxed">
                  Display pairing code & stream live video on projector
                </p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-neutral-800 group-hover:bg-white flex items-center justify-center shrink-0 transition-all ml-2">
              <ArrowRight className="w-4 h-4 text-neutral-300 group-hover:text-black group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>

          {/* Card 2: Phone Camera Broadcaster Mode */}
          <button
            type="button"
            onClick={() => navigateTo('broadcaster', '/camera')}
            className="group relative flex items-center justify-between p-5 sm:p-6 rounded-2xl bg-[#141414] hover:bg-[#1a1a1a] active:scale-[0.99] border border-neutral-800 hover:border-neutral-700 transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-neutral-800/80 border border-neutral-700 flex items-center justify-center shrink-0">
                <Camera className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-base sm:text-lg text-white">
                    Phone Camera
                  </h2>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-white/10 text-neutral-300">
                    Camera
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-neutral-400 mt-0.5 leading-relaxed">
                  Pair with 6-digit code & broadcast live camera feed
                </p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-neutral-800 group-hover:bg-white flex items-center justify-center shrink-0 transition-all ml-2">
              <ArrowRight className="w-4 h-4 text-neutral-300 group-hover:text-black group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
