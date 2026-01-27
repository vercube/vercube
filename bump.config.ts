import { defineConfig } from 'bumpp';

export default defineConfig({
  files: ['package.json', 'packages/*/package.json'],
  commit: 'chore: release v%s',
  tag: 'v%s',
  push: true,
  all: true,
});
