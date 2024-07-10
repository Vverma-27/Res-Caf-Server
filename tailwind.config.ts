import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./client/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./client/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./client/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./client/constants/**/*.{js,ts,jsx,tsx,mdx}",
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
        inria: ["Inria Sans", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      },
      boxShadow: {
        custom: "-1px 1px 4px -1px rgb(255, 153, 0)",
      },
      backgroundColor: {
        random0: "#2EA0F1",
        random1: "#F12E2E",
        random2: "#2EF1AB",
        random3: "#F1D22E",
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
