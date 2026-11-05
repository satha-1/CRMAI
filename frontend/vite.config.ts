import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Two entry points: the staff console (index.html) and the public chat widget (widget.html).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true, ws: true } },
  },
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), widget: resolve(__dirname, 'widget.html') },
    },
  },
});
