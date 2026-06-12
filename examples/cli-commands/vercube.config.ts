import { defineConfig } from '@vercube/core';
import { DbCommand } from './src/Commands/Db';
import { GreetCommand } from './src/Commands/Greet';

export default defineConfig({
  logLevel: 'info',
  server: {
    port: 3000,
  },
  cli: {
    commands: [GreetCommand, DbCommand],
  },
});
