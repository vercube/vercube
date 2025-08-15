import { stringifyQuery } from 'ufo';
import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';

// Constants for better maintainability
const DEFAULT_METHOD = 'GET';
const DEFAULT_HOSTNAME = '.';
const HTTP_PROTOCOL = 'http';
const HTTPS_PROTOCOL = 'https';

// Header keys for case-insensitive access
const HEADER_KEYS = {
  HOST: ['host', 'Host'],
  X_FORWARDED_PROTO: ['X-Forwarded-Proto', 'x-forwarded-proto'],
  COOKIE: 'cookie'
} as const;

/**
 * Type guard to check if an event is APIGatewayProxyEventV2
 */
function isV2Event(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): event is APIGatewayProxyEventV2 {
  return 'requestContext' in event && 
         'http' in event.requestContext && 
         'method' in event.requestContext.http;
}

/**
 * Type guard to check if an event is APIGatewayProxyEvent
 */
function isV1Event(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): event is APIGatewayProxyEvent {
  return 'httpMethod' in event;
}

/**
 * Safely gets a header value with case-insensitive fallback
 */
function getHeaderValue(headers: Record<string, string | undefined> | null | undefined, keys: readonly string[]): string | undefined {
  if (!headers) {
    return undefined;
  }
  
  for (const key of keys) {
    const value = headers[key];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

/**
 * Extracts the HTTP method from an API Gateway event.
 * 
 * Handles both v1 and v2 event formats:
 * - v1: Uses `httpMethod` property
 * - v2: Uses `requestContext.http.method` property
 * 
 * @param event - The AWS API Gateway event object (v1 or v2 format)
 * @returns The HTTP method as a string, defaults to 'GET' if not found
 */
function getEventMethod(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): string {
  if (isV1Event(event)) {
    return event.httpMethod || DEFAULT_METHOD;
  }
  
  if (isV2Event(event)) {
    return event.requestContext?.http?.method || DEFAULT_METHOD;
  }
  
  return DEFAULT_METHOD;
}

/**
 * Constructs a complete URL from an API Gateway event.
 * 
 * Builds the URL by combining:
 * - Protocol (http/https based on X-Forwarded-Proto header)
 * - Hostname (from headers or requestContext)
 * - Path (from event path properties)
 * - Query string (from query parameters)
 * 
 * @param event - The AWS API Gateway event object (v1 or v2 format)
 * @returns A complete URL object
 */
function getEventUrl(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): URL {
  const hostname = getEventHostname(event);
  const path = getEventPath(event);
  const query = getEventQuery(event);
  const protocol = getEventProtocol(event);

  const urlPath = query ? `${path}?${query}` : path;
  
  return new URL(urlPath, `${protocol}://${hostname}`);
}

/**
 * Extracts the hostname from the event
 */
function getEventHostname(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): string {
  const hostHeader = getHeaderValue(event.headers, HEADER_KEYS.HOST);
  if (hostHeader) {
    return hostHeader;
  }
  
  return event.requestContext?.domainName || DEFAULT_HOSTNAME;
}

/**
 * Extracts the path from the event
 */
function getEventPath(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): string {
  if (isV1Event(event)) {
    return event.path || '/';
  }
  
  if (isV2Event(event)) {
    return event.rawPath || '/';
  }
  
  return '/';
}

/**
 * Determines the protocol from the event headers
 */
function getEventProtocol(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): string {
  const forwardedProto = getHeaderValue(event.headers, HEADER_KEYS.X_FORWARDED_PROTO);
  return forwardedProto === HTTP_PROTOCOL ? HTTP_PROTOCOL : HTTPS_PROTOCOL;
}

/**
 * Extracts and formats query parameters from an API Gateway event.
 * 
 * Handles both v1 and v2 event formats:
 * - v2: Uses `rawQueryString` if available
 * - v1: Combines `queryStringParameters` and `multiValueQueryStringParameters`
 * 
 * @param event - The AWS API Gateway event object (v1 or v2 format)
 * @returns A formatted query string (without the leading '?')
 */
function getEventQuery(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): string {
  if (isV2Event(event) && typeof event.rawQueryString === 'string') {
    return event.rawQueryString;
  }
  
  const queryParams = event.queryStringParameters || {};
  const multiValueParams = isV1Event(event) ? event.multiValueQueryStringParameters || {} : {};
  
  const combinedParams = { ...queryParams, ...multiValueParams };
  
  return stringifyQuery(combinedParams);
}

/**
 * Converts API Gateway event headers to a standard Headers object.
 * 
 * Processes all headers from the event and handles cookies specially:
 * - Sets all event headers in the Headers object
 * - Appends cookies from the event's cookies array (v2 format)
 * 
 * @param event - The AWS API Gateway event object (v1 or v2 format)
 * @returns A Headers object with all event headers and cookies
 */
function getEventHeaders(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): Headers {
  const headers = new Headers();
  
  // Process all headers
  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      if (value !== undefined && value !== null) {
        headers.set(key, value);
      }
    }
  }
  
  // Handle cookies for v2 events
  if (isV2Event(event) && event.cookies && Array.isArray(event.cookies)) {
    for (const cookie of event.cookies) {
      if (cookie) {
        headers.append(HEADER_KEYS.COOKIE, cookie);
      }
    }
  }
  
  return headers;
}

/**
 * Extracts the request body from an API Gateway event.
 * 
 * Handles different body formats:
 * - Returns undefined if no body is present
 * - Decodes base64-encoded bodies when `isBase64Encoded` is true
 * - Returns the raw body string for regular requests
 * 
 * @param event - The AWS API Gateway event object (v1 or v2 format)
 * @returns The request body as BodyInit (string, Buffer, or undefined)
 */
function getEventBody(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): BodyInit | undefined {
  if (!event.body || event.body === null) {
    return undefined;
  }

  if (event.isBase64Encoded) {
    try {
      return Buffer.from(event.body, 'base64');
    } catch {
      // If base64 decoding fails, return the original body
      return event.body;
    }
  }
  
  return event.body;
}

/**
 * Converts an AWS API Gateway event to a standard Request object.
 * 
 * This function handles both APIGatewayProxyEvent (v1) and APIGatewayProxyEventV2 (v2) formats,
 * extracting the HTTP method, URL, headers, and body to create a web-standard Request object.
 * 
 * This file is highly inspired by the `awsRequest` from `nitro`
 * @see https://github.com/nitrojs/nitro/blob/v3/src/presets/aws-lambda/runtime/_utils.ts
 * 
 * @param event - The AWS API Gateway event object (v1 or v2 format)
 * @returns A new Request object with the extracted event data
 * @throws {Error} If the event is invalid or missing required properties
 */
export function convertEventToRequest(event: APIGatewayProxyEvent | APIGatewayProxyEventV2): Request {
  if (!event || typeof event !== 'object') {
    throw new Error('Invalid event: event must be a valid object');
  }

  const method = getEventMethod(event);
  const url = getEventUrl(event);
  const headers = getEventHeaders(event);
  const body = getEventBody(event);
  
  return new Request(url, { method, headers, body });
}