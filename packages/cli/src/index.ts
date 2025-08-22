#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { version } from '../package.json';
import { buildCommand } from './commands/build';
import { devCommand } from './commands/dev';
import { initCommand } from './commands/init';

const main = defineCommand({
  meta: {
    name: 'Vercube',
    version,
    description: 'Vercube CLI',
  },
  subCommands: {
    build: buildCommand,
    dev: devCommand,
    init: initCommand,
  },
});

runMain(main);
