export interface ExtractedColors {
  primary: string;
  glow: string;
  secondary: string;
  tertiary: string;
  bgGradient: string;
  ambient1: string;
  ambient2: string;
  ambient3: string;
}

export interface PresetTheme {
  id: string;
  name: string;
  accent: string;
  startColor: string;
  endColor: string;
  angle: number;
  bgGradient: string;
}

export const THEME_PRESETS: PresetTheme[] = [
  {
    id: "tokyo-night",
    name: "Tokyo Night Storm",
    accent: "#7aa2f7",
    startColor: "#1f2335",
    endColor: "#13141c",
    angle: 145,
    bgGradient: "radial-gradient(ellipse 85% 65% at 20% 0%, rgba(122, 162, 247, 0.15) 0%, transparent 65%), radial-gradient(ellipse 70% 55% at 80% 100%, rgba(187, 154, 247, 0.09) 0%, transparent 70%), #0c0d14"
  },
  {
    id: "tokyo-moon",
    name: "Tokyo Night Moon",
    accent: "#82aaff",
    startColor: "#222436",
    endColor: "#161622",
    angle: 150,
    bgGradient: "radial-gradient(ellipse 85% 65% at 20% 0%, rgba(130, 170, 255, 0.14) 0%, transparent 65%), radial-gradient(ellipse 70% 55% at 80% 100%, rgba(192, 153, 255, 0.08) 0%, transparent 70%), #0e0f17"
  },
  {
    id: "obsidian",
    name: "Obsidian OLED",
    accent: "#e2e8f0",
    startColor: "#050507",
    endColor: "#000000",
    angle: 180,
    bgGradient: "radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.03) 0%, transparent 60%), #000000"
  },
  {
    id: "graphite",
    name: "Slate Studio",
    accent: "#38bdf8",
    startColor: "#0f172a",
    endColor: "#020617",
    angle: 145,
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(56, 189, 248, 0.12) 0%, transparent 65%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(14, 165, 233, 0.08) 0%, transparent 70%), #07090e"
  },
  {
    id: "amber",
    name: "Cyberpunk Amber",
    accent: "#f59e0b",
    startColor: "#3b1d07",
    endColor: "#120701",
    angle: 145,
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(245, 158, 11, 0.14) 0%, transparent 65%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(217, 119, 6, 0.08) 0%, transparent 70%), #080402"
  },
  {
    id: "emerald",
    name: "Emerald Analog",
    accent: "#10b981",
    startColor: "#064e3b",
    endColor: "#022c22",
    angle: 135,
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(16, 185, 129, 0.14) 0%, transparent 65%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(5, 150, 105, 0.08) 0%, transparent 70%), #040807"
  },
  {
    id: "nordic",
    name: "Nordic Frost",
    accent: "#88c0d0",
    startColor: "#2e3440",
    endColor: "#1d212a",
    angle: 160,
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(136, 192, 208, 0.14) 0%, transparent 65%), #0c0e13"
  },
  {
    id: "crimson",
    name: "Velvet Rose",
    accent: "#f43f5e",
    startColor: "#4c0519",
    endColor: "#1f020a",
    angle: 140,
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(244, 63, 94, 0.14) 0%, transparent 65%), #080305"
  },
  {
    id: "synthwave",
    name: "Sunset Synth",
    accent: "#c084fc",
    startColor: "#2e1065",
    endColor: "#0c0317",
    angle: 145,
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(192, 132, 252, 0.16) 0%, transparent 65%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(236, 72, 153, 0.10) 0%, transparent 70%), #07020d"
  }
];

