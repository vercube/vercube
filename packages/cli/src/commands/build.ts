import { defineCommand, type CommandDef } from 'citty';

export const buildCommand: CommandDef = defineCommand({
  meta: {
    name: 'build',
    description: 'Build the project',
  },
  run: async () => {
    throw new Error('Build command not implemented yet');
  },
});