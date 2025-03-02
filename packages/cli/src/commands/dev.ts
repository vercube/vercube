
import { defineCommand, type CommandDef } from 'citty';
import { createVercube, createDevServer, watch } from '@vercube/devkit';

export const devCommand: CommandDef = defineCommand({
  meta: {
    name: 'dev',
    description: 'Start development server',
  },
  async run() {
    // create new app
    const app = await createVercube();

    // create dev server
    createDevServer(app);

    // create rollup watcher to watch for changes
    await watch(app);
  },
});