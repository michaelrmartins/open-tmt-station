import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: ECharts and React change far less often than the app
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'echarts';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': process.env.VITE_API_PROXY || 'http://localhost:3001' },
  },
});
