import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, initializeContainer } from '@vercube/di';
import { Listen, HooksService } from '../../../src';

class TestEvent {}

class Test {

  @Listen(TestEvent)
  public eventHandler() {}
}

describe('Debounce decorator', () => {

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

  it('call handler on event dispatch', async () => {
    gHooksService.trigger(TestEvent);

    expect(tester.eventHandler).toHaveBeenCalled();
  });
});
