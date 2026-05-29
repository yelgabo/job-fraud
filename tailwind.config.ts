import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        band: {
          high: "#dc2626",
          medium: "#d97706",
          low: "#16a34a",
          unknown: "#6b7280",
        },
      },
    },
  },
  plugins: [],
}

export default config
