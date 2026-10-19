import { Monitor, Smartphone, Wifi, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">

      {/* ── Header: Logo + subtitle ── */}
      <header className="w-full flex flex-col items-center px-8 py-6">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-11 h-11 rounded-2xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/40">
            <Wifi className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">LiveLens</h1>
        </div>
        <p className="text-slate-400 text-sm text-center max-w-xs leading-relaxed">
          Wireless low-latency camera streaming from your phone to any projector or screen.
        </p>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-10 gap-5">

        {/* Projector card */}
        <button
          onClick={() => navigate('/display')}
          className="group w-full max-w-lg relative overflow-hidden flex items-center gap-5 p-6 rounded-2xl bg-surface-800 border border-surface-700 hover:border-brand-500/60 transition-all duration-300 text-left shadow-xl hover:shadow-brand-500/10 hover:shadow-2xl"
        >
          {/* Glow accent */}
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />

          {/* Icon */}
          <div className="relative flex-shrink-0 w-16 h-16 rounded-2xl bg-brand-500/15 border border-brand-500/25 flex items-center justify-center group-hover:bg-brand-500/25 group-hover:border-brand-500/50 transition-all duration-300">
            <Monitor className="w-8 h-8 text-brand-400" />
          </div>

          {/* Text */}
          <div className="relative flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-white">Projector Screen</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
                Display
              </span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Show the camera feed on this device. A unique pairing code will be generated automatically.
            </p>
          </div>

          {/* Arrow */}
          <div className="relative flex-shrink-0 w-9 h-9 rounded-xl bg-surface-700 group-hover:bg-brand-500/20 border border-surface-600 group-hover:border-brand-500/40 flex items-center justify-center transition-all duration-300">
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all duration-300" />
          </div>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full max-w-lg">
          <div className="flex-1 h-px bg-surface-700" />
          <span className="text-xs text-slate-600 font-medium">or</span>
          <div className="flex-1 h-px bg-surface-700" />
        </div>

        {/* Phone Camera card */}
        <button
          onClick={() => navigate('/camera')}
          className="group w-full max-w-lg relative overflow-hidden flex items-center gap-5 p-6 rounded-2xl bg-surface-800 border border-surface-700 hover:border-green-500/60 transition-all duration-300 text-left shadow-xl hover:shadow-green-500/10 hover:shadow-2xl"
        >
          {/* Glow accent */}
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />

          {/* Icon */}
          <div className="relative flex-shrink-0 w-16 h-16 rounded-2xl bg-green-500/15 border border-green-500/25 flex items-center justify-center group-hover:bg-green-500/25 group-hover:border-green-500/50 transition-all duration-300">
            <Smartphone className="w-8 h-8 text-green-400" />
          </div>

          {/* Text */}
          <div className="relative flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-white">Phone Camera</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                Stream
              </span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Stream your phone camera to a projector screen. Enter the 6-digit pairing code to connect.
            </p>
          </div>

          {/* Arrow */}
          <div className="relative flex-shrink-0 w-9 h-9 rounded-xl bg-surface-700 group-hover:bg-green-500/20 border border-surface-600 group-hover:border-green-500/40 flex items-center justify-center transition-all duration-300">
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-green-400 group-hover:translate-x-0.5 transition-all duration-300" />
          </div>
        </button>

      </main>

      {/* ── Footer ── */}
      <footer className="w-full px-8 py-4">
        <p className="text-xs text-slate-600">
          Powered by WebRTC · End-to-end encrypted · Zero sign-up
        </p>
      </footer>

    </div>
  );
}
