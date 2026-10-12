/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseDecorator } from '../Common/BaseDecorators';
import { Container } from '../Domain/Container';
import { createDecorator } from '../Utils/Utils';
import { Inject } from './Inject';

/**
 * Decorator that handles cleanup tasks when a service or component is destroyed.
 * This decorator class extends BaseDecorator and executes the decorated method
 * during the destruction phase.
 */
class DestroyDecorator extends BaseDecorator<{}> {
  @Inject(Container)
  private gContainer!: Container;

  /**
   * Called when decorator is destroyed. Executes the decorated method if it exists
   * as a function on the instance. Used for cleanup tasks like unregistering
   * listeners or clearing timers. A returned promise is tracked, so
   * `container.dispose()` waits for it.
   */
  public override destroyed(): void {
    if (typeof this.instance[this.propertyName] !== 'function') {
      return;
    }

    const result = this.instance[this.propertyName]();

    if (typeof result?.then === 'function') {
      this.gContainer.trackDisposal(Promise.resolve(result));
    }
  }
}

/**
 * Decorator that automatically executes the decorated method when the service or component
 * is destroyed. Use this decorator to run cleanup logic like unregistering event listeners
 * or clearing timers.
 *
 * @example
 * ```typescript
 * class MyService {
 *   @Destroy()
 *   cleanup() {
 *     // Cleanup logic here
 *   }
 * }
 *
 * class Connection {
 *   @Destroy()
 *   async close() {
 *     // awaited by container.dispose() and app.close()
 *   }
 * }
 * ```
 * @returns {Function} Decorator function that creates a DestroyDecorator instance
 */
export function Destroy(): Function {
  return createDecorator(DestroyDecorator, {});
}
