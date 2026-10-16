import type { MaybePromise } from '../../Types/CommonTypes';

/**
 * A callback run when the application starts.
 */
export type StartupHook = () => MaybePromise<void>;

/**
 * Holds the callbacks run by `app.listen()` once the container is initialized
 * and before the server binds its port.
 *
 * Hooks run one after another in registration order, and the first failure
 * stops the boot: a scheduler that cannot reach its store must fail
 * `listen()`, not crash the process after the server is already serving.
 */
export class StartupRegistry {
  /** Registered hooks, in registration order. */
  private fHooks: StartupHook[] = [];

  /**
   * Registers a hook.
   *
   * @param {StartupHook} hook - The callback to run on start
   * @returns {() => void} Removes the hook again
   */
  public register(hook: StartupHook): () => void {
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
   * Runs every hook in registration order.
   *
   * @returns {Promise<void>} Resolves once every hook has run
   * @throws {Error} The first hook failure
   */
  public async run(): Promise<void> {
    // a copy, so a hook removing itself does not skip the next one
    for (const hook of [...this.fHooks]) {
      await hook();
    }
  }
}
