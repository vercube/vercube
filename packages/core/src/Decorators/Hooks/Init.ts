/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseDecorator, createDecorator } from '@vercube/di';

/**
 * This decorator fires the decorated function as soon as decorators are injected. You
 * can use this for initialization logic in runtime-loaded container deps.
 */
class InitDecorator extends BaseDecorator<{}> {

  /**
   * Called when decorator is initialized.
   */
  public override created(): void {
    if (typeof this.instance[this.propertyName] === 'function') {
      this.instance[this.propertyName]();
    }
  }

}

/**
 * Decorator that automatically executes the decorated method when dependencies are injected.
 * Use this decorator to run initialization logic for runtime-loaded container dependencies.
 * @returns {Function} Decorator function that creates an InitDecorator instance
 */
export function Init(): Function {
  return createDecorator(InitDecorator, {});
}
