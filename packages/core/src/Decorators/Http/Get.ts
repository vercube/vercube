
import { BaseDecorator, createDecorator, Inject } from '@cube/di';
import { RouterRegistry } from '../../Services/Router/RouterRegistry';

interface GetDecoratorOptions {
  path: string;
}

/**
 * This class is responsible for managing cache decorator.
 */
class GetDecorator extends BaseDecorator<GetDecoratorOptions> {

  @Inject(RouterRegistry)
  private gRouterRegistry!: RouterRegistry;

  /**
   * Test decorator
   */
  public override created(): void {

    this.gRouterRegistry.registerRoute({
      path: this.options.path,
      method: 'GET',
      handler: this.instance[this.propertyName].bind(this.instance),
    });

  }

}

/**
 * @return decorator function
 */
export function Get(path: string): Function {
  return createDecorator(GetDecorator, { path });
}
