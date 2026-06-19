import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@gal/core": resolve(__dirname, "./vendor/core/index.ts"),
      "@gal/types": resolve(__dirname, "./vendor/types/index.ts"),
      "@gal/telemetry": resolve(__dirname, "./vendor/telemetry/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
  },
});
