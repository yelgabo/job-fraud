import path from "node:path"
import { defineConfig } from "vitest/config"

// Mirrors tsconfig's "@/*" alias so component tests can import app modules; everything else
// stays on vitest defaults.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  esbuild: { jsx: "automatic" },
})
