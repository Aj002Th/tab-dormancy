import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: r('./popup.html'),
        dashboard: r('./dashboard.html'),
        background: r('./src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
