import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: { port: 5173 },
});

// role: Vite 6 build/dev configuration — React plugin, ES-module workers, fixed dev port.
// invariants: no legacy/WebGL1 plugins; one entry (index.html); no alias tricks that could
//             pull in a rendering library.
// owner milestone: M1
