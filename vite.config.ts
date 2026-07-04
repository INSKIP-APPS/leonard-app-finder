import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Config Vite standard (remplace @lovable.dev/vite-tanstack-config).
// App client-side (SPA) avec TanStack Router, React 19 et Tailwind CSS v4.
export default defineConfig({
  plugins: [
    // Le plugin router doit précéder react : il génère src/routeTree.gen.ts.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  // Résolution native des paths tsconfig (@/* → src/*), remplace vite-tsconfig-paths.
  resolve: { tsconfigPaths: true },
  server: {
    port: 5174,
    host: true,
  },
});
