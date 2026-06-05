import type { Config } from "tailwindcss";

/**
 * Praxarch design tokens.
 *
 * Philosophy: strictly monochromatic base. Color is a *signal*, not decoration —
 * it is reserved for agent/HITL/deploy state indicators only.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Monochromatic surfaces (mapped to CSS vars so light/dark share component code)
        surface: {
          base: "rgb(var(--surface-base) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
          overlay: "rgb(var(--surface-overlay) / <alpha-value>)",
        },
        border: {
          subtle: "rgb(var(--border-subtle) / <alpha-value>)",
          strong: "rgb(var(--border-strong) / <alpha-value>)",
        },
        content: {
          primary: "rgb(var(--content-primary) / <alpha-value>)",
          secondary: "rgb(var(--content-secondary) / <alpha-value>)",
          muted: "rgb(var(--content-muted) / <alpha-value>)",
        },
        // Status accents — the ONLY chromatic colors in the system.
        status: {
          active: "rgb(34 197 94 / <alpha-value>)", // green — autonomous agent running
          pending: "rgb(245 158 11 / <alpha-value>)", // amber — HITL checkpoint pause
          error: "rgb(239 68 68 / <alpha-value>)", // red — failed / aborted
          info: "rgb(59 130 246 / <alpha-value>)", // blue — deploying / informational
          idle: "rgb(113 113 122 / <alpha-value>)", // gray — paused / idle
        },
      },
      borderRadius: {
        // Tight, consistent radii (Linear/Dub harmony)
        lg: "0.625rem",
        xl: "0.875rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(245 158 11 / 0.45)" },
          "70%": { boxShadow: "0 0 0 6px rgb(245 158 11 / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(245 158 11 / 0)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
