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
    proxy: {
      "/prod": {
        target: "https://cg5h2ba15i.execute-api.ap-south-1.amazonaws.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
