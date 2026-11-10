import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [solid()],
  server: {
    watch: { usePolling: true, interval: 300 },
    host: '127.0.0.1',
    port: 5197,
    strictPort: true,
    fs: { allow: [new URL('../..', import.meta.url).pathname] },
  },
  resolve: { dedupe: ['solid-js'] },
});
