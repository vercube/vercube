import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'build',
    description: 'Build the project',
  },
  run: async () => {
    throw new Error('Build command not implemented yet');
  },
})