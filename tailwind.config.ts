import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./client/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./client/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./client/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#EEE", // Primary color
        secondary: "#F8F4F4", // Secondary color
        tertiary: "#F5F5F5", // Tertiary color
      },
      fontFamily: {
        sans: ["Overpass", "sans-serif"],
        mono: ["Overpass Mono", "monospace"],
        signika: ["Signika", "sans-serif"],
        manrope: ["Manrope", "sans-serif"],
      },
      boxShadow: {
        custom: "-3px 5px 14px -1px rgba(255, 153, 0, 0.3)",
      },
      fontSize: {
        xxs: "0.6rem",
        xs: "0.7rem",
        sm: "0.8rem",
        base: "1rem",
        xl: "1.25rem",
        "2xl": "1.563rem",
        "3xl": "1.953rem",
        "4xl": "2.441rem",
        "5xl": "3.052rem",
      },
    },
  },
  plugins: [],
};
export default config;
