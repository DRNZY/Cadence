export type LyricsProviderPref = "lrclib";

export interface LyricsPref {
  provider: LyricsProviderPref;
}

export function getLyricsPref(): LyricsPref {
  return { provider: "lrclib" };
}

export function isValidLyricsProvider(p: string): p is LyricsProviderPref {
  return p === "lrclib";
}