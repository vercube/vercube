/**
 * Splits a `--headers` value into individual `Name: Value` entries.
 * A comma only starts a new entry when it is followed by a header name and a colon,
 * so values such as `text/html, application/json` stay intact.
 *
 * @param value - raw flag value, e.g. `"Accept: a, b, X-Id: 1"`
 * @returns one `Name: Value` string per header
 */
export function splitHeaders(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/,(?=\s*[\w!#$%&'*+.^`|~-]+\s*:)/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
