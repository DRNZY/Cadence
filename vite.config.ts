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
    proxy: {
      "/api": `http://localhost:${process.env.CADENCE_PORT || 3001}`,
      "/stream": `http://localhost:${process.env.CADENCE_PORT || 3001}`,
      "/covers": `http://localhost:${process.env.CADENCE_PORT || 3001}`,
    },
    watch: {
      ignored: ["**/release/**", "**/dist/**", "**/dist-electron/**", "**/.git/**"],
    },
  },
  build: {
    outDir: "dist",
    target: "chrome130"
  },
});
