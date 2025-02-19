import { defineBuildConfig } from 'unbuild';
import { BaseBuildOptions } from '../shared/build.options';

export default defineBuildConfig({
  ...BaseBuildOptions,
  entries: [
    // common
    { input: 'src/index' },

    // appenders
    { input:'src/Appenders/index', outDir:'dist/appenders' },
  ],
});