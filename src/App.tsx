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

    if (path.includes('/camera') || role === 'broadcaster' || role === 'camera' || (code && code.length === 6)) {
      return 'broadcaster';
    }
    if (path.includes('/display') || role === 'viewer' || role === 'display') {
      return 'viewer';
    }
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
    return <Broadcaster initialCode={initialCode} onExit={() => navigateTo('home', '/')} />;
  }

  if (viewMode === 'viewer') {
    return <Viewer />;
  }

  // Home Selection Landing
  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col justify-center items-center p-6 text-white select-none">
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        {/* App Title */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-3xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shadow-2xl shadow-brand-500/10">
            <Video className="w-8 h-8 text-brand-400" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              LiveLens
            </h1>
            <p className="text-slate-400 text-sm sm:text-base mt-1">
              Zero-latency wireless camera to projector streaming
            </p>
          </div>
        </div>

        {/* Mode Selector Cards */}
        <div className="flex flex-col gap-4 w-full">
          {/* Projector Viewer Mode */}
          <button
            type="button"
            onClick={() => navigateTo('viewer', '/display')}
            className="group flex items-center justify-between p-5 rounded-3xl bg-surface-800/90 hover:bg-surface-700/80 active:scale-[0.98] border border-surface-700 transition-all shadow-xl text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-500/20 group-hover:bg-brand-500/30 flex items-center justify-center shrink-0 transition">
                <Monitor className="w-6 h-6 text-brand-400" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-white">Projector / Screen</h2>
                <p className="text-xs text-slate-400">Display QR code & receive live video feed</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
          </button>

          {/* Phone Camera Broadcaster Mode */}
          <button
            type="button"
            onClick={() => navigateTo('broadcaster', '/camera')}
            className="group flex items-center justify-between p-5 rounded-3xl bg-surface-800/90 hover:bg-surface-700/80 active:scale-[0.98] border border-surface-700 transition-all shadow-xl text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-green-500/20 group-hover:bg-green-500/30 flex items-center justify-center shrink-0 transition">
                <Camera className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-white">Phone Camera</h2>
                <p className="text-xs text-slate-400">Pair via code & broadcast live camera feed</p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-green-400 group-hover:translate-x-1 transition-all" />
          </button>
        </div>

        {/* Footer */}
        <p className="text-slate-500 text-xs">
          Powered by Cloudflare Workers & WebRTC
        </p>
      </div>
    </div>
  );
}