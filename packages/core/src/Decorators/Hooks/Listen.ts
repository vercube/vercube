import { BaseDecorator, Inject, createDecorator } from '@vercube/di';
import { HooksService } from '../../Services/Hooks/HooksService';
import type { HooksTypes } from '../../Types/HooksTypes';

interface IListenDecoratorParams {
  hookType: HooksTypes.HookType<unknown>;
}

/**
 * This class is responsible for managing cache decorator.
 */
class ListenDecorator extends BaseDecorator<IListenDecoratorParams> {
  @Inject(HooksService)
  private gHooksService!: HooksService;

  private fHook!: HooksTypes.HookID;

  /**
   * Called when decorator is initialized. It will register event listener that will call this function
   * once executed.
   */
  public override created(): void {
    // listen on hook type, and after it triggers, call proper method and return its result
    this.fHook = this.gHooksService.on(this.options.hookType, (data) => this.instance[this.propertyName](data));
  }

  /**
   * Called when decorator is destroyed. It will unregister event listener.
   */
  public override destroyed(): void {
    // release event listener
    this.gHooksService.off(this.fHook);
  }
}

/**
 * This decorator stores metadata about hook listeners. It can be later used along with function
 * applyEventListeners() to automatically register all listeners.
 *
 * @param hookType hook to listen for
 * @return decorator function
 */
export function Listen(hookType: HooksTypes.HookType<unknown>): Function {
  return createDecorator(ListenDecorator, { hookType });
}
