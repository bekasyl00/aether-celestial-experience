import { defineConfig } from 'vite';

export default defineConfig({
  base: '/aether-celestial-experience/',
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
