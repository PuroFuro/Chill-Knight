/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light, hand-drawn "doodle" palette (see reference-design/).
        paper: "#f3f3f4", // page background
        panel: "#ffffff", // cards / pop-outs
        ink: "#111111", // primary text + line art
        line: "#222222", // borders / strokes
        muted: "#6b7280", // secondary text
        // Status colors — chosen to read clearly on the white background.
        hp: "#4ade80", // health bar (green)
        exp: "#22d3ee", // exp bar (cyan)
        gold: "#d97706", // gold amount (amber)
        danger: "#dc2626",
        fire: "#f97316", // roundhead fireball tint
      },
      fontFamily: {
        // Title wordmark: KyivType Serif (loaded in index.html).
        display: ['"KyivType Serif"', "Georgia", "serif"],
        // Everything else: a clean typewriter mono.
        mono: ['"Cutive Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ['"Cutive Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
