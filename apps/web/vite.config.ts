import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5174),
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: false,
      },
      '/health': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replace(/\\/g, '/');
          if (!path.includes('/node_modules/')) return undefined;
          if (
            path.includes('/react/') ||
            path.includes('/react-dom/') ||
            path.includes('/react-router')
          ) {
            return 'vendor-react';
          }
          if (path.includes('/@tanstack/')) return 'vendor-query';
          if (path.includes('/lucide-react/')) return 'vendor-icons';
          return undefined;
        },
      },
    },
  },
});
