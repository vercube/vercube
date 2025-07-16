import { beforeAll, describe, expect, it } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BroadcastOthers } from '../../src/Decorators/BroadcastOthers';

class BroadcastOthersService {
  @BroadcastOthers()
  public sendMessage(content: string) {
    return { content };
  }
}

class NoBroadcastOthersService {
  public sendMessage(content: string) {
    return { content };
  }
}

describe('@BroadcastOthers() decorator', () => {
  let container: Container;
  let broadcastOthersService: BroadcastOthersService;
  let noBroadcastOthersService: NoBroadcastOthersService;

  beforeAll(() => {
    container = new Container();
    container.bind(BroadcastOthersService);
    container.bind(NoBroadcastOthersService);
    initializeContainer(container);

    broadcastOthersService = container.get(BroadcastOthersService);
    noBroadcastOthersService = container.get(NoBroadcastOthersService);
  });

  it('should have broadcast_others arg if method is decorated with @BroadcastOthers()', async () => {
    initializeMetadata(broadcastOthersService);
    const methodMeta = initializeMetadataMethod(broadcastOthersService, 'sendMessage');
    const shouldBroadcastOthers = methodMeta.args.some(arg => arg.type === 'broadcast_others');
    expect(shouldBroadcastOthers).toBe(true);
  });

  it('should not have broadcast_others arg if no @BroadcastOthers() decorator is used', async () => {
    initializeMetadata(noBroadcastOthersService);
    const methodMeta = initializeMetadataMethod(noBroadcastOthersService, 'sendMessage');
    const shouldBroadcastOthers = methodMeta.args.some(arg => arg.type === 'broadcast_others');
    expect(shouldBroadcastOthers).toBe(false);
  });
});