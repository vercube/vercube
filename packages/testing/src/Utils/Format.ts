import type { TestingTypes } from '../Types/TestingTypes';

/** Largest body a failure message shows, in bytes. */
const MAX_BODY_BYTES = 2048;

/** What replaces the value of a header that carries a credential. */
const REDACTED = '<redacted>';

/**
 * Header names that carry credentials, whole or as a `-` separated part, so
 * `x-api-key` and `x-auth-token` are caught along with `authorization`.
 */
const SECRET_PARTS: ReadonlySet<string> = new Set([
  'authorization',
  'cookie',
  'token',
  'secret',
  'password',
  'apikey',
  'credential',
  'credentials',
]);

/**
 * Tells whether a header carries a credential.
 *
 * @param name - The header name
 * @returns True when its value must not be printed
 */
export function isSecretHeader(name: string): boolean {
  const lower = name.toLowerCase();
  const parts = lower.split('-');

  return (
    SECRET_PARTS.has(lower.replaceAll('-', '')) ||
    parts.some((part, index) => SECRET_PARTS.has(part) || (index > 0 && SECRET_PARTS.has(parts[index - 1] + part)))
  );
}

/**
 * Caps a body at {@link MAX_BODY_BYTES}.
 *
 * @param body - The body as text
 * @returns The body, or its start with a note on how much was cut
 */
export function truncate(body: string): string {
  const bytes = new TextEncoder().encode(body);

  if (bytes.byteLength <= MAX_BODY_BYTES) {
    return body;
  }

  // decoding a cut multi-byte character yields U+FFFD rather than throwing
  const head = new TextDecoder().decode(bytes.slice(0, MAX_BODY_BYTES));

  return `${head}… (${bytes.byteLength} bytes in total)`;
}

/**
 * Renders one side of the exchange: its headers, then its body.
 *
 * @param label - `request` or `response`
 * @param headers - The headers to print, credentials withheld
 * @param body - The body to print
 * @returns The lines, the first one labelled
 */
function side(label: string, headers: Headers, body: string | undefined): string[] {
  const lines: string[] = [];

  for (const [name, value] of headers) {
    lines.push(`${name}: ${isSecretHeader(name) ? REDACTED : value}`);
  }

  if (body !== undefined && body !== '') {
    lines.push(...truncate(body).split('\n'));
  }

  if (lines.length === 0) {
    lines.push('(empty)');
  }

  const indent = ' '.repeat(label.length + 1);

  return lines.map((line, index) => `  ${index === 0 ? `${label} ` : indent}${line}`);
}

/**
 * Formats a failed expectation with the exchange it was about.
 *
 * ```
 * Expected status 200, got 422
 *
 *   POST http://localhost/users
 *   request  content-type: application/json
 *            {"name":"A"}
 *   response content-type: application/json
 *            {"errors":[{"path":"name","message":"Too short"}]}
 * ```
 *
 * @param headline - What was expected and what happened
 * @param request - The request
 * @param response - The response, its body already read
 * @returns The message
 */
export function formatFailure(
  headline: string,
  request: TestingTypes.RequestSnapshot,
  response?: TestingTypes.ResponseSnapshot,
): string {
  const lines = [headline, '', `  ${request.method} ${request.url}`, ...side('request ', request.headers, request.body)];

  if (response) {
    lines.push(...side('response', response.headers, response.body));
  }

  return lines.join('\n');
}

/**
 * Renders a value for a log line or a message.
 *
 * @param value - Anything
 * @returns A short string
 */
export function render(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
