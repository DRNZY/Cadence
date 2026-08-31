import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, User, Play, Plus, Mic2, FolderSync, ListMusic, Download, Upload, Trash2, ShieldCheck } from "lucide-react";
import { Track, Playlist } from "../types";

interface LibraryBrowserProps {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAlbum: (albumTracks: Track[]) => void;
  onRescan: () => void;
}

export const LibraryBrowser: React.FC<LibraryBrowserProps> = React.memo(({
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
  const [activeTab, setActiveTab] = useState<"albums" | "tracks" | "artists" | "playlists">("albums");
  const [previewAlbum, setPreviewAlbum] = useState<{
    album: string;
    artist: string;
    year?: string;
    coverPath?: string;
    tracks: Track[];
  } | null>(null);

  // Playlists State
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Playlists from backend
  const fetchPlaylists = () => {
    fetch("/api/playlists")
      .then(res => res.json())
      .then(data => setPlaylists(data.playlists || []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPlaylistName, description: newPlaylistDesc })
      });
      const data = await res.json();
      if (data.playlist) {
        setPlaylists(prev => [...prev, data.playlist]);
        setSelectedPlaylistId(data.playlist.id);
        setIsCreatingPlaylist(false);
        setNewPlaylistName("");
        setNewPlaylistDesc("");
      }
    } catch (err) {
      console.error("Create playlist error:", err);
    }
  };

  const handleDeletePlaylist = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this playlist?")) return;
    try {
      await fetch(`/api/playlists/${id}`, { method: "DELETE" });
      setPlaylists(prev => prev.filter(p => p.id !== id));
      if (selectedPlaylistId === id) setSelectedPlaylistId(null);
    } catch {}
  };

  const handleAddTrackToPlaylist = async (playlistId: string, trackId: string) => {
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    if (pl.trackIds.includes(trackId)) return;
    const updatedIds = [...pl.trackIds, trackId];

    try {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds: updatedIds })
      });
      const data = await res.json();
      if (data.playlist) {
        setPlaylists(prev => prev.map(p => p.id === playlistId ? data.playlist : p));
        setAddToPlaylistTrack(null);
      }
    } catch {}
  };

  const handleRemoveTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    const updatedIds = pl.trackIds.filter(id => id !== trackId);

    try {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds: updatedIds })
      });
      const data = await res.json();
      if (data.playlist) {
        setPlaylists(prev => prev.map(p => p.id === playlistId ? data.playlist : p));
      }
    } catch {}
  };

  const handleImportM3U = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const content = reader.result as string;
      try {
        const res = await fetch("/api/playlists/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, content })
        });
        const data = await res.json();
        if (data.playlist) {
          setPlaylists(prev => [...prev, data.playlist]);
          setSelectedPlaylistId(data.playlist.id);
        }
      } catch (err) {
        console.error("Import error:", err);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const safeTracks = Array.isArray(tracks) ? tracks : [];

  // Extract unique artists
  const artists = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of safeTracks) {
      map.set(t.artist, (map.get(t.artist) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [safeTracks]);

  // Group tracks by album
  const albums = useMemo(() => {
    const map = new Map<string, { album: string; artist: string; year?: string; coverPath?: string; tracks: Track[] }>();
    for (const t of safeTracks) {
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
  }, [safeTracks]);

  // Smart Collections
  const hiResTracks = useMemo(() => safeTracks.filter(t => t.format === "FLAC"), [safeTracks]);
  const karaokeTracks = useMemo(() => safeTracks.filter(t => t.hasLyrics), [safeTracks]);

  // Filtered tracks
  const filteredTracks = useMemo(() => {
    return safeTracks.filter(t => {
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
  }, [safeTracks, selectedArtist, formatFilter, searchQuery]);

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

  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId);
  const selectedPlaylistTracks = useMemo(() => {
    if (!selectedPlaylist || !Array.isArray(selectedPlaylist.trackIds)) return [];
    return selectedPlaylist.trackIds
      .map(id => safeTracks.find(t => t.id === id))
      .filter((t): t is Track => Boolean(t));
  }, [selectedPlaylist, safeTracks]);

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-full w-full p-5 select-none relative overflow-hidden">
      {/* Hidden File Input for M3U Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportM3U}
        accept=".m3u,.m3u8"
        className="hidden"
      />

      {/* Header with Search & Tab Navigation */}
      <div className="space-y-3 pb-3 border-b border-white/5">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search tracks, artists, albums..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-full pl-10 pr-4 py-2 text-xs font-medium text-white placeholder-neutral-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
            />
          </div>

          <button
            onClick={onRescan}
            title="Rescan library"
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
              onClick={() => { setActiveTab("albums"); setSelectedPlaylistId(null); }}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                activeTab === "albums" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Albums
            </button>
            <button
              onClick={() => { setActiveTab("tracks"); setSelectedPlaylistId(null); }}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                activeTab === "tracks" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Tracks
            </button>
            <button
              onClick={() => { setActiveTab("artists"); setSelectedPlaylistId(null); }}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                activeTab === "artists" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Artists
            </button>
            <button
              onClick={() => setActiveTab("playlists")}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                activeTab === "playlists" ? "bg-white/20 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Playlists
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
              Artist: <strong>{selectedArtist}</strong>
            </span>
            <button
              onClick={() => setSelectedArtist(null)}
              className="text-xs text-neutral-400 hover:text-white font-mono"
            >
              ✕ Clear
            </button>
          </div>
        )}

        {/* 1. Albums Grid View */}
        {activeTab === "albums" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3.5 pb-8">
            {filteredAlbums.map(item => {
              const coverUrl = item.coverPath
                ? `/covers?path=${encodeURIComponent(item.coverPath)}`
                : `/covers?artist=${encodeURIComponent(item.artist)}&album=${encodeURIComponent(item.album)}`;
              const isCurrentAlbum = currentTrack?.album === item.album;

              return (
                <motion.div
                  key={`${item.artist}-${item.album}`}
                  whileHover={{ y: -4, scale: 1.02 }}
                  onClick={() => setPreviewAlbum(item)}
                  className="group relative bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-white/20 rounded-2xl p-3 transition-all flex flex-col justify-between shadow-lg cursor-pointer"
                >
                  <div className="relative aspect-square rounded-xl overflow-hidden mb-2.5 bg-black/40 shadow-inner">
                    <img
                      src={coverUrl}
                      alt={item.album}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-xs">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayAlbum(item.tracks);
                        }}
                        className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-transform shadow-xl"
                        title="Play Album"
                      >
                        <Play className="w-5 h-5 ml-0.5 fill-black" />
                      </button>
                    </div>

                    {isCurrentAlbum && isPlaying && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-primary text-black text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1 shadow-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
                        Now Playing
                      </div>
                    )}
                  </div>

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
            {filteredTracks.map(t => {
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
                    <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-black/40 shrink-0 border border-white/10">
                      <img src={coverUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
                        {t.replayGain !== undefined && (
                          <span title={`ReplayGain: ${t.replayGain} dB`} className="text-[9px] font-mono px-1 rounded bg-blue-500/20 text-blue-400">
                            RG
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate">
                        {t.artist} • {t.album}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 text-[11px] font-mono text-neutral-400">
                    <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px]">
                      {t.format}
                    </span>
                    <span>{formatSeconds(t.duration)}</span>
                    <button
                      onClick={() => setAddToPlaylistTrack(t)}
                      className="p-1 rounded-full hover:bg-white/15 text-neutral-400 hover:text-primary transition-colors"
                      title="Add to playlist"
                    >
                      <ListMusic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onAddToQueue(t)}
                      className="p-1 rounded-full hover:bg-white/15 text-neutral-400 hover:text-white transition-colors"
                      title="Add to queue"
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

        {/* 4. Playlists & Smart Collections View */}
        {activeTab === "playlists" && (
          <div className="space-y-5 pb-8">
            {!selectedPlaylistId ? (
              <>
                {/* Actions Bar */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider font-mono">
                    Playlists
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/5 hover:bg-white/15 border border-white/10 text-neutral-300 flex items-center gap-1.5 transition-all"
                    >
                      <Upload className="w-3.5 h-3.5" /> Import M3U
                    </button>
                    <button
                      onClick={() => setIsCreatingPlaylist(true)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-black flex items-center gap-1.5 hover:bg-primary/90 transition-all shadow-lg"
                    >
                      <Plus className="w-4 h-4" /> New Playlist
                    </button>
                  </div>
                </div>

                {/* Smart Collections Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => onPlayAlbum(hiResTracks)}
                    className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-transparent border border-blue-500/30 hover:border-blue-500/60 transition-all cursor-pointer group space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/30 text-blue-400 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                        {hiResTracks.length} tracks
                      </span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">
                        Hi-Res Audio
                      </h4>
                      <p className="text-[11px] text-neutral-400">Lossless FLAC</p>
                    </div>
                  </div>

                  <div
                    onClick={() => onPlayAlbum(karaokeTracks)}
                    className="p-4 rounded-2xl bg-gradient-to-br from-primary/20 via-purple-500/10 to-transparent border border-primary/30 hover:border-primary/60 transition-all cursor-pointer group space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-xl bg-primary/30 text-primary flex items-center justify-center">
                        <Mic2 className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                        {karaokeTracks.length} tracks
                      </span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-primary transition-colors">
                        Karaoke
                      </h4>
                      <p className="text-[11px] text-neutral-400">Synced lyrics</p>
                    </div>
                  </div>
                </div>

                {/* User Playlists List */}
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-bold text-neutral-300 font-mono">Custom Playlists</h4>
                  {playlists.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 text-center space-y-2">
                      <ListMusic className="w-8 h-8 text-neutral-500 mx-auto" />
                      <p className="text-xs text-neutral-400">No playlists yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {playlists.map(pl => (
                        <div
                          key={pl.id}
                          onClick={() => setSelectedPlaylistId(pl.id)}
                          className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/15 transition-all cursor-pointer group"
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center text-primary group-hover:scale-105 transition-transform shrink-0 border border-white/10">
                              <ListMusic className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">
                                {pl.name}
                              </h4>
                              <p className="text-[10px] text-neutral-400 font-mono">
                                {pl.trackIds.length} tracks {pl.description ? `• ${pl.description}` : ""}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <a
                              href={`/api/playlists/${pl.id}/export.m3u8`}
                              download
                              onClick={e => e.stopPropagation()}
                              title="Export .m3u8"
                              className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={e => handleDeletePlaylist(pl.id, e)}
                              title="Delete Playlist"
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-neutral-400 hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Selected Playlist Detail View */
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => setSelectedPlaylistId(null)}
                      className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs font-mono text-neutral-300"
                    >
                      ← Back
                    </button>
                    <div>
                      <h3 className="text-sm font-bold text-white">{selectedPlaylist?.name}</h3>
                      <p className="text-[11px] text-neutral-400 font-mono">
                        {selectedPlaylistTracks.length} tracks • {selectedPlaylist?.description || "Custom Playlist"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onPlayAlbum(selectedPlaylistTracks)}
                      disabled={selectedPlaylistTracks.length === 0}
                      className="px-4 py-1.5 rounded-full bg-primary text-black font-bold text-xs flex items-center gap-1.5 hover:bg-primary/90 transition-all disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 fill-black" /> Play All
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  {selectedPlaylistTracks.map(t => (
                    <div
                      key={t.id}
                      onDoubleClick={() => onPlayTrack(t)}
                      className="group flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-neutral-300"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">{t.title}</p>
                          <p className="text-[11px] text-neutral-400 truncate">{t.artist} • {t.album}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 text-[11px] font-mono text-neutral-400">
                        <span>{formatSeconds(t.duration)}</span>
                        <button
                          onClick={() => onPlayTrack(t)}
                          className="p-1 rounded-full hover:bg-white/15 text-neutral-400 hover:text-white"
                          title="Play"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemoveTrackFromPlaylist(selectedPlaylist!.id, t.id)}
                          className="p-1 rounded-full hover:bg-red-500/20 text-neutral-400 hover:text-red-400"
                          title="Remove from playlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Create New Playlist */}
      {isCreatingPlaylist && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-5 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white">New Playlist</h3>
            <input
              type="text"
              placeholder="Playlist Name"
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
              autoFocus
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newPlaylistDesc}
              onChange={e => setNewPlaylistDesc(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsCreatingPlaylist(false)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim()}
                className="px-4 py-1.5 rounded-full text-xs font-bold bg-primary text-black disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Track To Playlist */}
      {addToPlaylistTrack && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-5 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Add to Playlist</h3>
              <button onClick={() => setAddToPlaylistTrack(null)} className="text-neutral-400 hover:text-white">✕</button>
            </div>
            <p className="text-xs text-neutral-400 truncate">
              {addToPlaylistTrack.title} — {addToPlaylistTrack.artist}
            </p>

            <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
              {playlists.map(pl => {
                const alreadyIn = pl.trackIds.includes(addToPlaylistTrack.id);
                return (
                  <button
                    key={pl.id}
                    onClick={() => handleAddTrackToPlaylist(pl.id, addToPlaylistTrack.id)}
                    disabled={alreadyIn}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-left border transition-all ${
                      alreadyIn
                        ? "bg-white/5 border-white/5 text-neutral-500 cursor-not-allowed"
                        : "bg-white/[0.03] hover:bg-white/[0.08] border-white/10 text-white"
                    }`}
                  >
                    <span className="text-xs font-semibold">{pl.name}</span>
                    <span className="text-[10px] font-mono text-neutral-400">
                      {alreadyIn ? "✓ Added" : "+ Add"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Album Preview & Song Selector */}
      <AnimatePresence>
        {previewAlbum && (
          <div
            onClick={() => setPreviewAlbum(null)}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 md:p-8"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0e1017]/95 border border-white/15 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl shadow-black/90 relative"
            >
              {/* Header Hero */}
              <div className="p-6 pb-4 border-b border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent flex flex-col md:flex-row gap-5 items-start md:items-center justify-between shrink-0">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-black/60 shrink-0 border border-white/15 shadow-2xl relative">
                    <img
                      src={
                        previewAlbum.coverPath
                          ? `/covers?path=${encodeURIComponent(previewAlbum.coverPath)}`
                          : `/covers?artist=${encodeURIComponent(previewAlbum.artist)}&album=${encodeURIComponent(previewAlbum.album)}`
                      }
                      alt={previewAlbum.album}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 text-left">
                    {previewAlbum.year && (
                      <span className="text-[10px] font-mono text-neutral-400">
                        {previewAlbum.year}
                      </span>
                    )}
                    <h2 className="text-lg md:text-xl font-black text-white truncate drop-shadow-md">
                      {previewAlbum.album}
                    </h2>
                    <p className="text-xs font-medium text-neutral-300 truncate">
                      {previewAlbum.artist}
                    </p>
                    <p className="text-[10px] font-mono text-neutral-400">
                      {previewAlbum.tracks.length} tracks •{" "}
                      {Math.round(
                        previewAlbum.tracks.reduce((acc, t) => acc + (t.duration || 0), 0) / 60
                      )}{" "}
                      min
                    </p>
                  </div>
                </div>

                {/* Quick Action Controls */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    onClick={() => {
                      onPlayAlbum(previewAlbum.tracks);
                      setPreviewAlbum(null);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Play All</span>
                  </button>
                  <button
                    onClick={() => {
                      previewAlbum.tracks.forEach(t => onAddToQueue(t));
                      setPreviewAlbum(null);
                    }}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs transition-all"
                    title="Add all tracks to queue"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPreviewAlbum(null)}
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all text-xs"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Tracklist table */}
              <div className="flex-1 overflow-y-auto p-4 space-y-1.5 no-scrollbar">
                {previewAlbum.tracks.map((track, idx) => {
                  const isCurrent = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      onClick={() => onPlayTrack(track)}
                      className={`group flex items-center justify-between p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        isCurrent
                          ? "bg-primary/20 border-primary/40 shadow-sm shadow-primary/20"
                          : "bg-white/[0.02] hover:bg-white/[0.07] border-white/5 hover:border-white/15"
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <span
                          className={`text-xs font-mono w-6 text-center shrink-0 ${
                            isCurrent ? "text-primary font-bold" : "text-neutral-500 group-hover:text-white"
                          }`}
                        >
                          {isCurrent && isPlaying ? "▶" : String(track.trackNumber || idx + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold truncate ${isCurrent ? "text-primary" : "text-white"}`}>
                            {track.title}
                          </p>
                          <p className="text-[10px] text-neutral-400 truncate">
                            {track.artist}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 shrink-0">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 text-neutral-400 border border-white/5">
                          {track.format}
                        </span>
                        <span className="text-xs font-mono text-neutral-400 w-10 text-right">
                          {Math.floor(track.duration / 60)}:
                          {String(Math.floor(track.duration % 60)).padStart(2, "0")}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToQueue(track);
                          }}
                          className="p-1 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Add to queue"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});
