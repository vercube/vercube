#!/usr/bin/env node
// SPIKE, throwaway: delete it when step 2 of #1488 adds the real package and its tests.
//
// Builds a `vercube` umbrella package in a temporary directory (one-line
// re-exports generated from scripts/umbrella/exports.mjs, nothing in the
// repository, nothing published), installs it next to the `@vercube/*` tarballs
// of this checkout with pnpm and with npm, and checks:
//
// 1. identity: `vercube/queue` and `@vercube/queue` are the same module
//    instance, and so are the DI container and the logger;
// 2. an application that mixes both styles with `@Inject` works;
// 3. types resolve under `moduleResolution` `bundler` and `nodenext`, and are
//    assignable both ways;
// 4. what a missing optional peer says, at run time and in TypeScript.
//
// `@vercube/queue` is an optional peer of the prototype (the strictest case:
// that is where a package manager could install a second copy).
//
//   pnpm build
//   node scripts/umbrella/prototype.mjs
//   node scripts/umbrella/prototype.mjs --keep   # leave the temporary projects in place

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { collectExports, ROOT } from './exports.mjs';

const repo = resolve(import.meta.dirname, '../..');
const keep = process.argv.includes('--keep');
const temp = mkdtempSync(join(tmpdir(), 'vercube-umbrella-'));

// regular dependencies of the prototype; every other mirrored package is an optional peer
const DEPENDENCIES = ['@vercube/core', '@vercube/di', '@vercube/logger', '@vercube/client', '@vercube/serverless'];

// the one name the three root packages disagree on (see collisions.mjs): the framework's own wins
const ROOT_EXPLICIT = `export { defineErrorCatalog } from '@vercube/di';\n`;

const write = (file, content) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

const run = (command, args, cwd) => spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, CI: '1' } });

const must = (command, args, cwd) => {
  const result = run(command, args, cwd);

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}\n${result.stdout}\n${result.stderr}`);
  }

  return result.stdout;
};

/**
 * Packs the public packages of the workspace, returns `{ name: { file, manifest } }`.
 */
function pack(destination) {
  const tarballs = {};

  for (const dir of readdirSync(join(repo, 'packages'))) {
    const manifest = join(repo, 'packages', dir, 'package.json');

    if (!existsSync(manifest) || JSON.parse(readFileSync(manifest, 'utf8')).private) {
      continue;
    }

    const before = new Set(readdirSync(destination));

    execFileSync('pnpm', ['pack', '--pack-destination', destination], { cwd: join(repo, 'packages', dir), stdio: 'ignore' });

    const file = readdirSync(destination).find((name) => !before.has(name));
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));

    tarballs[pkg.name] = { file: join(destination, file), manifest: pkg };
  }

  return tarballs;
}

/**
 * The umbrella package: an entry per mirrored export, each a one-line re-export.
 */
function buildUmbrella(dir, version) {
  const entries = collectExports().filter((entry) => entry.status === 'mirrored');
  const exports = { '.': { types: './index.d.mts', default: './index.mjs' } };
  const root = `${ROOT.map((name) => `export * from '${name}';`).join('\n')}\n${ROOT_EXPLICIT}`;

  write(join(dir, 'index.mjs'), root);
  write(join(dir, 'index.d.mts'), root);

  for (const entry of entries) {
    const code = `export * from '${entry.source}';\n${entry.hasDefault ? `export { default } from '${entry.source}';\n` : ''}`;

    write(join(dir, `${entry.subpath}.mjs`), code);
    write(join(dir, `${entry.subpath}.d.mts`), code);
    exports[entry.subpath] = { types: `${entry.subpath}.d.mts`, default: `${entry.subpath}.mjs` };
  }

  exports['./package.json'] = './package.json';

  const peers = [...new Set(entries.map((entry) => entry.package))].filter((name) => !DEPENDENCIES.includes(name));

  write(
    join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'vercube',
        version,
        description: 'SPIKE prototype of the umbrella package, never published',
        type: 'module',
        exports,
        dependencies: Object.fromEntries(DEPENDENCIES.map((name) => [name, version])),
        peerDependencies: Object.fromEntries(peers.map((name) => [name, version])),
        peerDependenciesMeta: Object.fromEntries(peers.map((name) => [name, { optional: true }])),
      },
      null,
      2,
    )}\n`,
  );

  return entries.length;
}

