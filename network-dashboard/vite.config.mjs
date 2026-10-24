import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bundles the React Flow views into flow/flow.js + flow/flow.css so the
// extension can load them without any remote scripts (MV3 CSP safe).
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'flow',
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: 'flow-src/index.jsx',
      formats: ['es'],
      fileName: () => 'flow.js',
      cssFileName: 'flow'
    }
  }
});
