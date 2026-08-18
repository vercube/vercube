import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/**
 * Words whose values are never shown. Matched against the words of a path
 * segment, so `keys` stays visible while `accessKeys` does not.
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
  'dsn',
  'connectionstring',
]);

/** Maximum recursion depth when flattening. */
const MAX_DEPTH = 8;

/**
 * Splits a path segment into lowercase words on separators, digits and camelCase boundaries.
 * @param segment one dotted path segment
 * @returns the words the segment is built from
 */
function words(segment: string): string[] {
  return segment
    .replaceAll(/([a-z\d])([A-Z])/g, '$1 $2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * @param word a single lowercase word, or two adjacent words joined
 * @returns whether the word names a credential
 */
function isSecretWord(word: string): boolean {
  return SECRET_WORDS.has(word) || (word.endsWith('s') && SECRET_WORDS.has(word.slice(0, -1)));
}

/**
 * @param key one key or path segment
 * @returns whether a value stored under this name should be withheld
 */
export function isSecretKey(key: string): boolean {
  const parts = words(key);

  return parts.some((word, index) => isSecretWord(word) || (index > 0 && isSecretWord(parts[index - 1] + word)));
}

/**
 * @param path dotted path of the value
 * @returns whether the value should be withheld
 */
function isSecret(path: string): boolean {
  return path.split('.').some((segment) => isSecretKey(segment));
}

/**
 * Renders a leaf value as text.
 * @param value the value to describe
 * @returns a short human-readable description
 */
function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'function') {
    return `[${/^class\s/.test(String(value)) ? 'class' : 'function'} ${value.name || 'anonymous'}]`;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'bigint' || typeof value === 'symbol') {
    return String(value);
  }

  return JSON.stringify(value) ?? String(value);
}

/**
 * Flattens a configuration object into dotted paths.
 * @param input the object to flatten
 * @returns one entry per leaf, sorted by path
 */
export function flattenConfig(input: unknown): DevtoolsTypes.ConfigEntry[] {
  const entries: DevtoolsTypes.ConfigEntry[] = [];
  const seen = new WeakSet<object>();

  /**
   * Walks one value, appending whatever leaves it contains.
   * @param value current value
   * @param path dotted path reached so far
   * @param depth remaining recursion budget
   */
  const walk = (value: unknown, path: string, depth: number): void => {
    if (path && isSecret(path)) {
      entries.push({ path, value: '<redacted>', redacted: true });
      return;
    }

    if (value === undefined) {
      return;
    }

    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) {
        entries.push({ path, value: '[circular]' });
        return;
      }

      if (depth === 0) {
        entries.push({ path, value: Array.isArray(value) ? `[${value.length} items]` : '[object]' });
        return;
      }

      seen.add(value);

      const children = Array.isArray(value) ? value.entries() : Object.entries(value);
      let empty = true;

      for (const [key, child] of children) {
        empty = false;
        walk(child, path ? `${path}.${String(key)}` : String(key), depth - 1);
      }

      if (empty) {
        entries.push({ path, value: Array.isArray(value) ? '[]' : '{}' });
      }

      return;
    }

    entries.push({ path, value: describe(value) });
  };

  walk(input, '', MAX_DEPTH);

  return entries.filter((entry) => entry.path).sort((a, b) => a.path.localeCompare(b.path));
}
