import { RequestContext } from '@vercube/core';
import { Container } from '@vercube/di';
import { RequestIdKey, RequestStartTimeKey } from '../src/Services/RequestContextKeys';
import { TypedRequestContext } from '../src/Services/TypedRequestContext';

const container = new Container();
container.bind(RequestContext);
container.bindTransient(TypedRequestContext);

const ctx = container.get(TypedRequestContext);

ctx.set(RequestIdKey, 'req-types-ok');
ctx.set(RequestStartTimeKey, 123);

// @ts-expect-error - RequestIdKey expects string
ctx.set(RequestIdKey, 123);

// @ts-expect-error - RequestStartTimeKey expects number
ctx.set(RequestStartTimeKey, 'not-a-number');
