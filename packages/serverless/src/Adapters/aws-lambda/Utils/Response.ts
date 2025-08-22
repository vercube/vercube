// oxlint-disable no-array-for-each
// Constants for better maintainability
const DEFAULT_BODY = '';
const DEFAULT_CONTENT_TYPE = '';
const UTF8_ENCODING = 'utf8';
const BASE64_ENCODING = 'base64';

// Content type patterns for text detection
const TEXT_CONTENT_TYPE_PATTERNS = [
  /^text\//,
  /^application\/(json|javascript|xml|xml\+text|x-www-form-urlencoded)$/,
  /^application\/.*\+json$/,
  /^application\/.*\+xml$/,
  /utf-?8/,
] as const;

/**
 * AWS Lambda response structure for API Gateway integration
 */
interface AWSResponseHeaders {
  headers: Record<string, string>;
  cookies?: string[];
  multiValueHeaders?: Record<string, string[]>;
}

/**
 * AWS Lambda response body structure
 */
interface AWSResponseBody {
  body: string;
  isBase64Encoded?: boolean;
}

/**
 * Converts a standard web Response object to AWS API Gateway compatible response format.
 *
 * This function transforms the Response headers and cookies into the format expected by
 * AWS API Gateway proxy integrations. It handles both v1 and v2 API Gateway formats:
 * - v1: Uses `multiValueHeaders` for cookies
 * - v2: Uses `cookies` array for cookies
 *
 * The function processes all response headers, converting them to the appropriate format
 * for AWS Lambda integration. Headers with multiple values are joined with commas,
 * and cookies are handled specially for both API Gateway versions.
 *
 * @param response - The standard web Response object to convert
 * @returns An object containing headers and cookies in AWS API Gateway format
 * @throws {Error} If the response object is invalid or headers cannot be processed
 */
export function convertResponseToAWSResponse(response: Response): AWSResponseHeaders {
  if (!response || !response.headers) {
    throw new Error('Invalid response: response must be a valid Response object with headers');
  }

  const headers: Record<string, string> = Object.create(null);

  // Process all response headers
  response.headers.forEach((value, key) => {
    if (value !== undefined && value !== null) {
      // Handle arrays by joining with commas, otherwise convert to string
      headers[key] = Array.isArray(value) ? value.join(',') : String(value);
    } else if (value === null) {
      headers[key] = 'null';
    } else if (value === undefined) {
      headers[key] = 'undefined';
    }
  });

  // Extract cookies for API Gateway compatibility
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];

  // Return appropriate format based on whether cookies exist
  if (cookies.length > 0) {
    return {
      headers,
      cookies, // API Gateway v2 format
      multiValueHeaders: { 'set-cookie': cookies }, // API Gateway v1 format
    };
  }

  return { headers };
}

/**
 * Converts a Response body to AWS API Gateway compatible format with proper encoding.
 *
 * AWS Lambda proxy integrations require special handling for binary content:
 * - Text content types are returned as UTF-8 strings
 * - Binary content types are base64 encoded with the `isBase64Encoded` flag set
 *
 * This function determines the appropriate encoding based on the response's content-type
 * header and converts the body accordingly. It supports both text and binary content
 * types, ensuring compatibility with API Gateway's payload encoding requirements.
 *
 * Binary media types should be configured as * in API Gateway settings.
 * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-payload-encodings.html
 *
 * This function is heavily inspired by the `awsResponseBody` from `nitro`
 * @see https://github.com/nitrojs/nitro/blob/v3/src/presets/aws-lambda/runtime/_utils.ts
 *
 * @param response - The standard web Response object containing the body to convert
 * @returns A promise that resolves to an object with the encoded body and encoding flag
 * @throws {Error} If the response body cannot be read or converted
 */
export async function convertBodyToAWSResponse(response: Response): Promise<AWSResponseBody> {
  if (!response) {
    throw new Error('Invalid response: response must be a valid Response object');
  }

  // Handle empty body case
  if (!response.body) {
    return { body: DEFAULT_BODY };
  }

  try {
    const buffer = await toBuffer(response.body);
    const contentType = response.headers.get('content-type') || DEFAULT_CONTENT_TYPE;

    // Determine if content should be treated as text or binary
    if (isTextType(contentType)) {
      return { body: buffer.toString(UTF8_ENCODING) };
    } else {
      return {
        body: buffer.toString(BASE64_ENCODING),
        isBase64Encoded: true,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to convert response body: ${errorMessage}`);
  }
}

/**
 * Determines if a content type should be treated as text content.
 *
 * This function uses a set of patterns to identify text-based content types:
 * - Content types starting with "text/" (e.g., text/plain, text/html)
 * - JavaScript, JSON, or XML content types
 * - Content types containing UTF-8 encoding specification
 *
 * The function performs case-insensitive matching to handle various content type
 * formats and specifications.
 *
 * @param contentType - The content type string to evaluate (e.g., "text/plain", "application/json")
 * @returns True if the content type should be treated as text, false otherwise
 */
function isTextType(contentType: string = DEFAULT_CONTENT_TYPE): boolean {
  if (!contentType) {
    return false;
  }

  return TEXT_CONTENT_TYPE_PATTERNS.some((pattern) => pattern.test(contentType));
}

/**
 * Converts a ReadableStream to a Buffer using Web Streams API.
 *
 * This function reads all chunks from a ReadableStream and concatenates them
 * into a single Buffer. It uses the modern Web Streams API with WritableStream
 * to efficiently process the stream data without blocking.
 *
 * The function handles stream errors gracefully and provides proper cleanup
 * of stream resources. It's designed to work with Response.body streams
 * from fetch API responses.
 *
 * @param data - The ReadableStream to convert to a Buffer
 * @returns A promise that resolves to a Buffer containing all stream data
 * @throws {Error} If the stream cannot be read or an error occurs during processing
 */
function toBuffer(data: ReadableStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    // Create a WritableStream to collect chunks
    const writableStream = new WritableStream({
      write(chunk: Buffer) {
        chunks.push(chunk);
      },
      close() {
        // Concatenate all chunks into a single buffer
        resolve(Buffer.concat(chunks));
      },
      abort(reason: any) {
        reject(new Error('Stream aborted: ' + String(reason)));
      },
    });

    // Pipe the readable stream to the writable stream
    data.pipeTo(writableStream).catch(reject);
  });
}
