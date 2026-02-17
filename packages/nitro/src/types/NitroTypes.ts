import type { Container } from '@vercube/di';

declare module 'nitro/types' {
  interface NitroApp {
    __vercubeContainer__?: Container;
  }
}
