import { describe, expect, it } from 'vitest';
import { Container, defineErrorCatalog, describeError, getErrorGuidance, Inject } from '../../src';

class PlanError extends Error {
  public status = 403;

  constructor(
    message: string,
    public readonly limit?: number,
  ) {
    super(message);
    this.name = 'PlanError';
  }
}

const Errors = defineErrorCatalog('BILLING', {
  PLAN_LIMIT: {
    message: ({ limit }: { limit: number }) => `Plan limit of ${limit} projects reached`,
    why: 'The workspace is on a plan with a fixed number of projects.',
    fix: 'Upgrade the workspace, or delete a project.',
    create: (message, { limit }) => new PlanError(message, limit),
  },
  DOWN: {
    message: 'Billing is unavailable',
    why: 'The payment provider did not answer.',
    fix: 'Retry in a minute.',
    link: 'https://status.example.com',
    status: 503,
    expose: true,
  },
});

describe('describeError()', () => {
  it('attaches the fields without making them enumerable', () => {
    const error = describeError(new Error('boom'), {
      code: 'APP_BOOM',
      why: 'It went boom.',
      fix: 'Do not light it.',
      link: 'https://example.com/boom',
      internal: { fuse: 3 },
    });

    expect(error).toMatchObject({ message: 'boom' });
    expect((error as { code?: string }).code).toBe('APP_BOOM');
    expect(Object.keys(error)).toEqual([]);
    expect({ ...error }).toEqual({});
    expect(JSON.stringify(error)).toBe('{}');
  });

  it('returns the error it was given and skips fields that are not set', () => {
    const error = new TypeError('bad');

    expect(describeError(error, { code: 'APP_BAD' })).toBe(error);
    expect(Object.getOwnPropertyNames(error)).not.toContain('why');
  });
});

describe('getErrorGuidance()', () => {
  it('reads what describeError() attached', () => {
    const error = describeError(new Error('boom'), { code: 'A', why: 'w', fix: 'f', expose: true, internal: { a: 1 } });

    expect(getErrorGuidance(error)).toEqual({ code: 'A', why: 'w', fix: 'f', expose: true, internal: { a: 1 } });
  });

  it('goes by shape, so an error of another origin is read too', () => {
    expect(getErrorGuidance({ message: 'x', code: 'EVLOG_STYLE', why: 'because', link: 'https://example.com' })).toEqual({
      code: 'EVLOG_STYLE',
      why: 'because',
      link: 'https://example.com',
    });
  });

  it('believes `expose` only on an error this package described', () => {
    // `http-errors` marks a message as safe to show with the same field name
    const foreign = Object.assign(new Error('bad json'), { code: 'ENTITY_PARSE_FAILED', expose: true });

    expect(getErrorGuidance(foreign)).toEqual({ code: 'ENTITY_PARSE_FAILED' });
    expect(getErrorGuidance(describeError(new Error('x'), { code: 'A', expose: true }))).toEqual({ code: 'A', expose: true });
  });

  it.each([undefined, null, 'text', 42, new Error('plain'), { code: 404 }, { why: '' }])('finds none on %s', (value) => {
    expect(getErrorGuidance(value)).toBeUndefined();
  });
});

