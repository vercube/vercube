import { ctxKey, type CtxKey } from './TypedRequestContext';

export const BearerTokenKey: CtxKey<string> = ctxKey<string>('bearerToken');
export const UserIdKey: CtxKey<string> = ctxKey<string>('userId');
export const RequestIdKey: CtxKey<string> = ctxKey<string>('requestId');
export const RequestStartTimeKey: CtxKey<number> = ctxKey<number>('requestStartTime');
export const RequestMethodKey: CtxKey<string> = ctxKey<string>('requestMethod');
export const RequestUrlKey: CtxKey<string> = ctxKey<string>('requestUrl');
export const CustomValueKey: CtxKey<string> = ctxKey<string>('customValue');
