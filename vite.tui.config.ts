import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// OpenCode transforms workspace TSX, but not installed node_modules TSX.
// Compile our local components while preserving the host's runtime singletons.
const hostModules = new Set([
  '@opencode/plugin/tui',
  '@opencode/plugin/rpc',
  '@opentui/solid',
  'solid-js',
]);

export default defineConfig({
  plugins: [solid({ solid: { moduleName: '@opentui/solid', generate: 'universal' } })],
  build: {
    emptyOutDir: false,
    lib: { entry: 'src/tui.tsx', formats: ['es'], fileName: () => 'tui.js' },
    rollupOptions: {
      external: (id) => {
        if (hostModules.has(id)) return true;
        if (/^(?:@opencode|@opentui|solid-js|effect)(?:\/|$)/.test(id))
          throw new Error(`Unsupported TUI runtime import: ${id}`);
        return false;
      },
    },
  },
});
