import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/**
 * Key names whose values are never shown.
 * Matched on whole path segments so substrings like `keys` are not redacted.
 */
const SECRET_SEGMENT =
  /(^|[._-])(token|secret|password|passwd|pwd|credential|credentials|privatekey|apikey|accesskey|secretkey|dsn|connectionstring)([._-]|$)/i;

/** Maximum recursion depth when flattening. */
const MAX_DEPTH = 8;

/**
 * @param path dotted path of the value
 * @returns whether the value should be withheld
 */
function isSecret(path: string): boolean {
  return path.split('.').some((segment) => SECRET_SEGMENT.test(segment.replaceAll(/[^a-z]/gi, '')));
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
