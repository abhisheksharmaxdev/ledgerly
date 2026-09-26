import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.API_PORT ?? 4000);

export default defineConfig({
  root: "client",
  publicDir: "public",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: `http://localhost:${apiPort}`, changeOrigin: false },
    },
  },
  preview: { port: 4173 },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    sourcemap: false,
    // three.js (3D background) and Recharts are only reached through React.lazy imports,
    // so the bundler splits them into on-demand chunks automatically.
    chunkSizeWarningLimit: 700,
  },
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
} as Parameters<typeof defineConfig>[0]);
