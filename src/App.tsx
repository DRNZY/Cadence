import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Disc3, LayoutGrid, BookOpen,
  Music2, Maximize2, Minimize2, Settings2,
  Minus, Square, X, Moon, PanelLeftClose, PanelLeft,
  PanelRightClose, PanelRight, Search, FolderSync
} from "lucide-react";
import type { Track, DeckMode, VisualizerMode, LayoutMode } from "./types";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useLastFmScrobbler } from "./hooks/useLastFmScrobbler";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { extractColors, applyThemeColors, THEME_PRESETS, buildCustomGradient } from "./utils/colorExtractor";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { VinylDeck } from "./components/VinylDeck";
import { LyricsDeck } from "./components/LyricsDeck";
import { WidgetContainer } from "./components/WidgetContainer";
import { ControlBar } from "./components/ControlBar";
import { EqualizerModal } from "./components/EqualizerModal";
import { SettingsModal, loadSettings } from "./components/SettingsModal";
import { SleepTimerModal } from "./components/SleepTimerModal";
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
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("cadence_library_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("cadence_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [isSleepTimerOpen, setIsSleepTimerOpen] = useState(false);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("cadence_library_collapsed", isLibraryCollapsed ? "true" : "false");
    } catch {}
  }, [isLibraryCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem("cadence_sidebar_collapsed", isRightPanelCollapsed ? "true" : "false");
    } catch {}
  }, [isRightPanelCollapsed]);

  // Calculate responsive ideal panel widths based on viewport size
  const getIdealPanelWidths = (winWidth: number) => {
    if (winWidth >= 2800) {
      return { left: Math.round(winWidth * 0.22), right: Math.round(winWidth * 0.26) };
    }
    if (winWidth >= 2000) {
      return { left: Math.round(winWidth * 0.23), right: Math.round(winWidth * 0.26) };
    }
    if (winWidth >= 1600) {
      return { left: 380, right: 400 };
    }
    return { left: 340, right: 360 };
  };

  // Draggable panel widths state (persisted to localStorage)
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("cadence_panel_widths");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.left === "number") {
          const maxAllowed = Math.round(window.innerWidth * 0.55);
          return Math.min(Math.max(parsed.left, 180), maxAllowed);
        }
      }
    } catch {}
    return getIdealPanelWidths(window.innerWidth).left;
  });

  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("cadence_panel_widths");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.right === "number") {
          const maxAllowed = Math.round(window.innerWidth * 0.55);
          return Math.min(Math.max(parsed.right, 180), maxAllowed);
        }
      }
    } catch {}
    return getIdealPanelWidths(window.innerWidth).right;
  });

  // Auto-balance reset handler
  const handleResetPanelWidths = useCallback(() => {
    const ideal = getIdealPanelWidths(window.innerWidth);
    setLeftPanelWidth(ideal.left);
    setRightPanelWidth(ideal.right);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("cadence_panel_widths", JSON.stringify({ left: leftPanelWidth, right: rightPanelWidth }));
    } catch {}
  }, [leftPanelWidth, rightPanelWidth]);

  // Load persistent settings from disk API on mount
  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setSettings(prev => ({ ...prev, ...data.settings }));
        }
      })
      .catch(() => {});
  }, []);

  // Theme mode effect (Dark vs Light)
  useEffect(() => {
    const isLight = settings.themeMode === "light";
    document.documentElement.classList.toggle("light", isLight);
    document.body.classList.toggle("light", isLight);
  }, [settings.themeMode]);

  // Divider drag handlers with extended bounds
  const handleLeftDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftPanelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const maxW = Math.round(window.innerWidth * 0.55);
      const newWidth = Math.min(Math.max(startWidth + deltaX, 180), maxW);
      setLeftPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleRightDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightPanelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const maxW = Math.round(window.innerWidth * 0.55);
      const newWidth = Math.min(Math.max(startWidth + deltaX, 180), maxW);
      setRightPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

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

  // Sleep timer countdown ticker
  useEffect(() => {
    if (sleepTimerRemaining === null) return;
    if (sleepTimerRemaining <= 0) {
      audioEngine.pause();
      setSleepTimerRemaining(null);
      return;
    }
    const interval = setInterval(() => {
      setSleepTimerRemaining(prev => {
        if (prev === null || prev <= 1) {
          audioEngine.pause();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerRemaining, audioEngine]);

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

  const handleShuffleAll = useCallback(() => {
    const all = tracksRef.current;
    if (all.length === 0) return;
    const randomIdx = Math.floor(Math.random() * all.length);
    const chosenTrack = all[randomIdx];
    const remaining = all.filter((_, i) => i !== randomIdx);
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    setQueue(remaining);
    setIsShuffle(true);
    handlePlayTrack(chosenTrack);
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

  // Global Keyboard Shortcuts
  useKeyboardShortcuts({
    onTogglePlayPause: () => audioEngine.togglePlay(),
    onSeekRelative: (delta) => audioEngine.seek(audioEngine.currentTime + delta),
    onAdjustVolume: (delta) => audioEngine.setVolume(audioEngine.volume + delta),
    onToggleMute: () => audioEngine.toggleMute(),
    onToggleLyrics: () => setIsRightPanelCollapsed(prev => !prev),
    onToggleQueue: () => setIsRightPanelCollapsed(prev => !prev),
    onToggleLibrary: () => setIsLibraryCollapsed(prev => !prev),
    onToggleSidebar: () => setIsRightPanelCollapsed(prev => !prev),
    onToggleFullscreen: () => toggleFullscreen(),
    onCloseModals: () => {
      setIsEqualizerOpen(false);
      setIsSettingsOpen(false);
      setIsSleepTimerOpen(false);
    },
    enabled: true,
  });

  // Render Left Column Content
  const renderLibraryPanel = () => {
    if (isLibraryCollapsed) {
      return (
        <div className="h-full glass-panel rounded-3xl overflow-hidden flex flex-col items-center py-4 px-2 shadow-xl border border-white/10 w-14 shrink-0 justify-between select-none">
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => setIsLibraryCollapsed(false)}
              className="p-2 rounded-2xl bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-all hover:scale-105 active:scale-95"
              title="Expand Library (Ctrl+B)"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <div className="w-6 h-[1px] bg-white/10" />
            <button
              onClick={() => setIsLibraryCollapsed(false)}
              className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              title="Browse Music"
            >
              <Disc3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsLibraryCollapsed(false)}
              className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              title="Search Tracks"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-3">
            <span className="text-[9px] font-mono text-neutral-500 [writing-mode:vertical-lr] rotate-180 uppercase tracking-widest">
              {tracks.length} Tracks
            </span>
            <div className="w-6 h-[1px] bg-white/10" />
            <button
              onClick={fetchLibrary}
              className="p-2 text-neutral-400 hover:text-primary hover:bg-white/5 rounded-xl transition-all"
              title="Rescan Library"
            >
              <FolderSync className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    return (
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
  };

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
        accentColor={settings.accentColor}
        tracks={tracks}
        onShufflePlay={handleShuffleAll}
        onOpenLibrary={() => setIsLibraryCollapsed(false)}
      />
    </div>
  );

  // Render Sidebar Stack (Modular Drag & Drop Widgets)
  const renderSidebarStack = () => (
    <WidgetContainer
      currentTrack={audioEngine.currentTrack}
      isPlaying={audioEngine.isPlaying}
      currentTime={audioEngine.currentTime}
      duration={audioEngine.duration}
      visualizerMode={visualizerMode}
      onSetVisualizerMode={setVisualizerMode}
      getFrequencyData={audioEngine.getFrequencyData}
      getTimeDomainData={audioEngine.getTimeDomainData}
      accentColor={settings.accentColor}
      queue={queue}
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
      onSeek={audioEngine.seek}
      visualizerEnabled={settings.visualizerEnabled}
    />
  );

  return (
    <div
      className="flex h-screen w-screen text-white relative overflow-hidden select-none"
      style={{
        background: settings.themeMode === "light" ? "#f1f5f9" : "var(--theme-bg-gradient, #06070b)",
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
          {/* Logo & Brand + Quick Library Toggle */}
          <div className="flex items-center space-x-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <div className="w-7 h-7 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shadow-md">
              <Disc3 className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xs font-bold tracking-tight text-white uppercase mr-1">
              Cadence
            </h1>
            <button
              onClick={() => setIsLibraryCollapsed(prev => !prev)}
              className={`p-1.5 rounded-xl border transition-all active:scale-95 ${
                isLibraryCollapsed
                  ? "bg-white/5 hover:bg-white/10 border-white/10 text-neutral-400 hover:text-white"
                  : "bg-white/10 border-white/20 text-white"
              }`}
              title={isLibraryCollapsed ? "Expand Library (Ctrl+B)" : "Collapse Library (Ctrl+B)"}
            >
              {isLibraryCollapsed ? <PanelLeft className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Center: Apple Segmented Layout Switcher */}
          <div className="flex bg-black/40 p-1 rounded-full border border-white/10 backdrop-blur-md" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {([
              { id: "studio", label: "Studio", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
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
            {/* Sleep Timer Button */}
            <button
              onClick={() => setIsSleepTimerOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors active:scale-95 ${
                sleepTimerRemaining !== null
                  ? "bg-indigo-600/30 border-indigo-500/50 text-indigo-300"
                  : "bg-white/5 hover:bg-white/10 border-white/10 text-neutral-300 hover:text-white"
              }`}
              title="Sleep Timer"
            >
              <Moon className="w-3.5 h-3.5" />
              {sleepTimerRemaining !== null ? (
                <span className="font-mono text-[10px]">
                  {Math.floor(sleepTimerRemaining / 60)}m
                </span>
              ) : (
                <span className="hidden sm:inline">Timer</span>
              )}
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

            {/* Right Panel / Widgets Toggle */}
            <button
              onClick={() => setIsRightPanelCollapsed(prev => !prev)}
              className={`p-1.5 rounded-xl border transition-all active:scale-95 ${
                isRightPanelCollapsed
                  ? "bg-white/5 hover:bg-white/10 border-white/10 text-neutral-400 hover:text-white"
                  : "bg-white/10 border-white/20 text-white"
              }`}
              title={isRightPanelCollapsed ? "Show Widgets" : "Hide Widgets"}
            >
              {isRightPanelCollapsed ? <PanelRight className="w-3.5 h-3.5" /> : <PanelRightClose className="w-3.5 h-3.5" />}
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
          {/* 1. STUDIO MODE (Fluid 3-Panel Resizable Layout) */}
          {layoutMode === "studio" && (
            <div className="flex h-full w-full overflow-hidden items-stretch relative min-w-0">
              {settings.libraryPosition === "left" ? (
                <>
                  {/* Left Library Panel */}
                  {/* Left Library Panel */}
                  <div
                    style={isLibraryCollapsed ? { width: 56 } : { width: leftPanelWidth }}
                    className="h-full overflow-hidden shrink-0 transition-[width] duration-150 ease-out min-w-0"
                  >
                    {renderLibraryPanel()}
                  </div>

                  {/* Drag Handle 1: Library ⟷ Center Deck */}
                  {!isLibraryCollapsed && (
                    <div
                      onMouseDown={handleLeftDividerMouseDown}
                      onDoubleClick={handleResetPanelWidths}
                      className="w-3 -mx-1.5 h-full cursor-col-resize z-20 flex items-center justify-center group shrink-0 select-none touch-none"
                      title="Drag to resize Library (Double-click to auto-balance)"
                    >
                      <div className="w-1 h-12 rounded-full bg-white/10 group-hover:bg-primary/80 group-hover:h-20 group-hover:w-1.5 transition-all" />
                    </div>
                  )}

                  {/* Center Hero Player Deck */}
                  <div className="flex-1 h-full overflow-hidden min-w-0 px-2">
                    {renderHeroDeck()}
                  </div>

                  {/* Drag Handle 2: Center Deck ⟷ Widgets Sidebar */}
                  {!isRightPanelCollapsed && (
                    <div
                      onMouseDown={handleRightDividerMouseDown}
                      onDoubleClick={handleResetPanelWidths}
                      className="w-3 -mx-1.5 h-full cursor-col-resize z-20 flex items-center justify-center group shrink-0 select-none touch-none"
                      title="Drag to resize Widgets (Double-click to auto-balance)"
                    >
                      <div className="w-1 h-12 rounded-full bg-white/10 group-hover:bg-primary/80 group-hover:h-20 group-hover:w-1.5 transition-all" />
                    </div>
                  )}

                  {/* Right Sidebar Stack */}
                  {!isRightPanelCollapsed && (
                    <div
                      style={{ width: rightPanelWidth }}
                      className="h-full overflow-hidden shrink-0 min-w-0"
                    >
                      {renderSidebarStack()}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Right Sidebar Stack on Left */}
                  {!isRightPanelCollapsed && (
                    <div
                      style={{ width: rightPanelWidth }}
                      className="h-full overflow-hidden shrink-0 min-w-0"
                    >
                      {renderSidebarStack()}
                    </div>
                  )}

                  {!isRightPanelCollapsed && (
                    <div
                      onMouseDown={handleRightDividerMouseDown}
                      onDoubleClick={handleResetPanelWidths}
                      className="w-3 -mx-1.5 h-full cursor-col-resize z-20 flex items-center justify-center group shrink-0 select-none touch-none"
                      title="Drag to resize Widgets (Double-click to auto-balance)"
                    >
                      <div className="w-1 h-12 rounded-full bg-white/10 group-hover:bg-primary/80 group-hover:h-20 group-hover:w-1.5 transition-all" />
                    </div>
                  )}

                  {/* Center Hero Player Deck */}
                  <div className="flex-1 h-full overflow-hidden min-w-0 px-2">
                    {renderHeroDeck()}
                  </div>

                  {/* Drag Handle: Center Deck ⟷ Library */}
                  {!isLibraryCollapsed && (
                    <div
                      onMouseDown={handleLeftDividerMouseDown}
                      onDoubleClick={handleResetPanelWidths}
                      className="w-3 -mx-1.5 h-full cursor-col-resize z-20 flex items-center justify-center group shrink-0 select-none touch-none"
                      title="Drag to resize Library (Double-click to auto-balance)"
                    >
                      <div className="w-1 h-12 rounded-full bg-white/10 group-hover:bg-primary/80 group-hover:h-20 group-hover:w-1.5 transition-all" />
                    </div>
                  )}

                  {/* Library on Right */}
                  <div
                    style={isLibraryCollapsed ? { width: 56 } : { width: leftPanelWidth }}
                    className="h-full overflow-hidden shrink-0 transition-[width] duration-150 ease-out min-w-0"
                  >
                    {renderLibraryPanel()}
                  </div>
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

      {/* Sleep Timer Modal */}
      <SleepTimerModal
        isOpen={isSleepTimerOpen}
        onClose={() => setIsSleepTimerOpen(false)}
        timerRemaining={sleepTimerRemaining}
        onStartTimer={(mins) => setSleepTimerRemaining(mins * 60)}
        onCancelTimer={() => setSleepTimerRemaining(null)}
      />
    </div>
  );
};

export default App;
