import { isSecretKey } from '@vercube/core';

/** Placeholder written in place of a withheld value. */
export const REDACTED = '<redacted>';

/** The placeholder as a JSON string literal. */
const REDACTED_JSON = JSON.stringify(REDACTED);

/**
 * Rewrites a query string or urlencoded body with credential-bearing values withheld.
 *
 * A secret in `?access_token=` is as sensitive as one in an `Authorization`
 * header, and it ends up in traces, downloadable snapshots and any exporter
 * that shares the pipeline. The same name matching used for configuration
 * values decides what to withhold.
 *
 * @param query - The raw query string, without the leading `?`
 * @returns The query string with secret values replaced, or the input untouched when nothing matched
 */
export function redactQuery(query: string): string {
  const params = new URLSearchParams(query);
  let redacted = false;

  // Snapshotted into a Set, because the loop writes back into `params`.
  for (const key of new Set(params.keys())) {
    if (isSecretKey(key)) {
      params.set(key, REDACTED);
      redacted = true;
    }
  }

  return redacted ? params.toString() : query;
}

/**
 * Rewrites JSON text with the values of credential-named keys withheld.
 *
 * Works on the text rather than on a parsed value, so the original formatting
 * survives and a body cut off mid-value by the capture cap is still masked:
 * a secret value that runs past the end of the text is withheld up to there.
 * The whole value under a matching key is replaced, objects and arrays included.
 *
 * @param text - JSON text, possibly truncated
 * @returns The text with secret values replaced, or the input untouched when nothing matched
 */
export function redactJson(text: string): string {
  let out = '';
  let copied = 0;
  let index = 0;

  while (index < text.length) {
    if (text[index] !== '"') {
      index++;
      continue;
    }

    const keyEnd = skipString(text, index);
    const colon = skipWhitespace(text, keyEnd);

    if (text[colon] !== ':' || !isSecretKey(decodeKey(text.slice(index, keyEnd)))) {
      index = keyEnd;
      continue;
    }

    const valueStart = skipWhitespace(text, colon + 1);

    if (valueStart >= text.length) {
      break;
    }

    const valueEnd = skipValue(text, valueStart);

    out += text.slice(copied, valueStart) + REDACTED_JSON;
    copied = valueEnd;
    index = valueEnd;
  }

  return copied === 0 ? text : out + text.slice(copied);
}

/**
 * @param text - JSON text
 * @param start - Index of the opening quote
 * @returns Index just past the closing quote, or the end of the text when unterminated
 */
function skipString(text: string, start: number): number {
  let index = start + 1;

  while (index < text.length) {
    const char = text[index];

    if (char === '\\') {
      index += 2;
    } else if (char === '"') {
      return index + 1;
    } else {
      index++;
    }
  }

  return text.length;
}

/**
 * @param text - JSON text
 * @param start - Index to start from
 * @returns Index of the first non-whitespace character at or after `start`
 */
function skipWhitespace(text: string, start: number): number {
  let index = start;

  while (index < text.length && /\s/.test(text[index])) {
    index++;
  }

  return index;
}

/**
 * @param text - JSON text
 * @param start - Index of the value's first character
 * @returns Index just past the value, or the end of the text when it is cut off
 */
function skipValue(text: string, start: number): number {
  const first = text[start];

  if (first === '"') {
    return skipString(text, start);
  }

  if (first !== '{' && first !== '[') {
    let index = start;

    while (index < text.length && !/[\s,}\]]/.test(text[index])) {
      index++;
    }

    return index;
  }

  let depth = 0;
  let index = start;

  while (index < text.length) {
    const char = text[index];

    if (char === '"') {
      index = skipString(text, index);
      continue;
    }

    if (char === '{' || char === '[') {
      depth++;
    } else if (char === '}' || char === ']') {
      depth--;

      if (depth === 0) {
        return index + 1;
      }
    }

    index++;
  }

  return text.length;
}

/**
 * @param literal - A JSON string literal, quotes included
 * @returns The decoded key, or the raw contents when the literal does not parse
 */
function decodeKey(literal: string): string {
  try {
    return JSON.parse(literal) as string;
  } catch {
    return literal.slice(1, -1);
  }
}
