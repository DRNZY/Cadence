import React, { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { Disc3, Sliders, Monitor } from "lucide-react";
import type { Track, DeckMode, VisualizerMode } from "./types";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { extractColors, applyThemeColors } from "./utils/colorExtractor";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { VinylDeck } from "./components/VinylDeck";
import { LyricsDeck } from "./components/LyricsDeck";
import { SpectrumVisualizer } from "./components/SpectrumVisualizer";
import { QueueDrawer } from "./components/QueueDrawer";
import { ControlBar } from "./components/ControlBar";
import { EqualizerModal } from "./components/EqualizerModal";

export const App: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [deckMode, setDeckMode] = useState<DeckMode>("vinyl");
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>("bars");
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");

  // Track end callback ref
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
  }, [queue, tracks, currentIndex, isShuffle, repeatMode]);

  const audioEngine = useAudioEngine(handleTrackEnd);

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
    if (audioEngine.currentTrack?.coverPath) {
      const coverUrl = `/covers?path=${encodeURIComponent(audioEngine.currentTrack.coverPath)}`;
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

  const handlePrevious = () => {
    if (audioEngine.currentTime > 3) {
      audioEngine.seek(0);
      return;
    }
    if (tracks.length > 0 && currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      audioEngine.playTrack(tracks[prevIdx]);
    }
  };

  const handleNext = () => {
    handleTrackEnd();
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audioEngine, handleNext, handlePrevious]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#08090e] text-white relative overflow-hidden select-none">
      <div className="absolute inset-0 ambient-glow opacity-50 pointer-events-none z-0" />
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

      <header className="h-14 w-full px-6 flex items-center justify-between border-b border-white/5 z-20 bg-neutral-950/40 backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-blue-500 flex items-center justify-center shadow-lg shadow-primary/20">
            <Disc3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider uppercase bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
              AuraDeck
            </h1>
            <p className="text-[10px] font-mono text-neutral-400 -mt-0.5">Studio Hi-Fi Engine</p>
          </div>
        </div>

        <div className="hidden lg:flex items-center space-x-3 bg-black/40 px-4 py-1.5 rounded-full border border-white/10 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-neutral-300">
            <Monitor className="w-3.5 h-3.5 text-primary" />
            32:9 Ultrawide Studio
          </span>
          <span className="text-neutral-600">•</span>
          <span className="text-neutral-400">
            {tracks.length} Tracks Indexed
          </span>
          <span className="text-neutral-600">•</span>
          <span className="text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            CachyOS Linux ALSA/PipeWire
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsEqualizerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-neutral-300 hover:text-white transition-colors"
          >
            <Sliders className="w-3.5 h-3.5 text-primary" />
            <span>10-Band EQ</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full p-4 overflow-hidden z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl">
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

        <div className="glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl">
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
          />
        </div>

        <div className="glass-panel rounded-3xl overflow-hidden flex flex-col shadow-xl">
          <LyricsDeck
            currentTrack={audioEngine.currentTrack}
            currentTime={audioEngine.currentTime}
            onSeek={audioEngine.seek}
          />
        </div>

        <div className="flex flex-col gap-4 overflow-hidden">
          <div className="glass-panel rounded-3xl overflow-hidden h-48 shrink-0 shadow-xl">
            <SpectrumVisualizer
              isPlaying={audioEngine.isPlaying}
              visualizerMode={visualizerMode}
              onSetVisualizerMode={setVisualizerMode}
              getFrequencyData={audioEngine.getFrequencyData}
              getTimeDomainData={audioEngine.getTimeDomainData}
            />
          </div>

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
      </main>

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

      <AnimatePresence>
        {isEqualizerOpen && (
          <EqualizerModal
            isOpen={isEqualizerOpen}
            onClose={() => setIsEqualizerOpen(false)}
            eqGains={audioEngine.eqGains}
            onSetGain={audioEngine.setEqGain}
            onSetAllGains={audioEngine.setAllEqGains}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