export function buildCustomGradient(startColor: string, endColor: string, _angle: number = 135, accentColor: string = "#ffffff"): ExtractedColors {
  return {
    primary: accentColor,
    glow: `${accentColor}60`,
    secondary: startColor,
    tertiary: endColor,
    ambient1: `${accentColor}70`,
    ambient2: `${startColor}60`,
    ambient3: `${endColor}45`,
    bgGradient: `radial-gradient(ellipse 90% 70% at 20% 0%, ${startColor}44 0%, transparent 65%),
                 radial-gradient(ellipse 80% 60% at 80% 100%, ${endColor}36 0%, transparent 70%),
                 radial-gradient(ellipse 70% 50% at 50% 50%, ${accentColor}22 0%, transparent 70%),
                 #000000`
  };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [Math.round(h * 360), s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (h % 360 + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c; g = x;
  } else if (h < 120) {
    r = x; g = c;
  } else if (h < 180) {
    g = c; b = x;
  } else if (h < 240) {
    g = x; b = c;
  } else if (h < 300) {
    r = x; b = c;
  } else {
    r = c; b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

interface ColorBucket {
  hue: number;
  count: number;
  totalSat: number;
  totalLight: number;
  r: number;
  g: number;
  b: number;
  score: number;
}

/**
 * Results by image URL.
 *
 * Every track on an album shares one cover URL, and skipping tracks walks
 * straight back through the same ones, so without this the same JPEG was
 * decoded and re-scanned on every single track change.
 */
const colorCache = new Map<string, ExtractedColors>();

/** In-flight extractions, so concurrent calls for one URL share one decode. */
const colorInFlight = new Map<string, Promise<ExtractedColors>>();

/** Bound on the cache. Artwork URLs are stable per album, so this holds a whole library. */
const COLOR_CACHE_LIMIT = 512;

/** Reused across calls; resizing it per call allocated a canvas every track. */
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

/** Store an extraction, evicting the oldest entry once the limit is reached. */
function remember(imgSrc: string, colors: ExtractedColors): ExtractedColors {
  if (colorCache.size >= COLOR_CACHE_LIMIT) {
    const oldest = colorCache.keys().next();
    if (!oldest.done) colorCache.delete(oldest.value);
  }
  colorCache.set(imgSrc, colors);
  return colors;
}

// Extract dominant top 2-3 saturated colors directly from cover art with high dynamic range
export function extractColors(imgSrc: string): Promise<ExtractedColors> {
  const cached = colorCache.get(imgSrc);
  if (cached) return Promise.resolve(cached);

  const pending = colorInFlight.get(imgSrc);
  if (pending) return pending;

  const work = runColorExtraction(imgSrc).finally(() => {
    colorInFlight.delete(imgSrc);
  });
  colorInFlight.set(imgSrc, work);
  return work;
}

function runColorExtraction(imgSrc: string): Promise<ExtractedColors> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imgSrc;

    img.onload = async () => {
      let bitmap: ImageBitmap | null = null;
      try {
     const size = 64;
        try {
          bitmap = await createImageBitmap(img, { resizeWidth: size, resizeHeight: size, resizeQuality: "high" });
        } catch {
          bitmap = null;
        }

        if (!scratchCanvas) scratchCanvas = document.createElement("canvas");
     if (!scratchCtx) {
          scratchCtx = scratchCanvas.getContext("2d", { willReadFrequently: true });
        }
        const canvas = scratchCanvas;
        const ctx = scratchCtx;
        if (!ctx) {
          img.removeAttribute("src");
          resolve(getDefaultColors());
          return;
        }

        canvas.width = size;
        canvas.height = size;
        if (bitmap) {
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
      bitmap = null;
        } else {
          ctx.drawImage(img, 0, 0, size, size);
        }

        const imgData = ctx.getImageData(0, 0, size, size).data;
        const NUM_BINS = 16;
        const binStep = 360 / NUM_BINS;
        const bins: ColorBucket[] = Array.from({ length: NUM_BINS }, (_, idx) => ({
          hue: Math.round(idx * binStep),
          count: 0,
          totalSat: 0,
          totalLight: 0,
          r: 0,
          g: 0,
          b: 0,
          score: 0
        }));

        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let sampledCount = 0;

        for (let i = 0; i < imgData.length; i += 16) {
          const pr = imgData[i];
          const pg = imgData[i + 1];
          const pb = imgData[i + 2];

          totalR += pr;
          totalG += pg;
          totalB += pb;
          sampledCount++;

          const [h, s, l] = rgbToHsl(pr, pg, pb);

          // Discard pure blacks/whites or flat neutral grays
          if (l < 0.10 || l > 0.92 || s < 0.16) continue;

          const binIdx = Math.floor((h % 360) / binStep) % NUM_BINS;
          const bucket = bins[binIdx];
          bucket.count++;
          bucket.totalSat += s;
          bucket.totalLight += l;
          bucket.r += pr;
          bucket.g += pg;
          bucket.b += pb;
        }

        // Score bins with high saturation weighting and optimal lightness curve
        bins.forEach(bin => {
          if (bin.count > 0) {
            const avgSat = bin.totalSat / bin.count;
            const avgLight = bin.totalLight / bin.count;
            // Heavily reward saturation and center lightness (0.45 - 0.65)
            const lightnessPenalty = 1 - Math.abs(avgLight - 0.52) * 1.5;
            bin.score = bin.count * Math.pow(avgSat, 1.8) * Math.max(0.1, lightnessPenalty);
          }
        });

        // Sort descending by score
        const sortedBins = [...bins].filter(b => b.count > 0).sort((a, b) => b.score - a.score);

        // Select up to 3 distinct colors with angular hue separation >= 35 deg
        const selectedRGB: [number, number, number][] = [];

        for (const bucket of sortedBins) {
          const avgR = Math.round(bucket.r / bucket.count);
          const avgG = Math.round(bucket.g / bucket.count);
          const avgB = Math.round(bucket.b / bucket.count);

          const isDistinct = selectedRGB.every(existing => {
            const [exH] = rgbToHsl(existing[0], existing[1], existing[2]);
            const diff = Math.min(Math.abs(exH - bucket.hue), 360 - Math.abs(exH - bucket.hue));
            return diff >= 35;
          });

          if (isDistinct) {
            // Intensify dynamic range: boost saturation & ensure vividness
            const [h, s, l] = rgbToHsl(avgR, avgG, avgB);
            const boostedSat = Math.min(1, Math.max(s * 1.25, 0.70));
            const tunedLight = Math.min(0.68, Math.max(0.46, l));
            selectedRGB.push(hslToRgb(h, boostedSat, tunedLight));
          }

          if (selectedRGB.length >= 3) break;
        }

        // Fallbacks if image is largely monochrome, dark, or has fewer than 3 hues
        if (selectedRGB.length === 0) {
          if (sampledCount > 0) {
            const avgR = Math.round(totalR / sampledCount);
            const avgG = Math.round(totalG / sampledCount);
            const avgB = Math.round(totalB / sampledCount);
            const [h, s] = rgbToHsl(avgR, avgG, avgB);
            const baseH = s < 0.1 ? 210 : h; // fallback cyan/sky hue
            selectedRGB.push(hslToRgb(baseH, 0.85, 0.55));
            selectedRGB.push(hslToRgb((baseH + 45) % 360, 0.80, 0.50));
            selectedRGB.push(hslToRgb((baseH + 180) % 360, 0.75, 0.48));
          } else {
remember(imgSrc, getDefaultColors());
            return;
          }
        } else if (selectedRGB.length === 1) {
          const [h] = rgbToHsl(selectedRGB[0][0], selectedRGB[0][1], selectedRGB[0][2]);
          selectedRGB.push(hslToRgb((h + 40) % 360, 0.82, 0.52));
          selectedRGB.push(hslToRgb((h + 175) % 360, 0.78, 0.48));
        } else if (selectedRGB.length === 2) {
          const [h1] = rgbToHsl(selectedRGB[0][0], selectedRGB[0][1], selectedRGB[0][2]);
          const [h2] = rgbToHsl(selectedRGB[1][0], selectedRGB[1][1], selectedRGB[1][2]);
          const midH = ((h1 + h2) / 2 + 180) % 360;
          selectedRGB.push(hslToRgb(midH, 0.78, 0.50));
        }

        const [c1, c2, c3] = selectedRGB;
        const primary = `rgb(${c1[0]}, ${c1[1]}, ${c1[2]})`;
        const glow = `rgba(${c1[0]}, ${c1[1]}, ${c1[2]}, 0.65)`;
        const secondary = `rgb(${c2[0]}, ${c2[1]}, ${c2[2]})`;
        const tertiary = `rgb(${c3[0]}, ${c3[1]}, ${c3[2]})`;

        const ambient1 = `rgba(${c1[0]}, ${c1[1]}, ${c1[2]}, 0.65)`;
        const ambient2 = `rgba(${c2[0]}, ${c2[1]}, ${c2[2]}, 0.55)`;
        const ambient3 = `rgba(${c3[0]}, ${c3[1]}, ${c3[2]}, 0.45)`;

        // Rich multi-stop ambient backdrop with pure OLED black base (#000000)
        const bgGradient = `radial-gradient(ellipse 90% 70% at 15% 10%, rgba(${c1[0]}, ${c1[1]}, ${c1[2]}, 0.26) 0%, transparent 65%),
                            radial-gradient(ellipse 80% 65% at 85% 90%, rgba(${c2[0]}, ${c2[1]}, ${c2[2]}, 0.22) 0%, transparent 65%),
                            radial-gradient(ellipse 70% 50% at 50% 50%, rgba(${c3[0]}, ${c3[1]}, ${c3[2]}, 0.15) 0%, transparent 70%),
                            #000000`;

        img.removeAttribute("src");
        remember(imgSrc, {
          primary,
          glow,
          secondary,
          tertiary,
          ambient1,
          ambient2,
          ambient3,
          bgGradient
        });
      } catch (err) {
        if (bitmap) {
          bitmap.close();
          bitmap = null;
        }
        img.removeAttribute("src");
        resolve(getDefaultColors());
      }
    };

    img.onerror = () => {
      img.removeAttribute("src");
      resolve(getDefaultColors());
    };
  });
}