describe('defineErrorCatalog()', () => {
  it('builds the error of an entry with its code, why, fix and a link to the reference', () => {
    const error = Errors.PLAN_LIMIT({ limit: 3 });

    expect(error).toBeInstanceOf(PlanError);
    expect(error.message).toBe('Plan limit of 3 projects reached');
    expect(error.limit).toBe(3);
    expect(getErrorGuidance(error)).toEqual({
      code: 'BILLING_PLAN_LIMIT',
      why: 'The workspace is on a plan with a fixed number of projects.',
      fix: 'Upgrade the workspace, or delete a project.',
      link: 'https://vercube.dev/docs/core-features/errors#billing_plan_limit',
    });
  });

  it('keeps what the error class sends: the guidance is not enumerable', () => {
    expect({ ...Errors.PLAN_LIMIT({ limit: 3 }) }).toEqual({ status: 403, limit: 3, name: 'PlanError' });
  });

  it('falls back to a plain Error and applies the status, link and expose of the entry', () => {
    const error = Errors.DOWN();

    expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
    expect(error.message).toBe('Billing is unavailable');
    expect((error as { status?: number }).status).toBe(503);
    expect(Object.keys(error)).toEqual([]);
    expect(getErrorGuidance(error)).toMatchObject({ link: 'https://status.example.com', expose: true });
  });

  it('does not replace the status an error already has', () => {
    const catalog = defineErrorCatalog('X', {
      A: { message: 'a', why: 'w', fix: 'f', status: 500, create: (message) => new PlanError(message) },
    });

    expect(catalog.A().status).toBe(403);
  });

  it('uses the error class of the catalog for entries without their own', () => {
    const catalog = defineErrorCatalog(
      'X',
      { A: { message: 'a', why: 'w', fix: 'f' } },
      { create: (message) => new PlanError(message) },
    );

    expect(catalog.A()).toBeInstanceOf(PlanError);
  });

  it('takes a cause and internal context from the call site', () => {
    const cause = new Error('socket hang up');
    const error = Errors.DOWN(undefined, { cause, internal: { provider: 'stripe' } });

    expect(error.cause).toBe(cause);
    expect(getErrorGuidance(error)?.internal).toEqual({ provider: 'stripe' });
    expect(JSON.stringify(error)).toBe('{}');
  });

  it('lets the parameters be left out when the message takes none or takes them optionally', () => {
    const catalog = defineErrorCatalog('X', {
      NONE: { message: () => 'no parameters', why: 'w', fix: 'f' },
      OPTIONAL: { message: (params?: { name?: string }) => `hello ${params?.name ?? 'you'}`, why: 'w', fix: 'f' },
    });

    expect(catalog.NONE().message).toBe('no parameters');
    expect(catalog.OPTIONAL().message).toBe('hello you');
    expect(catalog.OPTIONAL({ name: 'Ada' }).message).toBe('hello Ada');
    expect(catalog.NONE(undefined, { internal: { a: 1 } })).toBeInstanceOf(Error);
  });

  it('starts the stack where the error was thrown, not in the catalog', () => {
    function thrower(): Error {
      return Errors.DOWN();
    }

    const frames = thrower().stack!.split('\n');

    expect(frames[0]).toBe('Error: Billing is unavailable');
    expect(frames[1]).toContain('thrower');
  });

  it('builds an entry marked `stack: false` without a trace, and leaves the limit as it was', () => {
    const catalog = defineErrorCatalog('X', {
      HOT: { message: 'Too many requests', why: 'w', fix: 'f', stack: false, create: (message) => new PlanError(message) },
      PLAIN: { message: 'Rejected', why: 'w', fix: 'f', stack: false },
      THROWS: {
        message: 'never built',
        why: 'w',
        fix: 'f',
        stack: false,
        create: () => {
          throw new TypeError('constructor failed');
        },
      },
    });
    const limit = Error.stackTraceLimit;

    for (const error of [catalog.HOT(), catalog.PLAIN()]) {
      expect(error.stack!.split('\n')).toHaveLength(1);
      expect(getErrorGuidance(error)?.code).toMatch(/^X_/);
    }

    expect(catalog.HOT()).toBeInstanceOf(PlanError);
    expect(() => catalog.THROWS()).toThrow('constructor failed');
    expect(Error.stackTraceLimit).toBe(limit);
    // an error built right after has its trace
    expect(new Error('after').stack!.split('\n').length).toBeGreaterThan(1);
  });

  it('returns an error that cannot take new fields as it is', () => {
    const catalog = defineErrorCatalog('X', {
      FROZEN: { message: 'frozen', why: 'w', fix: 'f', create: (message) => Object.freeze(new Error(message)) },
    });

    expect(catalog.FROZEN().message).toBe('frozen');
    expect(getErrorGuidance(catalog.FROZEN())).toBeUndefined();
    expect(describeError(Object.freeze(new Error('x')), { code: 'A' }).message).toBe('x');
  });

  it('exposes the metadata of an entry without creating an error', () => {
    expect(Errors.PLAN_LIMIT.code).toBe('BILLING_PLAN_LIMIT');
    expect(Errors.DOWN.status).toBe(503);
    expect(Errors.DOWN.fix).toBe('Retry in a minute.');
    expect(Errors.prefix).toBe('BILLING');
    expect(Object.keys(Errors)).toEqual(['PLAN_LIMIT', 'DOWN']);
  });

  it('describes its errors with the parameters of a message named', () => {
    const catalog = defineErrorCatalog('X', {
      NESTED: {
        message: ({ route, count }: { route: { path: string }; count: number }) => `${route.path} failed ${count} times`,
        why: 'w',
        fix: 'f',
      },
      THROWS: {
        message: ({ list }: { list: string[] }) => list.map((item) => item.toUpperCase()).join(','),
        why: 'w',
        fix: 'f',
      },
    });

    expect(Errors.describe()).toEqual([
      {
        code: 'BILLING_PLAN_LIMIT',
        message: 'Plan limit of <limit> projects reached',
        why: 'The workspace is on a plan with a fixed number of projects.',
        fix: 'Upgrade the workspace, or delete a project.',
        link: 'https://vercube.dev/docs/core-features/errors#billing_plan_limit',
        status: undefined,
      },
      {
        code: 'BILLING_DOWN',
        message: 'Billing is unavailable',
        why: 'The payment provider did not answer.',
        fix: 'Retry in a minute.',
        link: 'https://status.example.com',
        status: 503,
      },
    ]);
    expect(catalog.describe().map((entry) => entry.message)).toEqual(['<route.path> failed <count> times', '']);
  });
});

describe('DiErrors', () => {
  class Mailer {}

  class Signup {
    @Inject(Mailer)
    public mailer!: Mailer;
  }

  it('explains an unresolved dependency and keeps its message', () => {
    const container = new Container();

    container.bind(Signup);

    let thrown: unknown;

    try {
      void container.get(Signup).mailer;
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).message).toBe('Unresolved dependency for [Mailer] required by [Signup]');
    expect(getErrorGuidance(thrown)).toMatchObject({
      code: 'VERCUBE_DI_UNRESOLVED',
      link: 'https://vercube.dev/docs/core-features/errors#vercube_di_unresolved',
    });
    expect(getErrorGuidance(thrown)?.fix).toContain('container.bind(MyService)');
  });

  it('explains a symbol bound without an implementation', () => {
    const container = new Container();

    expect(() => container.bind(Symbol('Cache'))).toThrow('Container - provide implementation for binds with symbols.');

    try {
      container.bind(Symbol('Cache'));
    } catch (error) {
      expect(getErrorGuidance(error)?.code).toBe('VERCUBE_DI_SYMBOL_WITHOUT_IMPLEMENTATION');
    }
  });
});
