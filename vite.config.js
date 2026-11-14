import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages (any repo name) and locally.
export default defineConfig({
  plugins: [react()],
  base: './',
});
