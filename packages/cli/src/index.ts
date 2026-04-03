#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { version } from '../package.json';
import { BaseCommand } from './BaseCommand';
import { createCliContainer } from './CliContainer';
import { loadUserCommands } from './CommandLoader';
import { CommandRegistry } from './CommandRegistry';
import { BuildCommand } from './Commands/Build';
import { DevCommand } from './Commands/Dev';
import { FetchCommand } from './Commands/Fetch';
import { InitCommand } from './Commands/Init';

const container = createCliContainer();
const registry = container.resolve(CommandRegistry);

// Register built-in commands
registry.register(BuildCommand);
registry.register(DevCommand);
registry.register(InitCommand);
registry.register(FetchCommand);

// Load and register user-defined commands from vercube.config.ts (via jiti, zero build)
const userCommands = await loadUserCommands(process.cwd());
for (const UserCommand of userCommands) {
  registry.register(UserCommand as new () => BaseCommand);
}

const main = defineCommand({
  meta: {
    name: 'vercube',
    version,
    description: 'Vercube CLI',
  },
  subCommands: registry.buildCittyTree(container),
});

runMain(main);
