import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Allow any host so a tunnel (ngrok, etc.) URL works without editing this
    // file each time it changes. Fine for local/dev sharing.
    allowedHosts: true,
    // Proxy the backend through this same dev server so everything is served
    // from ONE origin. That means a single tunnel exposes the whole game, with
    // no CORS setup and no second public port. The backend stays on localhost.
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/ws": { target: "http://localhost:8000", ws: true, changeOrigin: true },
    },
  },
});
