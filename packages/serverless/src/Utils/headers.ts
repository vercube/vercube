/**
 * Type definition for objects that can be iterated with forEach method.
 * Used for converting various header-like objects to plain objects.
 */
export type LoopableHeader = {
  forEach: (callbackfn: (value: string, key: string) => void) => void;
};

/**
 * Converts a loopable header object to a plain JavaScript object.
 *
 * This function is used to convert header objects (which have a forEach method)
 * into standard JavaScript objects with string keys and values. This is necessary for
 * compatibility with the standard web Headers API and other parts of the application.
 *
 * @param input - A header-like object with a forEach method
 * @returns A plain object with string keys and string values representing the headers
 */
export function headersToObject(input: LoopableHeader): Record<string, string> {
  const headers: Record<string, string> = {};
  // oxlint-disable-next-line no-array-for-each
  input.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

/**
 * Safely gets a header value with case-insensitive fallback.
 *
 * This utility function searches through a headers object using multiple possible
 * key variations to find a header value. It's useful for handling headers that
 * might have different casing across different platforms.
 *
 * @param headers - The headers object to search in
 * @param keys - Array of possible header keys to try (in order of preference)
 * @returns The header value if found, undefined otherwise
 */
export function getHeaderValue(
  headers: Record<string, string | undefined> | null | undefined,
  keys: readonly string[],
): string | undefined {
  if (!headers) {
    return undefined;
  }

  for (const key of keys) {
    const value = headers[key];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}
