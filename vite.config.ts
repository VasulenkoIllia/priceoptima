import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// API сервера під час розробки (npm run dev:server)
const API_TARGET = process.env.API_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
      "/health": { target: API_TARGET, changeOrigin: false }
    }
  },
  build: {
    // сервер віддає зібраний застосунок із dist/client, сам сервер збирається в dist/server
    outDir: "dist/client",
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // бібліотеки — окремими файлами: між релізами вони не змінюються й лишаються в кеші браузера
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](ag-grid-community|ag-grid-react)[\\/]/.test(id)) return "vendor-grid";
          if (/[\\/]node_modules[\\/](antd|@ant-design|rc-[^\\/]+|@rc-component)[\\/]/.test(id)) return "vendor-antd";
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler|@tanstack|zustand|immer|dayjs)[\\/]/.test(id)) return "vendor-core";
          return undefined;
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    include: ["shared/**/*.test.ts", "src/**/*.test.{ts,tsx}", "server/**/*.test.ts"]
  }
});
