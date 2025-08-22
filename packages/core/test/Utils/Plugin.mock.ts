import { BasePlugin } from '../../src';
import type { App } from '../../src';

// oxlint-disable no-unused-vars

export class MockPlugin extends BasePlugin {
  public name = 'mock';

  public async use(app: App, options?: unknown): Promise<void> {
    //
  }
}

export class MockPlugin2 extends BasePlugin {
  public async use(app: App, options?: unknown): Promise<void> {
    //
  }
}
