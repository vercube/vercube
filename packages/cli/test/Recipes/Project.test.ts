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
    const api = JSON.stringify({ dependencies: { '@vercube/core': 'latest' } });
    const fullstack = project({ 'apps/api/package.json': api, 'apps/web/package.json': '{}' });
    const workspace = project({ 'apps/api/package.json': api });

    expect(fullstack.layout).toBe('fullstack');
    expect(fullstack.appDir).toBe(join(fullstack.root, 'apps/api'));
    expect(fullstack.webDir).toBe(join(fullstack.root, 'apps/web'));
    expect(workspace.layout).toBe('workspace');
    expect(workspace.webDir).toBeNull();
  });

  it('should refuse a package that is not a Vercube app', () => {
    expect(() => project({ 'package.json': JSON.stringify({ name: 'other', dependencies: { express: '^5.0.0' } }) })).toThrow(
      'package.json does not depend on @vercube/core',
    );
  });

  it('should refuse a file outside the application', () => {
    const api = project();

    expect(() => api.createFile('../../outside.txt', 'x')).toThrow('outside the application');
    expect(() => api.read('/etc/hosts')).not.toThrow();
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

    it('should move a devDependency a recipe needs at runtime', () => {
      const api = project();

      api.addDependencies({ oxlint: '^9.0.0' });
      api.addDependencies({ typescript: '^9.0.0' }, { dev: true });

      const pkg = JSON.parse(read(api, 'package.json'));

      expect(pkg.dependencies.oxlint).toBe('^1.92.0');
      expect(pkg.devDependencies.oxlint).toBeUndefined();
      expect(pkg.devDependencies.typescript).toBe('^7.0.2');
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

    it('should write a placeholder to .env.example where the value is a secret', () => {
      const api = project();

      api.addEnv({ API_KEY: 'generated-secret' }, 'Auth', { API_KEY: 'change-me' });

      expect(read(api, '.env')).toBe('# Auth\nAPI_KEY=generated-secret\n');
      expect(read(api, '.env.example')).toBe('# Auth\nAPI_KEY=change-me\n');
    });

    it('should refuse a value spanning lines', () => {
      expect(() => project().addEnv({ A: 'x\nADMIN=true' })).toThrow('spans lines');
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
      expect(config).toContain(`import { defineConfig, withPluginOptions } from '@vercube/core'`);
      expect(config.replaceAll(/\s+/g, '').replaceAll(/,([)\]}])/g, '$1')).toContain(
        'plugins:[withPluginOptions(QueuePlugin,{strategies:[{strategy:MemoryStrategy}]})]',
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

    it('should refuse a plugins option it cannot extend', () => {
      const api = project({
        'vercube.config.ts': `import { defineConfig } from '@vercube/core';\n\nconst plugins = [];\n\nexport default defineConfig({ plugins });\n`,
      });

      expect(() => api.addPlugin({ name: 'QueuePlugin', from: '@vercube/queue' })).toThrow('is not an array literal');
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

    it('should refuse a name imported from another module', () => {
      const api = project({
        'src/boot/Container.ts': `import { Container } from '@vercube/di';\nimport { Jobs } from './legacy';\n\nexport function useContainer(container: Container): void {}\n`,
      });

      expect(() => api.bind({ name: 'Jobs', from: '@/jobs/Jobs' })).toThrow(
        'Jobs is already imported from ./legacy, not @/jobs/Jobs',
      );
    });

    it('should bind in the exported setup, not a local helper', () => {
      const api = project({
        'src/boot/Container.ts': `import { Container } from '@vercube/di';\n\nfunction useContainer(container: Container): void {}\n\nexport function setup(container: Container): void {\n  useContainer(container);\n}\n`,
      });

      api.bind({ name: 'Jobs', from: '@/jobs/Jobs' });

      expect(read(api, 'src/boot/Container.ts')).toMatch(
        /export function setup\(container: Container\): void \{\s*useContainer\(container\);\s*container\.bind\(Jobs\);/,
      );
    });

    it('should fail clearly when there is no setup function', () => {
      const api = project({ 'src/boot/Container.ts': `export const nothing = 1;\n` });

      expect(() => api.bind({ name: 'Jobs', from: '@/Jobs' })).toThrow(/Bind Jobs yourself with container\.bind\(Jobs\)/);
    });
  });

  describe('addToContainer', () => {
    it('should add a statement once, with its imports', () => {
      const api = project();
      const mount = 'void container.get(StorageManager).mount({ storage: MemoryStorage });';
      const imports = { StorageManager: '@vercube/storage', MemoryStorage: '@vercube/storage/drivers/MemoryStorage' };

      api.addToContainer('container.bind(StorageManager);', imports);
      api.addToContainer(mount, imports);
      api.addToContainer('void container.get(StorageManager).mount({storage: MemoryStorage})', imports);
      // a different literal is a different statement
      api.addToContainer("void container.get(StorageManager).mount({ name: 'a b', storage: MemoryStorage });", imports);
      api.addToContainer("void container.get(StorageManager).mount({ name: 'ab', storage: MemoryStorage });", imports);

      const container = read(api, 'src/boot/Container.ts');

      expect(container.match(/\.mount\(/g)).toHaveLength(3);
      expect(container.indexOf('container.bind(StorageManager)')).toBeLessThan(container.indexOf('.mount('));
      expect(container).toContain(`import { StorageManager } from '@vercube/storage'`);
    });

    it('should use the setup function’s own parameter name', () => {
      const api = project({
        'src/boot/Container.ts': `import { Container } from '@vercube/di';\n\nexport function setup(c: Container): void {}\n`,
      });

      api.addToContainer("container.get(X).configure({ container: 1, label: 'container' });", { X: '@/X' });

      // the variable is renamed; a property name and a string are not
      expect(read(api, 'src/boot/Container.ts')).toContain("c.get(X).configure({ container: 1, label: 'container' })");
    });
  });

  describe('addToEntry', () => {
    it('should add a statement before createApp() once', () => {
      const api = project();
      const start = 'await startNodeTelemetry({ serviceName: "api" });';

      api.addToEntry(start, { position: 'before-create-app', imports: { startNodeTelemetry: '@vercube/telemetry/sdk' } });
      api.addToEntry(start, { position: 'before-create-app' });

      const entry = read(api, 'src/index.ts');

      expect(entry.match(/startNodeTelemetry\(/g)).toHaveLength(1);
      expect(entry.indexOf('startNodeTelemetry(')).toBeLessThan(entry.indexOf('createApp('));
      expect(entry).toContain(`import { startNodeTelemetry } from '@vercube/telemetry/sdk'`);
    });

    it('should add a statement at the end', () => {
      const api = project();

      api.addToEntry('export const handler = toServerlessHandler(app);', {
        imports: { toServerlessHandler: '@vercube/serverless/aws-lambda' },
      });

      expect(read(api, 'src/index.ts').trimEnd().endsWith('export const handler = toServerlessHandler(app);')).toBe(true);
    });

    it('should find createApp() by its call, not by its text', () => {
      const api = project({
        'src/index.ts': `const note = 'createApp( is called below';\nconst app = await createApp ();\n`,
      });

      api.addToEntry('init();', { position: 'before-create-app' });

      expect(read(api, 'src/index.ts')).toMatch(/note = [^\n]+\n+init\(\);\s*const app/);
    });

    it('should fail clearly without createApp()', () => {
      const api = project({ 'src/index.ts': 'export {};\n' });

      expect(() => api.addToEntry('init();', { position: 'before-create-app' })).toThrow('Could not find the createApp() call');
    });
  });

  it('should edit a JSON file and refuse one with comments', () => {
    const api = project({ 'with-comments.json': '{ // no\n}' });

    api.updateJson('tsconfig.json', (json) => {
      json.include.push('./test/**/*.ts');
      return true;
    });

    expect(JSON.parse(read(api, 'tsconfig.json')).include).toEqual(['./src/**/*.ts', './test/**/*.ts']);
    expect(() => api.updateJson('with-comments.json', () => true)).toThrow('not plain JSON');
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
