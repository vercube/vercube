import type { App } from '@vercube/core';

export function useVercubeApp(): App | undefined {
  return globalThis.__vercubeApp__;
}
