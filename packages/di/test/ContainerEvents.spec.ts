/**
 * These tests are simiplar to "Container.spec.ts" but here we test strictly new container API. I've used
 * this to TDD my way towards working IOC container.
 *
 * The old Container.spec.ts measures backward compatiblity between new & old container.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from '../src';

class MyClass {}
class MyRuntimeClass {}
class MyOtherRuntimeClass {}

describe('[Framework][IOC] Container', () => {

  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('should allow to register on "expanded" event', () => {

    const callbackFn = vi.fn();

    container.bind(MyClass);
    container.flushQueue();
    container.events.onExpanded(callbackFn);

    container.expand((ctr) => {
      ctr.bind(MyRuntimeClass);
      ctr.bind(MyOtherRuntimeClass);
    });

    expect(callbackFn).toBeCalledWith([MyRuntimeClass, MyOtherRuntimeClass]);

  });

});
