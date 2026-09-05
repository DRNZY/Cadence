import React, { useState, useEffect, useRef } from "react";
import { 
  GripVertical, 
  EyeOff, 
  Plus, 
  Activity, 
  Mic2, 
  ListMusic, 
  Info, 
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Search,
  RefreshCw,
  Radio,
  Waves,
  Zap,
  Trash2
} from "lucide-react";
import { Reorder, useDragControls } from "framer-motion";
import { Track, VisualizerMode, WidgetId, LyricsState } from "../types";
import { SpectrumVisualizer } from "./SpectrumVisualizer";
import { LyricsDeck, LyricsDeckHandle } from "./LyricsDeck";
import { QueueDrawer } from "./QueueDrawer";

interface WidgetContainerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  visualizerMode: VisualizerMode;
  onSetVisualizerMode: (mode: VisualizerMode) => void;
  getFrequencyData: () => Uint8Array;
  getTimeDomainData: () => Uint8Array;
  accentColor?: string;
  queue: Track[];
  onPlayTrack: (track: Track) => void;
  onRemoveFromQueue: (index: number) => void;
  onClearQueue: () => void;
  onMoveQueueItem: (fromIdx: number, toIdx: number) => void;
  onSeek: (time: number) => void;
  visualizerEnabled?: boolean;
}

interface WidgetItemDef {
  id: WidgetId;
  title: string;
  icon: React.ReactNode;
  defaultVisible: boolean;
}

const WIDGET_DEFS: WidgetItemDef[] = [
  { id: "visualizer", title: "Spectrum", icon: <Activity className="w-3.5 h-3.5" />, defaultVisible: true },
  { id: "lyrics", title: "Lyrics Deck", icon: <Mic2 className="w-3.5 h-3.5" />, defaultVisible: true },
  { id: "queue", title: "Queue", icon: <ListMusic className="w-3.5 h-3.5" />, defaultVisible: true },
  { id: "trackDetails", title: "Audio Specs", icon: <Info className="w-3.5 h-3.5" />, defaultVisible: false }
];

const STORAGE_KEY = "cadence_widgets_v3";

interface WidgetCardItemProps {
  widgetId: WidgetId;
  isMinimized: boolean;
  isOnlyVisible: boolean;
  shouldLyricsCompact: boolean;
  hasSyncedLyrics: boolean;
  hasAnyLyrics: boolean;
  onToggleMinimize: () => void;
  onToggleWidget: () => void;
  // Visualizer props
  isPlaying: boolean;
  visualizerMode: VisualizerMode;
  onSetVisualizerMode: (mode: VisualizerMode) => void;
  getFrequencyData: () => Uint8Array;
  getTimeDomainData: () => Uint8Array;
  accentColor?: string;
  // Lyrics props
  currentTrack: Track | null;
  currentTime: number;
  onSeek: (time: number) => void;
  onLyricsLoaded: (state: LyricsState) => void;
  lyricsRef: React.RefObject<LyricsDeckHandle | null>;
  // Queue props
  queue: Track[];
  onPlayTrack: (track: Track) => void;
  onRemoveFromQueue: (index: number) => void;
  onClearQueue: () => void;
  onMoveQueueItem: (fromIdx: number, toIdx: number) => void;
  visibleWidgets: WidgetId[];
}

