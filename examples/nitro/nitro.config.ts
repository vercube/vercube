import { vercubeNitro } from '@vercube/nitro';
import { defineConfig } from 'nitro';

export default defineConfig({
  modules: [
    vercubeNitro({
      scanDirs: ['routes', 'services'],
      setupFile: './src/boot/boot.ts',
    }),
  ],
  serverDir: './src',
  experimental: {
    openAPI: true,
  },
});
