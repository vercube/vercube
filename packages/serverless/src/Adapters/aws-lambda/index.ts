import type { App } from '@vercube/core';
import type { APIGatewayProxyEvent, APIGatewayProxyEventV2 } from 'aws-lambda';
import type { ServerlessHandler } from '../../Types/ServerlessTypes';
import { convertEventToRequest } from './Utils/Request';
import { convertResponseToAWSResponse, convertBodyToAWSResponse } from './Utils/Response';

/**
 * Converts a Vercube App instance into an AWS Lambda handler function for API Gateway integration.
 *
 * This function creates a serverless handler that bridges between AWS API Gateway events and
 * the Vercube application framework. It handles the conversion of AWS Lambda events to standard
 * web Request objects, processes them through the Vercube app, and converts the responses back
 * to the format expected by AWS API Gateway.
 *
 * The handler supports both API Gateway v1 (APIGatewayProxyEvent) and v2 (APIGatewayProxyEventV2)
 * event formats, automatically detecting and handling the appropriate format. It processes:
 * - HTTP method, URL, headers, and body from the Lambda event
 * - Converts them to a standard web Request object
 * - Passes the request through the Vercube application
 * - Converts the Response back to AWS API Gateway format
 *
 * The returned handler function can be directly used as an AWS Lambda function handler,
 * providing seamless integration between AWS Lambda and Vercube applications.
 *
 * @param app - The Vercube App instance that will handle the requests
 * @returns An async function that accepts AWS API Gateway events and returns API Gateway responses
 *
 * @see {@link convertEventToRequest} For details on event to request conversion
 * @see {@link convertResponseToAWSResponse} For details on response header conversion
 * @see {@link convertBodyToAWSResponse} For details on response body conversion
 */
export function toServerlessHandler(app: App): ServerlessHandler<APIGatewayProxyEvent | APIGatewayProxyEventV2> {
  return async (event: APIGatewayProxyEvent | APIGatewayProxyEventV2) => {
    const request = convertEventToRequest(event);
    const response = await app.fetch(request);

    return {
      statusCode: response.status,
      ...convertResponseToAWSResponse(response),
      ...(await convertBodyToAWSResponse(response)),
    };
  };
}