const WidgetCardItem: React.FC<WidgetCardItemProps> = ({
  widgetId,
  isMinimized,
  isOnlyVisible,
  shouldLyricsCompact,
  hasSyncedLyrics,
  hasAnyLyrics,
  onToggleMinimize,
  onToggleWidget,
  isPlaying,
  visualizerMode,
  onSetVisualizerMode,
  getFrequencyData,
  getTimeDomainData,
  accentColor,
  currentTrack,
  currentTime,
  onSeek,
  onLyricsLoaded,
  lyricsRef,
  queue,
  onPlayTrack,
  onRemoveFromQueue,
  onClearQueue,
  onMoveQueueItem,
  visibleWidgets
}) => {
  const dragControls = useDragControls();

  // Dynamic height determination
  const heightClass = isMinimized
    ? "shrink-0 h-auto"
    : isOnlyVisible
    ? "flex-1 min-h-0"
    : widgetId === "visualizer"
    ? (visibleWidgets.includes("lyrics") && !hasSyncedLyrics
        ? "flex-1 min-h-[200px]"
        : "h-44 shrink-0")
    : widgetId === "lyrics"
    ? (shouldLyricsCompact ? "h-36 shrink-0" : "flex-1 min-h-[200px]")
    : widgetId === "queue"
    ? (visibleWidgets.includes("lyrics") && !hasSyncedLyrics
        ? "flex-1 min-h-[220px]"
        : (visibleWidgets.includes("lyrics") ? "h-52 shrink-0" : "flex-1 min-h-0"))
    : "shrink-0 h-auto";

  return (
    <Reorder.Item
      as="div"
      value={widgetId}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ scale: 1.02, zIndex: 50 }}
      transition={{ type: "spring", stiffness: 350, damping: 30 }}
      className={`glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl border border-white/10 transition-colors duration-200 ${heightClass}`}
    >
      {/* ─── SINGLE UNIFIED HEADER ─── */}
      <div
        onPointerDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("button") || target.closest("input")) return;
          dragControls.start(e);
        }}
        className="flex items-center justify-between px-3.5 py-2 border-b border-white/5 bg-white/[0.02] shrink-0 select-none cursor-grab active:cursor-grabbing"
      >
        {/* Left: Drag Handle, Icon, Title & Badges */}
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="w-3.5 h-3.5 text-neutral-500 hover:text-neutral-300 transition-colors shrink-0" />
          
          {widgetId === "visualizer" && (
            <>
              <Activity className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                Spectrum
              </span>
            </>
          )}

          {widgetId === "lyrics" && (
            <>
              <Mic2 className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                Lyrics
              </span>
              {hasAnyLyrics && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  hasSyncedLyrics 
                    ? "bg-primary/15 text-primary border-primary/30" 
                    : "bg-neutral-800/80 text-neutral-400 border-white/10"
                }`}>
                  {hasSyncedLyrics && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                  <span>{hasSyncedLyrics ? "Synced" : "Plain"}</span>
                </span>
              )}
            </>
          )}

          {widgetId === "queue" && (
            <>
              <ListMusic className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                Queue
              </span>
              <span className="text-[10px] font-mono text-neutral-500">
                ({queue.length})
              </span>
            </>
          )}

          {widgetId === "trackDetails" && (
            <>
              <Info className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                Audio Specs
              </span>
            </>
          )}
        </div>

        {/* Right: Widget Contextual Actions & Window Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Spectrum Mode Switcher in Header */}
          {widgetId === "visualizer" && !isMinimized && (
            <div className="flex bg-black/40 p-0.5 rounded-full border border-white/10 mr-1">
              {([
                { id: "bars", icon: <Radio className="w-2.5 h-2.5" />, title: "Bars" },
                { id: "wave", icon: <Waves className="w-2.5 h-2.5" />, title: "Wave" },
                { id: "radial", icon: <Zap className="w-2.5 h-2.5" />, title: "Radial" },
                { id: "oscilloscope", icon: <Activity className="w-2.5 h-2.5" />, title: "Oscilloscope" }
              ] as const).map(m => (
                <button
                  key={m.id}
                  onClick={() => onSetVisualizerMode(m.id)}
                  className={`p-1 rounded-full transition-all active:scale-90 ${
                    visualizerMode === m.id ? "bg-white/20 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                  }`}
                  title={m.title}
                >
                  {m.icon}
                </button>
              ))}
            </div>
          )}

          {/* Lyrics Search & Refresh in Header */}
          {widgetId === "lyrics" && !isMinimized && (
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={() => lyricsRef.current?.toggleSearch()}
                className="p-1 text-neutral-400 hover:text-white rounded hover:bg-white/5 transition-colors"
                title="Search Lyrics Online"
              >
                <Search className="w-3 h-3" />
              </button>
              <button
                onClick={() => lyricsRef.current?.refresh()}
                className="p-1 text-neutral-400 hover:text-white rounded hover:bg-white/5 transition-colors"
                title="Refresh Lyrics"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Queue Clear in Header */}
          {widgetId === "queue" && !isMinimized && queue.length > 0 && (
            <button
              onClick={onClearQueue}
              className="flex items-center gap-1 px-2 py-0.5 mr-1 rounded text-[10px] font-mono text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Clear Queue"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}

          {/* Minimize / Expand */}
          <button
            onClick={onToggleMinimize}
            className="p-1 text-neutral-400 hover:text-white rounded hover:bg-white/5 transition-colors"
            title={isMinimized ? "Expand" : "Collapse"}
          >
            {isMinimized ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>

          {/* Hide Widget */}
          <button
            onClick={onToggleWidget}
            className="p-1 text-neutral-400 hover:text-rose-400 rounded hover:bg-white/5 transition-colors"
            title="Hide Widget"
          >
            <EyeOff className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ─── WIDGET CONTENT (NO INNER HEADERS!) ─── */}
      {!isMinimized && (
        <div className="flex-1 overflow-hidden min-h-0 relative flex flex-col">
          {widgetId === "visualizer" && (
            <SpectrumVisualizer
              isPlaying={isPlaying}
              visualizerMode={visualizerMode}
              onSetVisualizerMode={onSetVisualizerMode}
              getFrequencyData={getFrequencyData}
              getTimeDomainData={getTimeDomainData}
              accentColor={accentColor}
              hideHeader={true}
            />
          )}

          {widgetId === "lyrics" && (
            <LyricsDeck
              ref={lyricsRef}
              currentTrack={currentTrack}
              currentTime={currentTime}
              onSeek={onSeek}
              onLyricsLoaded={onLyricsLoaded}
              isCompact={shouldLyricsCompact}
              hideHeader={true}
            />
          )}

          {widgetId === "queue" && (
            <QueueDrawer
              queue={queue}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlayTrack={onPlayTrack}
              onRemoveFromQueue={onRemoveFromQueue}
              onClearQueue={onClearQueue}
              onMoveQueueItem={onMoveQueueItem}
              hideHeader={true}
              hideNowPlaying={true}
            />
          )}

          {widgetId === "trackDetails" && (
            <div className="p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-neutral-400">Container / Codec</span>
                <span className="font-mono font-bold text-white uppercase">{currentTrack?.format || "FLAC"}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-neutral-400">Bitrate</span>
                <span className="font-mono text-primary font-semibold">
                  {currentTrack?.bitrate ? `${currentTrack.bitrate} kbps` : "Lossless / VBR"}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-neutral-400">Sample Rate</span>
                <span className="font-mono text-neutral-200">
                  {currentTrack?.sampleRate ? `${(currentTrack.sampleRate / 1000).toFixed(1)} kHz` : "44.1 kHz"}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-neutral-400">ReplayGain</span>
                <span className="font-mono text-neutral-300">
                  {currentTrack?.replayGain ? `${currentTrack.replayGain > 0 ? "+" : ""}${currentTrack.replayGain.toFixed(1)} dB` : "0.0 dB"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">File Location</span>
                <span className="font-mono text-[10px] text-neutral-400 truncate max-w-[180px]" title={currentTrack?.filePath}>
                  {currentTrack?.filePath || "—"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </Reorder.Item>
  );
};

export const WidgetContainer: React.FC<WidgetContainerProps> = ({
  currentTrack,
  isPlaying,
  currentTime,
  visualizerMode,
  onSetVisualizerMode,
  getFrequencyData,
  getTimeDomainData,
  accentColor,
  queue,
  onPlayTrack,
  onRemoveFromQueue,
  onClearQueue,
  onMoveQueueItem,
  onSeek
}) => {
  // Widget order & visibility state with persistence
  const [order, setOrder] = useState<WidgetId[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.order) && parsed.order.length > 0) {
          const validIds: WidgetId[] = ["visualizer", "lyrics", "queue", "trackDetails"];
          const filtered = parsed.order.filter((id: any) => validIds.includes(id));
          for (const id of validIds) {
            if (!filtered.includes(id)) filtered.push(id);
          }
          return filtered;
        }
      }
    } catch {}
    return ["visualizer", "lyrics", "queue", "trackDetails"];
  });

  const [visibility, setVisibility] = useState<Record<WidgetId, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.visibility) {
          return {
            visualizer: parsed.visibility.visualizer ?? true,
            lyrics: parsed.visibility.lyrics ?? true,
            queue: parsed.visibility.queue ?? true,
            trackDetails: parsed.visibility.trackDetails ?? false
          };
        }
      }
    } catch {}
    return {
      visualizer: true,
      lyrics: true,
      queue: true,
      trackDetails: false
    };
  });

  const [hasSyncedLyrics, setHasSyncedLyrics] = useState<boolean>(true);
  const [hasAnyLyrics, setHasAnyLyrics] = useState<boolean>(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [minimizedMap, setMinimizedMap] = useState<Record<WidgetId, boolean>>({
    visualizer: false,
    lyrics: false,
    queue: false,
    trackDetails: false
  });

  const lyricsRef = useRef<LyricsDeckHandle | null>(null);

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, visibility }));
    } catch {}
  }, [order, visibility]);

  const handleLyricsLoaded = (state: LyricsState) => {
    setHasSyncedLyrics(state.synced && state.lines.length > 0);
    setHasAnyLyrics(state.lines.length > 0);
  };

  const toggleWidget = (id: WidgetId) => {
    setVisibility(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const toggleMinimize = (id: WidgetId) => {
    setMinimizedMap(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const resetWidgets = () => {
    setOrder(["visualizer", "lyrics", "queue", "trackDetails"]);
    setVisibility({
      visualizer: true,
      lyrics: true,
      queue: true,
      trackDetails: false
    });
    setMinimizedMap({
      visualizer: false,
      lyrics: false,
      queue: false,
      trackDetails: false
    });
  };

  const visibleWidgets = order.filter(id => visibility[id]);

  // Framer Motion real-time reorder handler
  const handleReorder = (newVisibleOrder: WidgetId[]) => {
    setOrder(prev => {
      const hidden = prev.filter(id => !visibility[id]);
      return [...newVisibleOrder, ...hidden];
    });
  };

  // Dynamic Expansion Logic:
  // When tracks do NOT have synced lyrics or any lyrics, lyrics widget occupies a compact bar,
  // allowing the spectrum visualizer or queue to expand smoothly into flex-1 h-full!
  const shouldLyricsCompact = !hasSyncedLyrics && !hasAnyLyrics && visibleWidgets.length > 1;

  return (
    <div className="flex flex-col h-full w-full gap-3 overflow-hidden min-w-0">
      {/* Top Widget Toolbar / Controls */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 border border-white/10 rounded-2xl shrink-0 backdrop-blur-xl">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold tracking-wider text-neutral-300 uppercase">
            Widgets ({visibleWidgets.length})
          </span>
        </div>

        <div className="flex items-center gap-1.5 relative">
          {/* Quick toggle pill dropdown */}
          <button
            onClick={() => setIsMenuOpen(prev => !prev)}
            className={`px-2.5 py-1 text-[10px] font-semibold rounded-xl border transition-all flex items-center gap-1 active:scale-95 ${
              isMenuOpen 
                ? "bg-primary text-white border-primary shadow-sm shadow-primary/20" 
                : "bg-white/5 hover:bg-white/10 border-white/10 text-neutral-300 hover:text-white"
            }`}
            title="Configure active widgets"
          >
            <Plus className="w-3 h-3" />
            <span>Manage</span>
          </button>

          {/* Quick Reset Layout */}
          <button
            onClick={resetWidgets}
            className="p-1 text-neutral-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
            title="Reset default widget layout"
          >
            <RotateCcw className="w-3 h-3" />
          </button>

          {/* Manage Dropdown Popover (Fully Opaque, Crisp, No Bleed-through) */}
          {isMenuOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsMenuOpen(false)} 
              />
              <div className="absolute top-8 right-0 z-50 w-52 p-2 bg-[#0e1017] border border-white/20 rounded-2xl shadow-2xl shadow-black/90 flex flex-col gap-1">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Toggle Widgets
                </div>
                {WIDGET_DEFS.map(def => {
                  const isVisible = visibility[def.id];
                  return (
                    <button
                      key={def.id}
                      onClick={() => toggleWidget(def.id)}
                      className={`w-full px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-all ${
                        isVisible
                          ? "bg-white/15 text-white font-semibold"
                          : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {def.icon}
                        <span>{def.title}</span>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${isVisible ? "bg-primary" : "bg-neutral-600"}`} />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Real-time Reorderable Widget Stack */}
      {visibleWidgets.length === 0 ? (
        <div className="flex-1 glass-panel rounded-3xl flex flex-col items-center justify-center p-6 text-center text-neutral-400 border border-white/10">
          <Sparkles className="w-8 h-8 text-neutral-600 mb-2" />
          <p className="text-sm font-semibold text-neutral-300">All widgets are hidden</p>
          <p className="text-xs text-neutral-500 mt-1 max-w-xs">
            Click Manage above to show the Lyrics Deck, Audio Spectrum, Queue, or Audio Specs.
          </p>
          <button
            onClick={resetWidgets}
            className="mt-4 px-3 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-xl text-xs font-semibold hover:bg-primary/30 transition-all"
          >
            Restore Widgets
          </button>
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={visibleWidgets}
          onReorder={handleReorder}
          as="div"
          className="flex-1 flex flex-col gap-3 overflow-y-auto overflow-x-hidden min-h-0 no-scrollbar p-1"
        >
          {visibleWidgets.map((widgetId) => (
            <WidgetCardItem
              key={widgetId}
              widgetId={widgetId}
              isMinimized={minimizedMap[widgetId]}
              isOnlyVisible={visibleWidgets.length === 1}
              shouldLyricsCompact={shouldLyricsCompact}
              hasSyncedLyrics={hasSyncedLyrics}
              hasAnyLyrics={hasAnyLyrics}
              onToggleMinimize={() => toggleMinimize(widgetId)}
              onToggleWidget={() => toggleWidget(widgetId)}
              isPlaying={isPlaying}
              visualizerMode={visualizerMode}
              onSetVisualizerMode={onSetVisualizerMode}
              getFrequencyData={getFrequencyData}
              getTimeDomainData={getTimeDomainData}
              accentColor={accentColor}
              currentTrack={currentTrack}
              currentTime={currentTime}
              onSeek={onSeek}
              onLyricsLoaded={handleLyricsLoaded}
              lyricsRef={lyricsRef}
              queue={queue}
              onPlayTrack={onPlayTrack}
              onRemoveFromQueue={onRemoveFromQueue}
              onClearQueue={onClearQueue}
              onMoveQueueItem={onMoveQueueItem}
              visibleWidgets={visibleWidgets}
            />
          ))}
        </Reorder.Group>
      )}
    </div>
  );
};
