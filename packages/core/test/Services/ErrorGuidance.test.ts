import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controller, createApp, defineErrorCatalog, describeError, ForbiddenError, Get, type App } from '../../src';

const Errors = defineErrorCatalog('SHOP', {
  PLAN_LIMIT: {
    message: ({ limit }: { limit: number }) => `Plan limit of ${limit} projects reached`,
    why: 'The workspace is on a plan with a fixed number of projects.',
    fix: 'Upgrade the workspace, or delete a project.',
    create: (message) => new ForbiddenError(message),
  },
  PUBLIC: {
    message: 'Coupon expired',
    why: 'The coupon was valid until yesterday.',
    fix: 'Ask for a new coupon.',
    expose: true,
    create: (message) => new ForbiddenError(message),
  },
  BROKEN: {
    message: ({ table }: { table: string }) => `Table ${table} is missing`,
    why: 'The migrations did not run.',
    fix: 'Run `pnpm migrate`.',
  },
  BROKEN_PUBLIC: {
    message: 'Maintenance',
    why: 'The shop is being upgraded.',
    fix: 'Come back in an hour.',
    status: 503,
    expose: true,
  },
});

@Controller('/errors')
class ErrorsController {
  @Get('/limit')
  public limit(): never {
    throw Errors.PLAN_LIMIT({ limit: 3 }, { internal: { workspace: 'ws_1' } });
  }

  @Get('/public')
  public public(): never {
    throw Errors.PUBLIC();
  }

  @Get('/broken')
  public broken(): never {
    throw Errors.BROKEN({ table: 'orders' }, { internal: { dsn: 'postgres://secret' } });
  }

  @Get('/broken-public')
  public brokenPublic(): never {
    throw Errors.BROKEN_PUBLIC();
  }

  @Get('/described')
  public described(): never {
    throw describeError(new ForbiddenError('No'), { code: 'SHOP_NO', why: 'Because.', fix: 'Ask.' });
  }

  @Get('/plain')
  public plain(): never {
    throw new ForbiddenError('Plain');
  }
}

/** Everything the process wrote while `run` ran, as one string. */
async function captureOutput(run: () => Promise<void>): Promise<string> {
  const written: string[] = [];
  const collect = (...args: unknown[]): void =>
    void written.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  const spies = [
    vi.spyOn(console, 'log').mockImplementation(collect),
    vi.spyOn(console, 'info').mockImplementation(collect),
    vi.spyOn(console, 'warn').mockImplementation(collect),
    vi.spyOn(console, 'error').mockImplementation(collect),
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      collect(String(chunk));

      return true;
    }) as never),
  ];

  try {
    await run();
  } finally {
    for (const spy of spies) {
      spy.mockRestore();
    }
  }

  return written.join('\n');
}

async function create(dev: boolean, requestLogging: boolean = false): Promise<App> {
  return createApp({
    cfg: { dev, production: !dev, requestLogging, logLevel: 'error' },
    configFile: false,
    setup: (app) => app.container.bind(ErrorsController),
  });
}

const get = (app: App, path: string): Promise<Response> => app.fetch(new Request(`http://localhost/errors${path}`));

describe('error guidance in responses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('in production', () => {
    it('adds the code to the body of an HttpError and nothing else', async () => {
      const app = await create(false);
      const response = await get(app, '/limit');

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        status: 403,
        name: 'ForbiddenError',
        message: 'Plan limit of 3 projects reached',
        code: 'SHOP_PLAN_LIMIT',
      });
    });

    it('sends why, fix and link of an error marked to be shown', async () => {
      const app = await create(false);
      const body = await (await get(app, '/public')).json();

      expect(body).toMatchObject({
        code: 'SHOP_PUBLIC',
        why: 'The coupon was valid until yesterday.',
        fix: 'Ask for a new coupon.',
        link: 'https://vercube.dev/docs/core-features/errors#shop_public',
      });
    });

    it('answers an unexpected error as before: no message, no code, no guidance', async () => {
      const app = await create(false);
      let response!: Response;

      await captureOutput(async () => {
        response = await get(app, '/broken');
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        status: 500,
        name: 'InternalServerError',
        message: 'Internal Server Error',
      });
    });

    it('shows an unexpected error that asks to be shown, with the status of its entry', async () => {
      const app = await create(false);
      let response!: Response;

      await captureOutput(async () => {
        response = await get(app, '/broken-public');
      });

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        code: 'SHOP_BROKEN_PUBLIC',
        why: 'The shop is being upgraded.',
        fix: 'Come back in an hour.',
      });
    });

    it('never sends internal context', async () => {
      const app = await create(false);
      let text = '';

      await captureOutput(async () => {
        text = (await (await get(app, '/limit')).text()) + (await (await get(app, '/broken')).text());
      });

      expect(text).not.toContain('ws_1');
      expect(text).not.toContain('postgres://secret');
    });

    it('leaves the body of an error without guidance as it was', async () => {
      const app = await create(false);

      expect(await (await get(app, '/plain')).json()).toEqual({ status: 403, name: 'ForbiddenError', message: 'Plain' });
    });
  });

  describe('in development', () => {
    it('adds why, fix and link to the body of an HttpError', async () => {
      const app = await create(true);

      expect(await (await get(app, '/limit')).json()).toEqual({
        status: 403,
        name: 'ForbiddenError',
        message: 'Plan limit of 3 projects reached',
        code: 'SHOP_PLAN_LIMIT',
        why: 'The workspace is on a plan with a fixed number of projects.',
        fix: 'Upgrade the workspace, or delete a project.',
        link: 'https://vercube.dev/docs/core-features/errors#shop_plan_limit',
      });
    });

    it('reads guidance attached with describeError()', async () => {
      const app = await create(true);

      expect(await (await get(app, '/described')).json()).toMatchObject({ code: 'SHOP_NO', why: 'Because.', fix: 'Ask.' });
    });

    it('explains an unexpected error', async () => {
      const app = await create(true);
      let body: Record<string, unknown> = {};

      await captureOutput(async () => {
        body = await (await get(app, '/broken')).json();
      });

      expect(body).toMatchObject({
        status: 500,
        message: 'Table orders is missing',
        code: 'SHOP_BROKEN',
        why: 'The migrations did not run.',
        fix: 'Run `pnpm migrate`.',
      });
      expect(JSON.stringify(body)).not.toContain('postgres://secret');
    });
  });

  describe('in the log', () => {
    it('logs an unexpected error with its code, why, fix and internal context', async () => {
      const app = await create(false);
      const output = await captureOutput(async () => {
        await get(app, '/broken');
      });

      expect(output).toContain('SHOP_BROKEN');
      expect(output).toContain('The migrations did not run.');
      expect(output).toContain('Run `pnpm migrate`.');
      expect(output).toContain('postgres://secret');
    });

    it('adds the guidance of an HttpError to the wide event of the request', async () => {
      const app = await create(false, true);
      const output = await captureOutput(async () => {
        await get(app, '/limit');
      });

      expect(output).toContain('SHOP_PLAN_LIMIT');
      expect(output).toContain('The workspace is on a plan with a fixed number of projects.');
      expect(output).toContain('Upgrade the workspace, or delete a project.');
    });
  });
});
