import type { H3Event } from 'h3';
import { MetadataTypes } from './MetadataTypes';

/**
 * The HTTP event type.
 * This event is proxy type for the H3 event type.
 */
export type HttpEvent = H3Event;

export interface MiddlewareOptions<T = unknown> {
  middlewareArgs?: T;
  methodArgs?: MetadataTypes.Arg[];
}