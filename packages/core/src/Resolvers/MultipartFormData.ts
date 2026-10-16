import { BadRequestError } from '../Errors/Http/BadRequestError';
import { PayloadTooLargeError } from '../Errors/Http/PayloadTooLargeError';
import { UnsupportedMediaTypeError } from '../Errors/Http/UnsupportedMediaTypeError';
import { isSafeProperty } from '../Utils/Security';
import type { RouterTypes } from '../Types/RouterTypes';

/**
 * Fields of a multipart form: text fields are strings, uploads are `File`s, and
 * a repeated field becomes an array of its values.
 */
export type MultipartFields = Record<string, FormDataEntryValue | FormDataEntryValue[]>;

/**
 * Resolves a `multipart/form-data` request body into its fields.
 *
 * @param {RouterTypes.RouterEvent} event - The router event containing the request to process
 * @returns {Promise<MultipartFields | undefined>} The fields, or undefined when the request has no body
 * @throws {UnsupportedMediaTypeError} If the body is not `multipart/form-data`
 * @throws {PayloadTooLargeError} If the body is larger than `event.bodyLimit`
 * @throws {BadRequestError} If the body is not valid multipart data
 */
export async function resolveMultipartFormData(event: RouterTypes.RouterEvent): Promise<MultipartFields | undefined> {
  if (event.request.body === null) {
    return undefined;
  }

  const contentType = event.request.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new UnsupportedMediaTypeError('Expected a multipart/form-data request body');
  }

  const request = event.cloneBody === false ? event.request : event.request.clone();
  let form: FormData;

  try {
    form = await readForm(request, contentType, event.bodyLimit);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      throw error;
    }

    throw new BadRequestError('Invalid multipart/form-data body');
  }

  const fields: MultipartFields = {};

  for (const [key, value] of form) {
    if (!isSafeProperty(key)) {
      continue;
    }

    const current = Object.hasOwn(fields, key) ? fields[key] : undefined;

    if (current === undefined) {
      fields[key] = value;
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      fields[key] = [current, value];
    }
  }

  return fields;
}

/**
 * Parses the form, enforcing the size limit. A declared `Content-Length` is
 * checked up front, a body without one is buffered only up to the limit.
 *
 * @param {Request} request - The request to read
 * @param {string} contentType - The `Content-Type` header, carrying the boundary
 * @param {number | undefined} limit - The maximum body size in bytes
 * @returns {Promise<FormData>} The parsed form
 * @throws {PayloadTooLargeError} If the body is larger than the limit
 */
async function readForm(request: Request, contentType: string, limit: number | undefined): Promise<FormData> {
  if (limit === undefined) {
    return request.formData();
  }

  const length = request.headers.get('content-length');

  if (length !== null) {
    if (Number(length) > limit) {
      throw new PayloadTooLargeError('Request body is too large');
    }

    return request.formData();
  }

  const reader = request.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > limit) {
      // not awaited: a branch of a cloned body only settles its cancel once the
      // other branch is cancelled too, which nothing here would ever do
      reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError('Request body is too large');
    }

    chunks.push(value);
  }

  return new Response(new Blob(chunks as BlobPart[]), { headers: { 'content-type': contentType } }).formData();
}
