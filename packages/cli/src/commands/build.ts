import { createVercube, build } from '@vercube/devkit';
import { defineCommand, type CommandDef } from 'citty';

export const buildCommand: CommandDef = defineCommand({
  meta: {
    name: 'build',
    description: 'Build the project',
  },
  args: {
    entry: {
      type: 'string',
      description: 'Entry file',
      default: './src/index.ts',
    },
  },
  run: async (ctx) => {
    // create new app
    const app = await createVercube({
      build: {
        entry: ctx.args.entry,
      },
    });

    // run build
    await build(app);
  },
});
