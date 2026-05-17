/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        knight: {
          bg: "#0f1117",
          panel: "#1a1d27",
          panel2: "#232735",
          accent: "#6ee7b7",
          accent2: "#38bdf8",
          gold: "#fbbf24",
          danger: "#f87171",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
