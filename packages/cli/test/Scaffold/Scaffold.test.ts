import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';
import { RECIPES } from '../../src/Recipes/Catalog';
import {
  approveBuilds,
  formatSummary,
  pinVercubePackages,
  scaffoldProject,
  usePackageManager,
} from '../../src/Scaffold/Scaffold';
import { TEMPLATES } from '../../src/Scaffold/Templates';
import { API_TEMPLATE, apiTemplate } from '../Fixtures';
import type { InitPlan } from '../../src/Scaffold/Plan';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'vercube-scaffold-'));

  dirs.push(dir);

  return dir;
};

const plan = (overrides: Partial<InitPlan> = {}): InitPlan => ({
  dir: 'app',
  template: TEMPLATES[0],
  modules: [],
  deploy: 'node',
  packageManager: 'pnpm',
  answers: {},
  ...overrides,
});

describe('scaffoldProject', () => {
  it('should copy the template, pin @vercube packages and drop the template lockfile', async () => {
    const template = apiTemplate({ 'pnpm-lock.yaml': 'lockfileVersion: 9\n' });
    const dir = join(temp(), 'app');

    dirs.push(template);

    const summary = await scaffoldProject(plan(), {
      dir,
      version: '1.5.0',
      recipes: RECIPES,
      templateDir: template,
      install: false,
    });
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

    expect(pkg.dependencies['@vercube/core']).toBe('1.5.0');
    expect(pkg.devDependencies['@vercube/cli']).toBe('1.5.0');
    expect(existsSync(join(dir, 'pnpm-lock.yaml'))).toBe(false);
    expect(summary.applied).toEqual([]);
    // no modules: the template as it is, apart from the pinned versions
    expect(readFileSync(join(dir, 'src/boot/Container.ts'), 'utf8')).toBe(API_TEMPLATE['src/boot/Container.ts']);
  });

  it('should replace the contents of a directory with force, keeping its git history', async () => {
    const template = apiTemplate();
    const dir = join(temp(), 'app');

    dirs.push(template);
    mkdirSync(join(dir, 'src/jobs'), { recursive: true });
    mkdirSync(join(dir, '.git'), { recursive: true });
    writeFileSync(join(dir, 'src/jobs/Old.ts'), 'old');
    writeFileSync(join(dir, '.git/HEAD'), 'ref: refs/heads/main');

    await scaffoldProject(plan(), {
      dir,
      version: '1.5.0',
      recipes: RECIPES,
      templateDir: template,
      install: false,
      force: true,
    });

    expect(existsSync(join(dir, 'src/jobs/Old.ts'))).toBe(false);
    expect(existsSync(join(dir, '.git/HEAD'))).toBe(true);
    expect(existsSync(join(dir, 'src/index.ts'))).toBe(true);
  });

  it('should apply the modules, then the deploy target', async () => {
    const template = apiTemplate();
    const dir = join(temp(), 'app');

    dirs.push(template);

    const summary = await scaffoldProject(plan({ modules: ['cache'], deploy: 'aws-lambda' }), {
      dir,
      version: '1.5.0',
      recipes: RECIPES,
      templateDir: template,
      install: false,
    });

    expect(summary.applied).toEqual(['storage', 'cache', 'aws-lambda']);
    expect(summary.implied).toEqual(['storage']);
    expect(existsSync(join(dir, 'serverless.yml'))).toBe(true);
  });
});

describe('approveBuilds', () => {
  it('should add the approvals to pnpm-workspace.yaml, keeping what is there', () => {
    const root = temp();

    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\nallowBuilds:\n  esbuild: true\n');
    approveBuilds(root, ['serverless', 'esbuild']);

    expect(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')).toBe(
      'packages:\n  - apps/*\nallowBuilds:\n  esbuild: true\n  serverless: true\n',
    );
  });

  it('should be written for pnpm projects only', async () => {
    const template = apiTemplate();

    dirs.push(template);

    for (const packageManager of ['pnpm', 'npm']) {
      const dir = join(temp(), 'app');

      await scaffoldProject(plan({ deploy: 'aws-lambda', packageManager }), {
        dir,
        version: '1.5.0',
        recipes: RECIPES,
        templateDir: template,
        install: false,
      });

      expect(existsSync(join(dir, 'pnpm-workspace.yaml'))).toBe(packageManager === 'pnpm');
    }
  });
});

describe('usePackageManager', () => {
  const setup = (packageManager?: string) => {
    const root = temp();

    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', ...(packageManager ? { packageManager } : {}) }));

    return root;
  };

  it('should drop a packageManager field naming another one', () => {
    const root = setup('pnpm@12.14.0');

    usePackageManager(root, 'npm');

    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))).toEqual({ name: 'app' });
  });

  it('should keep the field for the package manager it names', () => {
    const root = setup('pnpm@12.14.0');

    usePackageManager(root, 'pnpm');

    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).packageManager).toBe('pnpm@12.14.0');
  });

  it('should give yarn a node_modules linker', () => {
    const root = setup('pnpm@12.14.0');

    usePackageManager(root, 'yarn');

    expect(readFileSync(join(root, '.yarnrc.yml'), 'utf8')).toBe('nodeLinker: node-modules\n');
  });
});

describe('pinVercubePackages', () => {
  it('should pin every package.json of a workspace, and only @vercube packages', () => {
    const root = temp();
    const write = (file: string, json: object) => {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), JSON.stringify(json));
    };

    write('package.json', { devDependencies: { oxlint: '^1.0.0' } });
    write('apps/api/package.json', { dependencies: { '@vercube/core': 'latest', zod: '^4.0.0' } });
    write('apps/web/package.json', { dependencies: { '@vercube/client': 'latest' } });

    pinVercubePackages(root, '1.5.0');

    const read = (file: string) => JSON.parse(readFileSync(join(root, file), 'utf8'));

    expect(read('apps/api/package.json').dependencies).toEqual({ '@vercube/core': '1.5.0', zod: '^4.0.0' });
    expect(read('apps/web/package.json').dependencies).toEqual({ '@vercube/client': '1.5.0' });
    // untouched, not rewritten
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(JSON.stringify({ devDependencies: { oxlint: '^1.0.0' } }));
  });
});

describe('formatSummary', () => {
  it('should say what was created, what to start and what to run next', () => {
    const lines = formatSummary(
      plan({ modules: ['cache'], deploy: 'aws-lambda', packageManager: 'npm' }),
      {
        applied: ['storage', 'cache', 'aws-lambda'],
        implied: ['storage'],
        created: [],
        updated: [],
        dependencies: [],
        services: ['redis'],
        notes: ['Start the local services with `docker compose up -d`'],
        builds: [],
      },
      'my-app',
    );

    expect(lines).toEqual([
      'Created my-app from the api template',
      'Modules: storage, cache (storage added because another module needs it)',
      'Deploy target: aws-lambda',
      'Start the local services with `docker compose up -d`',
      'Next: cd my-app && npm run dev',
    ]);
  });

  it('should use each package manager’s own command', () => {
    const next = (packageManager: string) =>
      formatSummary(
        plan({ packageManager }),
        { applied: [], implied: [], created: [], updated: [], dependencies: [], services: [], notes: [], builds: [] },
        '.',
      ).at(-1);

    expect(next('pnpm')).toBe('Next: pnpm dev');
    expect(next('bun')).toBe('Next: bun run dev');
    expect(next('deno')).toBe('Next: deno task dev');
  });
});
