import type { Span } from '@opentelemetry/api';

/** Content types whose bodies are safe to decode as text. */
const TEXT_CONTENT_TYPES: readonly string[] = [
  'application/json',
  'application/ld+json',
  'application/x-www-form-urlencoded',
  'application/xml',
  'application/javascript',
  'application/graphql',
  'text/',
  '+json',
  '+xml',
];

/** Default cap on how much of a body is kept, in bytes. */
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

/** Span event name carrying the request body. */
export const REQUEST_BODY_EVENT = 'http.request.body';

/** Span event name carrying the response body. */
export const RESPONSE_BODY_EVENT = 'http.response.body';

/** Why a body is not shown in full. */
export type BodyOmission = 'empty' | 'binary' | 'too-large' | 'streaming' | 'unreadable';

/** What was captured of one message body. */
export interface BodyPreview {
  contentType: string | null;
  /** Total size in bytes, even when only a prefix was kept. */
  size: number;
  /** Decoded text, absent when the body was omitted. */
  text?: string;
  /** True when only a prefix of the body is in `text`. */
  truncated: boolean;
  /** Set when no text is available, explaining why. */
  omitted?: BodyOmission;
}

/**
 * Starts reading the incoming request body.
 *
 * The clone has to be taken **before** the application reads the stream, so
 * this must be called before the handler runs, not from the span's settle
 * callback.
 *
 * @param request - The incoming request
 * @param maxBytes - Cap on the kept prefix
 * @returns The pending preview, or undefined when there is no body worth reading
 */
export function captureRequestBody(request: Request, maxBytes: number): Promise<BodyPreview> | undefined {
  if (!request.body || request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }

  return readBody(request.clone(), request.headers, maxBytes);
}

/**
 * Starts reading the outgoing response body.
 *
 * Must be called synchronously once the response exists: after the runtime
 * starts writing it to the socket there is nothing left to tee.
 *
 * @param response - The outgoing response
 * @param maxBytes - Cap on the kept prefix
 * @returns The pending preview, or undefined when there is no body
 */
export function captureResponseBody(response: Response, maxBytes: number): Promise<BodyPreview> | undefined {
  if (!response.body) {
    return undefined;
  }

  const contentType = response.headers.get('content-type');

  // A server-sent-events body never ends; reading it would hold the response open.
  if (contentType?.includes('text/event-stream')) {
    return Promise.resolve(omitted(contentType, 'streaming'));
  }

  return readBody(response.clone(), response.headers, maxBytes);
}

/**
 * Records a captured body as a span event.
 *
 * @param span - The span to annotate
 * @param name - Event name
 * @param preview - The captured body
 */
export function addBodyEvent(span: Span, name: string, preview: BodyPreview): void {
  span.addEvent(name, {
    'body.content_type': preview.contentType ?? undefined,
    'body.size': preview.size,
    'body.truncated': preview.truncated,
    'body.omitted': preview.omitted,
    'body.text': preview.text,
  });
}

/**
 * Reads a message body into a capped, decoded preview.
 *
 * @param message - A clone of the request or response
 * @param headers - Headers of the original message
 * @param maxBytes - Cap on the kept prefix
 * @returns The preview
 */
async function readBody(message: Request | Response, headers: Headers, maxBytes: number): Promise<BodyPreview> {
  const contentType = headers.get('content-type');
  const declared = Number.parseInt(headers.get('content-length') ?? '', 10);

  // A request built in-process carries no content-length, so this shortcut only
  // fires for real network traffic; everything else is read and capped below.
  if (Number.isFinite(declared) && declared > maxBytes) {
    return omitted(contentType, 'too-large', declared);
  }

  let bytes: Uint8Array;
  let size: number;

  try {
    ({ bytes, size } = await readCapped(message, maxBytes));
  } catch {
    return omitted(contentType, 'unreadable');
  }

  if (size === 0) {
    return omitted(contentType, 'empty');
  }

  if (!isTextual(contentType)) {
    return omitted(contentType, 'binary', size);
  }

  if (size > maxBytes) {
    // The cap can land mid-codepoint; drop the replacement characters it leaves.
    return { contentType, size, text: new TextDecoder().decode(bytes).replace(/�+$/, ''), truncated: true };
  }

  try {
    return { contentType, size, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), truncated: false };
  } catch {
    return omitted(contentType, 'binary', size);
  }
}

/**
 * Streams a body, keeping at most `maxBytes` of it in memory.
 *
 * The remainder is drained rather than cancelled, so the reported size stays
 * exact and the clone's tee buffer does not grow unbounded.
 *
 * @param message - A clone of the request or response
 * @param maxBytes - Cap on the kept prefix
 * @returns The captured prefix and the total size
 */
async function readCapped(message: Request | Response, maxBytes: number): Promise<{ bytes: Uint8Array; size: number }> {
  const reader = message.body?.getReader();

  if (!reader) {
    return { bytes: new Uint8Array(0), size: 0 };
  }

  const chunks: Uint8Array[] = [];
  let captured = 0;
  let size = 0;

  try {
    for (;;) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      size += value.byteLength;

      if (captured < maxBytes) {
        const slice = value.subarray(0, maxBytes - captured);
        chunks.push(slice);
        captured += slice.byteLength;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(captured);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { bytes, size };
}

/**
 * Whether a body of this content type should be decoded as text.
 *
 * @param contentType - Declared content type, when any
 * @returns True for textual bodies
 */
function isTextual(contentType: string | null): boolean {
  if (!contentType) {
    return true;
  }

  const normalized = contentType.toLowerCase();

  return TEXT_CONTENT_TYPES.some((candidate) => normalized.includes(candidate));
}

/**
 * Builds a preview that carries no text, only the reason.
 *
 * @param contentType - Declared content type, when known
 * @param reason - Why the body is not shown
 * @param size - Body size in bytes, when known
 * @returns The placeholder preview
 */
function omitted(contentType: string | null, reason: BodyOmission, size = 0): BodyPreview {
  return { contentType, size, truncated: false, omitted: reason };
}
