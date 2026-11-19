import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built files work from any folder on the VPS
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
