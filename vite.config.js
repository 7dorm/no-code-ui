import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';

  return {
    plugins: [react()],
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true
    },

    server: {
      host: '0.0.0.0',
      port: 5173
    },

    preview: {
      host: '0.0.0.0',
      port: Number(process.env.PORT),
      allowedHosts: ['no-code-ui.onrender.com']
      // или для теста можно:
      // allowedHosts: 'all'
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        'react-native': 'react-native-web'
      }
    },

    define: {
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
  };
});
