import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controller, createApp, Get, IntrospectionRegistry } from '../../src';
import { defaultConfig } from '../../src/Config/DefaultConfig';
import type { App } from '../../src';

@Controller('/reports')
class ReportsController {
  @Get('/')
  public list(): unknown {
    return [];
  }
}

let app: App;
let directory: string;

describe('App.inspect', () => {
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'inspect-'));
    app = await createApp({
      cfg: { ...defaultConfig, requestLogging: false },
      setup: (instance) => instance.container.bind(ReportsController),
    });
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    delete process.env.VERCUBE_INSPECT;
    delete process.env.VERCUBE_INSPECT_OUT;
  });

  it('describes every section by default', async () => {
    const described = (await app.inspect()) as Record<string, unknown>;

    expect(Object.keys(described)).toEqual(expect.arrayContaining(['routes', 'config', 'container', 'plugins']));
  });

  it('describes a single section when asked', async () => {
    const section = (await app.inspect('routes')) as { id: string; data: unknown[] };

    expect(section.id).toBe('routes');
    expect(section.data.length).toBeGreaterThan(0);
  });

  it('returns undefined for a section nothing registered', async () => {
    await expect(app.inspect('nope')).resolves.toBeUndefined();
  });

  it('prints to stdout and stops before binding a port', async () => {
    process.env.VERCUBE_INSPECT = 'routes';
    const written: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });

    await app.listen();
    write.mockRestore();

    expect(JSON.parse(written.join(''))).toHaveProperty('routes');
  });

  it('writes to a file when the CLI asks for one', async () => {
    const output = join(directory, 'out.json');
    process.env.VERCUBE_INSPECT = '*';
    process.env.VERCUBE_INSPECT_OUT = output;

    // The application is free to log while it boots, so the payload cannot
    // share stdout with it.
    await app.listen();

    expect(Object.keys(JSON.parse(readFileSync(output, 'utf8')))).toContain('container');
  });

  it('skips a requested section that does not exist', async () => {
    const output = join(directory, 'partial.json');
    process.env.VERCUBE_INSPECT = 'routes,nope';
    process.env.VERCUBE_INSPECT_OUT = output;

    await app.listen();

    expect(Object.keys(JSON.parse(readFileSync(output, 'utf8')))).toEqual(['routes']);
  });

  it('reports routes to the dev server and again when they change', async () => {
    const sent: { type: string; routes: { id: string }[]; discovery: unknown }[] = [];
    const original = process.send;

    process.env.VERCUBE_DEV_ROUTES = '1';
    process.env.VERCUBE_LISTEN = '0';
    process.send = ((message: (typeof sent)[number]) => sent.push(message) > 0) as typeof process.send;

    try {
      await app.listen();
      await vi.waitFor(() => expect(sent).toHaveLength(1));

      expect(sent[0].type).toBe('vercube:routes');
      expect(sent[0].routes.map((route) => route.id)).toContain('GET /reports/');
      expect(sent[0].discovery).toBeNull();

      app.container.get(IntrospectionRegistry).touch('routes');
      await vi.waitFor(() => expect(sent).toHaveLength(2));

      // a controller can move without any route changing
      app.container.get(IntrospectionRegistry).touch('discovery');
      await vi.waitFor(() => expect(sent).toHaveLength(3));
    } finally {
      process.send = original;
      delete process.env.VERCUBE_DEV_ROUTES;
      delete process.env.VERCUBE_LISTEN;
    }
  });

  it('keeps serving when the routes cannot be reported, and never reports them as empty', async () => {
    const sent: unknown[] = [];
    const original = process.send;
    const registry = app.container.get(IntrospectionRegistry);
    const describe = vi.spyOn(registry, 'describe').mockRejectedValue(new Error('provider failed'));

    process.env.VERCUBE_DEV_ROUTES = '1';
    process.env.VERCUBE_LISTEN = '0';
    process.send = ((message: unknown) => sent.push(message) > 0) as typeof process.send;

    try {
      await expect(app.listen()).resolves.toBeUndefined();

      describe.mockResolvedValue(undefined);
      registry.touch('routes');
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sent).toEqual([]);
    } finally {
      process.send = original;
      delete process.env.VERCUBE_DEV_ROUTES;
      delete process.env.VERCUBE_LISTEN;
    }
  });
});
