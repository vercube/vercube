import type { App } from '@vercube/core';

export default function setup(_app: App): void {
  // Use this function to customize the Vercube app before the DI container is flushed.
  // For example: bind tokens, override services, or configure plugins.
  // _app.container.bind(MyToken, MyImplementation);
}
