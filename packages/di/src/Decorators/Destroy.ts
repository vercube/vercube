/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseDecorator, createDecorator } from '@vercube/di';

/**
 * Decorator that handles cleanup tasks when a service or component is destroyed.
 * This decorator class extends BaseDecorator and executes the decorated method
 * during the destruction phase.
 */
class DestroyDecorator extends BaseDecorator<{}> {

  /**
   * Called when decorator is destroyed. Executes the decorated method if it exists
   * as a function on the instance. Used for cleanup tasks like unregistering 
   * listeners or clearing timers.
   */
  public override destroyed(): void {
    if (typeof this.instance[this.propertyName] === 'function') {
      this.instance[this.propertyName]();
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
 * ```
 * @returns {Function} Decorator function that creates a DestroyDecorator instance
 */
export function Destroy(): Function {
  return createDecorator(DestroyDecorator, {});
}
