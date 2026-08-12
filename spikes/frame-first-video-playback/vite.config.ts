import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: {
          mediabunny: ['mediabunny'],
          webcodecsExamples: ['webcodecs-examples'],
        },
      },
    },
  },
});
