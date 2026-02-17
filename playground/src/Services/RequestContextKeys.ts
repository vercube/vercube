import { ctxKey } from './TypedRequestContext';

export const BearerTokenKey = ctxKey<string>('bearerToken');
export const UserIdKey = ctxKey<string>('userId');
export const RequestIdKey = ctxKey<string>('requestId');
export const RequestStartTimeKey = ctxKey<number>('requestStartTime');
export const RequestMethodKey = ctxKey<string>('requestMethod');
export const RequestUrlKey = ctxKey<string>('requestUrl');
export const CustomValueKey = ctxKey<string>('customValue');
