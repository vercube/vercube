/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { H3Event, MultiPartData as H3MultiPartData, SessionData as H3SessionData } from 'h3';
import { MetadataTypes } from './MetadataTypes';

/**
 * The HTTP event type.
 * This event is proxy type for the H3 event type.
 */
export type HttpEvent = H3Event;

export type SessionData<T extends H3SessionData = {}> = H3SessionData<T>;
type SessionUpdate<T extends SessionData = SessionData> = Partial<SessionData<T>> | ((oldData: SessionData<T>) => Partial<SessionData<T>> | undefined);
export interface SessionEvent<T extends H3SessionData = {}> {
  readonly id: any;
  readonly data: T;
  update: (update: SessionUpdate<T>) => Promise<any>;
  clear: () => Promise<any>;
}
export interface MiddlewareOptions<T = unknown> {
  middlewareArgs?: T;
  methodArgs?: MetadataTypes.Arg[];
}

export type MultiPartData = H3MultiPartData;