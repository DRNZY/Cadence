export interface ExtractedColors {
  primary: string;
  glow: string;
  secondary: string;
  tertiary: string;
  bgGradient: string;
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
          if (brightness < 20 || brightness > 240) continue;

          r += pr;
          g += pg;
          b += pb;
          count++;

          // Find vibrant accent & secondary
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          const saturation = max === 0 ? 0 : (max - min) / max;

          if (saturation > maxSaturation && brightness > 40 && brightness < 215) {
            // Demote previous max to secondary
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

        const sR = secondaryR > 0 ? secondaryR : Math.round((avgR + 50) % 255);
        const sG = secondaryG > 0 ? secondaryG : Math.round((avgG + 30) % 255);
        const sB = secondaryB > 0 ? secondaryB : Math.round((avgB + 80) % 255);

        const primary = `rgb(${pR}, ${pG}, ${pB})`;
        const glow = `rgba(${pR}, ${pG}, ${pB}, 0.45)`;
        const secondary = `rgb(${sR}, ${sG}, ${sB})`;
        const tertiary = `rgb(${Math.round(pR * 0.25)}, ${Math.round(pG * 0.25)}, ${Math.round(pB * 0.25)})`;

        const bgGradient = `radial-gradient(ellipse 80% 60% at 15% -10%, rgba(${pR}, ${pG}, ${pB}, 0.22) 0%, transparent 70%),
                            radial-gradient(ellipse 70% 50% at 85% 110%, rgba(${sR}, ${sG}, ${sB}, 0.18) 0%, transparent 65%),
                            radial-gradient(ellipse 60% 40% at 50% 50%, rgba(${Math.round(avgR * 0.3)}, ${Math.round(avgG * 0.3)}, ${Math.round(avgB * 0.3)}, 0.15) 0%, transparent 80%),
                            #08090e`;

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

function getDefaultColors(): ExtractedColors {
  return {
    primary: "#c084fc",
    glow: "rgba(192, 132, 252, 0.4)",
    secondary: "rgba(59, 130, 246, 0.3)",
    tertiary: "rgba(18, 16, 38, 0.8)",
    bgGradient: `radial-gradient(ellipse 80% 60% at 15% -10%, rgba(192, 132, 252, 0.18) 0%, transparent 70%),
                 radial-gradient(ellipse 70% 50% at 85% 110%, rgba(59, 130, 246, 0.15) 0%, transparent 65%),
                 #08090e`
  };
}

export function applyThemeColors(colors: ExtractedColors) {
  document.documentElement.style.setProperty("--primary", colors.primary);
  document.documentElement.style.setProperty("--primary-glow", colors.glow);
  document.documentElement.style.setProperty("--secondary-glow", colors.secondary);
  document.documentElement.style.setProperty("--theme-tertiary", colors.tertiary);
  document.documentElement.style.setProperty("--theme-bg-gradient", colors.bgGradient);
}
