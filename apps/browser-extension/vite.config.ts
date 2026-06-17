import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@gal/core': resolve(__dirname, './vendor/gal-shared/packages/core/src/index.ts'),
      '@gal/types': resolve(__dirname, './vendor/gal-shared/packages/types/src/index.ts'),
      '@gal/telemetry': resolve(__dirname, './vendor/gal-shared/packages/telemetry/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't delete public/ assets
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        'auth-bridge': resolve(__dirname, 'src/content/auth-bridge.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background.js'
          }
          if (chunkInfo.name === 'auth-bridge') {
            return 'auth-bridge.js'
          }
          return 'assets/[name]-[hash].js'
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  // Ensure popup.html ends up at root of dist
  experimental: {
    renderBuiltUrl(filename, { hostType }) {
      if (hostType === 'html') {
        return filename
      }
      return { relative: true }
    },
  },
})
