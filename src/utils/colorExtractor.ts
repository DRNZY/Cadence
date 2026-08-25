// Extract dominant & accent colors from an image using off-screen canvas
export function extractColors(imgSrc: string): Promise<{ primary: string; glow: string; secondary: string }> {
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
        let maxSaturation = -1;
        let count = 0;

        for (let i = 0; i < imgData.length; i += 16) {
          const pr = imgData[i];
          const pg = imgData[i + 1];
          const pb = imgData[i + 2];

          // Skip very dark or pure white pixels
          const brightness = (pr * 299 + pg * 587 + pb * 114) / 1000;
          if (brightness < 25 || brightness > 235) continue;

          r += pr;
          g += pg;
          b += pb;
          count++;

          // Find vibrant accent
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          const saturation = max === 0 ? 0 : (max - min) / max;

          if (saturation > maxSaturation && brightness > 40 && brightness < 210) {
            maxSaturation = saturation;
            vibrantR = pr;
            vibrantG = pg;
            vibrantB = pb;
          }
        }

        if (count === 0) {
          resolve(getDefaultColors());
          return;
        }

        const avgR = Math.round(r / count);
        const avgG = Math.round(g / count);
        const avgB = Math.round(b / count);

        const primary = vibrantR > 0 ? `rgb(${vibrantR}, ${vibrantG}, ${vibrantB})` : `rgb(${avgR}, ${avgG}, ${avgB})`;
        const glow = vibrantR > 0 ? `rgba(${vibrantR}, ${vibrantG}, ${vibrantB}, 0.35)` : `rgba(${avgR}, ${avgG}, ${avgB}, 0.35)`;
        const secondary = `rgba(${avgR}, ${avgG}, ${avgB}, 0.25)`;

        resolve({ primary, glow, secondary });
      } catch (err) {
        resolve(getDefaultColors());
      }
    };

    img.onerror = () => {
      resolve(getDefaultColors());
    };
  });
}

function getDefaultColors() {
  return {
    primary: "#c084fc",
    glow: "rgba(192, 132, 252, 0.35)",
    secondary: "rgba(59, 130, 246, 0.25)"
  };
}

export function applyThemeColors(colors: { primary: string; glow: string; secondary: string }) {
  document.documentElement.style.setProperty("--primary", colors.primary);
  document.documentElement.style.setProperty("--primary-glow", colors.glow);
  document.documentElement.style.setProperty("--secondary-glow", colors.secondary);
}
