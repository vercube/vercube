import { headersToObject } from '../../../Utils';
import type { HttpRequest } from '@azure/functions';

/**
 * Converts an Azure Functions HttpRequest to a standard web Request object.
 *
 * This function bridges the gap between Azure Functions HTTP triggers and the standard
 * web Request API. It extracts the HTTP method, URL, headers, and body from the Azure
 * Functions HttpRequest and creates a standard Request object that can be used with
 * the Vercube application framework.
 *
 * The function handles:
 * - HTTP method extraction from the request
 * - URL preservation from the Azure Functions request
 * - Header conversion from Azure Functions format to standard Headers
 * - Body handling for non-GET/HEAD requests with proper duplex stream support
 *
 * This file is highly inspired by the `newRequestFromAzureFunctions` from `hono-azurefunc-adapter`
 * @see https://github.com/Marplex/hono-azurefunc-adapter/blob/main/src/request.ts
 *
 * @param request - The Azure Functions HttpRequest object to convert
 * @returns A standard web Request object compatible with the fetch API
 * @throws {Error} If the request object is invalid or missing required properties
 */
export function convertEventToRequest(request: HttpRequest): Request {
  const hasBody = !['GET', 'HEAD'].includes(request.method);

  return new Request(request.url, {
    method: request.method,
    headers: headersToObject(request.headers),
    ...(hasBody ? { body: request.body as ReadableStream, duplex: 'half' } : {}),
  });
}
