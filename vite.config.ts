import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url))
    }
  },
  server: {
    port: 5173
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 4000
  },
  test: {
    environment: "jsdom",
    include: ["shared/**/*.test.ts", "src/**/*.test.{ts,tsx}"]
  }
});
