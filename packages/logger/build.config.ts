import { defineBuildConfig } from 'unbuild';
import { BaseBuildOptions } from '../shared/build.options';

export default defineBuildConfig({
  ...BaseBuildOptions,
  entries: [
    // common
    { input: 'src/index' },

    // providers
    { input:'src/Providers/index', outDir:'dist/providers' },
  ],
});