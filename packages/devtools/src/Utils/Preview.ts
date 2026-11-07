import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/** Largest serialised preview kept per value. */
const MAX_PREVIEW_BYTES = 64 * 1024;

/**
 * Returns a short type label for a value.
 * @param value the value to name
 * @returns a short type label
 */
function describeType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (value instanceof Map) {
    return 'Map';
  }

  if (value instanceof Set) {
    return 'Set';
  }

  if (value instanceof Date) {
    return 'Date';
  }

  if (ArrayBuffer.isView(value)) {
    return value.constructor.name;
  }

  return typeof value;
}

/**
 * Replacer for `JSON.stringify` that handles non-JSON values.
 * @returns a stateful replacer; construct one per `describeValue` call
 */
export function previewReplacer(): (this: unknown, key: string, value: unknown) => unknown {
  // Ancestor chain only: a shared reference is not a cycle.
  const ancestors: Array<{ holder: unknown; original: object }> = [];

  return function (this: unknown, _key: string, value: unknown): unknown {
    // `this` is the object holding the current key; drop finished subtrees.
    while (ancestors.length > 0 && ancestors[ancestors.length - 1]!.holder !== this) {
      ancestors.pop();
    }

    if (typeof value === 'bigint') {
      return `${value}n`;
    }

    if (typeof value === 'function') {
      return `[function ${value.name || 'anonymous'}]`;
    }

    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      return `[${value.constructor.name} ${value.byteLength} bytes]`;
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (ancestors.some((entry) => entry.original === value)) {
      return '[circular]';
    }

    let replaced: unknown = value;

    if (value instanceof Map) {
      replaced = { '[Map]': Object.fromEntries(value) };
    } else if (value instanceof Set) {
      replaced = { '[Set]': [...value] };
    }

    ancestors.push({ holder: replaced, original: value });
    return replaced;
  };
}

/** A value preview before mount/key are attached. */
type Preview = Omit<DevtoolsTypes.StorageValue, 'mount' | 'key'>;

/**
 * Builds a preview of a value read from storage or cache.
 * @param value the value as the driver returned it
 * @returns a capped, JSON-rendered preview
 */
export function previewValue(value: unknown): Preview {
  const type = describeType(value);

  if (value === undefined) {
    return { type: 'undefined', size: 0, truncated: false };
  }

  let text: string;

  try {
    text = JSON.stringify(value, previewReplacer(), 2) ?? String(value);
  } catch {
    return { type, size: 0, truncated: false, error: 'This value could not be serialised.' };
  }

  const size = Buffer.byteLength(text, 'utf8');

  if (size <= MAX_PREVIEW_BYTES) {
    return { type, text, size, truncated: false };
  }

  // Truncating mid-escape is fine; re-encode the byte cut for valid UTF-8.
  const head = Buffer.from(text, 'utf8').subarray(0, MAX_PREVIEW_BYTES).toString('utf8');
  return { type, text: head, size, truncated: true };
}
