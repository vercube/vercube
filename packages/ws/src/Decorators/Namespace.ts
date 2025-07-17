import { initializeMetadata } from "@vercube/core";

/**
 * A decorator class for defining a namespace and accepting websockets connections.
 */
export function Namespace(path: string): Function {
  return function internalDecorator(target: any) {
    const meta = initializeMetadata(target.prototype);

    meta.__extra = {
      ...meta?.__extra,
      namespace: path
    };
  };
}