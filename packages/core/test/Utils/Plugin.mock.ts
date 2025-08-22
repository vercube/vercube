// oxlint-disable no-unused-vars
import { type App, BasePlugin } from '../../src';

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
