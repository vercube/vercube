import { defineCommand, runMain } from 'citty';
import { version } from '../package.json';
import build from './commands/build';
import dev from './commands/dev';

const main = defineCommand({
  meta: {
    name: 'cube',
    version,
    description: 'Cube CLI',
  },
  subCommands: {
    build,
    dev,
  },
});

runMain(main);