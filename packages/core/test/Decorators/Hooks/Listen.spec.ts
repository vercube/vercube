import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, destroyContainer, initializeContainer } from '@vercube/di';
import { HooksService, Listen } from '../../../src';

class TestEvent {}

class Test {
  @Listen(TestEvent)
  public eventHandler() {}
}

describe('Listen decorator', () => {
  let container: Container;
  let tester: Test;
  let gHooksService: HooksService;

  beforeEach(() => {
    container = new Container();
    container.bind(HooksService);
    container.bind(Test);

    initializeContainer(container);

    tester = container.get(Test);
    gHooksService = container.get(HooksService);
    vi.spyOn(tester, 'eventHandler');
  });

  it('should call handler on event dispatch', async () => {
    gHooksService.trigger(TestEvent);

    expect(tester.eventHandler).toHaveBeenCalled();
  });

  it('should unregister event listener when decorator is destroyed', async () => {
    const offSpy = vi.spyOn(gHooksService, 'off');

    gHooksService.trigger(TestEvent);
    expect(tester.eventHandler).toHaveBeenCalledTimes(1);

    destroyContainer(container);

    expect(offSpy).toHaveBeenCalled();

    vi.clearAllMocks();
    gHooksService.trigger(TestEvent);
    expect(tester.eventHandler).not.toHaveBeenCalled();
  });
});
