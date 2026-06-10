import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';

const reactPath = path.resolve(__dirname, '../../node_modules/react');
const reactDomPath = path.resolve(__dirname, '../../node_modules/react-dom');
const reactDomClientPath = path.resolve(__dirname, '../../node_modules/react-dom/client');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    process.env.ANALYZE && visualizer({ open: true, filename: 'bundle-stats.html', gzipSize: true }),
  ].filter(Boolean),
  base: '/',
  build: {
    base: './',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-dom/client'],
          'motion': ['framer-motion'],
          'icons': ['lucide-react'],
          'state': ['zustand'],
          'virtual': ['@tanstack/react-virtual'],
          'date': ['date-fns', 'date-fns/locale'],
          'socket': ['socket.io-client'],
        },
      },
    },
  },
  resolve: {
    alias: {
      'react': reactPath,
      'react/': reactPath + '/',
      'react-dom': reactDomPath,
      'react-dom/': reactDomPath + '/',
      'react-dom/client': reactDomClientPath,
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'framer-motion',
      'zustand',
      'lucide-react',
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
