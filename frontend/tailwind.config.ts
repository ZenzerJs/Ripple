import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        raised: "var(--raised)",
        text: "var(--text)",
        muted: "var(--muted)",
        action: "var(--action)",
        "action-fg": "var(--action-fg)",
        comparison: "var(--comparison)",
        leak: "var(--leak)",
        "leak-tint": "var(--leak-tint)",
        ok: "var(--ok)",
        "ok-tint": "var(--ok-tint)",
        warn: "var(--warn)",
        "warn-tint": "var(--warn-tint)",
        "border-strong": "var(--border-strong)",
        "border-subtle": "var(--border-subtle)",
        ring: "var(--ring)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "16px",
      },
      maxWidth: {
        container: "1120px",
        prose: "70ch",
      },
    },
  },
  plugins: [],
};

export default config;
