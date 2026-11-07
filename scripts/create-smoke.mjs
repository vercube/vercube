#!/usr/bin/env node
// Creates a project with the CLI built from this repository and checks that it
// works: install, lint, typecheck, build, its tests, and booting it to answer a
// request. The project depends on this repository's packages, packed to
// tarballs, so a recipe is tested against the code it ships with.
//
//   pnpm build
//   node scripts/create-smoke.mjs --template api --template-dir ../starter --modules queue --queue memory
//   node scripts/create-smoke.mjs --template api --template-dir ../starter --modules queue --queue bullmq --services
//
// --services starts the project's docker-compose.yml and boots it; without it a
// project that needs a broker or a database is only built, not booted.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const repo = resolve(import.meta.dirname, '..');

const { values: options } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    template: { type: 'string', default: 'api' },
    'template-dir': { type: 'string' },
    modules: { type: 'string', default: 'none' },
    deploy: { type: 'string', default: 'node' },
    services: { type: 'boolean', default: false },
    tarballs: { type: 'string' },
    port: { type: 'string', default: '3000' },
    out: { type: 'string' },
  },
});

if (!options['template-dir']) {
  throw new Error('--template-dir is required: a checkout of the template branch of vercube/starter');
}

// recipe flags (--queue, --scheduler-store, ...) are passed through to init
const OWN = new Set(['--template', '--template-dir', '--modules', '--deploy', '--tarballs', '--port', '--out']);
const passthrough = [];

for (let index = 2; index < process.argv.length; index++) {
  const arg = process.argv[index];
  const flag = arg.split('=')[0];

  if (flag === '--services') {
    continue;
  }

  if (OWN.has(flag)) {
    // skip its value too, unless given as --flag=value
    index += arg.includes('=') ? 0 : 1;
    continue;
  }

  passthrough.push(arg);
}

const step = (title) => console.log(`\n▶ ${title}`);

// docker compose names a project after its directory; runs side by side must not share one
const composeProject = `vercube-smoke-${process.pid}`;

const run = (command, args, cwd, env = {}) => {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, CI: '1', COMPOSE_PROJECT_NAME: composeProject, ...env },
  });
};

// 1. the packages of this repository, packed as they would be published
const tarballs = options.tarballs ?? mkdtempSync(join(tmpdir(), 'vercube-tarballs-'));

if (readdirSync(tarballs).length === 0) {
  step('Packing the packages');

  for (const dir of readdirSync(join(repo, 'packages'))) {
    if (existsSync(join(repo, 'packages', dir, 'package.json'))) {
      execFileSync('pnpm', ['pack', '--pack-destination', tarballs], { cwd: join(repo, 'packages', dir), stdio: 'ignore' });
    }
  }
}

const packages = Object.fromEntries(
  readdirSync(tarballs)
    .filter((file) => file.startsWith('vercube-') && file.endsWith('.tgz'))
    .map((file) => [`@vercube/${file.replace(/^vercube-(.*)-\d+\.\d+\.\d+.*\.tgz$/, '$1')}`, `file:${join(tarballs, file)}`]),
);

// 2. the project, from the CLI built in this repository
const root = options.out ?? join(mkdtempSync(join(tmpdir(), 'vercube-smoke-')), 'app');

step(`Creating ${options.template} with ${options.modules}, deploy ${options.deploy}`);
run(
  'node',
  [
    join(repo, 'packages/cli/dist/index.mjs'),
    'init',
    root,
    '--template',
    options.template,
    '--template-dir',
    resolve(options['template-dir']),
    '--modules',
    options.modules,
    '--deploy',
    options.deploy,
    '--package-manager',
    'pnpm',
    '--yes',
    '--no-install',
    '--no-git-init',
    ...passthrough,
  ],
  repo,
);

// 3. this repository's packages instead of the published ones
const manifests = readdirSync(root, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith('package.json') && !file.includes('node_modules'));

for (const file of manifests) {
  const pkg = JSON.parse(readFileSync(join(root, file), 'utf8'));

  for (const field of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (packages[name]) {
        pkg[field][name] = packages[name];
      }
    }
  }

  writeFileSync(join(root, file), `${JSON.stringify(pkg, null, 2)}\n`);
}

const workspace = join(root, 'pnpm-workspace.yaml');
const overrides = Object.entries(packages)
  .map(([name, spec]) => `  '${name}': ${spec}`)
  .join('\n');

writeFileSync(
  workspace,
  `${existsSync(workspace) ? readFileSync(workspace, 'utf8').replace(/\n?$/, '\n') : ''}overrides:\n${overrides}\n`,
);

const app = existsSync(join(root, 'apps/api/package.json')) ? join(root, 'apps/api') : root;
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
const appScripts = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).scripts ?? {};

// 4. what a user runs after creating it
step('Installing');
run('pnpm', ['install'], root);

if (existsSync(join(root, 'node_modules/.bin/oxfmt'))) {
  run(join(root, 'node_modules/.bin/oxfmt'), [], root);
}

if (scripts['test:lint']) {
  step('Linting');
  run('pnpm', ['run', 'test:lint'], root);
}

step('Typechecking');
run('pnpm', ['run', 'test:tscheck'], root);

step('Building');
run('pnpm', ['run', 'build'], root);

if (appScripts.test) {
  step('Testing');
  run('pnpm', ['run', 'test'], app);
}

// 5. booting it, when everything it needs is running
const needsServices = existsSync(join(root, 'docker-compose.yml'));

if (needsServices && !options.services) {
  console.log('\n✔ Built. Not booted: the project needs the services in docker-compose.yml, pass --services to start them.');
  process.exit(0);
}

const config = join(app, 'vercube.config.ts');

writeFileSync(config, readFileSync(config, 'utf8').replace(/port: \d+/, `port: ${options.port}`));

let server;

try {
  // inside the try: services that fail their health check are torn down too
  if (needsServices) {
    step('Starting the services');
    run('docker', ['compose', 'up', '-d', '--wait'], root);
  }

  step(`Booting on port ${options.port}`);
  server = spawn('node', ['dist/index.mjs'], { cwd: app, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } });

  // an answer while our server is not running comes from something else on the port
  let gone = false;

  server.once('exit', () => {
    gone = true;
  });

  const url = `http://localhost:${options.port}/api/foo`;
  const deadline = Date.now() + 30_000;
  let body = null;

  while (Date.now() < deadline && body === null && !gone) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        body = await response.json();
      }
    } catch {
      // not listening yet
    }

    if (body === null) {
      await new Promise((done) => setTimeout(done, 500));
    }
  }

  if (gone) {
    throw new Error('The app exited before it answered');
  }

  if (body?.message !== 'Hello, world!') {
    throw new Error(`GET ${url} did not answer within 30s`);
  }

  console.log(`\n✔ GET /api/foo answered ${JSON.stringify(body)}`);

  // a deployment stops it with SIGTERM: it has to exit, not hang on an open connection
  step('Stopping with SIGTERM');

  const exited = new Promise((done) => server.once('exit', () => done(true)));

  server.kill('SIGTERM');

  if (!(await Promise.race([exited, new Promise((done) => setTimeout(() => done(false), 15_000))]))) {
    throw new Error('The app did not exit within 15s of SIGTERM');
  }

  console.log('✔ Exited on SIGTERM');
} finally {
  // whatever happened above, nothing outlives the run
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL');
  }

  if (needsServices) {
    execFileSync('docker', ['compose', 'down', '-v'], {
      cwd: root,
      stdio: 'ignore',
      env: { ...process.env, COMPOSE_PROJECT_NAME: composeProject },
    });
  }
}
