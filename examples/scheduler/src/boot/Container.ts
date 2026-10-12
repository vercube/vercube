import { ReportJobs } from '@/jobs/ReportJobs';
import { Container } from '@vercube/di';

export function useContainer(container: Container): void {
  // binding the class is what registers its jobs
  container.bind(ReportJobs);
}
