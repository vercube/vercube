import { initializeMetadata } from '../../Utils/Utils';

/**
 * A factory function for creating a Controller decorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a class with controller metadata, including the base path for the controller.
 *
 * @param {string} path - The base path for the controller.
 * @return {Function} The decorator function.
 */
export function Controller(path: string): Function {
  /**
   * The internal decorator function.
   *
   * This function sets the controller metadata on the class prototype,
   * including the base path for the controller.
   *
   * @param {Function} ctx - The class constructor.
   */
  return function internalDecorator(ctx: Function) {
    const meta = initializeMetadata(ctx);

    meta.__controller = {
      ...ctx?.prototype?.__metadata?.__controller,
      path,
    };
  };
}