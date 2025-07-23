import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, type App, type ConfigTypes } from '@vercube/core';
import { Container, initializeContainer } from '@vercube/di';
import { WebsocketService } from '../../src/Services/WebsocketService';
import { WebsocketServiceKey } from '../../src/Utils/WebsocketServiceKey';
import { BroadcastOthers } from '../../src/Decorators/BroadcastOthers';
import { Message } from '../../src/Decorators/Message';
import { Namespace } from '../../src/Decorators/Namespace';

vi.mock('srvx', () => ({
  serve: vi.fn().mockReturnValue({
    ready: vi.fn().mockResolvedValue(undefined),
  }),
}));

@Namespace('/broadcastOthers')
class BroadcastOthersTestService {
  @Message({ event: 'echo' })
  @BroadcastOthers('echoed')
  public echoMessage(data: any, peer: any) {
    return { echoed: data };
  }
}

describe('@BroadcastOthers() decorator', () => {
  let container: Container;
  let app: App;
  let websocketService: WebsocketService;
  const broadcastSpy = vi.fn();

  const config: ConfigTypes.Config = {
    logLevel: 'info',
    server: { static: { dirs: ['./public'] } }
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    app = await createApp(config as any);
    container = app.container;

    container.bind(WebsocketServiceKey, WebsocketService);
    container.bind(BroadcastOthersTestService);

    websocketService = container.get(WebsocketServiceKey);

    vi.spyOn(websocketService, 'broadcastOthers').mockImplementation(broadcastSpy);

    initializeContainer(container);
  });

  it('should call broadcastOthers with the result of the method', async () => {
    const peer = { id: 'peer-1', namespace: '/broadcast' };
    const testService = container.get(BroadcastOthersTestService);

    const message = { text: 'hello' };
    const result = await testService.echoMessage(message, peer);

    expect(result).toEqual({ echoed: message });

    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy).toHaveBeenCalledWith(peer, {
      event: 'echoed',
      data: { echoed: message },
    });
  });
});