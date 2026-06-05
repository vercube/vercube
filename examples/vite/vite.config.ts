import { vercube } from '@vercube/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // Vite serves the Vue frontend; Vercube handles only its `/api` routes.
    vue(),
    vercube({
      scanDirs: ['src/server'],
      setupFile: './src/server/Boot/Setup.ts',
    }),
  ],
  server: {
    port: 3010,
  },
});
