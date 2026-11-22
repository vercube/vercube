/**
 * The marker of a playground request.
 *
 * The playground picks the trace id itself and sends it as a W3C `traceparent`
 * header, so the server records the request under an id the browser already
 * knows. That id is what opens the request, its logs and its trace afterwards.
 */

/** What identifies one playground request. */
export interface Marker {
  /** The trace id: 32 lowercase hex characters. */
  id: string;
  /** The `traceparent` header value that makes the server adopt the id. */
  traceparent: string;
}

/**
 * Writes random bytes as lowercase hex.
 *
 * @param bytes - How many bytes
 * @param random - Source of randomness, replaceable in tests
 * @returns The hex string, never all zeros
 */
function hex(bytes: number, random: (array: Uint8Array) => Uint8Array): string {
  const text = [...random(new Uint8Array(bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  // An all-zero id is invalid in W3C Trace Context and would be ignored.
  return /^0+$/.test(text) ? `${text.slice(0, -1)}1` : text;
}

/**
 * Creates the marker for a new request.
 *
 * @param random - Source of randomness, `crypto.getRandomValues` by default
 * @returns A fresh marker
 */
export function createMarker(
  random: (array: Uint8Array) => Uint8Array = (array) => globalThis.crypto.getRandomValues(array),
): Marker {
  const id = hex(16, random);

  return { id, traceparent: `00-${id}-${hex(8, random)}-01` };
}
