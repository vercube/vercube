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
 * This decorator informs HMR that it should make some sort of initialization stuff. Its called
 * when all decorators are ready to go.
 *
 * @param eventType event to listen for
 * @return decorator function
 */
export function Init(): Function {
  return createDecorator(InitDecorator, {});
}
