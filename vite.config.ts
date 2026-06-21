import { defineConfig } from 'vite';

export default defineConfig({
  base: '/zeta-interferometer/',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 600
  }
});
