import type { RollupWatcherEvent } from 'rollup';

export namespace BuilderTypes {

  export interface BuildOptions {
    input: string;
    output: string;
  }

  export type WatchEvent = RollupWatcherEvent;

}