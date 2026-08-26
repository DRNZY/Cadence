import { useEffect } from "react";
import TitleBar from "./components/TitleBar";
import Library from "./components/Library";
import Vinyl from "./components/Vinyl";
import Visualizer from "./components/Visualizer";
import Queue from "./components/Queue";
import Controls from "./components/Controls";
import { useLibrary } from "./store/library";

export default function App() {
  const hydrate = useLibrary((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#0a0b10] text-white select-none">
      {/* Dynamic Ambient Background Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full opacity-30 blur-[120px] transition-all duration-1000"
        style={{
          background: "radial-gradient(circle, var(--ambient-1, #6366f1) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full opacity-20 blur-[140px] transition-all duration-1000"
        style={{
          background: "radial-gradient(circle, var(--ambient-2, #ec4899) 0%, transparent 70%)",
        }}
      />

      {/* Top Frameless TitleBar with macOS-style traffic lights */}
      <TitleBar />

      {/* Main 3-Column Studio Grid Layout */}
      <main className="relative z-10 flex min-h-0 flex-1 gap-4 px-4 pb-24">
        {/* Left Column: Glass Music Library Browser */}
        <section className="glass flex w-[32%] min-w-[320px] max-w-[440px] flex-col overflow-hidden rounded-[28px]">
          <Library />
        </section>

        {/* Center Column: Vinyl Hero Deck & Spectrum Visualizer */}
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="glass relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px]">
            <Vinyl />
          </div>

          <div className="shrink-0">
            <Visualizer />
          </div>
        </section>

        {/* Right Column: Up Next Queue */}
        <section className="flex w-[25%] min-w-[260px] max-w-[360px] flex-col overflow-hidden">
          <Queue />
        </section>
      </main>

      {/* Floating Bottom Glass Controls Bar */}
      <Controls />
    </div>
  );
}
