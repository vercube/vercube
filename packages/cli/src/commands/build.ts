import { createVercube, build } from '@vercube/devkit';
import { defineCommand, type CommandDef } from 'citty';

export const buildCommand: CommandDef = defineCommand({
  meta: {
    name: 'build',
    description: 'Build the project',
  },
  run: async () => {
    // create new app
    const app = await createVercube();

    // run build
    await build(app);
  },
});