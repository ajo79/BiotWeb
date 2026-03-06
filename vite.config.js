import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".ts": "tsx",
        ".js": "jsx",
      },
    },
  },
  server: {
    port: 5173,
  },
});
