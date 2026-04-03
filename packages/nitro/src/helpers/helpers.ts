import type { App } from '@vercube/core';

export function useVercubeApp(): App {
  return globalThis.__vercubeApp__;
}
