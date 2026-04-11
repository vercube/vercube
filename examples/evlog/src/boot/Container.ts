import { HealthController } from '@/Controllers/HealthController';
import { UsersController } from '@/Controllers/UsersController';
import { Container } from '@vercube/di';

export function useContainer(container: Container): void {
  container.bind(UsersController);
  container.bind(HealthController);
}
