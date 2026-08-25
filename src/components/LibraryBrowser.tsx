import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Music, Disc, User, Play, Plus, Check, Mic2, Sparkles, FolderSync } from "lucide-react";
import { Track } from "../types";

interface LibraryBrowserProps {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAlbum: (albumTracks: Track[]) => void;
  onRescan: () => void;
}

export const LibraryBrowser: React.FC<LibraryBrowserProps> = ({
  tracks,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onAddToQueue,
  onPlayAlbum,
  onRescan
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<"ALL" | "FLAC" | "MP3" | "LYRICS">("ALL");
  const [activeTab, setActiveTab] = useState<"albums" | "tracks" | "artists">("albums");

  // Extract unique artists
  const artists = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tracks) {
      map.set(t.artist, (map.get(t.artist) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [tracks]);

  // Group tracks by album
  const albums = useMemo(() => {
    const map = new Map<string, { album: string; artist: string; year?: string; coverPath?: string; tracks: Track[] }>();
    for (const t of tracks) {
      const key = `${t.artist} - ${t.album}`;
      if (!map.has(key)) {
        map.set(key, {
          album: t.album,
          artist: t.artist,
          year: t.year,
          coverPath: t.coverPath,
          tracks: []
        });
      }
      map.get(key)!.tracks.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.artist.localeCompare(b.artist));
  }, [tracks]);

  // Filtered tracks
  const filteredTracks = useMemo(() => {
    return tracks.filter(t => {
      if (selectedArtist && t.artist !== selectedArtist) return false;
      if (formatFilter === "FLAC" && t.format !== "FLAC") return false;
      if (formatFilter === "MP3" && t.format !== "MP3") return false;
      if (formatFilter === "LYRICS" && !t.hasLyrics) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      );
    });
  }, [tracks, selectedArtist, formatFilter, searchQuery]);

  // Filtered albums
  const filteredAlbums = useMemo(() => {
    return albums.filter(a => {
      if (selectedArtist && a.artist !== selectedArtist) return false;
      if (formatFilter === "FLAC" && !a.tracks.some(t => t.format === "FLAC")) return false;
      if (formatFilter === "MP3" && !a.tracks.some(t => t.format === "MP3")) return false;
      if (formatFilter === "LYRICS" && !a.tracks.some(t => t.hasLyrics)) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        a.album.toLowerCase().includes(q) ||
        a.artist.toLowerCase().includes(q)
      );
    });
  }, [albums, selectedArtist, formatFilter, searchQuery]);

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full w-full p-5 select-none relative overflow-hidden">
      {/* Header with Search & Tab Navigation */}
      <div className="space-y-3 pb-3 border-b border-white/5">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search library, artists, albums, or lyrics..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-full pl-10 pr-4 py-2 text-xs font-medium text-white placeholder-neutral-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
            />
          </div>

          <button
            onClick={onRescan}
            title="Rescan ~/Music folder"
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <FolderSync className="w-4 h-4" />
          </button>
        </div>

        {/* View Tabs & Format Chips */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          {/* Main View Tabs */}
          <div className="flex bg-black/40 p-0.5 rounded-full border border-white/10">
            <button
              onClick={() => setActiveTab("albums")}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                activeTab === "albums" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Albums ({filteredAlbums.length})
            </button>
            <button
              onClick={() => setActiveTab("tracks")}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                activeTab === "tracks" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Tracks ({filteredTracks.length})
            </button>
            <button
              onClick={() => setActiveTab("artists")}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                activeTab === "artists" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Artists ({artists.length})
            </button>
          </div>

          {/* Format Chips */}
          <div className="flex items-center space-x-1">
            {(["ALL", "FLAC", "MP3", "LYRICS"] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => setFormatFilter(fmt)}
                className={`px-2.5 py-0.5 text-[10px] font-mono rounded-full font-bold border transition-all ${
                  formatFilter === fmt
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-white/5 text-neutral-400 border-white/5 hover:border-white/15"
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pt-4 pr-1 no-scrollbar space-y-4">
        {/* Active Artist Filter Chip */}
        {selectedArtist && (
          <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-2xl px-4 py-2">
            <span className="text-xs font-semibold text-primary">
              Filtered by: <strong>{selectedArtist}</strong>
            </span>
            <button
              onClick={() => setSelectedArtist(null)}
              className="text-xs text-neutral-400 hover:text-white font-mono"
            >
              ✕ Clear Filter
            </button>
          </div>
        )}

        {/* 1. Albums Grid View */}
        {activeTab === "albums" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3.5 pb-8">
            {filteredAlbums.map(item => {
              const coverUrl = item.coverPath
                ? `/covers?path=${encodeURIComponent(item.coverPath)}`
                : `/covers`;
              const isCurrentAlbum = currentTrack?.album === item.album;

              return (
                <motion.div
                  key={`${item.artist}-${item.album}`}
                  whileHover={{ y: -4, scale: 1.02 }}
                  className="group relative bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-white/15 rounded-2xl p-3 transition-all flex flex-col justify-between shadow-lg"
                >
                  {/* Album Cover with Overlay Play Button */}
                  <div className="relative aspect-square rounded-xl overflow-hidden mb-2.5 bg-black/40 shadow-inner">
                    <img
                      src={coverUrl}
                      alt={item.album}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-xs">
                      <button
                        onClick={() => onPlayAlbum(item.tracks)}
                        className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-transform shadow-xl"
                        title="Play Album"
                      >
                        <Play className="w-5 h-5 ml-0.5 fill-black" />
                      </button>
                    </div>

                    {isCurrentAlbum && isPlaying && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-primary/90 text-black text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1 shadow-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
                        Now Playing
                      </div>
                    )}
                  </div>

                  {/* Album & Artist Info */}
                  <div className="space-y-0.5 text-left">
                    <h3 className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">
                      {item.album}
                    </h3>
                    <p className="text-[11px] text-neutral-400 truncate">
                      {item.artist}
                    </p>
                    <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-neutral-500">
                      <span>{item.tracks.length} tracks</span>
                      <span>{item.tracks[0]?.format}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* 2. Tracks Table View */}
        {activeTab === "tracks" && (
          <div className="space-y-1 pb-8">
            {filteredTracks.map((t, idx) => {
              const isSelected = currentTrack?.id === t.id;
              const coverUrl = t.coverPath
                ? `/covers?path=${encodeURIComponent(t.coverPath)}`
                : `/covers`;

              return (
                <div
                  key={t.id}
                  onDoubleClick={() => onPlayTrack(t)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl text-left border transition-all ${
                    isSelected
                      ? "bg-primary/15 border-primary/30 text-white"
                      : "bg-white/[0.02] hover:bg-white/[0.06] border-white/5 text-neutral-300"
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    {/* Thumbnail */}
                    <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-black/40 shrink-0 border border-white/10">
                      <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => onPlayTrack(t)}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                      >
                        <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-xs font-bold truncate ${isSelected ? "text-primary" : "text-white"}`}>
                          {t.title}
                        </p>
                        {t.hasLyrics && (
                          <span title="Time-Synced Lyrics">
                            <Mic2 className="w-3 h-3 text-primary/80 shrink-0" />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate">
                        {t.artist} • {t.album}
                      </p>
                    </div>
                  </div>

                  {/* Format & Duration */}
                  <div className="flex items-center space-x-3 shrink-0 text-[11px] font-mono text-neutral-400">
                    <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px]">
                      {t.format}
                    </span>
                    <span>{formatSeconds(t.duration)}</span>
                    <button
                      onClick={() => onAddToQueue(t)}
                      className="p-1 rounded-full hover:bg-white/15 text-neutral-400 hover:text-white transition-colors"
                      title="Add to Up Next Queue"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 3. Artists Discography View */}
        {activeTab === "artists" && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pb-8">
            {artists.map(art => (
              <button
                key={art.name}
                onClick={() => {
                  setSelectedArtist(art.name);
                  setActiveTab("albums");
                }}
                className="flex items-center space-x-3 p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/15 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary/30 to-purple-500/20 border border-primary/30 flex items-center justify-center text-primary group-hover:scale-105 transition-transform shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">
                    {art.name}
                  </h4>
                  <p className="text-[10px] text-neutral-400 font-mono">
                    {art.count} tracks
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
