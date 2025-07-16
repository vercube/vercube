import { beforeAll, describe, expect, it } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { Broadcast } from '../../src/Decorators/Broadcast';

class BroadcastService {
  @Broadcast()
  public sendMessage(content: string) {
    return { content };
  }
}

class NoBroadcastService {
  public sendMessage(content: string) {
    return { content };
  }
}

describe('@Broadcast() decorator', () => {
  let container: Container;
  let broadcastService: BroadcastService;
  let noBroadcastService: NoBroadcastService;

  beforeAll(() => {
    container = new Container();
    container.bind(BroadcastService);
    container.bind(NoBroadcastService);
    initializeContainer(container);

    broadcastService = container.get(BroadcastService);
    noBroadcastService = container.get(NoBroadcastService);
  });

  it('should have broadcast arg if method is decorated with @Broadcast()', async () => {
    initializeMetadata(broadcastService);
    const methodMeta = initializeMetadataMethod(broadcastService, 'sendMessage');
    const shouldBroadcast = methodMeta.args.some(arg => arg.type === 'broadcast');
    expect(shouldBroadcast).toBe(true);
  });

  it('should not have broadcast arg if no @Broadcast() decorator is used', async () => {
    initializeMetadata(noBroadcastService);
    const methodMeta = initializeMetadataMethod(noBroadcastService, 'sendMessage');
    const shouldBroadcast = methodMeta.args.some(arg => arg.type === 'broadcast');
    expect(shouldBroadcast).toBe(false);
  });
});