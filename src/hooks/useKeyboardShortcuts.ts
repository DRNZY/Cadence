import { useEffect } from "react";

export interface KeyboardShortcutsHandlers {
  onTogglePlayPause: () => void;
  onSeekRelative: (seconds: number) => void;
  onAdjustVolume: (delta: number) => void;
  onToggleMute: () => void;
  onToggleLyrics: () => void;
  onToggleQueue: () => void;
  onToggleFullscreen?: () => void;
  onCloseModals?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onTogglePlayPause,
  onSeekRelative,
  onAdjustVolume,
  onToggleMute,
  onToggleLyrics,
  onToggleQueue,
  onToggleFullscreen,
  onCloseModals,
  enabled = true,
}: KeyboardShortcutsHandlers) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        if (e.key === "Escape" && onCloseModals) {
          target.blur();
          onCloseModals();
        }
        return;
      }

      switch (e.code) {
        case "Space": {
          e.preventDefault();
          onTogglePlayPause();
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const step = e.shiftKey ? -15 : -5;
          onSeekRelative(step);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const step = e.shiftKey ? 15 : 5;
          onSeekRelative(step);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          onAdjustVolume(0.05);
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          onAdjustVolume(-0.05);
          break;
        }
        case "KeyM": {
          e.preventDefault();
          onToggleMute();
          break;
        }
        case "KeyL": {
          e.preventDefault();
          onToggleLyrics();
          break;
        }
        case "KeyQ": {
          e.preventDefault();
          onToggleQueue();
          break;
        }
        case "KeyF": {
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onToggleFullscreen?.();
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          onCloseModals?.();
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enabled,
    onTogglePlayPause,
    onSeekRelative,
    onAdjustVolume,
    onToggleMute,
    onToggleLyrics,
    onToggleQueue,
    onToggleFullscreen,
    onCloseModals,
  ]);
}
