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
  project.addComposeService('redis', { image: IMAGES.redis, ports: ['6379:6379'] });
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
    ports: ['5432:5432'],
    environment: { POSTGRES_PASSWORD: 'postgres', POSTGRES_DB: 'app' },
  });
  project.addEnv({ DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5432/app' }, 'Postgres');
  project.note('Start the local services with `docker compose up -d`');
}
