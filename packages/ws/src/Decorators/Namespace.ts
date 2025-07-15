import { initializeMetadata } from "@vercube/core";

export function Namespace(path: string): Function {
  return function internalDecorator(target: any) {
    const meta = initializeMetadata(target.prototype);

    meta.__namespace = {
      ...meta?.__namespace,
      path,
    };
  };
}