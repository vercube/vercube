import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';

export class DummyService {
  constructor(@Inject(Logger) private logger: Logger) {}

  hello(): void {
    this.logger.error('Hello');
  }
}
