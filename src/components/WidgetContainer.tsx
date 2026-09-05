import React, { useState, useEffect } from "react";
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
  ChevronUp
} from "lucide-react";
import { Track, VisualizerMode, WidgetId, LyricsState } from "../types";
import { SpectrumVisualizer } from "./SpectrumVisualizer";
import { LyricsDeck } from "./LyricsDeck";
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

const STORAGE_KEY = "cadence_widgets_v2";

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
  const [draggedWidgetId, setDraggedWidgetId] = useState<WidgetId | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<WidgetId | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [minimizedMap, setMinimizedMap] = useState<Record<WidgetId, boolean>>({
    visualizer: false,
    lyrics: false,
    queue: false,
    trackDetails: false
  });

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

  // Drag and Drop reordering handlers
  const handleDragStart = (e: React.DragEvent, id: WidgetId) => {
    setDraggedWidgetId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent, id: WidgetId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverWidgetId !== id) {
      setDragOverWidgetId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverWidgetId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: WidgetId) => {
    e.preventDefault();
    setDragOverWidgetId(null);
    if (!draggedWidgetId || draggedWidgetId === targetId) {
      setDraggedWidgetId(null);
      return;
    }

    setOrder(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(draggedWidgetId);
      const toIdx = next.indexOf(targetId);
      if (fromIdx !== -1 && toIdx !== -1) {
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, draggedWidgetId);
      }
      return next;
    });

    setDraggedWidgetId(null);
  };

  const visibleWidgets = order.filter(id => visibility[id]);

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

          {/* Manage Dropdown Popover */}
          {isMenuOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsMenuOpen(false)} 
              />
              <div className="absolute top-8 right-0 z-50 w-52 p-2 bg-neutral-900/95 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-2xl flex flex-col gap-1">
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
                          ? "bg-white/10 text-white font-semibold"
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

      {/* Widget Stack Body */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden min-h-0">
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
          visibleWidgets.map((widgetId) => {
            const isDragging = draggedWidgetId === widgetId;
            const isDragOver = dragOverWidgetId === widgetId;
            const isMinimized = minimizedMap[widgetId];

            // Auto-expansion rules:
            // - If lyrics has no synced lyrics, spectrum or queue takes primary expanded height.
            // - If only 1 widget is visible, it takes full flex-1.
            // - If multiple are visible, determine heights gracefully.
            const isOnlyVisible = visibleWidgets.length === 1;

            return (
              <div
                key={widgetId}
                draggable
                onDragStart={(e) => handleDragStart(e, widgetId)}
                onDragOver={(e) => handleDragOver(e, widgetId)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, widgetId)}
                className={`group glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl border transition-all duration-300 ${
                  isDragging ? "opacity-40 scale-[0.98] border-primary/50" : "opacity-100"
                } ${
                  isDragOver ? "border-primary shadow-lg shadow-primary/20" : "border-white/10"
                } ${
                  isMinimized ? "shrink-0 h-auto" : 
                  isOnlyVisible ? "flex-1 min-h-0" :
                  widgetId === "visualizer" ? (
                    visibleWidgets.includes("lyrics") && !hasSyncedLyrics
                      ? "flex-1 min-h-[220px]" 
                      : "h-44 shrink-0"
                  ) :
                  widgetId === "lyrics" ? (
                    shouldLyricsCompact ? "h-40 shrink-0" : "flex-1 min-h-[200px]"
                  ) :
                  widgetId === "queue" ? (
                    visibleWidgets.includes("lyrics") && !hasSyncedLyrics
                      ? "flex-1 min-h-[240px]"
                      : (visibleWidgets.includes("lyrics") ? "h-52 shrink-0" : "flex-1 min-h-0")
                  ) :
                  /* trackDetails */ "shrink-0 h-auto"
                }`}
              >
                {/* Widget Drag Handle & Action Header */}
                <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/5 bg-white/[0.02] shrink-0 select-none cursor-grab active:cursor-grabbing">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
                    {widgetId === "visualizer" && <Activity className="w-3.5 h-3.5 text-primary" />}
                    {widgetId === "lyrics" && <Mic2 className="w-3.5 h-3.5 text-primary" />}
                    {widgetId === "queue" && <ListMusic className="w-3.5 h-3.5 text-primary" />}
                    {widgetId === "trackDetails" && <Info className="w-3.5 h-3.5 text-primary" />}
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                      {widgetId === "visualizer" && "Audio Spectrum"}
                      {widgetId === "lyrics" && (hasSyncedLyrics ? "Synced Lyrics" : hasAnyLyrics ? "Plain Lyrics" : "Lyrics Deck")}
                      {widgetId === "queue" && `Play Queue (${queue.length})`}
                      {widgetId === "trackDetails" && "Audio Engine Specs"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Minimize / Expand */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMinimize(widgetId);
                      }}
                      className="p-1 text-neutral-400 hover:text-white rounded hover:bg-white/5 transition-colors"
                      title={isMinimized ? "Expand" : "Collapse"}
                    >
                      {isMinimized ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    </button>

                    {/* Hide Widget */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWidget(widgetId);
                      }}
                      className="p-1 text-neutral-400 hover:text-rose-400 rounded hover:bg-white/5 transition-colors"
                      title="Hide Widget"
                    >
                      <EyeOff className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Widget Body Content */}
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
                      />
                    )}

                    {widgetId === "lyrics" && (
                      <LyricsDeck
                        currentTrack={currentTrack}
                        currentTime={currentTime}
                        onSeek={onSeek}
                        onLyricsLoaded={handleLyricsLoaded}
                        isCompact={shouldLyricsCompact}
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
                          <span className="text-neutral-400">ReplayGain Target</span>
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
