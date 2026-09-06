import { beforeEach, describe, expect, it } from 'vitest';
import { BaseLogger } from '../src/Service/BaseLogger';
import type { WideEvent } from 'evlog';

describe('BaseLogger plugin registration', () => {
  let logger: BaseLogger;
  let drained: WideEvent[];

  beforeEach(() => {
    drained = [];
    logger = new BaseLogger();
    logger.configure({ logLevel: 'debug', silent: true });
  });

  it('drains every emitted event', () => {
    logger.addDrain('test', ({ event }) => {
      drained.push(event);
    });

    logger.info('hello');

    expect(drained).toHaveLength(1);
    expect(drained[0].message).toBe('hello');
  });

  it('merges context providers into every event', () => {
    logger.addContextProvider(() => ({ tenant: 'acme' }));
    logger.addDrain('test', ({ event }) => {
      drained.push(event);
    });

    logger.info('hello');

    expect(drained[0].tenant).toBe('acme');
  });

  it('lets the call site override a provided field', () => {
    logger.addContextProvider(() => ({ tenant: 'acme' }));
    logger.addDrain('test', ({ event }) => {
      drained.push(event);
    });

    logger.info('tag', { tenant: 'other' });

    expect(drained[0].tenant).toBe('other');
  });

  it('skips a provider that returns nothing', () => {
    logger.addContextProvider(() => undefined);
    logger.addDrain('test', ({ event }) => {
      drained.push(event);
    });

    logger.info('hello');

    expect(drained[0].message).toBe('hello');
  });

  it('unregisters a provider', () => {
    const remove = logger.addContextProvider(() => ({ tenant: 'acme' }));
    logger.addDrain('test', ({ event }) => {
      drained.push(event);
    });

    remove();
    logger.info('hello');

    expect(drained[0].tenant).toBeUndefined();
  });

  it('shares providers with child loggers', () => {
    logger.addContextProvider(() => ({ tenant: 'acme' }));
    logger.addDrain('test', ({ event }) => {
      drained.push(event);
    });

    logger.child({ scope: 'child' }).info('hello');

    expect(drained[0]).toMatchObject({ tenant: 'acme', scope: 'child' });
  });

  it('keeps registered plugins across a reconfigure', () => {
    logger.addDrain('test', ({ event }) => {
      drained.push(event);
    });

    // This is the case that used to force devtools to monkey-patch the logger:
    // a second initLogger would previously have dropped the drain.
    logger.configure({ logLevel: 'warn', silent: true });
    logger.warn('after');

    expect(drained).toHaveLength(1);
    expect(drained[0].message).toBe('after');
  });

  it('applies the reconfigured options', () => {
    logger.addDrain('test', ({ event }) => {
      drained.push(event);
    });

    logger.configure({ logLevel: 'error', silent: true });
    logger.debug('filtered out');
    logger.error('kept');

    expect(drained.map((event) => event.message)).toEqual(['kept']);
  });

  it('replaces a plugin registered under the same name', () => {
    logger.addDrain('test', () => {
      drained.push({ pass: 'first' } as unknown as WideEvent);
    });
    logger.addDrain('test', () => {
      drained.push({ pass: 'second' } as unknown as WideEvent);
    });

    logger.info('hello');

    expect(drained.map((event) => (event as unknown as { pass: string }).pass)).toEqual(['second']);
  });
});
