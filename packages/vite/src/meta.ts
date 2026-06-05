import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';

/**
 * Absolute path to the directory holding the shipped runtime entries
 * (`dev-entry.mjs`, `dev-worker.mjs`). Resolved relative to the built plugin
 * module, so it points at `dist/runtime` at runtime.
 */
export const runtimeDir = resolve(dirname(fileURLToPath(import.meta.url)), 'runtime');

/**
 * Absolute path to the worker bootstrap loaded by env-runner.
 */
export const devWorker = resolve(runtimeDir, 'dev-worker.mjs');
