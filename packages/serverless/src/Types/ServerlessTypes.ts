import type { MaybePromise } from '@vercube/core';

export type ServerlessHandler<Event = unknown, HandlerResponse = unknown, Context = unknown> = (
  event: Event,
  context?: Context,
) => MaybePromise<HandlerResponse>;
