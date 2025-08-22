import { createDevServer, createVercube, watch } from '@vercube/devkit';
import { defineCommand } from 'citty';
import type { CommandDef } from 'citty';

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

    // create rolldown watcher to watch for changes
    await watch(app);
  },
});
