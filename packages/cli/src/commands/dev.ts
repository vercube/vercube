
import { defineCommand } from 'citty';
import { createDevServerApp, createDevServer, createRollupWatcher } from '@cube/devkit';

export default defineCommand({
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
    createRollupWatcher(app);
  },
});