/**
 * Words whose values are never kept in the inspection buffer. Matched against
 * the words of a key, so `keys` stays visible while `accessKeys` does not.
 *
 * Mirrors the list `@vercube/devtools` redacts config and storage with, on
 * purpose: a payload should never be readable in one panel and hidden in another.
 */
const SECRET_WORDS: ReadonlySet<string> = new Set([
  'token',
  'secret',
  'password',
  'passwd',
  'pwd',
  'credential',
  'privatekey',
  'apikey',
  'accesskey',
  'secretkey',
  'authorization',
  'cookie',
  'dsn',
  'connectionstring',
]);

/** What replaces the value of a key that names a credential. */
const REDACTED = '<redacted>';

/**
 * Splits a key into lowercase words on separators, digits and camelCase boundaries.
 *
 * @param key - The key to split.
 * @returns The words the key is built from.
 */
function words(key: string): string[] {
  return key
    .replaceAll(/([a-z\d])([A-Z])/g, '$1 $2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * @param word - A single lowercase word, or two adjacent words joined.
 * @returns Whether the word names a credential.
 */
function isSecretWord(word: string): boolean {
  return SECRET_WORDS.has(word) || (word.endsWith('s') && SECRET_WORDS.has(word.slice(0, -1)));
}

/**
 * Tells whether a value stored under this key should be withheld.
 *
 * @param key - The key to judge.
 * @returns True when the key names a credential.
 */
export function isSecretKey(key: string): boolean {
  const parts = words(key);

  return parts.some((word, index) => isSecretWord(word) || (index > 0 && isSecretWord(parts[index - 1] + word)));
}

/**
 * Copies headers with credential-looking values withheld.
 *
 * @param headers - Headers as received from the transport.
 * @returns Headers safe to keep for inspection.
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    safe[key] = isSecretKey(key) ? REDACTED : value;
  }

  return safe;
}

/**
 * Renders a payload for inspection: JSON, with credential-looking fields
 * withheld and the result capped.
 *
 * @param payload - The payload to render.
 * @param maxBytes - Largest preview to keep, in bytes.
 * @returns The preview, or a note when the payload cannot be rendered.
 */
export function previewPayload(payload: unknown, maxBytes: number): string {
  let text: string;

  try {
    text = JSON.stringify(payload, (key, value) => (key && isSecretKey(key) ? REDACTED : value), 2) ?? String(payload);
  } catch {
    return '<unserializable>';
  }

  const size = Buffer.byteLength(text, 'utf8');

  if (size <= maxBytes) {
    return text;
  }

  return `${text.slice(0, maxBytes)}\n… truncated, ${size} bytes in total`;
}
