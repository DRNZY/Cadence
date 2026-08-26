import React, { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Disc3, Sliders, Monitor, LayoutGrid, Sparkles, BookOpen, Music2, Maximize2, Minimize2, ListMusic, Mic2, Activity, Settings2 } from "lucide-react";
import type { Track, DeckMode, VisualizerMode, LayoutMode } from "./types";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { extractColors, applyThemeColors } from "./utils/colorExtractor";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { VinylDeck } from "./components/VinylDeck";
import { LyricsDeck } from "./components/LyricsDeck";
import { SpectrumVisualizer } from "./components/SpectrumVisualizer";
import { QueueDrawer } from "./components/QueueDrawer";
import { ControlBar } from "./components/ControlBar";
import { EqualizerModal } from "./components/EqualizerModal";
import { SettingsModal, loadSettings } from "./components/SettingsModal";
import type { AppSettings } from "./components/SettingsModal";

export const App: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [deckMode, setDeckMode] = useState<DeckMode>("vinyl");
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>("bars");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("studio");
  const [rightPanelTab, setRightPanelTab] = useState<"split" | "lyrics" | "queue">("split");
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // Auto-detect screen aspect ratio & dimensions on mount/resize
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const aspect = w / (h || 1);
      // Auto-set 32:9 for ultrawide, otherwise standard 16:9 studio
      if (aspect >= 2.1 || w >= 2400) {
        setLayoutMode("panoramic");
      } else {
        setLayoutMode("studio");
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleTrackEndRef = useRef<() => void>(() => {});
  const handlePreviousRef = useRef<() => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});

  const audioEngine = useAudioEngine({
    onTrackEnd: () => handleTrackEndRef.current(),
    onPreviousTrack: () => handlePreviousRef.current(),
    onNextTrack: () => handleNextRef.current()
  });

  // Track end callback
  const handleTrackEnd = useCallback(() => {
    if (repeatMode === "one" && audioEngine.currentTrack) {
      audioEngine.playTrack(audioEngine.currentTrack);
      return;
    }

    if (queue.length > 0) {
      const nextTrack = queue[0];
      setQueue(prev => prev.slice(1));
      audioEngine.playTrack(nextTrack);
      return;
    }

    if (tracks.length > 0 && currentIndex !== -1) {
      let nextIdx = currentIndex + 1;
      if (isShuffle) {
        nextIdx = Math.floor(Math.random() * tracks.length);
      } else if (nextIdx >= tracks.length) {
        if (repeatMode === "all") nextIdx = 0;
        else return;
      }
      setCurrentIndex(nextIdx);
      audioEngine.playTrack(tracks[nextIdx]);
    }
  }, [queue, tracks, currentIndex, isShuffle, repeatMode, audioEngine]);

  const handlePrevious = useCallback(() => {
    if (audioEngine.currentTime > 3) {
      audioEngine.seek(0);
      return;
    }
    if (tracks.length > 0 && currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      audioEngine.playTrack(tracks[prevIdx]);
    }
  }, [audioEngine, tracks, currentIndex]);

  const handleNext = useCallback(() => {
    handleTrackEnd();
  }, [handleTrackEnd]);

  handleTrackEndRef.current = handleTrackEnd;
  handlePreviousRef.current = handlePrevious;
  handleNextRef.current = handleNext;

  // Listen to Global Linux Hardware Media Keys from Electron Main Process
  useEffect(() => {
    if ((window as any).electronAPI?.onMediaKey) {
      const cleanup = (window as any).electronAPI.onMediaKey((action: string) => {
        if (action === "play-pause") audioEngine.togglePlayPause();
        else if (action === "next") handleNext();
        else if (action === "previous") handlePrevious();
        else if (action === "stop") audioEngine.seek(0);
      });
      return cleanup;
    }
  }, [audioEngine, handleNext, handlePrevious]);

  const fetchLibrary = useCallback(() => {
    fetch("/api/tracks")
      .then(res => res.json())
      .then(data => {
        const loadedTracks = data.tracks || [];
        setTracks(loadedTracks);
        if (loadedTracks.length > 0 && !audioEngine.currentTrack) {
          setCurrentIndex(0);
        }
      })
      .catch(err => console.error("Failed to load library:", err));
  }, [audioEngine.currentTrack]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  useEffect(() => {
    if (audioEngine.currentTrack) {
      const t = audioEngine.currentTrack;
      const coverUrl = t.coverPath
        ? `/covers?path=${encodeURIComponent(t.coverPath)}`
        : `/covers?artist=${encodeURIComponent(t.artist)}&album=${encodeURIComponent(t.album)}&title=${encodeURIComponent(t.title)}`;
      extractColors(coverUrl).then(colors => {
        applyThemeColors(colors);
      });
    }
  }, [audioEngine.currentTrack]);

  const handlePlayTrack = (track: Track) => {
    const idx = tracks.findIndex(t => t.id === track.id);
    if (idx !== -1) setCurrentIndex(idx);
    audioEngine.playTrack(track);
  };

  const handlePlayAlbum = (albumTracks: Track[]) => {
    if (albumTracks.length === 0) return;
    const [first, ...rest] = albumTracks;
    setQueue(rest);
    handlePlayTrack(first);
  };

  const handleAddToQueue = (track: Track) => {
    setQueue(prev => [...prev, track]);
  };


  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        audioEngine.togglePlayPause();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) audioEngine.seek(audioEngine.currentTime + 10);
        else handleNext();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        if (e.shiftKey) audioEngine.seek(audioEngine.currentTime - 10);
        else handlePrevious();
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        audioEngine.setVolume(Math.min(1, audioEngine.volume + 0.05));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        audioEngine.setVolume(Math.max(0, audioEngine.volume - 0.05));
      } else if (e.key.toLowerCase() === "m") {
        audioEngine.toggleMute();
      } else if (e.key.toLowerCase() === "e") {
        setIsEqualizerOpen(prev => !prev);
      } else if (e.key.toLowerCase() === "f" || e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audioEngine, handleNext, handlePrevious]);

  // Apply performance mode settings to DOM
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // Glass blur
    if (settings.enableGlassBlur) {
      const blur = settings.performanceMode === "quality" ? "blur(32px) saturate(180%)" : "blur(18px) saturate(160%)";
      root.style.setProperty("--glass-backdrop", blur);
      body.classList.remove("no-glass");
    } else {
      root.style.setProperty("--glass-backdrop", "none");
      body.classList.add("no-glass");
    }

    // Ambient glow
    if (settings.enableAmbientGlow) {
      body.classList.remove("no-glow");
    } else {
      body.classList.add("no-glow");
    }

    // Dynamic theme — if off, reset to default purple
    if (!settings.dynamicTheme) {
      root.style.setProperty("--primary", "#c084fc");
      root.style.setProperty("--primary-glow", "rgba(192,132,252,0.35)");
      root.style.setProperty("--secondary-glow", "rgba(59,130,246,0.25)");
      root.style.setProperty("--theme-bg-gradient", "#08090e");
    }

    // Persist
    try { localStorage.setItem("cadence_settings", JSON.stringify(settings)); } catch {}
  }, [settings]);

  return (
    <div
      className="flex flex-col h-screen w-screen text-white relative overflow-hidden select-none"
      style={{
        background: "var(--theme-bg-gradient, #08090e)",
        transition: "background 1.2s cubic-bezier(0.4, 0, 0.2, 1)"
      }}
    >
      {/* Dynamic Animated Ambient Liquid Mesh Backdrop via pure CSS gradients */}
      <div className="absolute inset-0 pointer-events-none z-0 ambient-glow opacity-30" />

      {/* Top Studio TitleBar & Navigation */}
      <header className="h-14 w-full px-5 flex items-center justify-between border-b border-white/5 z-20 bg-neutral-950/60 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-blue-500 flex items-center justify-center shadow-lg shadow-primary/20">
            <Disc3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black tracking-wider uppercase bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
                Cadence
              </h1>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-white/10 text-neutral-300 border border-white/10">
                Native Standalone
              </span>
            </div>
            <p className="text-[10px] font-mono text-neutral-400 -mt-0.5">Studio Hi-Fi Engine</p>
          </div>
        </div>

        {/* Center: Layout Preset Selector Pills */}
        <div className="hidden md:flex items-center space-x-1 bg-black/50 p-1 rounded-full border border-white/10 text-xs">
          <button
            onClick={() => setLayoutMode("studio")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all ${
              layoutMode === "studio" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
            }`}
            title="Optimized 3-Panel Layout for standard 16:9 monitors & laptops"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-primary" />
            <span>Studio 16:9</span>
          </button>
          <button
            onClick={() => setLayoutMode("panoramic")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all ${
              layoutMode === "panoramic" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
            }`}
            title="4-Panel Ultrawide Layout for 21:9 & 32:9 monitors"
          >
            <Monitor className="w-3.5 h-3.5 text-primary" />
            <span>Ultrawide 32:9</span>
          </button>
          <button
            onClick={() => setLayoutMode("stage")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all ${
              layoutMode === "stage" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
            }`}
            title="Vinyl Centerstage Focus"
          >
            <Music2 className="w-3.5 h-3.5 text-primary" />
            <span>Vinyl Stage</span>
          </button>
          <button
            onClick={() => setLayoutMode("browser")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all ${
              layoutMode === "browser" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
            }`}
            title="Library Discography Focus"
          >
            <BookOpen className="w-3.5 h-3.5 text-primary" />
            <span>Library Focus</span>
          </button>
        </div>

        {/* Right: Audio Engine Badges & Actions */}
        <div className="flex items-center space-x-2.5">
          <div className="hidden lg:flex items-center space-x-2 bg-black/40 px-3 py-1.5 rounded-full border border-white/10 text-xs font-mono">
            <span className="text-neutral-400">{tracks.length} Tracks</span>
            <span className="text-neutral-600">•</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              PipeWire/ALSA
            </span>
          </div>

          <button
            onClick={() => setIsEqualizerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-neutral-300 hover:text-white transition-colors"
          >
            <Sliders className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">10-Band EQ</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-colors"
            title="Toggle Fullscreen (F11)"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />

      {/* Main Responsive Grid Layout */}
      <main className="flex-1 w-full p-3 md:p-4 overflow-hidden z-10">
        {/* 1. STUDIO 16:9 MODE (Default & Perfect for 1080p, 1440p, laptops) */}
        {layoutMode === "studio" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 h-full w-full overflow-hidden">
            {/* Left Column: Library Browser (33% width) */}
            <div className="lg:col-span-4 glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl min-w-0">
              <LibraryBrowser
                tracks={tracks}
                currentTrack={audioEngine.currentTrack}
                isPlaying={audioEngine.isPlaying}
                onPlayTrack={handlePlayTrack}
                onAddToQueue={handleAddToQueue}
                onPlayAlbum={handlePlayAlbum}
                onRescan={fetchLibrary}
              />
            </div>

            {/* Center Column: Vinyl Turntable Hero Deck (42% width) */}
            <div className="lg:col-span-5 glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl min-w-0">
              <VinylDeck
                currentTrack={audioEngine.currentTrack}
                isPlaying={audioEngine.isPlaying}
                currentTime={audioEngine.currentTime}
                duration={audioEngine.duration}
                playbackRate={audioEngine.playbackRate}
                deckMode={deckMode}
                onSetDeckMode={setDeckMode}
                onSetSpeed={audioEngine.setSpeed}
                onSeek={audioEngine.seek}
                onStartScratch={audioEngine.startScratch}
                onScratch={audioEngine.scratch}
                onEndScratch={audioEngine.endScratch}
              />
            </div>

            {/* Right Column: Dynamic Tabbed Stack (25% width) */}
            <div className="lg:col-span-3 flex flex-col h-full gap-3 overflow-hidden min-w-0">
              {/* Right Panel View Switcher Tabs */}
              <div className="flex bg-black/40 p-1 rounded-2xl border border-white/10 shrink-0 justify-between">
                <button
                  onClick={() => setRightPanelTab("split")}
                  className={`flex-1 py-1 text-[11px] font-semibold rounded-xl transition-all flex items-center justify-center gap-1 ${
                    rightPanelTab === "split" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span>Studio Mix</span>
                </button>
                <button
                  onClick={() => setRightPanelTab("lyrics")}
                  className={`flex-1 py-1 text-[11px] font-semibold rounded-xl transition-all flex items-center justify-center gap-1 ${
                    rightPanelTab === "lyrics" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Mic2 className="w-3 h-3 text-primary" />
                  <span>Lyrics</span>
                </button>
                <button
                  onClick={() => setRightPanelTab("queue")}
                  className={`flex-1 py-1 text-[11px] font-semibold rounded-xl transition-all flex items-center justify-center gap-1 ${
                    rightPanelTab === "queue" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <ListMusic className="w-3 h-3 text-primary" />
                  <span>Queue ({queue.length})</span>
                </button>
              </div>

              {/* Sub-view: Split (Top Visualizer + Bottom Lyrics) */}
              {rightPanelTab === "split" && (
                <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                  {settings.visualizerEnabled && (
                    <div className="glass-panel rounded-3xl overflow-hidden h-40 shrink-0 shadow-xl">
                      <SpectrumVisualizer
                        isPlaying={audioEngine.isPlaying}
                        visualizerMode={visualizerMode}
                        onSetVisualizerMode={setVisualizerMode}
                        getFrequencyData={audioEngine.getFrequencyData}
                        getTimeDomainData={audioEngine.getTimeDomainData}
                      />
                    </div>
                  )}
                  <div className="glass-panel rounded-3xl overflow-hidden flex-1 shadow-xl">
                    <LyricsDeck
                      currentTrack={audioEngine.currentTrack}
                      currentTime={audioEngine.currentTime}
                      onSeek={audioEngine.seek}
                    />
                  </div>
                </div>
              )}

              {/* Sub-view: Full Lyrics Deck */}
              {rightPanelTab === "lyrics" && (
                <div className="glass-panel rounded-3xl overflow-hidden flex-1 shadow-xl">
                  <LyricsDeck
                    currentTrack={audioEngine.currentTrack}
                    currentTime={audioEngine.currentTime}
                    onSeek={audioEngine.seek}
                  />
                </div>
              )}

              {/* Sub-view: Queue & Inspector */}
              {rightPanelTab === "queue" && (
                <div className="glass-panel rounded-3xl overflow-hidden flex-1 shadow-xl">
                  <QueueDrawer
                    queue={queue}
                    currentTrack={audioEngine.currentTrack}
                    isPlaying={audioEngine.isPlaying}
                    onPlayTrack={handlePlayTrack}
                    onRemoveFromQueue={idx => setQueue(prev => prev.filter((_, i) => i !== idx))}
                    onClearQueue={() => setQueue([])}
                    onMoveQueueItem={(from, to) => {
                      setQueue(prev => {
                        const copy = [...prev];
                        const [item] = copy.splice(from, 1);
                        copy.splice(to, 0, item);
                        return copy;
                      });
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. PANORAMIC 32:9 ULTRAWIDE MODE */}
        {layoutMode === "panoramic" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 h-full w-full overflow-hidden">
            <div className="glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl min-w-0">
              <LibraryBrowser
                tracks={tracks}
                currentTrack={audioEngine.currentTrack}
                isPlaying={audioEngine.isPlaying}
                onPlayTrack={handlePlayTrack}
                onAddToQueue={handleAddToQueue}
                onPlayAlbum={handlePlayAlbum}
                onRescan={fetchLibrary}
              />
            </div>

            <div className="glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl min-w-0">
              <VinylDeck
                currentTrack={audioEngine.currentTrack}
                isPlaying={audioEngine.isPlaying}
                currentTime={audioEngine.currentTime}
                duration={audioEngine.duration}
                playbackRate={audioEngine.playbackRate}
                deckMode={deckMode}
                onSetDeckMode={setDeckMode}
                onSetSpeed={audioEngine.setSpeed}
                onSeek={audioEngine.seek}
                onStartScratch={audioEngine.startScratch}
                onScratch={audioEngine.scratch}
                onEndScratch={audioEngine.endScratch}
              />
            </div>

            <div className="glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl min-w-0">
              <LyricsDeck
                currentTrack={audioEngine.currentTrack}
                currentTime={audioEngine.currentTime}
                onSeek={audioEngine.seek}
              />
            </div>

            <div className="flex flex-col gap-3.5 overflow-hidden min-w-0">
              {settings.visualizerEnabled && (
                <div className="glass-panel rounded-3xl overflow-hidden h-44 shrink-0 shadow-xl">
                  <SpectrumVisualizer
                    isPlaying={audioEngine.isPlaying}
                    visualizerMode={visualizerMode}
                    onSetVisualizerMode={setVisualizerMode}
                    getFrequencyData={audioEngine.getFrequencyData}
                    getTimeDomainData={audioEngine.getTimeDomainData}
                  />
                </div>
              )}

              <div className="glass-panel rounded-3xl overflow-hidden flex-1 shadow-xl">
                <QueueDrawer
                  queue={queue}
                  currentTrack={audioEngine.currentTrack}
                  isPlaying={audioEngine.isPlaying}
                  onPlayTrack={handlePlayTrack}
                  onRemoveFromQueue={idx => setQueue(prev => prev.filter((_, i) => i !== idx))}
                  onClearQueue={() => setQueue([])}
                  onMoveQueueItem={(from, to) => {
                    setQueue(prev => {
                      const copy = [...prev];
                      const [item] = copy.splice(from, 1);
                      copy.splice(to, 0, item);
                      return copy;
                    });
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 3. VINYL STAGE MODE */}
        {layoutMode === "stage" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 h-full w-full overflow-hidden">
            <div className="lg:col-span-7 glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl min-w-0">
              <VinylDeck
                currentTrack={audioEngine.currentTrack}
                isPlaying={audioEngine.isPlaying}
                currentTime={audioEngine.currentTime}
                duration={audioEngine.duration}
                playbackRate={audioEngine.playbackRate}
                deckMode={deckMode}
                onSetDeckMode={setDeckMode}
                onSetSpeed={audioEngine.setSpeed}
                onSeek={audioEngine.seek}
                onStartScratch={audioEngine.startScratch}
                onScratch={audioEngine.scratch}
                onEndScratch={audioEngine.endScratch}
              />
            </div>

            <div className="lg:col-span-5 flex flex-col gap-3.5 h-full overflow-hidden min-w-0">
              {settings.visualizerEnabled && (
                <div className="glass-panel rounded-3xl overflow-hidden h-48 shrink-0 shadow-xl">
                  <SpectrumVisualizer
                    isPlaying={audioEngine.isPlaying}
                    visualizerMode={visualizerMode}
                    onSetVisualizerMode={setVisualizerMode}
                    getFrequencyData={audioEngine.getFrequencyData}
                    getTimeDomainData={audioEngine.getTimeDomainData}
                  />
                </div>
              )}
              <div className="glass-panel rounded-3xl overflow-hidden flex-1 shadow-xl">
                <LyricsDeck
                  currentTrack={audioEngine.currentTrack}
                  currentTime={audioEngine.currentTime}
                  onSeek={audioEngine.seek}
                />
              </div>
            </div>
          </div>
        )}

        {/* 4. LIBRARY FOCUS MODE */}
        {layoutMode === "browser" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 h-full w-full overflow-hidden">
            <div className="lg:col-span-7 glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl min-w-0">
              <LibraryBrowser
                tracks={tracks}
                currentTrack={audioEngine.currentTrack}
                isPlaying={audioEngine.isPlaying}
                onPlayTrack={handlePlayTrack}
                onAddToQueue={handleAddToQueue}
                onPlayAlbum={handlePlayAlbum}
                onRescan={fetchLibrary}
              />
            </div>

            <div className="lg:col-span-5 glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl min-w-0">
              <VinylDeck
                currentTrack={audioEngine.currentTrack}
                isPlaying={audioEngine.isPlaying}
                currentTime={audioEngine.currentTime}
                duration={audioEngine.duration}
                playbackRate={audioEngine.playbackRate}
                deckMode={deckMode}
                onSetDeckMode={setDeckMode}
                onSetSpeed={audioEngine.setSpeed}
                onSeek={audioEngine.seek}
                onStartScratch={audioEngine.startScratch}
                onScratch={audioEngine.scratch}
                onEndScratch={audioEngine.endScratch}
              />
            </div>
          </div>
        )}
      </main>

      {/* Persistent Bottom Hi-Fi Control Bar */}
      <footer className="w-full shrink-0 z-30 pb-2">
        <ControlBar
          currentTrack={audioEngine.currentTrack}
          isPlaying={audioEngine.isPlaying}
          currentTime={audioEngine.currentTime}
          duration={audioEngine.duration}
          volume={audioEngine.volume}
          isMuted={audioEngine.isMuted}
          isShuffle={isShuffle}
          repeatMode={repeatMode}
          isEqualizerOpen={isEqualizerOpen}
          onTogglePlay={audioEngine.togglePlayPause}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onSeek={audioEngine.seek}
          onSetVolume={audioEngine.setVolume}
          onToggleMute={audioEngine.toggleMute}
          onToggleShuffle={() => setIsShuffle(prev => !prev)}
          onToggleRepeat={() => {
            setRepeatMode(prev => (prev === "off" ? "all" : prev === "all" ? "one" : "off"));
          }}
          onToggleEqualizer={() => setIsEqualizerOpen(prev => !prev)}
        />
      </footer>

      {/* 10-Band Equalizer & DSP Modal */}
      <AnimatePresence>
        {isEqualizerOpen && (
          <EqualizerModal
            isOpen={isEqualizerOpen}
            onClose={() => setIsEqualizerOpen(false)}
            eqGains={audioEngine.eqGains}
            dspSettings={audioEngine.dspSettings}
            onSetGain={audioEngine.setEqGain}
            onSetAllGains={audioEngine.setAllEqGains}
            onUpdateDspSettings={audioEngine.updateDspSettings}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
