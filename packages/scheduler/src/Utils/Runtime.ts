/**
 * Reads an environment variable on Node, Bun and Deno alike.
 *
 * @param name - Variable to read
 * @returns Its value, or undefined when it is unset or cannot be read
 */
export function readEnv(name: string): string | undefined {
  const value = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];

  if (value !== undefined) {
    return value;
  }

  try {
    return (globalThis as { Deno?: { env?: { get(key: string): string | undefined } } }).Deno?.env?.get(name);
  } catch {
    // Deno without --allow-env throws instead of returning nothing
    return undefined;
  }
}

/**
 * Whether the process runs in production, read from `NODE_ENV`.
 *
 * @returns True when `NODE_ENV` is `production`
 */
export function isProduction(): boolean {
  return readEnv('NODE_ENV') === 'production';
}

/**
 * Random hexadecimal string.
 *
 * @param bytes - How many random bytes to encode
 * @returns Twice as many hexadecimal characters
 */
export function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds the id of this replica: the pod or host name, the process id and a
 * random suffix, so two processes in the same pod are still told apart.
 *
 * @returns The replica id, such as `api-7d9f-2xk8p-12-a3f0`
 */
export function createInstanceId(): string {
  const runtime = globalThis as {
    process?: { pid?: number; getBuiltinModule?: (id: string) => { hostname?: () => string } | undefined };
  };

  let host = readEnv('HOSTNAME');

  if (!host) {
    try {
      host = runtime.process?.getBuiltinModule?.('node:os')?.hostname?.();
    } catch {
      // no os module, the fallback below is enough
    }
  }

  return `${host || 'vercube'}-${runtime.process?.pid ?? 0}-${randomHex(2)}`;
}
