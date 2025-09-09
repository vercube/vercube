import { build, createVercube } from '@vercube/devkit';
import { defineCommand } from 'citty';
import type { CommandDef } from 'citty';

export const buildCommand: CommandDef = defineCommand({
  meta: {
    name: 'build',
    description: 'Build the project',
  },
  args: {
    entry: {
      type: 'string',
      description: 'Entry file',
    },
  },
  run: async (ctx) => {
    // create new app
    const app = await createVercube({
      build: {
        entry: ctx?.args?.entry ?? undefined,
      },
    });

    // run build
    await build(app);
  },
});
