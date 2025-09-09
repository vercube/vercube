// HTTP method constants
export const DEFAULT_METHOD = 'GET';
export const DEFAULT_HOSTNAME = '.';

// Protocol constants
export const HTTP_PROTOCOL = 'http';
export const HTTPS_PROTOCOL = 'https';

// Response constants
export const DEFAULT_BODY = '';
export const DEFAULT_CONTENT_TYPE = '';

// Encoding constants
export const UTF8_ENCODING = 'utf8';
export const BASE64_ENCODING = 'base64';

// Header keys for case-insensitive access
export const HEADER_KEYS = {
  HOST: ['host', 'Host'],
  X_FORWARDED_PROTO: ['X-Forwarded-Proto', 'x-forwarded-proto'],
  COOKIE: 'cookie',
} as const;
