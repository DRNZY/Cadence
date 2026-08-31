import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/release/**", "**/dist/**", "**/dist-electron/**", "**/.git/**"],
    },
  },
  build: {
    outDir: "dist",
    target: "chrome130"
  },
});
