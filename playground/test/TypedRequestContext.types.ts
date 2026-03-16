import { RequestContext } from '@vercube/core';
import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { vi } from 'vitest';
import { RequestIdKey, RequestStartTimeKey } from '../src/Services/RequestContextKeys';
import { TypedRequestContext } from '../src/Services/TypedRequestContext';

const container = new Container();
container.bindMock(Logger, {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});
container.bind(RequestContext);
container.bindTransient(TypedRequestContext);

const ctx = container.get(TypedRequestContext);

ctx.set(RequestIdKey, 'req-types-ok');
ctx.set(RequestStartTimeKey, 123);

// @ts-expect-error - RequestIdKey expects string
ctx.set(RequestIdKey, 123);

// @ts-expect-error - RequestStartTimeKey expects number
ctx.set(RequestStartTimeKey, 'not-a-number');
