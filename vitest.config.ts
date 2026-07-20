import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Config de test isolée de vite.config.ts : on ne charge pas les plugins UI
// (router/react/tailwind) inutiles aux tests de logique pure.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
