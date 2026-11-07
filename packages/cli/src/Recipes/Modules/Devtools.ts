import { defineRecipe } from '../Apply';

export const devtoolsRecipe = defineRecipe({
  id: 'devtools',
  label: 'Devtools',
  hint: 'an inspector at /_devtools',
  // its panels for jobs and schedules only fill when those are set up first
  after: ['queue', 'scheduler', 'storage', 'telemetry'],
  apply: ({ project }) => {
    // a dependency, not a devDependency: vercube.config.ts imports it at runtime
    project.addDependencies({ '@vercube/devtools': 'latest' });
    // on in development; in production it only mounts with a token
    project.addPlugin({ name: 'DevtoolsPlugin', from: '@vercube/devtools', options: '{ token: process.env.DEVTOOLS_TOKEN }' });
    project.addEnv({ DEVTOOLS_TOKEN: '' }, 'Devtools: needed to open them in production');
    project.note('Devtools at /_devtools');
  },
});
