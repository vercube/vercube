import { defineRecipe } from '../Apply';
import { bundleConfig } from './BundledConfig';
import { VERSIONS } from './Versions';

const WRANGLER = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "vercube-api",
  "main": "dist/index.mjs",
  "compatibility_date": "2026-11-01",
  // node:async_hooks, node:fs and process.env, which the framework uses
  "compatibility_flags": ["nodejs_compat"],
  // files in ./public are served by Cloudflare before the Worker runs
  "assets": { "directory": "./public" },
  "vars": {
    "NODE_ENV": "production"
  }
  // Bindings go here and are read through CloudflareBindings:
  // "kv_namespaces": [{ "binding": "CACHE", "id": "<namespace id>" }]
}
`;

export const cloudflareRecipe = defineRecipe({
  id: 'cloudflare',
  label: 'Cloudflare Workers',
  kind: 'deploy',
  apply: ({ project }) => {
    project.addDependencies({ '@vercube/serverless': 'latest' });
    project.addDependencies({ wrangler: VERSIONS.wrangler }, { dev: true });
    project.allowBuilds(['workerd', 'esbuild', 'sharp']);
    // a Worker has no file system to read vercube.config.ts from
    bundleConfig(project);
    // app.listen() stays: \`vercube dev\` needs it, and it binds nothing on Workers.
    // Cloudflare runs the default export of the module.
    project.setDefaultExport('const worker: CloudflareHandler = toServerlessHandler(app);\n\nexport default worker;', {
      imports: {
        toServerlessHandler: '@vercube/serverless/cloudflare',
        CloudflareHandler: { from: '@vercube/serverless/cloudflare', type: true },
      },
      unused: ['RequestHandler'],
    });
    project.createFile('wrangler.jsonc', WRANGLER);
    project.createFile('public/.gitkeep', '');
    project.bind({ name: 'CloudflareBindings', from: '@vercube/serverless/cloudflare' });
    project.addScript('preview', 'vercube build && wrangler dev');
    project.addScript('deploy', 'vercube build && wrangler deploy');
    project.addLines('.gitignore', ['.wrangler', '.dev.vars']);
    project.note('Run the Worker locally with `preview`, deploy it with `run deploy` (needs `wrangler login` once)');
  },
});
