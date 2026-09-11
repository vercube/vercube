import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createContext, setupContext } from '../src/context';

let baseDir: string;

beforeEach(() => {
  baseDir = join(tmpdir(), `vercube-vite-context-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(baseDir, { recursive: true });
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

function write(sub: string, name: string, code: string): void {
  const dir = join(baseDir, sub);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), code);
}

describe('createContext', () => {
  it('initializes an empty context with defaults', () => {
    const ctx = createContext({});

    expect(ctx.controllers).toEqual([]);
    expect(ctx.services).toEqual([]);
    expect(ctx.scanDirs).toEqual([]);
    expect(ctx.dev).toBe(true);
    expect(ctx.hasClient).toBe(false);
    expect(ctx.serverEntry).toMatch(/node_modules\/\.vercube\/server-entry\.[0-9a-f]{8}\.mjs$/);
  });

  it('keeps the server entry path stable for the same root', () => {
    expect(createContext({ rootDir: '/app' }).serverEntry).toBe(createContext({ rootDir: '/app' }).serverEntry);
  });
});

describe('setupContext', () => {
  it('resolves scan dirs, detects a client, scans controllers and writes the server entry', async () => {
    writeFileSync(join(baseDir, 'index.html'), '<html></html>');
    write('src/Controllers', 'HelloController.ts', `@Controller('/hello') export class HelloController { @Get('/') index() {} }`);

    const ctx = createContext({ scanDirs: ['src'] });
    await setupContext(ctx, { root: baseDir, dev: true });

    expect(ctx.root).toBe(baseDir);
    expect(ctx.dev).toBe(true);
    expect(ctx.hasClient).toBe(true);
    expect(ctx.scanDirs).toEqual([join(baseDir, 'src')]);
    expect(ctx.controllers.map((c) => c.importClassName)).toEqual(['HelloController']);
    expect(existsSync(ctx.serverEntry)).toBe(true);
    expect(readFileSync(ctx.serverEntry, 'utf8')).toContain('app.container.bind(HelloController);');
  });

  it('resolves a custom rootDir and setup file relative to Vite root', async () => {
    const appRoot = join(baseDir, 'app');
    mkdirSync(appRoot, { recursive: true });
    write('app/src', 'PingController.ts', `@Controller('/ping') export class PingController { @Get('/') ping() {} }`);
    writeFileSync(join(appRoot, 'setup.ts'), `export default async () => {};`);

    const ctx = createContext({ rootDir: 'app', setupFile: 'setup.ts' });
    await setupContext(ctx, { root: baseDir, dev: false });

    expect(ctx.root).toBe(appRoot);
    expect(ctx.dev).toBe(false);
    expect(ctx.hasClient).toBe(false);
    expect(ctx.setupFile).toBe(join(appRoot, 'setup.ts'));
    expect(readFileSync(ctx.serverEntry, 'utf8')).toContain('await __vercubeSetup__(app);');
  });

  it('does not let a second server reaching the project through another path overwrite the entry', async () => {
    // A symlink stands in for a container mounting the same checkout at another path.
    const project = join(baseDir, 'project');
    const mounted = join(baseDir, 'mounted');
    mkdirSync(project, { recursive: true });
    symlinkSync(project, mounted);
    write('project/src', 'HelloController.ts', `@Controller('/hello') export class HelloController { @Get('/') index() {} }`);

    const host = createContext({});
    await setupContext(host, { root: project, dev: true });
    const container = createContext({});
    await setupContext(container, { root: mounted, dev: true });

    expect(container.serverEntry).not.toBe(host.serverEntry);
    expect(readFileSync(host.serverEntry, 'utf8')).toContain(join(project, 'src'));
    expect(readFileSync(host.serverEntry, 'utf8')).not.toContain(mounted);
  });
});
