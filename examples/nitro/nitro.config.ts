import { vercubeNitro } from '@vercube/nitro';
import { defineConfig } from 'nitro';

export default defineConfig({
  modules: [vercubeNitro()],
  serverDir: './src',
  experimental: {
    openAPI: true,
  },
});
