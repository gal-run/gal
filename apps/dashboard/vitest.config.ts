import { defineConfig } from 'vitest/config'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@gal/api/client': resolve(__dirname, './src/ee/vendored-gal-api/client/index.ts'),
      '@gal/enforce-rules': resolve(__dirname, './src/vendored-gal/enforce-rules/index.ts'),
      '@gal/core': resolve(__dirname, './src/vendored-gal/core/index.ts'),
      '@gal/swarm': resolve(__dirname, './src/vendored-gal/swarm/index.ts'),
      '@gal/telemetry': resolve(__dirname, './src/lib/gal-telemetry-browser.ts'),
      '@gal/types': resolve(__dirname, './src/vendored-gal/types/index.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
