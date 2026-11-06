import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';
import { Project } from '../../src/Recipes/Project';
import { RecipeError } from '../../src/Recipes/RecipeError';
import { apiTemplate } from '../Fixtures';

const dirs: string[] = [];

function project(overrides?: Record<string, string | null>): Project {
  const dir = apiTemplate(overrides);

  dirs.push(dir);

  return new Project(dir, { version: '1.5.0' });
}

const read = (project: Project, file: string): string => readFileSync(join(project.root, file), 'utf8');

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Project', () => {
  it('should find the app of an api project', () => {
    const api = project();

    expect(api.layout).toBe('api');
    expect(api.appDir).toBe(api.root);
    expect(api.webDir).toBeNull();
  });

  it('should find the apps of a fullstack project', () => {
    const fullstack = project({ 'apps/api/package.json': '{}', 'apps/web/package.json': '{}' });

    expect(fullstack.layout).toBe('fullstack');
    expect(fullstack.appDir).toBe(join(fullstack.root, 'apps/api'));
    expect(fullstack.webDir).toBe(join(fullstack.root, 'apps/web'));
  });

  it('should refuse a directory without a package.json', () => {
    expect(() => project({ 'package.json': null })).toThrow(RecipeError);
  });

  describe('addDependencies', () => {
    it('should pin @vercube packages to the CLI version and keep what is there', () => {
      const api = project();

      api.addDependencies({ '@vercube/queue': 'latest', bullmq: '^5.0.0', '@vercube/core': '^9.9.9' });
      api.addDependencies({ vitest: '^4.0.0' }, { dev: true });

      const pkg = JSON.parse(read(api, 'package.json'));

      expect(pkg.dependencies).toMatchObject({ '@vercube/queue': '1.5.0', bullmq: '^5.0.0', '@vercube/core': 'latest' });
      expect(Object.keys(pkg.dependencies)).toEqual(Object.keys(pkg.dependencies).toSorted());
      expect(pkg.devDependencies.vitest).toBe('^4.0.0');
      expect(api.summary.dependencies).toEqual(['@vercube/queue', 'bullmq', 'vitest']);
    });

    it('should not add a devDependency as a dependency', () => {
      const api = project();

      api.addDependencies({ oxlint: '^9.0.0' });

      expect(JSON.parse(read(api, 'package.json')).dependencies.oxlint).toBeUndefined();
    });
  });

  it('should add a script once', () => {
    const api = project();

    api.addScript('test', 'vitest run');
    api.addScript('test', 'jest');

    expect(JSON.parse(read(api, 'package.json')).scripts.test).toBe('vitest run');
  });

  describe('addEnv', () => {
    it('should write .env.example and .env, keeping values already set', () => {
      const api = project({ '.env': 'REDIS_URL=redis://prod:6379\n' });

      api.addEnv({ REDIS_URL: 'redis://localhost:6379', QUEUE_PREFIX: 'app' }, 'Queue');
      api.addEnv({ REDIS_URL: 'redis://other:6379' }, 'Cache');

      expect(read(api, '.env.example')).toBe('# Queue\nREDIS_URL=redis://localhost:6379\nQUEUE_PREFIX=app\n');
      expect(read(api, '.env')).toBe('REDIS_URL=redis://prod:6379\n\n# Queue\nQUEUE_PREFIX=app\n');
    });
  });

  describe('addComposeService', () => {
    it('should add a service once, next to the ones there', () => {
      const api = project({ 'docker-compose.yml': 'services:\n  db:\n    image: postgres:17-alpine\n' });

      api.addComposeService('redis', { image: 'redis:7-alpine', ports: ['6379:6379'] });
      api.addComposeService('redis', { image: 'redis:6' });

      const compose = read(api, 'docker-compose.yml');

      expect(compose).toContain('db:');
      expect(compose).toContain('image: redis:7-alpine');
      expect(compose).not.toContain('redis:6');
      expect(api.summary.services).toEqual(['redis']);
    });
  });

  describe('addPlugin', () => {
    it('should import the plugin and list it with its options', () => {
      const api = project();

      api.addPlugin({
        name: 'QueuePlugin',
        from: '@vercube/queue',
        options: '{ strategies: [{ strategy: MemoryStrategy }] }',
        imports: { MemoryStrategy: '@vercube/queue/strategies/MemoryStrategy' },
      });

      const config = read(api, 'vercube.config.ts');

      expect(config).toContain(`import { QueuePlugin } from '@vercube/queue'`);
      expect(config).toContain(`import { MemoryStrategy } from '@vercube/queue/strategies/MemoryStrategy'`);
      // the project's formatter tidies the layout after install
      expect(config.replaceAll(/\s+/g, '').replaceAll(',]', ']')).toContain(
        'plugins:[[QueuePlugin,{strategies:[{strategy:MemoryStrategy}]}]]',
      );
      // the rest of the file is untouched
      expect(config).toContain("logLevel: 'debug'");
    });

    it('should add nothing for a plugin already listed, with or without options', () => {
      const api = project({
        'vercube.config.ts': `import { defineConfig } from '@vercube/core';\nimport { DevtoolsPlugin } from '@vercube/devtools';\n\nexport default defineConfig({\n  plugins: [DevtoolsPlugin],\n});\n`,
      });
      const before = read(api, 'vercube.config.ts');

      api.addPlugin({ name: 'DevtoolsPlugin', from: '@vercube/devtools', options: '{ path: "/x" }' });

      expect(read(api, 'vercube.config.ts')).toBe(before);
      expect(api.summary.updated).toEqual([]);
    });

    it('should fail clearly without a config object', () => {
      const api = project({ 'vercube.config.ts': `const config = {};\n\nexport default config;\n` });
      const noConfig = project({ 'vercube.config.ts': null });

      expect(() => api.addPlugin({ name: 'P', from: 'p' })).toThrow(/must export its config/);
      expect(() => noConfig.addPlugin({ name: 'P', from: 'p' })).toThrow('vercube.config.ts not found');
    });
  });

  it('should set a config option once', () => {
    const api = project();

    api.setConfig('health', 'true');
    api.setConfig('health', 'false');

    expect(read(api, 'vercube.config.ts')).toMatch(/health: true/);
  });

  describe('bind', () => {
    it('should import the class and bind it in the container setup', () => {
      const api = project();

      api.bind({ name: 'EmailJobs', from: '@/jobs/EmailJobs' });
      api.bind({ name: 'EmailJobs', from: '@/jobs/EmailJobs' });
      api.bind({ name: 'HomeController', from: '@/controller/HomeController', default: true });

      const container = read(api, 'src/boot/Container.ts');

      expect(container).toContain(`import { EmailJobs } from '@/jobs/EmailJobs'`);
      expect(container).toContain(`import HomeController from '@/controller/HomeController'`);
      expect(container.match(/container\.bind\(EmailJobs\)/g)).toHaveLength(1);
      expect(container.indexOf('container.bind(FooController)')).toBeLessThan(container.indexOf('container.bind(EmailJobs)'));
    });

    it('should find a setup function under another name and parameter', () => {
      const api = project({
        'src/boot/Container.ts': `import { Container } from '@vercube/di';\n\nexport function setup(c: Container): void {}\n`,
      });

      api.bind({ name: 'Jobs', from: '@/Jobs' });

      expect(read(api, 'src/boot/Container.ts')).toContain('c.bind(Jobs)');
    });

    it('should fail clearly when there is no setup function', () => {
      const api = project({ 'src/boot/Container.ts': `export const nothing = 1;\n` });

      expect(() => api.bind({ name: 'Jobs', from: '@/Jobs' })).toThrow(/Bind Jobs yourself with container\.bind\(Jobs\)/);
    });
  });

  it('should create a file once and never overwrite the user’s', () => {
    const api = project();

    expect(api.createFile('src/jobs/EmailJobs.ts', 'export class EmailJobs {}\n')).toBe(true);
    writeFileSync(join(api.root, 'src/jobs/EmailJobs.ts'), 'export class EmailJobs { mine = 1 }\n');
    expect(api.createFile('src/jobs/EmailJobs.ts', 'export class EmailJobs {}\n')).toBe(false);

    expect(read(api, 'src/jobs/EmailJobs.ts')).toContain('mine');
    expect(api.summary.created).toEqual(['src/jobs/EmailJobs.ts']);
  });

  it('should keep notes once', () => {
    const api = project();

    api.note('docker compose up -d');
    api.note('docker compose up -d');

    expect(api.summary.notes).toEqual(['docker compose up -d']);
  });
});
