import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ListMusic, Trash2, ArrowUp, ArrowDown, X, Play, Music, Info, HardDrive } from "lucide-react";
import { Track } from "../types";

interface QueueDrawerProps {
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayTrack: (track: Track) => void;
  onRemoveFromQueue: (index: number) => void;
  onClearQueue: () => void;
  onMoveQueueItem: (fromIdx: number, toIdx: number) => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({
  queue,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onRemoveFromQueue,
  onClearQueue,
  onMoveQueueItem
}) => {
  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, "0")}`;
  };

  const formatBytes = (bytes: number) => {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-full w-full p-4 select-none relative overflow-hidden space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center space-x-2">
          <ListMusic className="w-4 h-4 text-primary" />
          <span className="text-xs uppercase tracking-wider font-semibold text-neutral-300">
            Up Next Queue ({queue.length})
          </span>
        </div>
        {queue.length > 0 && (
          <button
            onClick={onClearQueue}
            className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-red-400 font-medium transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Current Playing Track Details Card */}
      {currentTrack && (
        <div className="p-3 bg-primary/10 border border-primary/20 rounded-2xl space-y-2 text-left">
          <div className="flex items-center justify-between text-[10px] uppercase font-mono text-primary font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Now Playing
            </span>
            <span>{currentTrack.format} Lossless</span>
          </div>

          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-black/40 shrink-0 border border-primary/20">
              <img
                src={currentTrack.coverPath ? `/covers?path=${encodeURIComponent(currentTrack.coverPath)}` : `/covers`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-white truncate">{currentTrack.title}</h4>
              <p className="text-[11px] text-neutral-400 truncate">{currentTrack.artist}</p>
            </div>
          </div>

          {/* Linux Audio Inspector Metadata Badges */}
          <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px] font-mono text-neutral-400 bg-black/30 p-2 rounded-xl border border-white/5">
            <div>Sample: <span className="text-white">{currentTrack.sampleRate ? `${currentTrack.sampleRate} Hz` : "44.1 kHz"}</span></div>
            <div>Bitrate: <span className="text-white">{currentTrack.bitrate ? `${Math.round(currentTrack.bitrate / 1000)} kbps` : "Lossless"}</span></div>
            <div>Size: <span className="text-white">{formatBytes(currentTrack.size)}</span></div>
            <div>Duration: <span className="text-white">{formatSeconds(currentTrack.duration)}</span></div>
          </div>
        </div>
      )}

      {/* Queue Tracks List */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 no-scrollbar">
        {queue.length > 0 ? (
          queue.map((t, idx) => (
            <div
              key={`${t.id}-${idx}`}
              className="group flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-left transition-all"
            >
              <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                <span className="text-[10px] font-mono text-neutral-500 w-4 text-center shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{t.title}</p>
                  <p className="text-[10px] text-neutral-400 truncate">{t.artist}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-1 shrink-0">
                <button
                  onClick={() => onPlayTrack(t)}
                  className="p-1 rounded hover:bg-white/15 text-neutral-400 hover:text-white"
                  title="Play Now"
                >
                  <Play className="w-3 h-3 fill-current" />
                </button>
                {idx > 0 && (
                  <button
                    onClick={() => onMoveQueueItem(idx, idx - 1)}
                    className="p-1 rounded hover:bg-white/15 text-neutral-400 hover:text-white"
                    title="Move Up"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                )}
                {idx < queue.length - 1 && (
                  <button
                    onClick={() => onMoveQueueItem(idx, idx + 1)}
                    className="p-1 rounded hover:bg-white/15 text-neutral-400 hover:text-white"
                    title="Move Down"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => onRemoveFromQueue(idx)}
                  className="p-1 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-400"
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-44 text-center space-y-2 text-neutral-500">
            <Music className="w-6 h-6" />
            <p className="text-xs">Queue is empty</p>
            <p className="text-[10px] text-neutral-600">Click "+" on any track to queue it next</p>
          </div>
        )}
      </div>
    </div>
  );
};
