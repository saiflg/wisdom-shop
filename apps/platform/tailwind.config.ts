import type { Config } from "tailwindcss";

/**
 * Deliberately a colder, more utilitarian palette than the school portal's
 * brand gradient: an operator should be able to tell at a glance that they
 * are in the platform console and not inside a school's own tenant.
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        platform: {
          50: "#f4f6f8",
          100: "#e5e9ee",
          200: "#cbd4dd",
          300: "#a3b2c2",
          400: "#7389a1",
          500: "#546c86",
          600: "#41566d",
          700: "#364759",
          800: "#2f3d4c",
          900: "#2a3541",
        },
      },
    },
  },
  plugins: [],
};

export default config;
