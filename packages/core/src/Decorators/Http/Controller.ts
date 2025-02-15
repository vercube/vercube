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
  return function internalDecorator(target: any) {
    const meta = initializeMetadata(target.prototype);

    meta.__controller = {
      ...meta?.__controller,
      path,
    };
  };
}