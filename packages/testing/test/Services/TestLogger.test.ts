import { Body, Controller, Get, Post, ValidationProvider } from '@vercube/core';
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createTestApp, TestingError, TestLogger } from '../../src';

@Controller('/logs')
class LoggingController {
  @Inject(Logger)
  private gLogger!: Logger;

  @Get('/hello')
  public hello(): unknown {
    this.gLogger.child({ route: 'hello' }).info('saying hello', { to: 'ada' });
    return { ok: true };
  }

  @Get('/boom')
  public boom(): never {
    throw new Error('kaboom');
  }

  @Post('/validated')
  public validated(@Body({ validationSchema: z.object({ name: z.string() }) }) body: unknown): unknown {
    return body;
  }
}

describe('TestLogger', () => {
  it('should record each level with its arguments', () => {
    const logger = new TestLogger();

    logger.debug('d');
    logger.info('i', { a: 1 });
    logger.warn('w');
    logger.error(new Error('e'));

    expect(logger.records.map((record) => record.level)).toEqual(['debug', 'info', 'warn', 'error']);
    expect(logger.records[1]).toMatchObject({ args: ['i', { a: 1 }], message: 'i {"a":1}' });
    expect(logger.records[3].message).toBe('Error: e');
    expect(typeof logger.records[0].at).toBe('number');
  });

  it('should share the records with children and merge their context', () => {
    const logger = new TestLogger({ app: 'test' });
    const child = logger.child({ requestId: '1' });

    child.info('from child');
    logger.set({ user: 'ada' });
    logger.info('from parent');

    expect(logger.records).toHaveLength(2);
    expect(logger.records[0].context).toEqual({ app: 'test', requestId: '1' });
    expect(logger.records[1].context).toEqual({ app: 'test', user: 'ada' });
    expect(child.getContext()).toEqual({ app: 'test', requestId: '1' });
  });

  it('should find and filter by level and match', () => {
    const logger = new TestLogger();

    logger.info('user created', { id: 1 });
    logger.warn('user missing');
    logger.info('order created');

    expect(logger.find('warn')?.message).toBe('user missing');
    expect(logger.find(undefined, 'order')?.message).toBe('order created');
    expect(logger.filter('info', /created/)).toHaveLength(2);
    expect(logger.filter(undefined, (record) => record.args[1] !== undefined)).toHaveLength(1);
    expect(logger.find('error')).toBeUndefined();

    logger.clear();
    expect(logger.records).toHaveLength(0);
  });

  it('should record emit() as a wide event and reset the context', () => {
    const logger = new TestLogger();

    logger.set({ step: 'checkout' });
    logger.emit({ total: 10 });

    expect(logger.find('wide-event')?.context).toEqual({ step: 'checkout', total: 10 });
    expect(logger.getContext()).toEqual({});
  });

  it('should add what context providers return', () => {
    const logger = new TestLogger();
    const remove = logger.addContextProvider(() => ({ traceId: 't-1' }));

    logger.info('with trace');
    remove();
    logger.info('without');

    expect(logger.records[0].context).toEqual({ traceId: 't-1' });
    expect(logger.records[1].context).toEqual({});
  });

  it('should mirror to the console when asked', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new TestLogger();

    logger.warn('quiet');
    logger.print = true;
    logger.warn('loud');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toEqual(['[warn]', 'loud', '']);

    spy.mockRestore();
  });

  it('should accept the evlog configuration and ignore it', () => {
    const logger = new TestLogger();

    expect(() => {
      logger.configure({ logLevel: 'debug' });
      logger.addPlugin({ name: 'p' });
      logger.addDrain('d', () => {});
      logger.addEnricher('e', () => {});
    }).not.toThrow();
  });

  describe('in an app', () => {
    it('should capture what controllers log', async () => {
      await using app = await createTestApp({ controllers: [LoggingController] });

      await app.get('/logs/hello').expect(200);

      expect(app.logs.find('info', 'saying hello')).toMatchObject({
        context: { route: 'hello' },
        args: ['saying hello', { to: 'ada' }],
      });
      expect(app.resolve(Logger)).toBe(app.logs);
    });

    it('should capture what the framework logs', async () => {
      await using app = await createTestApp({ controllers: [LoggingController] });

      await app.get('/logs/boom').expect(500);

      expect(app.logs.find('error', 'kaboom')).toBeDefined();
    });

    it('should capture a validation middleware warning', async () => {
      await using app = await createTestApp({
        controllers: [LoggingController],
        overrides: [[ValidationProvider, null as never]],
      });

      await app.post('/logs/validated').json({ name: 1 }).expect(200);

      expect(app.logs.find('warn', 'Validation provider is not registered')).toBeDefined();
    });

    it('should not be there with logger: false', async () => {
      await using app = await createTestApp({ logger: false });

      expect(() => app.logs).toThrow(TestingError);
      expect(app.resolve(Logger)).not.toBeInstanceOf(TestLogger);
    });
  });
});
