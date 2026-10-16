/**
 * Environment variable that decides whether `app.listen()` binds a port:
 * `0` or `false` keeps the server down, `1` or `true` always starts it.
 */
export const LISTEN_ENV = 'VERCUBE_LISTEN';

/**
 * Environment variables set by platforms that drive the app through its
 * exported `fetch` handler, where binding a port serves nobody.
 */
const PLATFORM_ENV: readonly string[] = ['VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'FUNCTIONS_WORKER_RUNTIME'];

/**
 * Whether `app.listen()` should bind a port.
 *
 * An entry file can call `app.listen()` unconditionally: tools that import it
 * to reach the app without a server (the scheduler CLI, the Vite dev worker)
 * set `VERCUBE_LISTEN=0` first, and serverless platforms are detected. Process
 * managers such as PM2 import the entry rather than run it, so a guard like
 * `import.meta.main` would keep the server down there.
 *
 * @param {Record<string, string | undefined>} [env] - Environment to read, `process.env` by default
 * @returns {boolean} True when the server should listen
 */
export function shouldListen(env: Record<string, string | undefined> = globalThis.process?.env ?? {}): boolean {
  const value = env[LISTEN_ENV]?.trim().toLowerCase();

  if (value === '0' || value === 'false') {
    return false;
  }

  if (value === '1' || value === 'true') {
    return true;
  }

  return !PLATFORM_ENV.some((name) => !!env[name]);
}
