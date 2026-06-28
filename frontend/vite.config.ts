import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The game is fully client-side (no backend). Two build choices make the output
// "just open index.html" friendly:
//
//  1. `base: "./"` — the built index.html references its JS/CSS/assets with
//     RELATIVE paths, so the bundle works in any folder or embedded in a site.
//  2. A classic (non-module) script — browsers BLOCK `<script type="module">`
//     when a page is opened directly from disk (the file:// protocol), which
//     shows up as a blank white screen on a double-click. Emitting one classic
//     IIFE script instead lets index.html run both from a web server AND from a
//     plain double-clicked file. (Assets like images/sounds load fine either
//     way.)

// Rewrite the auto-injected entry tag into a classic, DEFERRED script. `defer`
// matters: a module script is implicitly deferred (runs after the DOM is
// parsed), but a plain classic script in <head> runs immediately — before
// <div id="root"> exists — which would crash on startup. `defer` restores the
// run-after-parse behavior. We also drop `crossorigin`, which trips up file://.
function classicEntry(): Plugin {
  return {
    name: "classic-entry",
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin /g, "<script defer ")
        .replace(/<script type="module" /g, "<script defer ")
        .replace(/(<link rel="stylesheet") crossorigin /g, "$1 ");
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), classicEntry()],
  build: {
    target: "es2018",
    // Single self-contained JS bundle (no module/code-splitting) so it can be a
    // plain classic script that runs from file://.
    rollupOptions: {
      output: {
        format: "iife",
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
  },
});
