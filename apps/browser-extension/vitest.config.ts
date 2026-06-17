import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@gal/core": resolve(__dirname, "./vendor/gal-shared/packages/core/src/index.ts"),
      "@gal/types": resolve(__dirname, "./vendor/gal-shared/packages/types/src/index.ts"),
      "@gal/telemetry": resolve(__dirname, "./vendor/gal-shared/packages/telemetry/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
  },
});
