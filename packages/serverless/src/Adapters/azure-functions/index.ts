import { convertEventToRequest } from './Utils/Request';
import { convertResponseToAzureFunctionsResponse } from './Utils/Response';
import type { ServerlessHandler } from '../../Types/ServerlessTypes';
import type { HttpRequest } from '@azure/functions';
import type { App } from '@vercube/core';

/**
 * Converts a Vercube App instance into an Azure Functions handler function for HTTP integration.
 *
 * This function creates a serverless handler that bridges between Azure Functions HTTP triggers
 * and the Vercube application framework. It handles the conversion of Azure Functions HttpRequest
 * objects to standard web Request objects, processes them through the Vercube app, and converts
 * the responses back to the format expected by Azure Functions.
 *
 * The handler processes:
 * - HTTP method, URL, headers, and body from the Azure Functions HttpRequest
 * - Converts them to a standard web Request object
 * - Passes the request through the Vercube application
 * - Converts the Response back to Azure Functions HttpResponseInit format
 *
 * The returned handler function can be directly used as an Azure Functions HTTP trigger handler,
 * providing seamless integration between Azure Functions and Vercube applications.
 *
 * @param app - The Vercube App instance that will handle the requests
 * @returns An async function that accepts Azure Functions HttpRequest and returns HttpResponseInit
 *
 * @see {@link convertEventToRequest} For details on HttpRequest to Request conversion
 * @see {@link convertResponseToAzureFunctionsResponse} For details on Response to HttpResponseInit conversion
 */
export function toServerlessHandler(app: App): ServerlessHandler<HttpRequest, any> {
  return async (event: HttpRequest) => {
    const request = convertEventToRequest(event);
    const response = await app.fetch(request);

    return convertResponseToAzureFunctionsResponse(response);
  };
}
