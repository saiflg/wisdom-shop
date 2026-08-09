import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Every shade reads a CSS custom property instead of a literal, so a
      // school's own colour reaches all 160-odd existing `bg-brand-600` /
      // `text-brand-500` usages without one of them being edited. The
      // defaults live in globals.css; a branded school overrides them with
      // one <style> block in the layout (see lib/branding.ts).
      //
      // Space-separated "R G B", not `#rrggbb`: that is the only form the
      // `rgb(... / <alpha-value>)` syntax can take an alpha from, and
      // without it every `bg-brand-600/40` in the app would silently stop
      // being translucent.
      colors: {
        brand: {
          50: "rgb(var(--brand-50) / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          900: "rgb(var(--brand-900) / <alpha-value>)",
        },
        /** Text that sits on top of a brand-coloured surface. */
        "on-brand": "rgb(var(--on-brand) / <alpha-value>)",
      },
      backgroundImage: {
        "brand-gradient": "var(--brand-gradient)",
      },
    },
  },
  plugins: [],
};

export default config;
