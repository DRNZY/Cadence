import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Disc3, Sliders, Monitor, LayoutGrid, Sparkles, BookOpen,
  Music2, Maximize2, Minimize2, ListMusic, Mic2, Settings2,
  Minus, Square, X, Palette
} from "lucide-react";
import type { Track, DeckMode, VisualizerMode, LayoutMode } from "./types";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useLastFmScrobbler } from "./hooks/useLastFmScrobbler";
import { extractColors, applyThemeColors, THEME_PRESETS, buildCustomGradient } from "./utils/colorExtractor";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { VinylDeck } from "./components/VinylDeck";
import { LyricsDeck } from "./components/LyricsDeck";
import { SpectrumVisualizer } from "./components/SpectrumVisualizer";
import { QueueDrawer } from "./components/QueueDrawer";
import { ControlBar } from "./components/ControlBar";
import { EqualizerModal } from "./components/EqualizerModal";
import { SettingsModal, loadSettings } from "./components/SettingsModal";
import type { AppSettings } from "./components/SettingsModal";

function findBestTrackMatch(all: Track[], query: string): Track | null {
  if (!query || all.length === 0) return null;
  const q = query.toLowerCase().trim();

  // 1. Direct substring match
  const exact = all.find(t =>
    t.title.toLowerCase() === q ||
    t.artist.toLowerCase() === q ||
    t.title.toLowerCase().includes(q) ||
    t.artist.toLowerCase().includes(q) ||
    t.album.toLowerCase().includes(q) ||
    t.filePath.toLowerCase().includes(q)
  );
  if (exact) return exact;

  // 2. Multi-token fuzzy search
  const tokens = q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  let bestTrack: Track | null = null;
  let bestScore = 0;

  for (const t of all) {
    const text = `${t.title} ${t.artist} ${t.album} ${t.filePath}`.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
    let score = 0;
    for (const tok of tokens) {
      if (text.includes(tok)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTrack = t;
    }
  }

  return bestScore > 0 ? bestTrack : null;
}

export const App: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [deckMode, setDeckMode] = useState<DeckMode>("cover");
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

  const lastFm = useLastFmScrobbler(
    audioEngine.currentTrack,
    audioEngine.isPlaying,
    audioEngine.currentTime,
    audioEngine.duration
  );

  const tracksRef = useRef<Track[]>([]);
  tracksRef.current = tracks;

  // Primary playback actions defined before any effects
  const handlePlayTrack = useCallback((track: Track) => {
    const all = tracksRef.current;
    const idx = all.findIndex(t => t.id === track.id);
    if (idx !== -1) setCurrentIndex(idx);
    audioEngine.playTrack(track);
  }, [audioEngine]);

  const handlePlayAlbum = useCallback((albumTracks: Track[]) => {
    if (albumTracks.length === 0) return;
    const [first, ...rest] = albumTracks;
    setQueue(rest);
    handlePlayTrack(first);
  }, [handlePlayTrack]);

  const handleAddToQueue = useCallback((track: Track) => {
    setQueue(prev => [...prev, track]);
  }, []);

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

  // Keep refs up-to-date
  handleTrackEndRef.current = handleTrackEnd;
  handlePreviousRef.current = handlePrevious;
  handleNextRef.current = handleNext;

  // Fetch initial music library
  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/tracks");
      const data = await res.json();
      const trackList = Array.isArray(data) ? data : Array.isArray(data.tracks) ? data.tracks : [];
      setTracks(trackList);
    } catch (err) {
      console.error("[Cadence] Error fetching tracks:", err);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  // Dynamic Ambient Theme Color Extraction
  useEffect(() => {
    if (!settings.dynamicTheme || !audioEngine.currentTrack) {
      if (!settings.dynamicTheme) {
        if (settings.themePreset === "custom") {
          const customTheme = buildCustomGradient(
            settings.customGradientStart,
            settings.customGradientEnd,
            settings.customGradientAngle,
            settings.accentColor
          );
          applyThemeColors(customTheme);
        } else {
          const preset = THEME_PRESETS.find(p => p.id === settings.themePreset) || THEME_PRESETS[0];
          const customTheme = buildCustomGradient(preset.startColor, preset.endColor, preset.angle, preset.accent);
          applyThemeColors(customTheme);
        }
      }
      return;
    }

    const coverUrl = audioEngine.currentTrack.coverPath
      ? `/covers?path=${encodeURIComponent(audioEngine.currentTrack.coverPath)}`
      : `/covers?artist=${encodeURIComponent(audioEngine.currentTrack.artist)}&album=${encodeURIComponent(audioEngine.currentTrack.album)}&title=${encodeURIComponent(audioEngine.currentTrack.title)}`;

    extractColors(coverUrl).then(colors => {
      applyThemeColors(colors);
    });
  }, [audioEngine.currentTrack, settings]);

  // Listen for SSE remote commands & MPRIS
  useEffect(() => {
    const sse = new EventSource("/api/ctl/events");
    sse.onmessage = (event) => {
      try {
        const cmd = JSON.parse(event.data);
        if (cmd.action === "play") {
          if (cmd.track) {
            handlePlayTrack(cmd.track);
          } else if (cmd.query && tracksRef.current.length > 0) {
            const found = findBestTrackMatch(tracksRef.current, cmd.query);
            if (found) handlePlayTrack(found);
          } else {
            audioEngine.play();
          }
        } else if (cmd.action === "pause") {
          audioEngine.pause();
        } else if (cmd.action === "resume") {
          audioEngine.play();
        } else if (cmd.action === "toggle") {
          audioEngine.togglePlay();
        } else if (cmd.action === "next") {
          handleNext();
        } else if (cmd.action === "prev" || cmd.action === "previous") {
          handlePrevious();
        } else if (cmd.action === "stop") {
          audioEngine.pause();
          audioEngine.seek(0);
        } else if (cmd.action === "shuffle") {
          setIsShuffle(prev => !prev);
        }
      } catch (err) {
        console.warn("[Cadence SSE error]:", err);
      }
    };

    const unbindPlay = (window as any).electronAPI?.onPlayCommand?.((payload: any) => {
      if (payload?.query && tracksRef.current.length > 0) {
        const found = findBestTrackMatch(tracksRef.current, payload.query);
        if (found) handlePlayTrack(found);
      }
    });

    const unbindMedia = (window as any).electronAPI?.onMediaKey?.((action: string) => {
      if (action === "play-pause") audioEngine.togglePlay();
      else if (action === "next") handleNext();
      else if (action === "previous") handlePrevious();
      else if (action === "stop") {
        audioEngine.pause();
        audioEngine.seek(0);
      }
    });

    return () => {
      sse.close();
      unbindPlay?.();
      unbindMedia?.();
    };
  }, [audioEngine, handlePlayTrack, handleNext, handlePrevious]);

  // Update server playback state for CLI status reporting
  useEffect(() => {
    fetch("/api/ctl/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: audioEngine.isPlaying ? "playing" : audioEngine.currentTrack ? "paused" : "stopped",
        currentTrack: audioEngine.currentTrack,
        currentTime: audioEngine.currentTime,
        duration: audioEngine.duration
      })
    }).catch(() => {});
  }, [audioEngine.isPlaying, audioEngine.currentTrack, audioEngine.currentTime, audioEngine.duration]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        audioEngine.togglePlay();
      } else if (e.code === "ArrowRight") {
        if (e.shiftKey) handleNext();
        else audioEngine.seek(audioEngine.currentTime + 5);
      } else if (e.code === "ArrowLeft") {
        if (e.shiftKey) handlePrevious();
        else audioEngine.seek(audioEngine.currentTime - 5);
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

  // Render Left Column Content
  const renderLibraryPanel = () => (
    <div className="h-full glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl min-w-0">
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
  );

  // Render Hero Deck Center
  const renderHeroDeck = () => (
    <div className="h-full glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl min-w-0">
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
        isLoved={lastFm.isLoved}
        onToggleLove={lastFm.toggleLove}
      />
    </div>
  );

  // Render Sidebar Stack (Lyrics / Visualizer / Queue)
  const renderSidebarStack = () => (
    <div className="flex flex-col h-full gap-3 overflow-hidden min-w-0">
      {/* Right Panel View Switcher Tabs with Apple Springs */}
      <div className="flex bg-black/50 p-1 rounded-2xl border border-white/10 shrink-0 justify-between backdrop-blur-xl">
        <button
          onClick={() => setRightPanelTab("split")}
          className={`flex-1 py-1 text-[11px] font-semibold rounded-xl transition-all flex items-center justify-center gap-1 active:scale-95 ${
            rightPanelTab === "split" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
          }`}
        >
          <Sparkles className="w-3 h-3 text-primary" />
          <span>Mix</span>
        </button>
        <button
          onClick={() => setRightPanelTab("lyrics")}
          className={`flex-1 py-1 text-[11px] font-semibold rounded-xl transition-all flex items-center justify-center gap-1 active:scale-95 ${
            rightPanelTab === "lyrics" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
          }`}
        >
          <Mic2 className="w-3 h-3 text-primary" />
          <span>Lyrics</span>
        </button>
        <button
          onClick={() => setRightPanelTab("queue")}
          className={`flex-1 py-1 text-[11px] font-semibold rounded-xl transition-all flex items-center justify-center gap-1 active:scale-95 ${
            rightPanelTab === "queue" ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
          }`}
        >
          <ListMusic className="w-3 h-3 text-primary" />
          <span>Queue ({queue.length})</span>
        </button>
      </div>

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
                accentColor={settings.accentColor}
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

      {rightPanelTab === "lyrics" && (
        <div className="glass-panel rounded-3xl overflow-hidden flex-1 shadow-xl">
          <LyricsDeck
            currentTrack={audioEngine.currentTrack}
            currentTime={audioEngine.currentTime}
            onSeek={audioEngine.seek}
          />
        </div>
      )}

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
  );

  return (
    <div
      className="flex h-screen w-screen text-white relative overflow-hidden select-none"
      style={{
        background: "var(--theme-bg-gradient, #06070b)",
        transition: "background 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
      }}
    >
      {/* Dynamic Ambient Mesh Backdrop */}
      <div className="absolute inset-0 pointer-events-none z-0 ambient-glow opacity-25" />

      {/* Left Sidebar Player Bar Position (Optional) */}
      {settings.playerBarPosition === "left" && (
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
          position="left"
          onTogglePlay={audioEngine.togglePlay}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onSeek={audioEngine.seek}
          onSetVolume={audioEngine.setVolume}
          onToggleMute={audioEngine.toggleMute}
          onToggleShuffle={() => setIsShuffle(prev => !prev)}
          onToggleRepeat={() => setRepeatMode(prev => prev === "off" ? "all" : prev === "all" ? "one" : "off")}
          onToggleEqualizer={() => setIsEqualizerOpen(prev => !prev)}
        />
      )}

      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Top Header Bar */}
        <header
          className="h-12 w-full px-4 flex items-center justify-between border-b border-white/5 z-20 bg-neutral-950/70 backdrop-blur-xl shrink-0 select-none"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          {/* Logo & Brand */}
          <div className="flex items-center space-x-2.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <div className="w-7 h-7 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shadow-md">
              <Disc3 className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xs font-bold tracking-tight text-white uppercase">
              Cadence
            </h1>
          </div>

          {/* Center: Apple Segmented Layout Switcher */}
          <div className="flex bg-black/40 p-1 rounded-full border border-white/10 backdrop-blur-md" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {([
              { id: "studio", label: "Studio", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
              { id: "panoramic", label: "Ultrawide", icon: <Monitor className="w-3.5 h-3.5" /> },
              { id: "stage", label: "Stage", icon: <Music2 className="w-3.5 h-3.5" /> },
              { id: "browser", label: "Library", icon: <BookOpen className="w-3.5 h-3.5" /> }
            ] as const).map(item => {
              const active = layoutMode === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setLayoutMode(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all active:scale-95 ${
                    active ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right Status Badges & Action Controls */}
          <div className="flex items-center space-x-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {lastFm.status.enabled && lastFm.status.hasSession && (
              <div
                className="hidden sm:flex items-center gap-1.5 bg-red-950/40 px-2.5 py-1 rounded-full border border-red-500/20 text-xs font-mono text-red-300"
                title={`Last.fm Scrobbling Active (@${lastFm.status.username})`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span>Last.fm</span>
              </div>
            )}

            <div className="hidden lg:flex items-center space-x-2 bg-black/40 px-2.5 py-1 rounded-full border border-white/10 text-xs font-mono">
              <span className="text-neutral-400">{tracks.length} tracks</span>
              <span className="text-neutral-600">•</span>
              <span className="text-emerald-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                PipeWire
              </span>
            </div>

            {/* Quick Themes Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-colors active:scale-95"
              title="Themes & Layout"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setIsEqualizerOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-neutral-300 hover:text-white transition-colors active:scale-95"
              title="Equalizer"
            >
              <Sliders className="w-3.5 h-3.5 text-white" />
              <span className="hidden sm:inline">EQ</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-colors active:scale-95"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-colors active:scale-95"
              title="Settings"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>

            {/* Integrated Window Control Action Buttons */}
            <div className="flex items-center ml-1.5 space-x-1 pl-2 border-l border-white/10">
              <button
                onClick={() => (window as any).electronAPI?.minimize?.()}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                title="Minimize"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => (window as any).electronAPI?.maximize?.()}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                title="Maximize / Restore"
              >
                <Square className="w-3 h-3" />
              </button>
              <button
                onClick={() => (window as any).electronAPI?.close?.()}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-rose-500/80 active:scale-95 transition-all"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* Top Header Player Bar Position */}
        {settings.playerBarPosition === "top" && (
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
            position="top"
            onTogglePlay={audioEngine.togglePlay}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onSeek={audioEngine.seek}
            onSetVolume={audioEngine.setVolume}
            onToggleMute={audioEngine.toggleMute}
            onToggleShuffle={() => setIsShuffle(prev => !prev)}
            onToggleRepeat={() => setRepeatMode(prev => prev === "off" ? "all" : prev === "all" ? "one" : "off")}
            onToggleEqualizer={() => setIsEqualizerOpen(prev => !prev)}
          />
        )}

        {/* Main Grid Area */}
        <main className="flex-1 w-full p-3 md:p-4 overflow-hidden z-10 min-h-0">
          {/* 1. STUDIO MODE (3-Column Balanced) */}
          {layoutMode === "studio" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 h-full w-full overflow-hidden">
              {settings.libraryPosition === "left" ? (
                <>
                  <div className="lg:col-span-4 h-full overflow-hidden min-w-0">{renderLibraryPanel()}</div>
                  <div className="lg:col-span-5 h-full overflow-hidden min-w-0">{renderHeroDeck()}</div>
                  <div className="lg:col-span-3 h-full overflow-hidden min-w-0">{renderSidebarStack()}</div>
                </>
              ) : (
                <>
                  <div className="lg:col-span-3 h-full overflow-hidden min-w-0">{renderSidebarStack()}</div>
                  <div className="lg:col-span-5 h-full overflow-hidden min-w-0">{renderHeroDeck()}</div>
                  <div className="lg:col-span-4 h-full overflow-hidden min-w-0">{renderLibraryPanel()}</div>
                </>
              )}
            </div>
          )}

          {/* 2. PANORAMIC ULTRAWIDE MODE (4-Column) */}
          {layoutMode === "panoramic" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 h-full w-full overflow-hidden">
              {settings.libraryPosition === "left" ? (
                <>
                  <div className="h-full overflow-hidden min-w-0">{renderLibraryPanel()}</div>
                  <div className="h-full overflow-hidden min-w-0">{renderHeroDeck()}</div>
                  <div className="h-full glass-panel rounded-3xl overflow-hidden shadow-xl min-w-0">
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
                          accentColor={settings.accentColor}
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
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-3.5 overflow-hidden min-w-0">
                    {settings.visualizerEnabled && (
                      <div className="glass-panel rounded-3xl overflow-hidden h-44 shrink-0 shadow-xl">
                        <SpectrumVisualizer
                          isPlaying={audioEngine.isPlaying}
                          visualizerMode={visualizerMode}
                          onSetVisualizerMode={setVisualizerMode}
                          getFrequencyData={audioEngine.getFrequencyData}
                          getTimeDomainData={audioEngine.getTimeDomainData}
                          accentColor={settings.accentColor}
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
                  <div className="h-full glass-panel rounded-3xl overflow-hidden shadow-xl min-w-0">
                    <LyricsDeck
                      currentTrack={audioEngine.currentTrack}
                      currentTime={audioEngine.currentTime}
                      onSeek={audioEngine.seek}
                    />
                  </div>
                  <div className="h-full overflow-hidden min-w-0">{renderHeroDeck()}</div>
                  <div className="h-full overflow-hidden min-w-0">{renderLibraryPanel()}</div>
                </>
              )}
            </div>
          )}

          {/* 3. STAGE MODE (Hero Focus + Lyrics) */}
          {layoutMode === "stage" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full w-full overflow-hidden">
              <div className="lg:col-span-7 h-full overflow-hidden min-w-0">
                {renderHeroDeck()}
              </div>
              <div className="lg:col-span-5 h-full glass-panel rounded-3xl overflow-hidden shadow-xl min-w-0">
                <LyricsDeck
                  currentTrack={audioEngine.currentTrack}
                  currentTime={audioEngine.currentTime}
                  onSeek={audioEngine.seek}
                />
              </div>
            </div>
          )}

          {/* 4. BROWSER MODE (Full Library Focus) */}
          {layoutMode === "browser" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full w-full overflow-hidden">
              <div className="lg:col-span-8 h-full overflow-hidden min-w-0">
                {renderLibraryPanel()}
              </div>
              <div className="lg:col-span-4 h-full overflow-hidden min-w-0">
                {renderHeroDeck()}
              </div>
            </div>
          )}
        </main>

        {/* Bottom Dock Player Bar Position (Default) */}
        {settings.playerBarPosition === "bottom" && (
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
            position="bottom"
            onTogglePlay={audioEngine.togglePlay}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onSeek={audioEngine.seek}
            onSetVolume={audioEngine.setVolume}
            onToggleMute={audioEngine.toggleMute}
            onToggleShuffle={() => setIsShuffle(prev => !prev)}
            onToggleRepeat={() => setRepeatMode(prev => prev === "off" ? "all" : prev === "all" ? "one" : "off")}
            onToggleEqualizer={() => setIsEqualizerOpen(prev => !prev)}
          />
        )}
      </div>

      {/* Equalizer Modal */}
      <EqualizerModal
        isOpen={isEqualizerOpen}
        onClose={() => setIsEqualizerOpen(false)}
        gains={audioEngine.equalizerGains}
        onSetGain={audioEngine.setEqualizerGain}
        onApplyPreset={audioEngine.applyPreset}
        dspSettings={audioEngine.dspSettings}
        onUpdateDspSettings={audioEngine.updateDspSettings}
      />

      {/* Settings & Themes Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  );
};

export default App;
