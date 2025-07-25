import { initializeMetadata } from '@vercube/core';

/**
 * A decorator function for defining a websocket namespace and accepting websocket connections.
 *
 * This function attaches namespace metadata to the decorated class, which is used to group websocket events under a
 * specific namespace.
 *
 * @param {string} path - The namespace path for websocket connections.
 * @returns {Function} - The decorator function.
 */
export function Namespace(path: string): Function {
  return function internalDecorator(target: any) {
    const meta = initializeMetadata(target.prototype);

    meta.__meta = {
      ...meta?.__meta,
      namespace: path
    };
  };
}