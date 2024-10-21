import { defineBuildConfig } from 'unbuild';
import { BaseBuildOptions } from '../../shared/build.options';

export default defineBuildConfig({
  ...BaseBuildOptions,
  rollup: {
    ...BaseBuildOptions.rollup,
    esbuild: {
      exclude: ['ioredis']
    }
  }
})