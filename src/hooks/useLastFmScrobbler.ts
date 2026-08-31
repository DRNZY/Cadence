import { useEffect, useRef, useState, useCallback } from "react";
import type { Track } from "../types";

export interface LastFmStatus {
  enabled: boolean;
  username: string | null;
  hasSession: boolean;
  apiKey?: string;
  isScrobbling?: boolean;
}

export function useLastFmScrobbler(
  currentTrack: Track | null,
  isPlaying: boolean,
  currentTime: number,
  duration: number
) {
  const [status, setStatus] = useState<LastFmStatus>({
    enabled: false,
    username: null,
    hasSession: false
  });
  const [isLoved, setIsLoved] = useState<boolean>(false);

  const currentTrackRef = useRef<Track | null>(null);
  const trackStartTimeRef = useRef<number>(0);
  const hasScrobbledRef = useRef<boolean>(false);
  const nowPlayingTimerRef = useRef<any>(null);

  // Fetch status on mount
  const refreshStatus = useCallback(() => {
    fetch("/api/lastfm/config")
      .then(res => res.json())
      .then(data => {
        setStatus({
          enabled: Boolean(data.enabled),
          username: data.username || null,
          hasSession: Boolean(data.hasSession),
          apiKey: data.apiKey
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Handle Track Change & Now Playing
  useEffect(() => {
    if (!status.enabled || !status.hasSession || !currentTrack) {
      if (nowPlayingTimerRef.current) clearTimeout(nowPlayingTimerRef.current);
      return;
    }

    // New track loaded
    if (currentTrackRef.current?.id !== currentTrack.id) {
      currentTrackRef.current = currentTrack;
      hasScrobbledRef.current = false;
      trackStartTimeRef.current = Math.floor(Date.now() / 1000);
      setIsLoved(false);

      if (nowPlayingTimerRef.current) clearTimeout(nowPlayingTimerRef.current);

      if (isPlaying) {
        // Wait 4 seconds before sending Now Playing to prevent rapid skipping notifications
        nowPlayingTimerRef.current = setTimeout(() => {
          fetch("/api/lastfm/now-playing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              artist: currentTrack.artist,
              track: currentTrack.title,
              album: currentTrack.album,
              duration: currentTrack.duration
            })
          }).catch(err => console.warn("[Last.fm] Now playing error:", err));
        }, 4000);
      }
    }

    return () => {
      if (nowPlayingTimerRef.current) clearTimeout(nowPlayingTimerRef.current);
    };
  }, [currentTrack, isPlaying, status.enabled, status.hasSession]);

  // Handle Scrobble Threshold Check
  useEffect(() => {
    if (
      !status.enabled ||
      !status.hasSession ||
      !currentTrack ||
      !isPlaying ||
      hasScrobbledRef.current
    ) {
      return;
    }

    const dur = duration || currentTrack.duration || 0;
    // Standard Last.fm criteria: Minimum 30s track length, played 50% or 4 minutes (240s)
    if (dur < 30) return;

    const threshold = Math.min(dur * 0.5, 240);

    if (currentTime >= threshold && currentTime > 0) {
      hasScrobbledRef.current = true;
      const ts = trackStartTimeRef.current || Math.floor(Date.now() / 1000);

      fetch("/api/lastfm/scrobble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist: currentTrack.artist,
          track: currentTrack.title,
          album: currentTrack.album,
          duration: Math.round(dur),
          timestamp: ts
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            console.log(`[Last.fm] Successfully scrobbled: ${currentTrack.artist} — ${currentTrack.title}`);
          }
        })
        .catch(err => console.warn("[Last.fm] Scrobble error:", err));
    }
  }, [currentTime, duration, currentTrack, isPlaying, status.enabled, status.hasSession]);

  // Toggle Love / Favorite on Last.fm
  const toggleLove = useCallback(async (track: Track, loved: boolean) => {
    if (!status.hasSession) return false;

    try {
      const res = await fetch("/api/lastfm/love", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist: track.artist,
          track: track.title,
          loved
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsLoved(loved);
        return true;
      }
    } catch (err) {
      console.warn("[Last.fm] Love toggle error:", err);
    }
    return false;
  }, [status.hasSession]);

  return {
    status,
    isLoved,
    refreshStatus,
    toggleLove
  };
}
