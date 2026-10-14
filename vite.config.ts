import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Where the built website goes: inside the Go server, which bakes it into the binary. Go can only embed
 * files below its own package, so the build has to land there rather than in a dist/ of its own.
 */
const outDir = fileURLToPath(new URL('./server/internal/site/dist', import.meta.url));

/**
 * Puts dist/.gitkeep back after every build. Vite empties the folder first, and without the placeholder
 * a fresh clone has nothing for Go to embed and won't compile until someone builds the website.
 * @returns {Plugin} The plugin.
 */
const keepGitkeep = (): Plugin =>
{
  return {
    name: 'keep-gitkeep',
    closeBundle: () =>
    {
      writeFileSync(`${outDir}/.gitkeep`, '');
    },
  };
};

export default defineConfig({
  root: 'web',
  plugins: [ react(), keepGitkeep() ],
  build: {
    outDir,
    emptyOutDir: true,
  },

  // while developing, Vite serves the pages and passes /api through to the Go server.
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8686',
    },
  },
});
