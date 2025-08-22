// oxlint-disable no-new-array
// oxlint-disable no-array-for-each
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Container } from '@vercube/di';
import { HooksService } from '../../src/';

describe('HooksService', () => {

  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind(HooksService);
  });

  it('should allow to listen on event, trigger it and have listener called', async () => {

    class TestEvent {}
    const testEventListener = vi.fn();

    const hooks = container.get(HooksService);
    hooks.on(TestEvent, testEventListener);
    await hooks.trigger(TestEvent);

    expect(testEventListener).toBeCalled();

  });

  it('should allow multiple listeners for event and have them called', async () => {

    class TestEvent {}
    const testEventListeners = [
      vi.fn(),
      vi.fn(),
      vi.fn(),
    ];

    const hooks = container.get(HooksService);
    testEventListeners.forEach((listener) => hooks.on(TestEvent, listener));
    await hooks.trigger(TestEvent);

    testEventListeners.forEach((listener) => expect(listener).toBeCalled());

  });

  it('should allow multiple triggering of single event', async () => {

    class TestEvent {}
    const testEventListener = vi.fn();

    const hooks = container.get(HooksService);
    hooks.on(TestEvent, testEventListener);

    const triggers = new Array(5).fill(0).map(() => hooks.trigger(TestEvent));
    await Promise.all(triggers);

    expect(testEventListener).toBeCalledTimes(5);

  });

  it('should allow to pass payload in event and receive it on listener', () => {

    class TestEventWithPayload {

        public value: number;

    }

    let savedPayload: TestEventWithPayload = null!;

    const testEventListener = vi.fn((payload) => { savedPayload = payload; });

    const hooks = container.get(HooksService);
    hooks.on(TestEventWithPayload, testEventListener);
    hooks.trigger(TestEventWithPayload, {
      value: 42,
    });

    expect(testEventListener).toBeCalledWith({ value: 42 });
    expect(savedPayload).toBeInstanceOf(TestEventWithPayload);

  });

  it('should allow to await until all async listeners are done', async () => {

    // expect  one assertion
    expect.assertions(2);

    // some value that will be updated asynchronously
    let someValue: number = 0;

    // asynchronous event listener function that updates value after minor delay
    const asyncListenerFunction = (): Promise<void> => new Promise((resolve) => {
      // after 0.1s, set someValue as 10
      setTimeout(() => {
        someValue = 10;
        resolve();
      }, 10);
    });

    class TestEvent {}
    const testEventListener = vi.fn(asyncListenerFunction);

    const hooks = container.get(HooksService);
    hooks.on(TestEvent, testEventListener);

    expect(someValue).toEqual(0);
    await hooks.trigger(TestEvent); // await until all async listeners are triggered
    expect(someValue).toEqual(10); // it should wait minor timeout before leaving trigger()

  });

  it('should allow to remove event listener', async () => {

    expect.assertions(1);

    class TestEvent {}
    const testEventListener = vi.fn();

    const hooks = container.get(HooksService);
    const listenerId = hooks.on(TestEvent, testEventListener); // store id to remove later
    hooks.off(listenerId); // remove listener

    await hooks.trigger(TestEvent); // trigger the event
    expect(testEventListener).not.toBeCalled();

  });

  it('should throw error if try to remove non-existing event listener', () => {

    class TestEvent {}

    const hooks = container.get(HooksService);
    const listenerId = hooks.on(TestEvent, () => {});

    // remove it for the first time
    hooks.off(listenerId);

    // remove it for the second time
    expect(() => {
      hooks.off(listenerId);
    }).toThrowError();

  });

  it('should throw error if try to remove listener with invalid ID', () => {

    class TestEvent {}

    const hooks = container.get(HooksService);
    
    // Create a fake listener ID that doesn't exist
    const fakeListenerId = {
      __type: TestEvent,
      __id: 'non-existent-id'
    } as any;

    // Try to remove a listener that was never registered
    expect(() => {
      hooks.off(fakeListenerId);
    }).toThrowError('Trying to unbind event that was not bound.');

  });

  it('should allow waiting for event to be triggered', async () => {

    // expect two assertions
    expect.assertions(2);

    // some value that will be updated asynchronously
    let someValue: number = 0;

    // test event class
    class TestEvent {}

    // get hooks from container
    const hooks = container.get(HooksService);

    // asynchronously trigger the event after minor timeout
    setTimeout(() => {
      someValue = 10;
      hooks.trigger(TestEvent);
    }, 10);

    // before waiting, expect the value to equal 0
    expect(someValue).toEqual(0);

    // make waitFor() call to await until event is triggered
    await hooks.waitFor(TestEvent, null);

    // if waitFor() really waited, then someValue will have value 10 instead of 0
    expect(someValue).toEqual(10);

  });

  it('should throw when timeout is exceeded and event was not called', () => new Promise((resolve) => {

    // expect 1 assertions
    expect.assertions(1);

    // test event class
    class TestEvent {}

    // get hooks from container
    const hooks = container.get(HooksService);

    // make waitFor() call with timeout
    hooks.waitFor(TestEvent, 10)
      .then(() => {
        resolve(1);
      })
      .catch((error) => {
        expect(error).not.toBeNull();
        resolve(1);
      });

  }));

  it('should call two triggers if two waitFor() are used on same event', async () => {

    class TestEvent {}

    // get hooks from container
    const hooks = container.get(HooksService);
    let method1Done = false;
    let method2Done = false;

    async function someMethod1() {
      await hooks.waitFor(TestEvent);
      method1Done = true;
    }

    async function someMethod2() {
      await hooks.waitFor(TestEvent);
      method2Done = true;
    }

    someMethod1();
    someMethod2();

    await hooks.trigger(TestEvent);

    expect(method1Done).toBe(true);
    expect(method2Done).toBe(true);

  });

});
