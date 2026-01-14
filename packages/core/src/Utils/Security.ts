/**
 * Dangerous property names that can lead to prototype pollution attacks.
 * These properties should never be set on objects from untrusted sources.
 */
export const DANGEROUS_PROPERTIES = Object.freeze(['__proto__', 'constructor', 'prototype']);

/**
 * Checks if a property name is safe to use (not a prototype pollution vector).
 *
 * @param {string} key - The property name to check
 * @returns {boolean} True if the property is safe to use, false if it's dangerous
 *
 * @example
 * isSafeProperty('name') // true
 * isSafeProperty('__proto__') // false
 * isSafeProperty('constructor') // false
 */
export function isSafeProperty(key: string): boolean {
  return !DANGEROUS_PROPERTIES.includes(key);
}

/**
 * Custom reviver function for JSON.parse that filters out dangerous properties
 * that could lead to prototype pollution attacks.
 *
 * @param {string} key - The property key being processed
 * @param {unknown} value - The property value
 * @returns {unknown} The value if safe, undefined if dangerous
 *
 * @example
 * JSON.parse('{"__proto__": {"admin": true}}', secureReviver)
 * // Returns an empty object, filtering out __proto__
 */
export function secureReviver(key: string, value: unknown): unknown {
  // Filter out dangerous properties during parsing
  if (!isSafeProperty(key)) {
    return undefined;
  }
  return value;
}

/**
 * Safely parses a JSON string, filtering out properties that could lead to
 * prototype pollution attacks.
 *
 * This function uses a custom reviver to prevent __proto__, constructor, and
 * prototype properties from being set on the parsed object.
 *
 * @param {string} text - The JSON string to parse
 * @returns {unknown} The parsed object with dangerous properties filtered out
 * @throws {SyntaxError} If the JSON string is malformed
 *
 * @example
 * const obj = safeJsonParse('{"name": "John", "__proto__": {"isAdmin": true}}');
 * // Returns { name: 'John' } - __proto__ is filtered out
 *
 * @example
 * const malicious = safeJsonParse('{"constructor": {"prototype": {"polluted": true}}}');
 * // Returns {} - dangerous properties are filtered out
 */
export function safeJsonParse(text: string): unknown {
  return JSON.parse(text, secureReviver);
}

/**
 * Sanitizes an object by removing dangerous properties that could lead to
 * prototype pollution attacks. Creates a new object with only safe properties.
 *
 * @param {Record<string, unknown>} obj - The object to sanitize
 * @returns {Record<string, unknown>} A new object with dangerous properties removed
 *
 * @example
 * const unsafe = { name: 'John', __proto__: { isAdmin: true } };
 * const safe = sanitizeObject(unsafe);
 * // Returns { name: 'John' }
 *
 * @example
 * const malicious = { constructor: { prototype: { polluted: true } } };
 * const clean = sanitizeObject(malicious);
 * // Returns {}
 */
export function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  // Create a null-prototype object to avoid prototype chain issues
  const sanitized = Object.create(null);

  for (const key of Object.keys(obj)) {
    // Only copy safe properties that are own properties of the object
    if (isSafeProperty(key) && Object.prototype.hasOwnProperty.call(obj, key)) {
      sanitized[key] = obj[key];
    }
  }

  // Convert back to a regular object for compatibility
  return Object.assign({}, sanitized);
}

/**
 * Safely assigns properties from source to target, filtering out dangerous
 * properties that could lead to prototype pollution.
 *
 * @param {any} target - The target object to assign properties to
 * @param {Record<string, unknown>} source - The source object with properties to copy
 * @returns {void}
 *
 * @example
 * const target = { existing: 'value' };
 * const source = { name: 'John', __proto__: { isAdmin: true } };
 * safeAssign(target, source);
 * // target is now { existing: 'value', name: 'John' }
 */
export function safeAssign(target: any, source: Record<string, unknown>): void {
  for (const key of Object.keys(source)) {
    // Only assign safe properties that are own properties
    if (isSafeProperty(key) && Object.prototype.hasOwnProperty.call(source, key)) {
      target[key] = source[key];
    }
  }
}
