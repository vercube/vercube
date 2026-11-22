import type { BuiltRequest, RequestHeader } from './request';

/**
 * "Copy as curl" and "Copy as fetch" of the route playground.
 *
 * The playground's own headers (the marker, the trace parent) are never
 * exported: they mean something only to the devtools instance that sent them.
 * Credentials are left out unless the caller asks for them.
 */

/** What an export includes. */
export interface ExportOptions {
  /** Origin the target is resolved against, such as `http://localhost:3000`. */
  origin: string;
  /** Whether credential headers and cookies are written out. */
  includeCredentials?: boolean;
}

/**
 * Quotes a value for a POSIX shell.
 *
 * @param value - Any text
 * @returns The text in single quotes, with embedded quotes escaped
 */
function quote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

/**
 * The headers an export shows.
 *
 * @param request - The built request
 * @param includeCredentials - Whether credentials are written out
 * @returns The headers, with cookies folded into one `Cookie` header
 */
function exportedHeaders(request: BuiltRequest, includeCredentials: boolean): RequestHeader[] {
  const headers = request.headers.filter((header) => !header.internal && (includeCredentials || !header.secret));
  const cookies = request.cookies.filter((cookie) => includeCredentials || !cookie.secret);

  if (cookies.length > 0) {
    headers.push({
      name: 'Cookie',
      value: cookies.map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`).join('; '),
      secret: false,
      internal: false,
    });
  }

  return headers;
}

/**
 * Writes a request as a curl command.
 *
 * @param request - The built request
 * @param options - Origin, and whether credentials are included
 * @returns The command, one option per line
 */
export function toCurl(request: BuiltRequest, options: ExportOptions): string {
  const lines = [`curl -X ${request.method} ${quote(`${options.origin}${request.target}`)}`];

  for (const header of exportedHeaders(request, options.includeCredentials === true)) {
    lines.push(`-H ${quote(`${header.name}: ${header.value}`)}`);
  }

  if (request.body.kind === 'text') {
    lines.push(`--data-raw ${quote(request.body.text)}`);
  } else if (request.body.kind === 'form') {
    for (const field of request.body.fields) {
      lines.push(`-F ${quote(`${field.name}=${field.value}`)}`);
    }
  }

  return lines.join(' \\\n  ');
}

/**
 * Writes a request as a `fetch` call.
 *
 * @param request - The built request
 * @param options - Origin, and whether credentials are included
 * @returns JavaScript source
 */
export function toFetch(request: BuiltRequest, options: ExportOptions): string {
  const headers = exportedHeaders(request, options.includeCredentials === true);
  const lines: string[] = [];

  if (request.body.kind === 'form') {
    lines.push('const form = new FormData();');

    for (const field of request.body.fields) {
      lines.push(`form.append(${JSON.stringify(field.name)}, ${JSON.stringify(field.value)});`);
    }

    lines.push('');
  }

  lines.push(`const response = await fetch(${JSON.stringify(`${options.origin}${request.target}`)}, {`);
  lines.push(`  method: ${JSON.stringify(request.method)},`);

  if (headers.length > 0) {
    lines.push('  headers: {');

    for (const header of headers) {
      lines.push(`    ${JSON.stringify(header.name)}: ${JSON.stringify(header.value)},`);
    }

    lines.push('  },');
  }

  if (request.body.kind === 'text') {
    lines.push(`  body: ${JSON.stringify(request.body.text)},`);
  } else if (request.body.kind === 'form') {
    lines.push('  body: form,');
  }

  lines.push('});');

  return lines.join('\n');
}
