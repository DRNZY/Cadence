import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  Disc3, LayoutGrid, BookOpen, Music2, Maximize2, Minimize2, Settings2, Minus, Square, X, Moon, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, Search, FolderSync, Film } from "./components/icons";
import type { Track, DeckMode, VisualizerMode, LayoutMode } from "./types";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useLastFmScrobbler } from "./hooks/useLastFmScrobbler";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { extractColors, applyThemeColors, THEME_PRESETS, buildCustomGradient } from "./utils/colorExtractor";
import { lazy, Suspense } from "react";
/** In-panel placeholder. Small, local, and it does not take the window down. */
const PanelLoading = () => (
  <div className="flex-1 min-h-0 flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 border-primary/40 border-t-transparent animate-spin" />
  </div>
);

/**
 * Panel scope.
 *
 * A throw while rendering any one panel would otherwise unmount the whole tree,
 * which includes the transport controls, leaving playback running with no way to
 * stop it from the interface. Each heavy panel is wrapped so a failure costs that
 * panel and nothing else.
 */
const Panel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <ErrorBoundary label={label}>{children}</ErrorBoundary>
);

const LibraryBrowser = lazy(() => import("./components/LibraryBrowser").then(m => ({ default: m.LibraryBrowser })));
const VinylDeck = lazy(() => import("./components/VinylDeck").then(m => ({ default: m.VinylDeck })));
const LyricsDeck = lazy(() => import("./components/LyricsDeck").then(m => ({ default: m.LyricsDeck })));
const WidgetContainer = lazy(() => import("./components/WidgetContainer").then(m => ({ default: m.WidgetContainer })));
const EqualizerModal = lazy(() => import("./components/EqualizerModal").then(m => ({ default: m.EqualizerModal })));
const SettingsModal = lazy(() => import("./components/SettingsModal").then(m => ({ default: m.SettingsModal })));
import { ControlBar } from "./components/ControlBar";
import { SleepTimerModal } from "./components/SleepTimerModal";
import { loadSettings } from "./utils/settings";
import type { AppSettings } from "./utils/settings";
import { getTrackCoverUrl } from "./utils/formatters";

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
  const [isCinemaMode, setIsCinemaMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("cadence_cinema_mode") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("cadence_cinema_mode", isCinemaMode ? "true" : "false");
    } catch {}
  }, [isCinemaMode]);

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

  // Idle 2-panel split ratio when no song is active (Library ⟷ Widgets)
  const [idleSplitRatio, setIdleSplitRatio] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("cadence_idle_split_ratio");
      if (saved) return parseFloat(saved);
    } catch {}
    return 0.58;
  });
  const idleSplitRatioRef = useRef<number>(idleSplitRatio);
  useEffect(() => {
    idleSplitRatioRef.current = idleSplitRatio;
    try {
      localStorage.setItem("cadence_idle_split_ratio", idleSplitRatio.toString());
    } catch {}
  }, [idleSplitRatio]);

  // Window viewport width state
  const [windowWidth, setWindowWidth] = useState<number>(() => {
    return typeof window !== "undefined" ? window.innerWidth : 1920;
  });

  // Proportional custom ratios ref (if user drags dividers manually)
  const userRatioRef = useRef<{ left?: number; right?: number }>({});
  const [isDraggingPanel, setIsDraggingPanel] = useState<boolean>(false);
  const [isWindowResizing, setIsWindowResizing] = useState<boolean>(false);
  const resizeDebounceTimerRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);

  // Calculate responsive ideal panel widths based on real-time viewport resolution
  const getIdealPanelWidths = useCallback((winWidth: number) => {
    if (winWidth >= 3000) {
      return { left: Math.round(winWidth * 0.22), right: Math.round(winWidth * 0.25) };
    }
    if (winWidth >= 2200) {
      return { left: Math.round(winWidth * 0.22), right: Math.round(winWidth * 0.25) };
    }
    if (winWidth >= 1600) {
      return { left: Math.round(winWidth * 0.22), right: Math.round(winWidth * 0.24) };
    }
    return {
      left: Math.min(Math.max(Math.round(winWidth * 0.24), 260), 380),
      right: Math.min(Math.max(Math.round(winWidth * 0.26), 280), 400)
    };
  }, []);

  // Draggable panel widths state
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    return getIdealPanelWidths(typeof window !== "undefined" ? window.innerWidth : 1920).left;
  });

  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    return getIdealPanelWidths(typeof window !== "undefined" ? window.innerWidth : 1920).right;
  });

  // Auto-balance reset handler
  const handleResetPanelWidths = useCallback(() => {
    userRatioRef.current = {};
    setIdleSplitRatio(0.58);
    const ideal = getIdealPanelWidths(window.innerWidth);
    setLeftPanelWidth(ideal.left);
    setRightPanelWidth(ideal.right);
  }, [getIdealPanelWidths]);

  // Real-time window resize handler
  useEffect(() => {
    const handleResize = () => {
      document.body.classList.add("is-resizing");
      setIsWindowResizing(true);

      if (resizeDebounceTimerRef.current) {
        window.clearTimeout(resizeDebounceTimerRef.current);
      }
      resizeDebounceTimerRef.current = window.setTimeout(() => {
        document.body.classList.remove("is-resizing");
        setIsWindowResizing(false);

        const finalW = window.innerWidth;
        setWindowWidth(finalW);
        const ideal = getIdealPanelWidths(finalW);
        if (userRatioRef.current.left !== undefined) {
          const maxW = Math.round(finalW * 0.45);
          setLeftPanelWidth(Math.min(Math.max(Math.round(finalW * userRatioRef.current.left), 220), maxW));
        } else {
          setLeftPanelWidth(ideal.left);
        }
        if (userRatioRef.current.right !== undefined) {
          const maxW = Math.round(finalW * 0.45);
          setRightPanelWidth(Math.min(Math.max(Math.round(finalW * userRatioRef.current.right), 240), maxW));
        } else {
          setRightPanelWidth(ideal.right);
        }
      }, 100);

      if (resizeRafRef.current) return;
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        setWindowWidth(window.innerWidth);
        const ideal = getIdealPanelWidths(window.innerWidth);

        if (userRatioRef.current.left !== undefined) {
          const maxW = Math.round(window.innerWidth * 0.45);
          setLeftPanelWidth(Math.min(Math.max(Math.round(window.innerWidth * userRatioRef.current.left), 220), maxW));
        } else {
          setLeftPanelWidth(ideal.left);
        }

        if (userRatioRef.current.right !== undefined) {
          const maxW = Math.round(window.innerWidth * 0.45);
          setRightPanelWidth(Math.min(Math.max(Math.round(window.innerWidth * userRatioRef.current.right), 240), maxW));
        } else {
          setRightPanelWidth(ideal.right);
        }
      });
    };

    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      if (resizeDebounceTimerRef.current) window.clearTimeout(resizeDebounceTimerRef.current);
      document.body.classList.remove("is-resizing");
    };
  }, [getIdealPanelWidths]);

  // Divider drag handlers with ratio tracking
  const handleLeftDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPanel(true);
    document.body.classList.add("is-resizing");
    const startX = e.clientX;
    const startWidth = leftPanelWidth;
    let dragRafId: number | null = null;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (dragRafId) return;
      dragRafId = requestAnimationFrame(() => {
        dragRafId = null;
        const deltaX = moveEvent.clientX - startX;
        const winW = window.innerWidth;
        const maxW = Math.round(winW * 0.45);
        const newWidth = Math.min(Math.max(startWidth + deltaX, 220), maxW);
        userRatioRef.current.left = newWidth / winW;
        setLeftPanelWidth(newWidth);
      });
    };

    const onMouseUp = () => {
      if (dragRafId) cancelAnimationFrame(dragRafId);
      setIsDraggingPanel(false);
      document.body.classList.remove("is-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleRightDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPanel(true);
    document.body.classList.add("is-resizing");
    const startX = e.clientX;
    const startWidth = rightPanelWidth;
    let dragRafId: number | null = null;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (dragRafId) return;
      dragRafId = requestAnimationFrame(() => {
        dragRafId = null;
        const deltaX = startX - moveEvent.clientX;
        const winW = window.innerWidth;
        const maxW = Math.round(winW * 0.45);
        const newWidth = Math.min(Math.max(startWidth + deltaX, 240), maxW);
        userRatioRef.current.right = newWidth / winW;
        setRightPanelWidth(newWidth);
      });
    };

    const onMouseUp = () => {
      if (dragRafId) cancelAnimationFrame(dragRafId);
      setIsDraggingPanel(false);
      document.body.classList.remove("is-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleIdleDividerMouseDown = (e: React.MouseEvent, pos: "left" | "right") => {
    e.preventDefault();
    setIsDraggingPanel(true);
    document.body.classList.add("is-resizing");
    const startX = e.clientX;
    const startRatio = idleSplitRatioRef.current;
    let dragRafId: number | null = null;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (dragRafId) return;
      dragRafId = requestAnimationFrame(() => {
        dragRafId = null;
        const winW = window.innerWidth;
        const deltaX = pos === "left" ? (moveEvent.clientX - startX) : (startX - moveEvent.clientX);
        const newWidth = Math.min(Math.max(startRatio * winW + deltaX, 320), winW - 320);
        const newRatio = newWidth / winW;
        idleSplitRatioRef.current = newRatio;
        setIdleSplitRatio(newRatio);
      });
    };

    const onMouseUp = () => {
      if (dragRafId) cancelAnimationFrame(dragRafId);
      setIsDraggingPanel(false);
      document.body.classList.remove("is-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  /**
   * Refs for the callbacks the SSE subscription invokes.
   *
   * `fetchLibrary` is stable, but the playback handlers are not: they change
   * whenever the queue, the track list or the index changes. Reading them
   * through refs is what lets that subscription have no dependencies at all.
   */
  const fetchLibraryRef = useRef<() => void>(() => {});
  const handlePlayTrackRef = useRef<(track: Track) => void>(() => {});
  const handleTrackEndRef = useRef<() => void>(() => {});
  const handlePreviousRef = useRef<() => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});

  const audioEngine = useAudioEngine({
    onTrackEnd: () => handleTrackEndRef.current(),
    onPreviousTrack: () => handlePreviousRef.current(),
 onNextTrack: () => handleNextRef.current()
  });

  /**
   * Always points at the current engine.
   *
   * `audioEngine` is a new object whenever the playhead moves, so anything that
   * puts it in a dependency array tears itself down several times a second.
   * Long-lived subscriptions and stable callbacks read through this ref instead,
   * which is what makes their own dependencies empty.
   */
  const audioEngineRef = useRef(audioEngine);
  audioEngineRef.current = audioEngine;

  /**
   * Stable playhead getter for the vinyl deck.
   *
   * Passing `currentTime` as a prop made the deck re-render on every tick.
   * This identity never changes, so the deck's `React.memo` can hold.
   */
  const getCurrentTime = useCallback(() => audioEngineRef.current.currentTime, []);

  const lastFm = useLastFmScrobbler(
    audioEngine.currentTrack,
    audioEngine.isPlaying,
    audioEngine.currentTime,
    audioEngine.duration
  );

  const hasActiveTrack = Boolean(audioEngine.currentTrack);

  // Dynamic responsive widths: 2-panel split when idle (Library ⟷ Widgets), 3-panel split when song is playing
  const effectiveLeftWidth = useMemo(() => {
    if (isCinemaMode) return 0;
    if (settings.libraryPosition === "left") {
      if (isLibraryCollapsed) return 56;
      if (hasActiveTrack) return leftPanelWidth;
      return Math.min(Math.max(Math.round(windowWidth * idleSplitRatio), 300), windowWidth - 320);
    } else {
      if (isRightPanelCollapsed) return 0;
      if (hasActiveTrack) return rightPanelWidth;
      return Math.min(Math.max(Math.round(windowWidth * (1 - idleSplitRatio)), 280), windowWidth - 320);
    }
  }, [isCinemaMode, settings.libraryPosition, isLibraryCollapsed, isRightPanelCollapsed, hasActiveTrack, leftPanelWidth, rightPanelWidth, windowWidth, idleSplitRatio]);

  const effectiveRightWidth = useMemo(() => {
    if (isCinemaMode) return 0;
    if (settings.libraryPosition === "left") {
      if (isRightPanelCollapsed) return 0;
      if (hasActiveTrack) return rightPanelWidth;
      return Math.max(280, windowWidth - effectiveLeftWidth - 24);
    } else {
      if (isLibraryCollapsed) return 56;
      if (hasActiveTrack) return leftPanelWidth;
      return Math.max(280, windowWidth - effectiveLeftWidth - 24);
    }
  }, [isCinemaMode, settings.libraryPosition, isRightPanelCollapsed, isLibraryCollapsed, hasActiveTrack, rightPanelWidth, leftPanelWidth, windowWidth, effectiveLeftWidth]);

  // High-precision sleep timer target and fadeout controls
  const sleepTimerTargetRef = useRef<number | null>(null);
  const sleepTimerTotalSecsRef = useRef<number>(0);
  const sleepTimerOriginalVolRef = useRef<number>(audioEngine.volume);
  const sleepTimerFadingRef = useRef<boolean>(false);

  const handleStartSleepTimer = useCallback((minutes: number) => {
    const totalSecs = minutes * 60;
    sleepTimerTotalSecsRef.current = totalSecs;
    sleepTimerTargetRef.current = Date.now() + totalSecs * 1000;
    sleepTimerOriginalVolRef.current = audioEngineRef.current.volume;
    sleepTimerFadingRef.current = false;
    setSleepTimerRemaining(totalSecs);
  }, []);

  const handleExtendSleepTimer = useCallback((additionalMinutes: number) => {
    const addSecs = additionalMinutes * 60;
    sleepTimerTotalSecsRef.current += addSecs;
    sleepTimerTargetRef.current = (sleepTimerTargetRef.current || Date.now()) + addSecs * 1000;
    const remaining = Math.max(0, Math.ceil((sleepTimerTargetRef.current - Date.now()) / 1000));
    setSleepTimerRemaining(remaining);
    if (sleepTimerFadingRef.current) {
      sleepTimerFadingRef.current = false;
      audioEngineRef.current.setVolume(sleepTimerOriginalVolRef.current);
    }
  }, []);

  const handleCancelSleepTimer = useCallback(() => {
    if (sleepTimerFadingRef.current) {
      audioEngineRef.current.setVolume(sleepTimerOriginalVolRef.current);
    }
    sleepTimerTargetRef.current = null;
    sleepTimerFadingRef.current = false;
    setSleepTimerRemaining(null);
  }, []);

  // Active sleep timer countdown ticker with verified 10-second exponential volume fade-out
  useEffect(() => {
    if (sleepTimerRemaining === null && sleepTimerTargetRef.current === null) return;

    const interval = setInterval(() => {
      if (!sleepTimerTargetRef.current) return;
      const now = Date.now();
      const remainingSecs = Math.max(0, Math.ceil((sleepTimerTargetRef.current - now) / 1000));

      setSleepTimerRemaining(remainingSecs);

      // Start exponential fade-out over final 10 seconds
      if (remainingSecs <= 10 && remainingSecs > 0 && !sleepTimerFadingRef.current) {
        sleepTimerFadingRef.current = true;
        audioEngineRef.current.fadeVolume(0, remainingSecs);
      }

      // Finish timer: pause playback and restore volume
      if (remainingSecs <= 0) {
audioEngineRef.current.pause();
        setTimeout(() => {
          audioEngineRef.current.setVolume(sleepTimerOriginalVolRef.current);
          sleepTimerTargetRef.current = null;
          sleepTimerFadingRef.current = false;
          setSleepTimerRemaining(null);
        }, 300);
      }
    }, 1000);

    return () => clearInterval(interval);
    // Reads the engine through the ref. Depending on `audioEngine` reset this
    // interval on every playhead tick while a timer was running, so the
    // one-second countdown could never reliably reach its next tick.
  }, []);

  const tracksRef = useRef<Track[]>([]);
  tracksRef.current = tracks;

  // Primary playback actions defined before any effects
  const handlePlayTrack = useCallback((track: Track) => {
    const all = tracksRef.current;
    const idx = all.findIndex(t => t.id === track.id);
    if (idx !== -1) setCurrentIndex(idx);
    audioEngineRef.current.playTrack(track);
    // Stable: the engine is read through a ref, so this callback keeps its
    // identity for the lifetime of the component. It is passed to LibraryBrowser,
    // which is React.memo'd; when this identity churned, that memo could never
    // succeed and the whole library panel re-rendered on every tick.
  }, []);

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
    const engine = audioEngineRef.current;
    if (repeatMode === "one" && engine.currentTrack) {
      engine.playTrack(engine.currentTrack);
      return;
    }

    if (queue.length > 0) {
      const nextTrack = queue[0];
      setQueue(prev => prev.slice(1));
      engine.playTrack(nextTrack);
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
      engine.playTrack(tracks[nextIdx]);
    }
  }, [queue, tracks, currentIndex, isShuffle, repeatMode]);

  const handlePrevious = useCallback(() => {
    const engine = audioEngineRef.current;
    if (engine.currentTime > 3) {
      engine.seek(0);
      return;
    }
    if (tracks.length > 0 && currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      engine.playTrack(tracks[prevIdx]);
    }
  }, [tracks, currentIndex]);

  const handleNext = useCallback(() => {
    handleTrackEnd();
  }, [handleTrackEnd]);

  // Keep refs up-to-date
  handleTrackEndRef.current = handleTrackEnd;
  handlePreviousRef.current = handlePrevious;
  handleNextRef.current = handleNext;
  handlePlayTrackRef.current = handlePlayTrack;

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
  fetchLibraryRef.current = fetchLibrary;

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  // Sync Light/Dark appearance mode with document root
  useEffect(() => {
    const isLight = settings.themeMode === "light";
    document.documentElement.classList.toggle("light", isLight);
    document.body.classList.toggle("light", isLight);
    if (isLight) {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [settings.themeMode]);

  /**
   * Apply the render-cost settings to the document.
   *
   * `enableAmbientGlow` and `enableGlassBlur` were both user-toggleable in the
   * settings modal and both defaulted to on, but nothing ever read them. The
   * `body.no-glow` / `body.no-glass` rules that were written to honour them
   * existed in the stylesheet and were never applied to anything, so the toggles
   * did nothing at all and the expensive compositing ran unconditionally.
   *
   * `performanceMode` folds in on top of the two toggles, because "performance"
   * and "ultra-low" mean the same thing compositing-wise.
   */
  useEffect(() => {
    const mode = settings.performanceMode;
    const lean = mode === "performance" || mode === "ultra-low";
    document.body.classList.toggle("no-glow", !settings.enableAmbientGlow || lean);
    document.body.classList.toggle("no-glass", !settings.enableGlassBlur || lean);
  }, [
    settings.enableAmbientGlow,
    settings.enableGlassBlur,
    settings.performanceMode
  ]);

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

    const coverUrl = getTrackCoverUrl(audioEngine.currentTrack);

    extractColors(coverUrl).then(colors => {
      applyThemeColors(colors);
    });
  }, [audioEngine.currentTrack, settings]);

  // Listen for SSE remote commands & MPRIS
  useEffect(() => {
    const sse = new EventSource("/api/ctl/events");
    sse.onmessage = (event) => {
      // Resolved per message rather than captured: a captured engine would be a
      // snapshot of whatever the hook returned when the subscription was made.
      const engine = audioEngineRef.current;
      try {
    const cmd = JSON.parse(event.data);
        if (cmd.action === "play") {
          if (cmd.track) {
            handlePlayTrackRef.current(cmd.track);
          } else if (cmd.query && tracksRef.current.length > 0) {
            const found = findBestTrackMatch(tracksRef.current, cmd.query);
            if (found) handlePlayTrackRef.current(found);
          } else {
            engine.play();
          }
        } else if (cmd.action === "pause") {
          engine.pause();
        } else if (cmd.action === "resume") {
          engine.play();
        } else if (cmd.action === "toggle") {
          engine.togglePlay();
        } else if (cmd.action === "next") {
          handleNextRef.current();
        } else if (cmd.action === "prev" || cmd.action === "previous") {
          handlePreviousRef.current();
        } else if (cmd.action === "stop") {
          engine.pause();
          engine.seek(0);
        } else if (cmd.action === "shuffle") {
          setIsShuffle(prev => !prev);
        } else if (cmd.action === "seek" && typeof cmd.time === "number") {
          engine.seek(cmd.time);
        } else if (cmd.type === "favorites_updated" && Array.isArray(cmd.favorites)) {
          window.dispatchEvent(new CustomEvent("cadence:favorites_updated", { detail: cmd.favorites }));
        } else if (cmd.type === "playlists_updated" && Array.isArray(cmd.playlists)) {
          window.dispatchEvent(new CustomEvent("cadence:playlists_updated", { detail: cmd.playlists }));
        } else if (cmd.type === "library_updated") {
          fetchLibraryRef.current();
        }
      } catch (err) {
        console.warn("[Cadence SSE error]:", err);
      }
    };

const unbindPlay = (window as any).electronAPI?.onPlayCommand?.((payload: any) => {
      if (payload?.query && tracksRef.current.length > 0) {
  const found = findBestTrackMatch(tracksRef.current, payload.query);
        if (found) handlePlayTrackRef.current(found);
      }
    });

    const unbindMedia = (window as any).electronAPI?.onMediaKey?.((action: string) => {
      const engine = audioEngineRef.current;
      if (action === "play-pause") engine.togglePlay();
      else if (action === "next") handleNextRef.current();
      else if (action === "previous") handlePreviousRef.current();
      else if (action === "stop") {
        engine.pause();
        engine.seek(0);
      }
    });

    return () => {
      sse.close();
      unbindPlay?.();
      unbindMedia?.();
    };
    // Empty on purpose. This is a subscription, not a derivation: it has to keep
    // working against the latest handlers without being rebuilt for them.
    // Listing `audioEngine` here (or any callback derived from it) meant every
    // `timeupdate` tick closed the EventSource and opened a new one, which is a
    // fresh TCP connection plus a new server-side keep-alive timer several times
    // a second, for as long as audio was playing. The handlers are read through
    // refs instead.
  }, []);

  // Update server playback state for CLI status reporting and Discord RPC
  //
  // Gated on whole seconds rather than fired per `timeupdate`. The old version
  // ran on every tick, and the tick rate goes *up* when the stream is
  // struggling, so a track that had started dropping frames produced more state
  // reports. Each one stringified the whole Track (its id alone is ~48
  // characters), POSTed it, fanned it out to every SSE client, and wrote a
  // SET_ACTIVITY frame to the Discord socket. One second is all that status
  // output and rich presence can actually display.
  useEffect(() => {
    const wholeSecond = Math.floor(audioEngine.currentTime);
    const payload = {
      status: audioEngine.isPlaying ? "playing" : audioEngine.currentTrack ? "paused" : "stopped",
      currentTrack: audioEngine.currentTrack,
      currentTime: wholeSecond,
      duration: audioEngine.duration
    };

    fetch("/api/ctl/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {});

    if ((window as any).electronAPI?.updatePlaybackState) {
      (window as any).electronAPI.updatePlaybackState(payload);
    }
  }, [
    audioEngine.isPlaying,
    audioEngine.currentTrack,
    Math.floor(audioEngine.currentTime),
    audioEngine.duration
  ]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
  document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };
  const toggleFullscreenRef = useRef<() => void>(() => {});
  toggleFullscreenRef.current = toggleFullscreen;

  // Global Keyboard Shortcuts
  //
  // Memoised, and the engine is read through the ref. Inline arrows here meant
  // `useKeyboardShortcuts` received a new object every render, so it detached
  // and reattached the document keydown listener every render.
  const shortcuts = useMemo(() => ({
    onTogglePlayPause: () => audioEngineRef.current.togglePlay(),
    onSeekRelative: (delta: number) => {
      const e = audioEngineRef.current;
      e.seek(e.currentTime + delta);
    },
    onAdjustVolume: (delta: number) => {
  const e = audioEngineRef.current;
      e.setVolume(e.volume + delta);
    },
    onToggleMute: () => audioEngineRef.current.toggleMute(),
    onToggleLyrics: () => setIsRightPanelCollapsed(prev => !prev),
    onToggleQueue: () => setIsRightPanelCollapsed(prev => !prev),
    onToggleLibrary: () => setIsLibraryCollapsed(prev => !prev),
    onToggleSidebar: () => setIsRightPanelCollapsed(prev => !prev),
    onToggleCinemaMode: () => setIsCinemaMode(prev => !prev),
    onToggleFullscreen: () => toggleFullscreenRef.current(),
    onCloseModals: () => {
      setIsEqualizerOpen(false);
      setIsSettingsOpen(false);
      setIsSleepTimerOpen(false);
    },
    enabled: true,
  }), []);

  useKeyboardShortcuts(shortcuts);

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
        <Panel label="Library">
        <LibraryBrowser
          tracks={tracks}
          currentTrack={audioEngine.currentTrack}
          isPlaying={audioEngine.isPlaying}
          onPlayTrack={handlePlayTrack}
          onAddToQueue={handleAddToQueue}
          onPlayAlbum={handlePlayAlbum}
          onRescan={fetchLibrary}
        />
        </Panel>
      </div>
    );
  };

  // Render Hero Deck Center
  const renderHeroDeck = () => (
    <div className="h-full glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl min-w-0">
      <Panel label="Deck">
      <VinylDeck
        currentTrack={audioEngine.currentTrack}
        isPlaying={audioEngine.isPlaying}
        getCurrentTime={getCurrentTime}
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
      </Panel>
    </div>
  );

  // Render Sidebar Stack (Modular Drag & Drop Widgets)
  const renderSidebarStack = () => (
    <Panel label="Widgets">
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
    </Panel>
  );

  return (
    <>
      {/* Per-panel fallbacks rather than one app-wide boundary. A chunk that was not warm
          used to blank the entire interface, transport included. */}
      <Suspense fallback={<PanelLoading />}>
    <div
      id="app-root"
      className={`flex h-screen w-screen relative overflow-hidden select-none transition-colors duration-500 ${
        settings.themeMode === "light" ? "light text-slate-900" : "text-white"
      }`}
      style={{
        background: isCinemaMode
          ? "#000000"
          : settings.themeMode === "light"
          ? "#f1f5f9"
          : "var(--theme-bg-gradient, #06070b)",
        transition: "background 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
      }}
    >
      {/* Dynamic Ambient Mesh Backdrop */}
      <div className={`absolute inset-0 pointer-events-none z-0 ambient-glow ${isCinemaMode ? "opacity-50" : "opacity-30"} transition-opacity duration-700`} />

      {/* Floating Cinema Mode Exit Button */}
        {isCinemaMode && (
          <button
            onClick={() => setIsCinemaMode(false)}
            className="cadence-pop-in absolute top-4 right-5 z-50 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900/85 hover:bg-neutral-800 border border-white/15 text-neutral-300 hover:text-white text-xs font-mono shadow-2xl backdrop-blur-xl transition-all active:scale-95 group"
            title="Exit Cinema Mode (C)"
          >
            <Film className="w-3.5 h-3.5 text-primary group-hover:scale-110 transition-transform" />
            <span>Exit Cinema (C)</span>
          </button>
        )}

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
          isCinemaMode={isCinemaMode}
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
          className={`h-12 w-full px-4 flex items-center justify-between border-b border-white/5 z-20 bg-neutral-950/70 backdrop-blur-xl shrink-0 select-none transition-all duration-500 ${
            isCinemaMode ? "-mt-12 opacity-0 pointer-events-none" : "mt-0 opacity-100"
          }`}
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

            {/* Cinema Mode Toggle */}
            <button
              onClick={() => setIsCinemaMode(prev => !prev)}
              className={`p-1.5 rounded-full border transition-all active:scale-95 ${
                isCinemaMode
                  ? "bg-primary/30 border-primary/50 text-primary shadow-lg shadow-primary/25"
                  : "bg-white/5 hover:bg-white/10 border-white/10 text-neutral-300 hover:text-white"
              }`}
              title="Cinema Mode (C)"
            >
              <Film className="w-3.5 h-3.5" />
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
            <div className="cadence-window-controls flex items-center ml-1.5 space-x-1 pl-2 border-l border-white/10">
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
          {/* 1. STUDIO MODE (Fluid 3-Panel / 2-Panel Dynamic Morphing Layout) */}
          {layoutMode === "studio" && (
            <div className="flex h-full w-full overflow-hidden items-stretch relative min-w-0">
              {settings.libraryPosition === "left" ? (
                <>
                  {/* Left Library Panel */}
                  <div
                    style={{
                      width: effectiveLeftWidth,
                      opacity: isCinemaMode ? 0 : 1,
                      pointerEvents: isCinemaMode ? "none" : "auto",
                      transition: (isDraggingPanel || isWindowResizing) ? "none" : "width 0.55s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease-out"
                    }}
                    className="h-full overflow-hidden shrink-0 min-w-0"
                  >
                    {renderLibraryPanel()}
                  </div>

                  {/* Drag Handle 1: Library ⟷ (Center Deck or Widgets) */}
                  {!isLibraryCollapsed && !isCinemaMode && (
                    <div
                      onMouseDown={hasActiveTrack ? handleLeftDividerMouseDown : (e) => handleIdleDividerMouseDown(e, "left")}
                      onDoubleClick={handleResetPanelWidths}
                      className="w-3 -mx-1.5 h-full cursor-col-resize z-20 flex items-center justify-center group shrink-0 select-none touch-none"
                      title={hasActiveTrack ? "Drag to resize Library (Double-click to auto-balance)" : "Drag to resize split (Double-click to reset)"}
                    >
                      <div className="w-1 h-12 rounded-full bg-white/10 group-hover:bg-primary/80 group-hover:h-20 group-hover:w-1.5 transition-all" />
                    </div>
                  )}

                  {/* Center Hero Player Deck (Smoothly animates/springs into middle when song plays) */}
                  <div 
                    style={{
                      flex: hasActiveTrack ? "1 1 0%" : "0 0 0px",
                      width: hasActiveTrack ? undefined : 0,
                      opacity: hasActiveTrack ? 1 : 0,
                      transform: hasActiveTrack ? "scale(1)" : "scale(0.96)",
                      pointerEvents: hasActiveTrack ? "auto" : "none",
                      overflow: "hidden",
                      transition: (isDraggingPanel || isWindowResizing)
                        ? "none"
                        : "flex 0.55s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), transform 0.55s cubic-bezier(0.16, 1, 0.3, 1)"
                    }}
                    className={`h-full overflow-hidden min-w-0 ${hasActiveTrack ? "px-2" : "px-0"}`}
                  >
                    {renderHeroDeck()}
                  </div>

                  {/* Drag Handle 2: Center Deck ⟷ Widgets Sidebar (Only when track active) */}
                  {hasActiveTrack && !isRightPanelCollapsed && !isCinemaMode && (
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
                  <div
                    style={{
                      width: effectiveRightWidth,
                      opacity: (isCinemaMode || isRightPanelCollapsed) ? 0 : 1,
                      pointerEvents: (isCinemaMode || isRightPanelCollapsed) ? "none" : "auto",
                      transition: (isDraggingPanel || isWindowResizing) ? "none" : "width 0.55s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease-out"
                    }}
                    className="h-full overflow-hidden shrink-0 min-w-0"
                  >
                    {renderSidebarStack()}
                  </div>
                </>
              ) : (
                <>
                  {/* Right Sidebar Stack on Left */}
                  <div
                    style={{
                      width: effectiveLeftWidth,
                      opacity: (isCinemaMode || isRightPanelCollapsed) ? 0 : 1,
                      pointerEvents: (isCinemaMode || isRightPanelCollapsed) ? "none" : "auto",
                      transition: (isDraggingPanel || isWindowResizing) ? "none" : "width 0.55s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease-out"
                    }}
                    className="h-full overflow-hidden shrink-0 min-w-0"
                  >
                    {renderSidebarStack()}
                  </div>

                  {/* Drag Handle 1: Widgets ⟷ (Center Deck or Library) */}
                  {!isRightPanelCollapsed && !isCinemaMode && (
                    <div
                      onMouseDown={hasActiveTrack ? handleRightDividerMouseDown : (e) => handleIdleDividerMouseDown(e, "right")}
                      onDoubleClick={handleResetPanelWidths}
                      className="w-3 -mx-1.5 h-full cursor-col-resize z-20 flex items-center justify-center group shrink-0 select-none touch-none"
                      title={hasActiveTrack ? "Drag to resize Widgets (Double-click to auto-balance)" : "Drag to resize split (Double-click to reset)"}
                    >
                      <div className="w-1 h-12 rounded-full bg-white/10 group-hover:bg-primary/80 group-hover:h-20 group-hover:w-1.5 transition-all" />
                    </div>
                  )}

                  {/* Center Hero Player Deck (Smoothly animates/springs into middle when song plays) */}
                  <div 
                    style={{
                      flex: hasActiveTrack ? "1 1 0%" : "0 0 0px",
                      width: hasActiveTrack ? undefined : 0,
                      opacity: hasActiveTrack ? 1 : 0,
                      transform: hasActiveTrack ? "scale(1)" : "scale(0.96)",
                      pointerEvents: hasActiveTrack ? "auto" : "none",
                      overflow: "hidden",
                      transition: (isDraggingPanel || isWindowResizing)
                        ? "none"
                        : "flex 0.55s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), transform 0.55s cubic-bezier(0.16, 1, 0.3, 1)"
                    }}
                    className={`h-full overflow-hidden min-w-0 ${hasActiveTrack ? "px-2" : "px-0"}`}
                  >
                    {renderHeroDeck()}
                  </div>

                  {/* Drag Handle 2: Center Deck ⟷ Library (Only when track active) */}
                  {hasActiveTrack && !isLibraryCollapsed && !isCinemaMode && (
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
                    style={{
                      width: effectiveRightWidth,
                      opacity: isCinemaMode ? 0 : 1,
                      pointerEvents: isCinemaMode ? "none" : "auto",
                      transition: (isDraggingPanel || isWindowResizing) ? "none" : "width 0.55s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease-out"
                    }}
                    className="h-full overflow-hidden shrink-0 min-w-0"
                  >
                    {renderLibraryPanel()}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 2. STAGE MODE (Hero Focus + Lyrics) */}
          {layoutMode === "stage" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full w-full overflow-hidden">
              <div className={`${isCinemaMode ? "lg:col-span-12" : "lg:col-span-7"} h-full overflow-hidden min-w-0 transition-all duration-500`}>
                {renderHeroDeck()}
              </div>
              {!isCinemaMode && (
                <div className="lg:col-span-5 h-full glass-panel rounded-3xl overflow-hidden shadow-xl min-w-0 transition-all duration-500">
                  <Panel label="Lyrics">
                  <LyricsDeck
                    currentTrack={audioEngine.currentTrack}
                    currentTime={audioEngine.currentTime}
                    isPlaying={audioEngine.isPlaying}
                    onSeek={audioEngine.seek}
                  />
                  </Panel>
                </div>
              )}
            </div>
          )}

          {/* 3. BROWSER MODE (Full Library Focus) */}
          {layoutMode === "browser" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full w-full overflow-hidden">
              {!isCinemaMode && (
                <div className="lg:col-span-8 h-full overflow-hidden min-w-0 transition-all duration-500">
                  {renderLibraryPanel()}
                </div>
              )}
              <div className={`${isCinemaMode ? "lg:col-span-12" : "lg:col-span-4"} h-full overflow-hidden min-w-0 transition-all duration-500`}>
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
            isCinemaMode={isCinemaMode}
            position="bottom"
            barStyle={settings.playerBarStyle || "floating"}
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
        eqQs={audioEngine.eqQs}
        eqBypassed={audioEngine.eqBypassed}
        currentTrack={audioEngine.currentTrack}
        audioInfo={{
          sampleRate: audioEngine.sampleRate,
          baseLatency: audioEngine.baseLatency,
          outputLatency: audioEngine.outputLatency
        }}
        onSetGain={audioEngine.setEqualizerGain}
        onSetQ={audioEngine.setEqQ}
        onSetBypass={audioEngine.setEqBypass}
        onApplyPreset={audioEngine.applyPreset}
        dspSettings={audioEngine.dspSettings}
        onUpdateDspSettings={audioEngine.updateDspSettings}
        onLoadImpulseResponse={audioEngine.loadImpulseResponse}
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
        totalDurationSeconds={sleepTimerTotalSecsRef.current}
        onStartTimer={handleStartSleepTimer}
        onExtendTimer={handleExtendSleepTimer}
        onCancelTimer={handleCancelSleepTimer}
      />
    </div>
      </Suspense>
    </>
  );
};

export default App;
