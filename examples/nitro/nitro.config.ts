import { vercubeNitro } from '@vercube/nitro';
import { defineConfig } from 'nitro';

export default defineConfig({
  modules: [
    vercubeNitro({
      scanDirs: ['routes', 'services'],
    }),
  ],
  serverDir: './src',
  experimental: {
    openAPI: true,
  },
});
