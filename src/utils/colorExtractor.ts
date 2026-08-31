export interface ExtractedColors {
  primary: string;
  glow: string;
  secondary: string;
  tertiary: string;
  bgGradient: string;
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
    id: "obsidian",
    name: "Obsidian OLED",
    accent: "#ffffff",
    startColor: "#050507",
    endColor: "#000000",
    angle: 180,
    bgGradient: "radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.04) 0%, transparent 60%), #050508"
  },
  {
    id: "graphite",
    name: "Space Titanium",
    accent: "#38bdf8",
    startColor: "#0f172a",
    endColor: "#020617",
    angle: 145,
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(56, 189, 248, 0.12) 0%, transparent 65%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(14, 165, 233, 0.08) 0%, transparent 70%), #07090e"
  },
  {
    id: "emerald",
    name: "Emerald Hi-Fi",
    accent: "#10b981",
    startColor: "#064e3b",
    endColor: "#022c22",
    angle: 135,
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(16, 185, 129, 0.14) 0%, transparent 65%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(5, 150, 105, 0.08) 0%, transparent 70%), #040807"
  },
  {
    id: "amber",
    name: "Amber Vinyl",
    accent: "#f59e0b",
    startColor: "#451a03",
    endColor: "#1c0d02",
    angle: 145,
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(245, 158, 11, 0.14) 0%, transparent 65%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(217, 119, 6, 0.08) 0%, transparent 70%), #0a0604"
  },
  {
    id: "nordic",
    name: "Nordic Slate",
    accent: "#94a3b8",
    startColor: "#1e293b",
    endColor: "#0f172a",
    angle: 160,
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(148, 163, 184, 0.12) 0%, transparent 65%), #090d14"
  },
  {
    id: "crimson",
    name: "Crimson Velvet",
    accent: "#f43f5e",
    startColor: "#4c0519",
    endColor: "#1f020a",
    angle: 140,
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(244, 63, 94, 0.14) 0%, transparent 65%), #080305"
  }
];

export function buildCustomGradient(startColor: string, endColor: string, angle: number = 135, accentColor: string = "#ffffff"): ExtractedColors {
  return {
    primary: accentColor,
    glow: `${accentColor}40`,
    secondary: `${startColor}30`,
    tertiary: `${endColor}20`,
    bgGradient: `radial-gradient(ellipse 85% 65% at 20% 0%, ${startColor}33 0%, transparent 65%),
                 radial-gradient(ellipse 75% 55% at 80% 100%, ${endColor}26 0%, transparent 70%),
                 #05060a`
  };
}

// Extract dominant & accent colors from an image using off-screen canvas
export function extractColors(imgSrc: string): Promise<ExtractedColors> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imgSrc;

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(getDefaultColors());
          return;
        }

        const size = 64;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imgData = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0;
        let vibrantR = 0, vibrantG = 0, vibrantB = 0;
        let secondaryR = 0, secondaryG = 0, secondaryB = 0;
        let maxSaturation = -1;
        let secondSaturation = -1;
        let count = 0;

        for (let i = 0; i < imgData.length; i += 16) {
          const pr = imgData[i];
          const pg = imgData[i + 1];
          const pb = imgData[i + 2];

          // Skip extremely dark or pure white pixels
          const brightness = (pr * 299 + pg * 587 + pb * 114) / 1000;
          if (brightness < 25 || brightness > 235) continue;

          r += pr;
          g += pg;
          b += pb;
          count++;

          // Find vibrant accent & secondary
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          const saturation = max === 0 ? 0 : (max - min) / max;

          if (saturation > maxSaturation && brightness > 40 && brightness < 210) {
            secondSaturation = maxSaturation;
            secondaryR = vibrantR;
            secondaryG = vibrantG;
            secondaryB = vibrantB;

            maxSaturation = saturation;
            vibrantR = pr;
            vibrantG = pg;
            vibrantB = pb;
          } else if (saturation > secondSaturation && brightness > 30 && brightness < 220) {
            secondaryR = pr;
            secondaryG = pg;
            secondaryB = pb;
          }
        }

        if (count === 0) {
          resolve(getDefaultColors());
          return;
        }

        const avgR = Math.round(r / count);
        const avgG = Math.round(g / count);
        const avgB = Math.round(b / count);

        const pR = vibrantR > 0 ? vibrantR : avgR;
        const pG = vibrantG > 0 ? vibrantG : avgG;
        const pB = vibrantB > 0 ? vibrantB : avgB;

        const sR = secondaryR > 0 ? secondaryR : Math.round((avgR + 40) % 255);
        const sG = secondaryG > 0 ? secondaryG : Math.round((avgG + 30) % 255);
        const sB = secondaryB > 0 ? secondaryB : Math.round((avgB + 60) % 255);

        const primary = `rgb(${pR}, ${pG}, ${pB})`;
        const glow = `rgba(${pR}, ${pG}, ${pB}, 0.35)`;
        const secondary = `rgb(${sR}, ${sG}, ${sB})`;
        const tertiary = `rgb(${Math.round(pR * 0.2)}, ${Math.round(pG * 0.2)}, ${Math.round(pB * 0.2)})`;

        const bgGradient = `radial-gradient(ellipse 80% 60% at 20% 0%, rgba(${pR}, ${pG}, ${pB}, 0.18) 0%, transparent 65%),
                            radial-gradient(ellipse 70% 50% at 80% 100%, rgba(${sR}, ${sG}, ${sB}, 0.14) 0%, transparent 70%),
                            #06070b`;

        resolve({ primary, glow, secondary, tertiary, bgGradient });
      } catch (err) {
        resolve(getDefaultColors());
      }
    };

    img.onerror = () => {
      resolve(getDefaultColors());
    };
  });
}

export function getDefaultColors(): ExtractedColors {
  return {
    primary: "#ffffff",
    glow: "rgba(255, 255, 255, 0.25)",
    secondary: "rgba(56, 189, 248, 0.15)",
    tertiary: "rgba(15, 23, 42, 0.6)",
    bgGradient: "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(255, 255, 255, 0.05) 0%, transparent 65%), #06070b"
  };
}

export function applyThemeColors(colors: ExtractedColors) {
  document.documentElement.style.setProperty("--primary", colors.primary);
  document.documentElement.style.setProperty("--primary-glow", colors.glow);
  document.documentElement.style.setProperty("--secondary-glow", colors.secondary);
  document.documentElement.style.setProperty("--theme-tertiary", colors.tertiary);
  document.documentElement.style.setProperty("--theme-bg-gradient", colors.bgGradient);
}
