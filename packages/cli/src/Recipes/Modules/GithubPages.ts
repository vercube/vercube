import { defineRecipe } from '../Apply';

const WORKFLOW = `name: Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build:pages
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist-static

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;

export const githubPagesRecipe = defineRecipe({
  id: 'github-pages',
  label: 'GitHub Pages (static files)',
  kind: 'deploy',
  // the workflow belongs at the repository root, and the web app of a fullstack
  // project is published by its own build
  unsupported: (project) =>
    project.layout === 'api'
      ? undefined
      : 'GitHub Pages serves static files only: publish the web app with its own build, and deploy the API to a target that runs code.',
  apply: ({ project }) => {
    project.createFile('.github/workflows/pages.yml', WORKFLOW);
    project.createFile('public/.gitkeep', '');
    project.addScript('build:pages', 'vercube build --target github-pages');
    project.addLines('.gitignore', ['dist-static']);
    project.note(
      '`build:pages` writes the static site to dist-static: files from public/, and the answer of every GET route that reads nothing from the request',
    );
    project.note('GitHub Pages runs no code: routes that need a server are listed by the build and are not part of the site');
    project.note('Turn Pages on once under Settings > Pages > Source: GitHub Actions');
  },
});
