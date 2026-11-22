import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  BaseMiddleware,
  Controller,
  Cookie,
  Cookies,
  createApp,
  Get,
  initializeMetadata,
  Middleware,
  Response as Res,
  setCookie,
  StandardSchemaValidationProvider,
  ValidationProvider,
} from '../../../src';
import type { StandardSchemaV1 } from '@standard-schema/spec';

/** A schema that reports the rejected value in its issue, as some validators do. */
const leaky: StandardSchemaV1<string> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => ({ issues: [{ message: 'bad', path: ['x'], input: value } as StandardSchemaV1.Issue] }),
  },
};

class CookieMiddleware extends BaseMiddleware {
  public override onRequest(_request: Request, response: Response): void {
    setCookie(response, 'mw', '1');
  }
}

@Controller('/cookies')
class CookieController {
  @Get('/leaky')
  public leaky(@Cookie('session', { validationSchema: leaky }) session: string) {
    return { session };
  }

  @Get('/optional')
  public optional(@Cookie('page', { validationSchema: z.coerce.number().optional() }) page?: number) {
    return { page: page ?? null };
  }

  @Get('/middleware')
  @Middleware(CookieMiddleware)
  public middleware(@Res() response: Response) {
    setCookie(response, 'handler', '2');

    return { ok: true };
  }

  @Get('/one')
  public one(@Cookie('session') session?: string, @Cookie('theme') theme: string = 'light') {
    return { session, theme };
  }

  @Get('/all')
  public all(@Cookies() cookies: Record<string, string>, @Cookie() same: Record<string, string>) {
    return { cookies, same };
  }

  @Get('/validated')
  public validated(
    @Cookie('page', { validationSchema: z.coerce.number().int().min(1) }) page: number,
    @Cookies({ validationSchema: z.object({ page: z.string() }) }) all: { page: string },
  ) {
    return { page, all };
  }

  @Get('/write')
  public write(@Res() response: Response) {
    setCookie(response, 'session', 'a b', { httpOnly: true });

    return { ok: true };
  }
}

async function createCookieApp() {
  return createApp({
    cfg: { requestLogging: false },
    configFile: false,
    setup: (app) => {
      app.container.bind(CookieController);
      app.container.bind(ValidationProvider, StandardSchemaValidationProvider);
    },
  });
}

function request(path: string, cookie?: string): Request {
  return new Request(`http://localhost/cookies${path}`, cookie ? { headers: { cookie } } : undefined);
}

describe('Cookie decorators', () => {
  it('adds the arguments to the metadata', async () => {
    await createCookieApp();
    const meta = initializeMetadata(CookieController.prototype);

    expect(meta.__methods['one'].args.toSorted((a, b) => a.idx - b.idx)).toMatchObject([
      { idx: 0, type: 'cookie', data: { name: 'session' }, validate: false },
      { idx: 1, type: 'cookie', data: { name: 'theme' }, validate: false },
    ]);
    expect(meta.__methods['all'].args.map((arg) => arg.type)).toEqual(['cookies', 'cookies']);
    expect(meta.__methods['validated'].args.every((arg) => arg.validate === true)).toBe(true);
  });

  it('does not duplicate arguments for a second application', async () => {
    await createCookieApp();
    await createCookieApp();

    expect(initializeMetadata(CookieController.prototype).__methods['one'].args).toHaveLength(2);
  });

  it('injects one cookie, decoded, and lets a default apply to a missing one', async () => {
    const app = await createCookieApp();

    const response = await app.fetch(request('/one', 'other=1; session=abc%20def'));

    expect(await response.json()).toEqual({ session: 'abc def', theme: 'light' });
  });

  it('resolves to undefined without a Cookie header', async () => {
    const app = await createCookieApp();

    const response = await app.fetch(request('/one'));

    expect(await response.json()).toEqual({ theme: 'light' });
  });

  it('injects every cookie', async () => {
    const app = await createCookieApp();

    const response = await app.fetch(request('/all', 'a=1; b=2'));

    expect(await response.json()).toEqual({ cookies: { a: '1', b: '2' }, same: { a: '1', b: '2' } });
  });

  it('injects an empty object when the request has no cookies', async () => {
    const app = await createCookieApp();

    const response = await app.fetch(request('/all'));

    expect(await response.json()).toEqual({ cookies: {}, same: {} });
  });

  it('hands the handler what the schema parsed', async () => {
    const app = await createCookieApp();

    const response = await app.fetch(request('/validated', 'page=3'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ page: 3, all: { page: '3' } });
  });

  it('answers 400 when a cookie fails its schema', async () => {
    const app = await createCookieApp();

    expect((await app.fetch(request('/validated', 'page=zero'))).status).toBe(400);
    expect((await app.fetch(request('/validated'))).status).toBe(400);
  });

  it('sends a cookie set on the @Response() argument', async () => {
    const app = await createCookieApp();

    const response = await app.fetch(request('/write'));

    expect(response.headers.getSetCookie()).toEqual(['session=a%20b; Path=/; HttpOnly']);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('does not send a rejected cookie value back', async () => {
    const app = await createCookieApp();

    const response = await app.fetch(request('/leaky', 'session=SECRET-TOKEN'));
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain('bad');
    expect(body).not.toContain('SECRET-TOKEN');
  });

  it('lets an optional schema accept a missing cookie', async () => {
    const app = await createCookieApp();

    expect(await (await app.fetch(request('/optional'))).json()).toEqual({ page: null });
    expect(await (await app.fetch(request('/optional', 'page=4'))).json()).toEqual({ page: 4 });
  });

  it('keeps cookies set by a middleware and by the handler', async () => {
    const app = await createCookieApp();

    const response = await app.fetch(request('/middleware'));

    expect(response.headers.getSetCookie().toSorted()).toEqual(['handler=2; Path=/', 'mw=1; Path=/']);
  });
});
