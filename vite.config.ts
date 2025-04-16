import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://script.google.com/macros/s/AKfycbwLNfhqfY70U4B27BHd844ei7gWnfviVxzwmWFxcHiMQbFQYii6VhGfWOUC6qyB6GpmUA/exec',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});