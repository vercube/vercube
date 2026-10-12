import { describe, expect, it } from 'vitest';
import { Container, Destroy, initializeContainer, Inject, InjectOptional } from '../src';

describe('[Framework][IOC] Container.dispose', () => {
  it('should run @Destroy() hooks last registered first', async () => {
    const order: string[] = [];

    class First {
      @Destroy()
      destroy() {
        order.push('first');
      }
    }

    class Second {
      @Inject(First)
      first!: First;

      @Destroy()
      destroy() {
        order.push('second');
      }
    }

    const container = new Container();
    container.bind(First);
    container.bind(Second);
    initializeContainer(container);

    await container.dispose();

    expect(order).toEqual(['second', 'first']);
  });

  it('should wait for the promise a @Destroy() hook returns', async () => {
    let closed = false;

    class Connection {
      @Destroy()
      async close() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        closed = true;
      }
    }

    const container = new Container();
    container.bind(Connection);
    initializeContainer(container);

    await container.dispose();

    expect(closed).toBe(true);
  });

  it('should wait for promises tracked by hand', async () => {
    let done = false;

    class Service {
      @Inject(Container)
      container!: Container;

      @Destroy()
      destroy() {
        this.container.trackDisposal(
          new Promise<void>((resolve) =>
            setTimeout(() => {
              done = true;
              resolve();
            }, 20),
          ),
        );
      }
    }

    const container = new Container();
    container.bind(Service);
    initializeContainer(container);

    await container.dispose();

    expect(done).toBe(true);
  });

  it('should run the hooks once however many times it is called', async () => {
    let calls = 0;

    class Service {
      @Destroy()
      destroy() {
        calls++;
      }
    }

    const container = new Container();
    container.bind(Service);
    initializeContainer(container);

    const first = container.dispose();
    expect(container.dispose()).toBe(first);
    await first;

    expect(calls).toBe(1);
    expect(container.disposed).toBe(true);
  });

  it('should skip singletons that were never created', async () => {
    let calls = 0;

    class Lazy {
      @Destroy()
      destroy() {
        calls++;
      }
    }

    const container = new Container();
    container.bind(Lazy);

    await container.dispose();

    expect(calls).toBe(0);
  });

  it('should keep handing out existing instances but refuse to create new ones', async () => {
    class Existing {}
    class Fresh {}

    const container = new Container();
    container.bind(Existing);
    container.bind(Fresh);

    const existing = container.get(Existing);
    await container.dispose();

    expect(container.get(Existing)).toBe(existing);
    expect(() => container.get(Fresh)).toThrow('Container - disposed, cannot create [Fresh]');
  });

  it('should run every hook and report every failure', async () => {
    let ran = false;

    class Throws {
      @Destroy()
      destroy() {
        throw new Error('sync');
      }
    }

    class Rejects {
      @Destroy()
      async destroy() {
        throw new Error('async');
      }
    }

    class Fine {
      @Destroy()
      destroy() {
        ran = true;
      }
    }

    const container = new Container();
    container.bind(Fine);
    container.bind(Throws);
    container.bind(Rejects);
    initializeContainer(container);

    const error = await container.dispose().catch((error_: unknown) => error_);

    expect(ran).toBe(true);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map((e: Error) => e.message).sort()).toEqual(['async', 'sync']);
  });

  it('should resolve an optional dependency that was never created as absent during disposal', async () => {
    let seen: unknown = 'unset';

    class Metrics {}

    class Worker {
      @InjectOptional(Metrics)
      metrics!: Metrics | null;

      @Destroy()
      destroy() {
        seen = this.metrics;
      }
    }

    const container = new Container();
    container.bind(Worker);
    initializeContainer(container);

    // bound after the flush, so never constructed
    container.bind(Metrics);

    await container.dispose();

    expect(seen).toBeNull();
  });

  it('should refuse a service a hook would construct during disposal, so none is left without its cleanup', async () => {
    let destroyed = 0;

    class Late {
      @Destroy()
      destroy() {
        destroyed++;
      }
    }

    class Early {
      @Inject(Container)
      container!: Container;

      @Destroy()
      destroy() {
        this.container.get(Late);
      }
    }

    const container = new Container();
    container.bind(Early);
    initializeContainer(container);

    // bound after the flush, so never constructed
    container.bind(Late);

    const error = await container.dispose().catch((error_: unknown) => error_);

    expect((error as AggregateError).errors[0].message).toBe('Container - disposed, cannot create [Late]');
    expect(destroyed).toBe(0);
  });
});
