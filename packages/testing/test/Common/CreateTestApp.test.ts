import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BasePlugin, Controller, Get, Param } from '@vercube/core';
import { Destroy, Inject } from '@vercube/di';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TestingError } from '../../src';
import type { App } from '@vercube/core';

class Greeter {
  public greet(name: string): string {
    return `hello ${name}`;
  }
}

@Controller('/greet')
class GreetController {
  @Inject(Greeter)
  private gGreeter!: Greeter;

  @Get('/:name')
  public greet(@Param('name') name: string): { message: string } {
    return { message: this.gGreeter.greet(name) };
  }
}

class BindsGreeterPlugin extends BasePlugin {
  public override name = 'BindsGreeterPlugin';

  public override use(app: App): void {
    app.container.bind(Greeter);
  }
}

describe('createTestApp', () => {
  it('should serve a controller with its providers', async () => {
    const app = await createTestApp({ controllers: [GreetController], providers: [Greeter] });

    const res = await app.get('/greet/ada').expect(200);

    expect(await res.json()).toEqual({ message: 'hello ada' });

    await app.close();
  });

  it('should bind a provider under another key', async () => {
    class LoudGreeter extends Greeter {
      public override greet(name: string): string {
        return `HELLO ${name.toUpperCase()}`;
      }
    }

    const app = await createTestApp({ controllers: [GreetController], providers: [[Greeter, LoudGreeter]] });

    expect(await (await app.get('/greet/ada')).json()).toEqual({ message: 'HELLO ADA' });

    await app.close();
  });

  it('should close once however many times it is called', async () => {
    let destroyed = 0;

    class Service {
      @Destroy()
      public destroy(): void {
        destroyed++;
      }
    }

    const app = await createTestApp({ providers: [Service] });

    await Promise.all([app.close(), app.close()]);
    await app.close();

    expect(destroyed).toBe(1);
  });

  it('should close at the end of an await using block', async () => {
    let destroyed = false;

    class Service {
      @Destroy()
      public destroy(): void {
        destroyed = true;
      }
    }

    {
      await using app = await createTestApp({ providers: [Service] });
      expect(app.resolve(Service)).toBeInstanceOf(Service);
    }

    expect(destroyed).toBe(true);
  });

  it('should refuse requests after close', async () => {
    const app = await createTestApp({ controllers: [GreetController], providers: [Greeter] });
    await app.close();

    await expect(app.get('/greet/ada')).rejects.toThrow('was sent after app.close()');
  });

  it('should wait for the promises @Destroy() hooks return', async () => {
    let closed = false;

    class Connection {
      @Destroy()
      public async close(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 50));
        closed = true;
      }
    }

    const app = await createTestApp({ providers: [Connection] });
    await app.close();

    expect(closed).toBe(true);
  });

  it('should expose the container', async () => {
    const app = await createTestApp({ providers: [Greeter] });

    expect(app.resolve(Greeter).greet('x')).toBe('hello x');
    expect(app.resolveOptional(class Unbound {})).toBeNull();
    expect(app.container).toBe(app.app.container);

    await app.close();
  });

  it('should apply the test defaults under the config option', async () => {
    const app = await createTestApp({ config: { logLevel: 'warn' } });

    expect(app.app.config.requestLogging).toBe(false);
    expect(app.app.config.logLevel).toBe('warn');

    await app.close();
  });

  describe('overrides', () => {
    it('should win over a binding a plugin made', async () => {
      const app = await createTestApp({
        controllers: [GreetController],
        plugins: [BindsGreeterPlugin],
        overrides: [[Greeter, { greet: () => 'fake' }]],
      });

      expect(await (await app.get('/greet/ada')).json()).toEqual({ message: 'fake' });

      await app.close();
    });

    it('should bind a class override as a singleton', async () => {
      class FakeGreeter {
        public greet(): string {
          return 'class fake';
        }
      }

      const app = await createTestApp({
        controllers: [GreetController],
        plugins: [BindsGreeterPlugin],
        overrides: [[Greeter, FakeGreeter]],
      });

      expect(await (await app.get('/greet/ada')).json()).toEqual({ message: 'class fake' });
      expect(app.resolve(Greeter)).toBeInstanceOf(FakeGreeter);

      await app.close();
    });

    it('should wrap object overrides with stub() when strict', async () => {
      class Repository {
        public find(): string {
          return 'real';
        }

        public save(): void {}
      }

      const app = await createTestApp({
        providers: [Repository],
        overrides: [[Repository, { find: () => 'fake' }]],
        strictOverrides: true,
      });

      const repository = app.resolve(Repository);

      expect(repository.find()).toBe('fake');
      expect(() => repository.save()).toThrow('Repository.save is not stubbed');

      await app.close();
    });

    it('should refuse overrides after boot', async () => {
      const app = await createTestApp();

      expect(() => app.override()).toThrow(TestingError);
      expect(() => app.override()).toThrow(/`overrides` option/);

      await app.close();
    });
  });

  describe('isolation', () => {
    it('should keep the overrides of two apps apart', async () => {
      const [first, second] = await Promise.all([
        createTestApp({ controllers: [GreetController], overrides: [[Greeter, { greet: () => 'first' }]] }),
        createTestApp({ controllers: [GreetController], overrides: [[Greeter, { greet: () => 'second' }]] }),
      ]);

      expect(await (await first.get('/greet/a').expect(200)).json()).toEqual({ message: 'first' });
      expect(await (await second.get('/greet/a').expect(200)).json()).toEqual({ message: 'second' });

      // the controller path is not prefixed twice by the second app
      await first.get('/greet/greet/a').expect(404);
      await second.get('/greet/greet/a').expect(404);

      await Promise.all([first.close(), second.close()]);
    });
  });

  describe('boot failures', () => {
    it('should name the phase and keep the cause', async () => {
      const cause = new Error('plugin exploded');

      class FailingPlugin extends BasePlugin {
        public override name = 'FailingPlugin';

        public override use(): void {
          throw cause;
        }
      }

      const error = await createTestApp({ plugins: [FailingPlugin] }).catch((error_: unknown) => error_);

      expect(error).toBeInstanceOf(TestingError);
      expect((error as TestingError).phase).toBe('plugins');
      expect((error as TestingError).cause).toBe(cause);
      expect((error as TestingError).message).toBe('createTestApp() failed during plugins: plugin exploded');
    });

    it('should name the extension that failed', async () => {
      const error = await createTestApp({
        extensions: [
          {
            name: 'broken',
            beforeInitialize: () => {
              throw new Error('nope');
            },
          },
        ],
      }).catch((error_: unknown) => error_);

      expect((error as TestingError).phase).toBe('overrides');
      expect((error as TestingError).message).toBe('createTestApp() failed during overrides in extension "broken": nope');
    });

    it('should name the setup', async () => {
      const error = await createTestApp({
        setup: () => {
          throw new Error('bad setup');
        },
      }).catch((error_: unknown) => error_);

      expect((error as TestingError).message).toBe('createTestApp() failed during setup in setup(): bad setup');
    });
  });

  describe('extensions', () => {
    it('should run the hooks in order and tear down last first', async () => {
      const order: string[] = [];

      const extension = (name: string) => ({
        name,
        setup: () => void order.push(`${name}:setup`),
        beforeInitialize: () => void order.push(`${name}:beforeInitialize`),
        ready: () => void order.push(`${name}:ready`),
        teardown: () => void order.push(`${name}:teardown`),
      });

      const app = await createTestApp({
        extensions: [extension('a'), extension('b')],
        setup: () => void order.push('user:setup'),
      });

      await app.close();

      expect(order).toEqual([
        'a:setup',
        'b:setup',
        'user:setup',
        'a:beforeInitialize',
        'b:beforeInitialize',
        'a:ready',
        'b:ready',
        'b:teardown',
        'a:teardown',
      ]);
    });
  });

  describe('config file', () => {
    let dir: string;

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'vercube-testing-'));

      await writeFile(
        join(dir, 'vercube.config.mjs'),
        [
          'export default {',
          '  plugins: [',
          '    {',
          "      name: 'file-plugin',",
          '      setup(app) {',
          "        app.container.bindInstance(Symbol.for('vercube.testing.file-plugin'), true);",
          '      },',
          '    },',
          '  ],',
          '};',
          '',
        ].join('\n'),
      );

      await writeFile(join(dir, '.env'), 'VERCUBE_TESTING_FROM_ENV=1\n');
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
      delete process.env.VERCUBE_TESTING_FROM_ENV;
    });

    const marker = Symbol.for('vercube.testing.file-plugin');

    it('should read neither the config file nor .env by default', async () => {
      delete process.env.VERCUBE_TESTING_FROM_ENV;

      // run from the project root, as a test suite would be
      const cwd = process.cwd();
      process.chdir(dir);

      try {
        const app = await createTestApp();

        expect(app.resolveOptional(marker)).toBeNull();
        expect(process.env.VERCUBE_TESTING_FROM_ENV).toBeUndefined();

        await app.close();
      } finally {
        process.chdir(cwd);
      }
    });

    it('should load both when asked to', async () => {
      delete process.env.VERCUBE_TESTING_FROM_ENV;

      const app = await createTestApp({ configFile: { cwd: dir } });

      expect(app.resolveOptional(marker)).toBe(true);
      expect(process.env.VERCUBE_TESTING_FROM_ENV).toBe('1');

      await app.close();
    });
  });
});
