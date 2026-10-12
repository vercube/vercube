import type { MaybePromise } from '../../Types/CommonTypes';

/**
 * A callback run when the application closes.
 */
export type ShutdownHook = () => MaybePromise<void>;

/**
 * Holds the callbacks run by `app.close()`.
 *
 * Hooks run one after another in reverse registration order, like a stack:
 * whatever was set up last depends on what was set up before it, so it is torn
 * down first. A scheduler registered after the queue it publishes to stops
 * before that queue closes its connections.
 *
 * A failing hook does not stop the others. Every failure is collected and
 * thrown together once all hooks have run.
 */
export class ShutdownRegistry {
  /** Registered hooks, in registration order. */
  private fHooks: ShutdownHook[] = [];

  /**
   * Registers a hook.
   *
   * @param {ShutdownHook} hook - The callback to run on close
   * @returns {() => void} Removes the hook again
   */
  public register(hook: ShutdownHook): () => void {
    this.fHooks.push(hook);

    return () => {
      const index = this.fHooks.indexOf(hook);

      if (index !== -1) {
        this.fHooks.splice(index, 1);
      }
    };
  }

  /**
   * The number of registered hooks.
   */
  public get size(): number {
    return this.fHooks.length;
  }

  /**
   * Runs every hook, last registered first, and empties the registry.
   *
   * @returns {Promise<void>} Resolves once every hook has settled
   * @throws {AggregateError} When one or more hooks failed
   */
  public async run(): Promise<void> {
    const hooks = this.fHooks.reverse();
    const errors: unknown[] = [];

    this.fHooks = [];

    for (const hook of hooks) {
      try {
        await hook();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} shutdown hook(s) failed`);
    }
  }
}
