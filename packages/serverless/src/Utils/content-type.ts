// Constants for content type detection
const DEFAULT_CONTENT_TYPE = '';

// Content type patterns for text detection
const TEXT_CONTENT_TYPE_PATTERNS = [
  /^text\//,
  /^application\/(json|javascript|xml|xml\+text|x-www-form-urlencoded)$/,
  /^application\/.*\+json$/,
  /^application\/.*\+xml$/,
  /utf-?8/,
] as const;

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
export function isTextType(contentType: string = DEFAULT_CONTENT_TYPE): boolean {
  if (!contentType) {
    return false;
  }

  return TEXT_CONTENT_TYPE_PATTERNS.some((pattern) => pattern.test(contentType));
}
