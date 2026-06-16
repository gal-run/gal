import { defineConfig } from 'vitest/config'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // The app tsconfig sets `jsx: "preserve"` (Next.js compiles JSX itself).
  // Under vitest 4 / rolldown-vite the oxc transform otherwise inherits that
  // setting and refuses to parse .tsx test files ("content contains invalid
  // JS syntax ... do not set jsx to preserve"). Pin the test-time transform to
  // the React automatic runtime so .ts/.tsx suites parse and run.
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'react',
    },
  },
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
