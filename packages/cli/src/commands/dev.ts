
import { defineCommand, type CommandDef } from 'citty';
import { createDevServerApp, createDevServer, createWatcher } from '@vercube/devkit';

export const devCommand: CommandDef = defineCommand({
  meta: {
    name: 'dev',
    description: 'Start development server',
  },
  async run() {
    // create new dev server app
    const app = createDevServerApp();

    // create dev server
    createDevServer(app);

    // create rollup watcher to watch for changes
    await createWatcher(app);
  },
});