/**
 * The workspace packages `names` install: themselves and their dependencies, not their peers.
 */
function closure(names, tarballs) {
  const found = new Set();
  const queue = [...names];

  while (queue.length > 0) {
    const name = queue.pop();

    if (!found.has(name) && tarballs[name]) {
      found.add(name);
      queue.push(...Object.keys(tarballs[name].manifest.dependencies ?? {}));
    }
  }

  return [...found];
}

/**
 * A project that depends on `names`, every `@vercube/*` and `vercube` coming from the tarballs.
 */
function createProject(dir, manager, names, tarballs) {
  const local = Object.fromEntries(
    closure([...names, ...DEPENDENCIES], tarballs).map((name) => [name, `file:${tarballs[name].file}`]),
  );

  write(
    join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: `umbrella-${manager}`,
        private: true,
        type: 'module',
        dependencies: {
          ...Object.fromEntries(names.map((name) => [name, `file:${tarballs[name].file}`])),
          '@oxc-project/runtime': '0.158.0',
        },
        // npm reads the overrides here, pnpm from pnpm-workspace.yaml
        overrides:
          manager === 'npm' ? Object.fromEntries(Object.entries(local).filter(([name]) => !names.includes(name))) : undefined,
      },
      null,
      2,
    )}\n`,
  );

  if (manager === 'pnpm') {
    const overrides = Object.entries(local).map(([name, spec]) => `  '${name}': ${spec}`);

    write(join(dir, 'pnpm-workspace.yaml'), `packages: []\noverrides:\n${overrides.join('\n')}\n`);
    must('pnpm', ['install', '--ignore-scripts'], dir);
  } else {
    must('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], dir);
  }
}

/**
 * Every installed copy of a package, by its real directory.
 */
function copies(dir, name) {
  const found = new Set();
  const walk = (modules) => {
    for (const entry of existsSync(modules) ? readdirSync(modules) : []) {
      const path = join(modules, entry);

      if (entry.startsWith('@') || entry === '.pnpm') {
        walk(path);
      } else if (existsSync(join(path, 'package.json'))) {
        if (JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).name === name) {
          found.add(createRequire(import.meta.url).resolve(join(path, 'package.json')));
        }

        walk(join(path, 'node_modules'));
      }
    }
  };

  walk(join(dir, 'node_modules'));

  return found.size;
}

// an application in both styles: the plugin and the controller decorators come
// from `vercube`, the injected classes and the consumer decorators from `@vercube/*`
const APP = `
import { Container, Controller, createApp, defineErrorCatalog, Inject, Logger, Post, withPluginOptions } from 'vercube';
import { defineQueueStrategy, QueueManager, QueuePlugin } from 'vercube/queue';
import { MemoryStrategy } from 'vercube/queue/strategies/MemoryStrategy';
import { Controller as ScopedController } from '@vercube/core';
import { Container as ScopedContainer, defineErrorCatalog as scopedDefineErrorCatalog, Inject as ScopedInject } from '@vercube/di';
import { Logger as ScopedLogger } from '@vercube/logger';
import { Consumer, Job, QueueManager as ScopedQueueManager } from '@vercube/queue';
import { MemoryStrategy as ScopedMemoryStrategy } from '@vercube/queue/strategies/MemoryStrategy';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const handled: string[] = [];

@Controller('/jobs')
class JobsController {
  // key from @vercube/queue, decorator from @vercube/di, bound by the plugin from vercube/queue
  @ScopedInject(ScopedQueueManager)
  private queue!: ScopedQueueManager;

  @Post('/')
  public async add(): Promise<unknown> {
    return this.queue.add({ queue: 'mails', job: 'welcome', payload: { userId: 'u1' } });
  }
}

@Consumer({ queue: 'mails' })
class MailConsumer {
  // key and decorator from vercube, on a class decorated by @vercube/queue
  @Inject(Logger)
  private logger!: Logger;

  @Job('welcome')
  public async welcome(payload: { userId: string }): Promise<void> {
    handled.push(\`\${payload.userId}:\${this.logger instanceof ScopedLogger}\`);
  }
}

const app = await createApp({
  configFile: false,
  cfg: {
    logLevel: 'error',
    plugins: [withPluginOptions(QueuePlugin, { strategies: [defineQueueStrategy({ strategy: MemoryStrategy })] })],
  },
  setup: (instance) => {
    instance.container.bind(JobsController);
    instance.container.bind(MailConsumer);
  },
});

const response = await app.fetch(new Request('http://localhost/jobs', { method: 'POST' }));

for (let attempt = 0; attempt < 50 && handled.length === 0; attempt++) {
  await new Promise((done) => setTimeout(done, 20));
}

const real = (specifier: string) => realpathSync(fileURLToPath(import.meta.resolve(specifier)));

console.log(JSON.stringify({
  sameQueueManager: QueueManager === ScopedQueueManager,
  sameMemoryStrategy: MemoryStrategy === ScopedMemoryStrategy,
  sameContainer: Container === ScopedContainer,
  sameInject: Inject === ScopedInject,
  sameLogger: Logger === ScopedLogger,
  sameController: Controller === ScopedController,
  // the one collision of the root entry resolves to the framework's own
  sameDefineErrorCatalog: defineErrorCatalog === scopedDefineErrorCatalog,
  sameResolvedManager: app.container.get(QueueManager) === app.container.get(ScopedQueueManager),
  status: response.status,
  consumerHandled: handled,
  umbrellaEntry: real('vercube/queue'),
  scopedEntry: real('@vercube/queue'),
}));

await app.container.get(QueueManager).close();
`;

// assignable both ways, and the explicit root export is the framework's
const TYPES = `
import { Container, defineErrorCatalog, type ConfigTypes, type IOC } from 'vercube';
import { QueueManager, type QueueTypes } from 'vercube/queue';
import { createClient } from 'vercube/client';
import type { ConfigTypes as ScopedConfigTypes } from '@vercube/core';
import { Container as ScopedContainer, defineErrorCatalog as scopedDefine, type IOC as ScopedIOC } from '@vercube/di';
import { QueueManager as ScopedQueueManager, type QueueTypes as ScopedQueueTypes } from '@vercube/queue';

declare const a: QueueManager;
declare const b: ScopedQueueManager;
declare const c: QueueTypes.JobRef;
declare const d: ScopedQueueTypes.JobRef;
declare const e: ConfigTypes.Config;
declare const f: ScopedConfigTypes.Config;
declare const g: IOC.ServiceKey;
declare const h: ScopedIOC.ServiceKey;

export const checks: [ScopedQueueManager, QueueManager, ScopedQueueTypes.JobRef, QueueTypes.JobRef] = [a, b, c, d];
export const more: [ScopedConfigTypes.Config, ConfigTypes.Config, ScopedIOC.ServiceKey, IOC.ServiceKey] = [e, f, g, h];
export const container: ScopedContainer = new Container();
export const define: typeof scopedDefine = defineErrorCatalog;
export const client: typeof createClient = createClient;
`;

const tsconfig = (moduleResolution) =>
  `${JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: moduleResolution === 'nodenext' ? 'nodenext' : 'ESNext',
      moduleResolution,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      experimentalDecorators: true,
      types: [],
    },
    include: ['types.ts'],
  })}\n`;

const tsc = join(repo, 'node_modules/.bin/tsc');
const firstLines = (text, count = 3) => text.trim().split('\n').slice(0, count).join('\n      ');
const results = {};

try {
  console.log('Packing the packages');

  const tarballsDir = join(temp, 'tarballs');

  mkdirSync(tarballsDir);

  const tarballs = pack(tarballsDir);
  const version = tarballs['@vercube/core'].manifest.version;
  const mirrored = buildUmbrella(join(temp, 'vercube'), version);
  const before = new Set(readdirSync(tarballsDir));

  // packed, never published
  must('pnpm', ['pack', '--pack-destination', tarballsDir], join(temp, 'vercube'));
  tarballs.vercube = {
    file: join(
      tarballsDir,
      readdirSync(tarballsDir).find((name) => !before.has(name)),
    ),
    manifest: JSON.parse(readFileSync(join(temp, 'vercube/package.json'), 'utf8')),
  };

  console.log(`Prototype vercube@${version}: root entry + ${mirrored} mirrored subpaths, ${DEPENDENCIES.length} dependencies\n`);

  const { transformSync } = createRequire(join(repo, 'packages/devkit/package.json'))('oxc-transform');

  for (const manager of ['pnpm', 'npm']) {
    console.log(`▶ ${manager} ${must(manager, ['--version'], temp).trim()}`);

    // 1 + 2: a project in both styles
    const app = join(temp, `app-${manager}`);

    createProject(app, manager, ['vercube', '@vercube/core', '@vercube/di', '@vercube/logger', '@vercube/queue'], tarballs);
    write(join(app, 'app.mjs'), transformSync('app.ts', APP, { decorator: { legacy: true } }).code);

    const executed = run('node', ['app.mjs'], app);

    if (executed.status !== 0) {
      throw new Error(`The application failed with ${manager}\n${executed.stdout}\n${executed.stderr}`);
    }

    const proof = JSON.parse(executed.stdout.trim().split('\n').at(-1));
    const installed = Object.fromEntries(
      ['vercube', '@vercube/di', '@vercube/core', '@vercube/logger', '@vercube/queue'].map((name) => [name, copies(app, name)]),
    );
    // the lockfile names where every package came from: nothing of the framework may be the published one
    const lockfile = readFileSync(join(app, manager === 'pnpm' ? 'pnpm-lock.yaml' : 'package-lock.json'), 'utf8');
    const fromRegistry =
      /registry\.npmjs\.org\/(@vercube\/|vercube\/)/.test(lockfile) || /^ {2}'?(@vercube\/[\w-]+|vercube)@\d/m.test(lockfile);

    console.log(`  identity   ${JSON.stringify(proof, null, 2).replaceAll('\n', '\n             ')}`);
    console.log(
      `  copies     ${JSON.stringify(installed)}${fromRegistry ? '  ! part of the framework came from the registry' : ''}`,
    );

    // 3: types
    write(join(app, 'types.ts'), TYPES);

    const types = {};

    for (const moduleResolution of ['bundler', 'nodenext']) {
      write(join(app, 'tsconfig.json'), tsconfig(moduleResolution));

      const checked = run(tsc, ['-p', '.'], app);

      types[moduleResolution] = checked.status === 0 ? 'ok' : firstLines(checked.stdout + checked.stderr, 6);
      console.log(`  types      ${moduleResolution}: ${types[moduleResolution]}`);
    }

    // 4: the optional peer is not installed
    const bare = join(temp, `bare-${manager}`);

    createProject(bare, manager, ['vercube'], tarballs);

    const missing = run('node', ['--input-type=module', '-e', "await import('vercube/queue')"], bare);
    const message = (missing.stderr.match(/^.*Error.*$/m)?.[0] ?? missing.stderr).replaceAll(temp, '<tmp>');
    const code = missing.stderr.match(/code: '([^']+)'/)?.[1];

    write(
      join(bare, 'types.ts'),
      "import { QueueManager } from 'vercube/queue';\nexport const manager: QueueManager | null = null;\n",
    );
    write(join(bare, 'tsconfig.json'), tsconfig('bundler'));

    const lax = run(tsc, ['-p', '.'], bare);
    const strict = run(tsc, ['-p', '.', '--skipLibCheck', 'false'], bare);

    console.log(`  missing    runtime: ${code}: ${message}`);
    console.log(`             tsc, skipLibCheck: ${firstLines(lax.stdout + lax.stderr).replaceAll(temp, '<tmp>') || 'no error'}`);
    console.log(
      `             tsc, no skipLibCheck: ${firstLines(strict.stdout + strict.stderr).replaceAll(temp, '<tmp>') || 'no error'}\n`,
    );

    results[manager] = { proof, installed, fromRegistry, types, missing: { code, message } };
  }
} finally {
  if (keep) {
    console.log(`Kept ${temp}`);
  } else {
    rmSync(temp, { recursive: true, force: true });
  }
}

const failed = Object.entries(results).filter(
  ([, { proof, installed, fromRegistry, types }]) =>
    fromRegistry ||
    Object.entries(proof).some(([key, value]) => key.startsWith('same') && value !== true) ||
    proof.status !== 200 ||
    proof.consumerHandled[0] !== 'u1:true' ||
    Object.values(installed).some((count) => count !== 1) ||
    Object.values(types).some((value) => value !== 'ok'),
);

console.log(
  failed.length === 0
    ? '✔ Same instances, working injection and types on pnpm and npm'
    : `✖ Failed on ${failed.map(([name]) => name).join(', ')}`,
);
process.exitCode = failed.length === 0 && Object.keys(results).length === 2 ? 0 : 1;
