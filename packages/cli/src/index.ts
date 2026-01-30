#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { version } from '../package.json';

const main = defineCommand({
  meta: {
    name: 'Vercube',
    version,
    description: 'Vercube CLI',
  },
  subCommands: {
    build: () => import('./commands/build').then(({ buildCommand }) => buildCommand),
    dev: () => import('./commands/dev').then(({ devCommand }) => devCommand),
    init: () => import('./commands/init').then(({ initCommand }) => initCommand),
    fetch: () => import('./commands/fetch').then(({ fetchCommand }) => fetchCommand),
  },
});

runMain(main);