export function getDefaultColors(): ExtractedColors {
  return {
    primary: "#ffffff",
    glow: "rgba(255, 255, 255, 0.40)",
    secondary: "rgb(56, 189, 248)",
    tertiary: "rgb(168, 85, 247)",
    ambient1: "rgba(255, 255, 255, 0.40)",
    ambient2: "rgba(56, 189, 248, 0.35)",
    ambient3: "rgba(168, 85, 247, 0.25)",
    bgGradient: "radial-gradient(ellipse 85% 65% at 20% 0%, rgba(56, 189, 248, 0.14) 0%, transparent 65%), radial-gradient(ellipse 75% 55% at 80% 100%, rgba(168, 85, 247, 0.10) 0%, transparent 70%), #000000"
  };
}

export function applyThemeColors(colors: ExtractedColors) {
  document.documentElement.style.setProperty("--primary", colors.primary);
  document.documentElement.style.setProperty("--primary-glow", colors.glow);
  document.documentElement.style.setProperty("--secondary-glow", colors.secondary);
  document.documentElement.style.setProperty("--theme-tertiary", colors.tertiary);
  document.documentElement.style.setProperty("--ambient-1", colors.ambient1);
  document.documentElement.style.setProperty("--ambient-2", colors.ambient2);
  document.documentElement.style.setProperty("--ambient-3", colors.ambient3);
  document.documentElement.style.setProperty("--theme-bg-gradient", colors.bgGradient);
}
