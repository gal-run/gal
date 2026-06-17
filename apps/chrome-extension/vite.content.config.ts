import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@gal/core': resolve(__dirname, './vendor/core/index.ts'),
      '@gal/types': resolve(__dirname, './vendor/types/index.ts'),
      '@gal/telemetry': resolve(__dirname, './vendor/telemetry/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/content.tsx'),
      },
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: '[name].js',
      },
    },
  },
})
