import { Body, Controller, Get, Post } from '@vercube/core';
import { Inject } from '@vercube/di';
import { QueueManager } from '@vercube/queue';
import type { QueueTypes } from '@vercube/queue';

/**
 * Controller demonstrating the usage of the Queue module.
 * Publishes jobs the {@link EmailConsumer} handles, and exposes what the queue
 * module currently holds.
 */
@Controller('/api/queue')
export class QueueController {
  /**
   * The queue manager instance.
   */
  @Inject(QueueManager)
  private gQueue!: QueueManager;

  /**
   * Publishes a welcome mail job.
   *
   * @param {object} body - The user the mail is for
   * @returns {Promise<QueueTypes.JobRef>} Reference to the published job
   */
  @Post('/welcome')
  public async welcome(@Body() body: { userId?: string }): Promise<QueueTypes.JobRef> {
    return this.gQueue.add({
      queue: 'emails',
      job: 'welcome',
      payload: { userId: body?.userId ?? 'anonymous' },
    });
  }

  /**
   * Publishes a job that keeps failing, to watch the retry policy.
   *
   * @returns {Promise<QueueTypes.JobRef>} Reference to the published job
   */
  @Post('/bounce')
  public async bounce(): Promise<QueueTypes.JobRef> {
    return this.gQueue.add({ queue: 'emails', job: 'bounce', payload: {} });
  }

  /**
   * @returns {QueueTypes.Snapshot} Mounted strategies, handlers, counters and the last jobs
   */
  @Get('/')
  public inspect(): QueueTypes.Snapshot {
    return this.gQueue.inspect();
  }
}
