import { defineRecipe } from '../Apply';
import { bundleConfig } from './BundledConfig';
import { VERSIONS } from './Versions';

const FUNCTION = `import { netlify } from '../../dist/index.mjs';
import type { Config } from '@netlify/functions';

export default netlify;

// every path that is not a file in \`public\`
export const config: Config = { path: '/*', preferStatic: true };
`;

const NETLIFY_TOML = `[build]
  command = "vercube build"
  # served by Netlify's CDN before the function is asked
  publish = "public"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
`;

export const netlifyRecipe = defineRecipe({
  id: 'netlify',
  label: 'Netlify Functions',
  kind: 'deploy',
  apply: ({ project }) => {
    project.addDependencies({ '@vercube/serverless': 'latest' });
    project.addDependencies(
      { 'netlify-cli': VERSIONS.netlifyCli, '@netlify/functions': VERSIONS.netlifyFunctions },
      { dev: true },
    );
    project.allowBuilds(['esbuild', 'sharp', 'netlify-cli', 'unix-dgram']);
    // the function bundle does not carry vercube.config.ts as a file
    bundleConfig(project);
    // app.listen() stays: \`vercube dev\` needs it, and it binds nothing in a function
    project.addToEntry('export const netlify: NetlifyHandler = toServerlessHandler(app);', {
      imports: {
        toServerlessHandler: '@vercube/serverless/netlify',
        NetlifyHandler: { from: '@vercube/serverless/netlify', type: true },
      },
    });
    project.createFile('netlify/functions/api.mts', FUNCTION);
    project.createFile('netlify.toml', NETLIFY_TOML);
    project.createFile('public/.gitkeep', '');
    project.bind({ name: 'NetlifyContext', from: '@vercube/serverless/netlify' });
    project.addScript('preview', 'vercube build && netlify dev');
    project.addScript('deploy', 'netlify deploy --build --prod');
    project.addLines('.gitignore', ['.netlify']);
    project.note(
      'Run the function locally with `preview`, deploy it with `run deploy` (needs `netlify login` and `netlify link` once)',
    );
  },
});
