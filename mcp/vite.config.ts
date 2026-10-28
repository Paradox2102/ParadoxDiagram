// The MCP server as one ES module (dist/server.js). The app's model, catalog, geometry and export code from ../src
// is bundled in; npm dependencies stay external (they install with the package).
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/server.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node24',
    rollupOptions: { output: { entryFileNames: 'server.js', format: 'es', banner: '#!/usr/bin/env node' } },
  },
});
