import { defineConfig } from 'vite';

// `base` must match the GitHub Pages sub-path when deployed (e.g. '/pattern-explorer/').
// Override with: BASE_PATH=/repo-name/ npm run build
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  worker: { format: 'es' },
  // Polling is needed for file watching when the project lives on a Windows drive under WSL.
  server: { watch: { usePolling: true, interval: 300 } },
  build: { target: 'es2022' },
});
