import { defineRecipe } from '../Apply';
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
    // A Worker has no file system to read vercube.config.ts from, so the
    // configuration is imported and travels in the bundle.
    project.addToEntry('provideConfig(config);', {
      position: 'before-create-app',
      imports: { provideConfig: '@vercube/core', config: { from: '../vercube.config', default: true } },
    });
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
    // a Worker bundle is deployed, not imported: it needs no declarations
    const hadBuild = /\bbuild\s*:/.test(project.read('vercube.config.ts') ?? '');

    project.setConfig('build', '{ dts: false }');
    // Importing the configuration puts it under the type check, and its default
    // export has no declared type. With no declarations to emit, the compiler
    // need not be able to write them file by file.
    project.updateJson('tsconfig.json', (tsconfig) => {
      const options = (tsconfig.compilerOptions ??= {});

      if (options.isolatedDeclarations === false && options.declaration === false) {
        return false;
      }

      options.isolatedDeclarations = false;
      options.declaration = false;

      return true;
    });
    project.bind({ name: 'CloudflareBindings', from: '@vercube/serverless/cloudflare' });
    project.addScript('preview', 'vercube build && wrangler dev');
    project.addScript('deploy', 'vercube build && wrangler deploy');
    project.addLines('.gitignore', ['.wrangler', '.dev.vars']);
    project.note('Run the Worker locally with `preview`, deploy it with `run deploy` (needs `wrangler login` once)');

    if (hadBuild) {
      project.note('Add `dts: false` to the `build` option of vercube.config.ts: a Worker bundle needs no declarations');
    }
  },
});
