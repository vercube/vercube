import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Destroy, Inject } from '@vercube/di';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BasePlugin, Controller, createApp, Get, loadVercubeConfig } from '../../src';
import type { App } from '../../src';

class Greeter {
  public greet(): string {
    return 'real';
  }
}

@Controller('/greet')
class GreetController {
  @Inject(Greeter)
  private gGreeter!: Greeter;

  @Get('/')
  public greet(): string {
    return this.gGreeter.greet();
  }
}

class BindsGreeterPlugin extends BasePlugin {
  public override name = 'BindsGreeterPlugin';

  public override use(app: App): void {
    app.container.bind(Greeter);
  }
}

describe('createApp options', () => {
  describe('beforeInitialize', () => {
    it('should replace a binding a plugin made', async () => {
      const app = await createApp({
        configFile: false,
        cfg: { requestLogging: false },
        setup: (instance) => {
          instance.container.bindMock(Greeter, { greet: () => 'too early' });
          instance.container.bind(GreetController);
          instance.addPlugin(BindsGreeterPlugin);
        },
        beforeInitialize: (instance) => {
          instance.container.bindMock(Greeter, { greet: () => 'mock' });
        },
      });

      const response = await app.fetch(new Request('http://localhost/greet'));

      expect(await response.json()).toBe('mock');
    });

    it('should run after plugins and before the container is initialised', async () => {
      const order: string[] = [];

      class OrderPlugin extends BasePlugin {
        public override name = 'OrderPlugin';

        public override use(): void {
          order.push('plugin');
        }
      }

      class Eager {
        constructor() {
          order.push('initialize');
        }
      }

      await createApp({
        configFile: false,
        setup: (instance) => {
          instance.container.bind(Eager);
          instance.addPlugin(OrderPlugin);
          order.push('setup');
        },
        beforeInitialize: () => {
          order.push('beforeInitialize');
        },
      });

      expect(order).toEqual(['setup', 'plugin', 'beforeInitialize', 'initialize']);
    });
  });

  describe('configFile', () => {
    let dir: string;
    const previous = process.env.VERCUBE_CONFIG_FILE_TEST;

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'vercube-config-'));
      await writeFile(join(dir, 'vercube.config.mjs'), "export default { runtime: { fromFile: 'yes' } };\n");
      await writeFile(join(dir, '.env'), 'VERCUBE_CONFIG_FILE_TEST=loaded\n');
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });

      if (previous === undefined) {
        delete process.env.VERCUBE_CONFIG_FILE_TEST;
      } else {
        process.env.VERCUBE_CONFIG_FILE_TEST = previous;
      }
    });

    it('should read neither the config file nor .env when false', async () => {
      delete process.env.VERCUBE_CONFIG_FILE_TEST;

      // the cwd points at the project, `configFile: false` still wins
      const config = await loadVercubeConfig({ logLevel: 'error' }, { cwd: dir, configFile: false });

      expect(config.logLevel).toBe('error');
      expect(config.server?.port).toBe(3000);
      expect(config.runtime).toEqual({});
      expect(process.env.VERCUBE_CONFIG_FILE_TEST).toBeUndefined();
    });

    it('should boot from the defaults when false', async () => {
      const app = await createApp({ configFile: false, cfg: { logLevel: 'error' } });

      expect(app.config.logLevel).toBe('error');
      expect(app.config.server?.port).toBe(3000);
    });

    it('should load both from the cwd it is given', async () => {
      delete process.env.VERCUBE_CONFIG_FILE_TEST;

      const app = await createApp({ configFile: { cwd: dir } });

      expect(app.config).toMatchObject({ server: { port: 3000 } });
      expect((app as unknown as { fConfig: { runtime: unknown } }).fConfig.runtime).toEqual({ fromFile: 'yes' });
      expect(process.env.VERCUBE_CONFIG_FILE_TEST).toBe('loaded');
    });
  });

  describe('close', () => {
    it('should run @Destroy() hooks and wait for the promises they return', async () => {
      let closed = false;

      class Connection {
        @Destroy()
        public async close(): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 50));
          closed = true;
        }
      }

      const app = await createApp({
        configFile: false,
        setup: (instance) => {
          instance.container.bind(Connection);
        },
      });

      await app.close();

      expect(closed).toBe(true);
      expect(app.container.disposed).toBe(true);
    });
  });
});
