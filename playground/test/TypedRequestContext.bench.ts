import { RequestContext } from '@vercube/core';
import { Container } from '@vercube/di';
import { beforeEach, bench, describe } from 'vitest';
import { RequestIdKey, RequestStartTimeKey } from '../src/Services/RequestContextKeys';
import { TypedRequestContext } from '../src/Services/TypedRequestContext';

describe('TypedRequestContext overhead', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind(RequestContext);
    container.bindTransient(TypedRequestContext);
  });

  bench('direct RequestContext set/get', async () => {
    const requestContext = container.get(RequestContext);
    await requestContext.run(async () => {
      requestContext.set('requestId', 'req-123');
      requestContext.set('requestStartTime', 1_234_567_890);
      requestContext.get('requestId');
      requestContext.get('requestStartTime');
    });
  });

  bench('TypedRequestContext set/get', async () => {
    const requestContext = container.get(RequestContext);
    const ctx = container.get(TypedRequestContext);
    await requestContext.run(async () => {
      ctx.set(RequestIdKey, 'req-123');
      ctx.set(RequestStartTimeKey, 1_234_567_890);
      ctx.get(RequestIdKey);
      ctx.get(RequestStartTimeKey);
    });
  });
});
