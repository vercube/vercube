import { randomBytes } from 'node:crypto';
import { IMAGES } from './Versions';
import type { Project } from '../Project';

/**
 * Adds Redis to docker-compose.yml and `REDIS_URL` to the env files. Shared by
 * every recipe that needs Redis, so it is added once.
 *
 * @param {Project} project - The project
 * @returns {void}
 */
export function useRedis(project: Project): void {
  // published on localhost only: neither runs with a password here
  project.addComposeService('redis', { image: IMAGES.redis, ports: ['127.0.0.1:6379:6379'] });
  project.addEnv({ REDIS_URL: 'redis://127.0.0.1:6379' }, 'Redis');
  project.note('Start the local services with `docker compose up -d`');
}

/**
 * Adds Postgres to docker-compose.yml and `DATABASE_URL` to the env files.
 *
 * @param {Project} project - The project
 * @returns {void}
 */
export function usePostgres(project: Project): void {
  project.addComposeService('postgres', {
    image: IMAGES.postgres,
    ports: ['127.0.0.1:5432:5432'],
    environment: { POSTGRES_PASSWORD: 'postgres', POSTGRES_DB: 'app' },
  });
  project.addEnv({ DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5432/app' }, 'Postgres');
  project.note('Start the local services with `docker compose up -d`');
}

/** The value `.env.example` shows for `API_KEY`, refused by the guard. */
export const API_KEY_PLACEHOLDER = 'change-me';

const API_KEY_GUARD = `import { UnauthorizedError } from '@vercube/core';

/**
 * Lets a request in when its \`x-api-key\` header matches API_KEY. A guard for
 * the generated examples: replace it with real auth before deploying.
 */
export function requireApiKey(key: string | undefined): void {
  const expected = process.env.API_KEY;

  // no key configured, or the placeholder from .env.example: nobody gets in
  if (!expected || expected === '${API_KEY_PLACEHOLDER}' || key !== expected) {
    throw new UnauthorizedError('Invalid or missing API key');
  }
}
`;

/**
 * Adds the `API_KEY` guard the generated example controllers call, and the key
 * itself to the env files. Shared, so it is added once.
 *
 * @param {Project} project - The project
 * @returns {void}
 */
export function useApiKeyGuard(project: Project): void {
  project.createFile('src/services/ApiKeyGuard.ts', API_KEY_GUARD);
  project.addEnv({ API_KEY: randomBytes(24).toString('base64url') }, 'Auth', { API_KEY: API_KEY_PLACEHOLDER });
}
