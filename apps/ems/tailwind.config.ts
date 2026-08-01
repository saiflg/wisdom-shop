import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f6ff",
          100: "#e0e9ff",
          200: "#c2d3ff",
          300: "#94b1ff",
          400: "#5f85ff",
          500: "#3860ff",
          600: "#213eeb",
          700: "#1a2fbd",
          800: "#1a2c94",
          900: "#1b2a74",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #3860ff 0%, #7c3aed 50%, #db2777 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
