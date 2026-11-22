import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Controller, createApp, Get, loadVercubeConfig, provideConfig, RuntimeConfig } from '../../src';

@Controller('/provided')
class ProvidedController {
  @Get('/')
  public index(): { ok: boolean } {
    return { ok: true };
  }
}

describe('provideConfig()', () => {
  afterEach(() => {
    provideConfig(undefined);
  });

  it('stands in for the config file, under the overrides and over the defaults', async () => {
    provideConfig({ logLevel: 'error', server: { port: 4321 }, runtime: { region: 'weur' } as never });

    const config = await loadVercubeConfig({ server: { host: '0.0.0.0' } });

    expect(config.logLevel).toBe('error');
    expect(config.server).toMatchObject({ port: 4321, host: '0.0.0.0', runtime: 'node' });
    expect(config.runtime).toEqual({ region: 'weur' });
  });

  it('lets the overrides win', async () => {
    provideConfig({ logLevel: 'error' });

    expect((await loadVercubeConfig({ logLevel: 'warn' })).logLevel).toBe('warn');
  });

  it('is what createApp() uses without options', async () => {
    provideConfig({ requestLogging: false, logLevel: 'error', runtime: { region: 'weur' } as never });

    const app = await createApp({ setup: (instance) => instance.container.bind(ProvidedController) });

    expect(app.container.get(RuntimeConfig).runtimeConfig).toEqual({ region: 'weur' });
    expect((await app.fetch(new Request('http://localhost/provided'))).status).toBe(200);
  });

  it('is ignored when the caller turns the config file off', async () => {
    provideConfig({ server: { port: 4321 } });

    expect((await loadVercubeConfig({}, { configFile: false })).server?.port).toBe(3000);
  });

  it('is ignored when the caller names the directory to read the file from', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'vercube-provided-'));

    try {
      provideConfig({ server: { port: 4321 } });

      // an empty directory: the defaults, not what was provided
      expect((await loadVercubeConfig({}, { cwd })).server?.port).toBe(3000);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('is no longer used once it is cleared', async () => {
    provideConfig({ runtime: { region: 'weur' } as never });
    provideConfig(undefined);

    const app = await createApp({ cfg: { requestLogging: false, logLevel: 'error' }, configFile: { cwd: tmpdir() } });

    expect(app.container.get(RuntimeConfig).runtimeConfig).toEqual({});
  });
});
