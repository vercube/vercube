import EmailConsumer from '@/consumers/EmailConsumer';
import JobsController from '@/controller/JobsController';
import { Container } from '@vercube/di';

export function useContainer(container: Container): void {
  // register controllers
  container.bind(JobsController);

  // register consumers, this is what starts consuming the queue
  container.bind(EmailConsumer);
}
