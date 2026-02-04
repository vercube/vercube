import { headersToObject } from '../../../Utils';
import { cookiesFromHeaders } from './Utils';
import type { HttpResponseInit } from '@azure/functions';

/**
 * Converts a standard web Response object to Azure Functions HttpResponseInit format.
 *
 * This function transforms a standard web Response object into the format expected by
 * Azure Functions HTTP responses. It handles the conversion of headers, cookies, status
 * code, and body to ensure compatibility with Azure Functions runtime.
 *
 * The function processes:
 * - Response headers conversion to plain object format
 * - Set-Cookie headers extraction and conversion to Azure Functions Cookie format
 * - HTTP status code preservation
 * - Response body conversion to AsyncIterableIterator for Azure Functions compatibility
 *
 * This file is highly inspired by the `newAzureFunctionsResponse` from `hono-azurefunc-adapter`
 * @see https://github.com/Marplex/hono-azurefunc-adapter/blob/main/src/response.ts
 *
 * @param response - The standard web Response object to convert
 * @returns An HttpResponseInit object compatible with Azure Functions
 * @throws {Error} If the response object is invalid or missing required properties
 */
export function convertResponseToAzureFunctionsResponse(response: Response): HttpResponseInit {
  const headers = headersToObject(response.headers);
  const cookies = cookiesFromHeaders(response.headers);

  return {
    cookies,
    headers,
    status: response.status,
    // Cast needed: web standard ReadableStream is compatible with Node.js stream/web ReadableStream
    // but TypeScript sees them as different types
    body: response.body as HttpResponseInit['body'],
  };
}
