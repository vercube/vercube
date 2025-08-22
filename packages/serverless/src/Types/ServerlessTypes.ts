import type { MaybePromise } from '@vercube/core';

export type ServerlessHandler<Event = unknown, HandlerResponse = unknown> = (event: Event) => MaybePromise<HandlerResponse>;
