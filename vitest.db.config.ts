// Тести з реальною PostgreSQL: `npm run test:db` з TEST_DATABASE_URL на локальну тестову базу (міграції накочуються, дані тестів унікальні).
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["server/**/*.db.test.ts"],
    globalSetup: ["server/__tests__/db/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      SESSION_SECRET: "db-test-session-secret-0123456789",
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      UPLOADS_DIR: join(tmpdir(), "priceoptima-db-test-uploads")
    }
  }
});
