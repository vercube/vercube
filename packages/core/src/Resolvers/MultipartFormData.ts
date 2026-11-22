import { CoreErrors } from '../Errors/Catalog';
import { PayloadTooLargeError } from '../Errors/Http/PayloadTooLargeError';
import { isSafeProperty } from '../Utils/Security';
import { readBytes, readSharedBytes } from '../Utils/SharedBody';
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
    throw CoreErrors.MULTIPART_EXPECTED();
  }

  let form: FormData;

  try {
    form = await readForm(event, contentType);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      throw error;
    }

    throw CoreErrors.MULTIPART_INVALID();
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
 * Reads a multipart body, enforcing the size limit.
 *
 * Where nothing else can read the body, the runtime parses it straight off the
 * request. Otherwise its bytes are read once and shared, and the form is parsed
 * from them.
 *
 * @param {RouterTypes.RouterEvent} event - The router event
 * @param {string} contentType - The `Content-Type` header, which carries the boundary
 * @returns {Promise<FormData>} The parsed form
 * @throws {PayloadTooLargeError} If the body is larger than the limit
 */
async function readForm(event: RouterTypes.RouterEvent, contentType: string): Promise<FormData> {
  const { request, bodyLimit } = event;

  if (event.cloneBody === false && (bodyLimit === undefined || request.headers.has('content-length'))) {
    if (bodyLimit !== undefined && Number(request.headers.get('content-length')) > bodyLimit) {
      throw CoreErrors.BODY_TOO_LARGE();
    }

    return request.formData();
  }

  const bytes = event.cloneBody === false ? await readBytes(request, bodyLimit) : await readSharedBytes(request, bodyLimit);

  return new Response(bytes as BodyInit, { headers: { 'content-type': contentType } }).formData();
}
