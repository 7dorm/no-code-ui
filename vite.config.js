import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      'react-native': 'react-native-web'
    }
  },
  define: {
    // Полифилл для process, который используется в @babel/types и других Node.js модулях
    'process.env': '{}',
    'global': 'globalThis',
    'process': JSON.stringify({
      env: {},
      version: '',
      versions: {},
      browser: true,
      nextTick: (fn) => setTimeout(fn, 0),
      cwd: () => '/'
    })
  }
});
