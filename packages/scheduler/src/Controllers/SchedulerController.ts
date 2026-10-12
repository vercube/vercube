import { Controller, Get, Header, Param, Post } from '@vercube/core';
import { Inject } from '@vercube/di';
import { SchedulerManager } from '../Services/SchedulerManager';
import { $SchedulerHttpOptions } from '../Symbols/SchedulerSymbols';
import type { SchedulerTypes } from '../Types/SchedulerTypes';

/** Path the controller is mounted at when the options do not set one. */
export const DEFAULT_HTTP_PATH = '/_scheduler';

/**
 * Runs a job when an external scheduler calls it, for platforms without a
 * long-lived process: Vercel Cron, a Kubernetes CronJob calling `curl`, or any
 * other cron service.
 *
 * Every request needs `Authorization: Bearer <secret>`. The run goes through
 * the same claim as a timer, so two calls for the same occurrence run it once,
 * and the response is sent once the job finished, since a serverless function
 * stops when it has answered. `SchedulerPlugin` rewrites the mount path.
 */
@Controller(DEFAULT_HTTP_PATH)
export class SchedulerController {
  @Inject(SchedulerManager)
  private readonly gScheduler!: SchedulerManager;

  @Inject($SchedulerHttpOptions)
  private readonly gOptions!: SchedulerTypes.HttpOptions;

  /**
   * Runs a job, for callers that send GET, such as Vercel Cron.
   *
   * @param name - Name of the job
   * @param authorization - The `Authorization` header
   * @returns The outcome as JSON
   */
  @Get('/run/:name')
  public get(@Param('name') name: string, @Header('authorization') authorization: string | undefined): Promise<Response> {
    return this.run(name, authorization);
  }

  /**
   * Runs a job, for callers that send POST.
   *
   * @param name - Name of the job
   * @param authorization - The `Authorization` header
   * @returns The outcome as JSON
   */
  @Post('/run/:name')
  public post(@Param('name') name: string, @Header('authorization') authorization: string | undefined): Promise<Response> {
    return this.run(name, authorization);
  }

  /**
   * Checks the secret, then runs the job and answers with how it ended:
   * `200` when it completed, was enqueued or skipped, `401` for a bad secret,
   * `404` for an unknown job and `500` when it failed.
   *
   * @param name - Name of the job
   * @param authorization - The `Authorization` header
   * @returns The response
   */
  private async run(name: string, authorization: string | undefined): Promise<Response> {
    if (!(await matchesSecret(authorization, this.gOptions.secret))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!this.gScheduler.list().some((job) => job.name === name)) {
      return Response.json({ error: `No job is registered as "${name}"` }, { status: 404 });
    }

    const scheduledAt = this.gScheduler.currentOccurrence(name) ?? undefined;
    let result: SchedulerTypes.RunResult;

    try {
      result = await this.gScheduler.trigger(name, { source: 'external', ...(scheduledAt ? { scheduledAt } : {}) });
    } catch (error) {
      // a cluster job without a store, the caller has to learn why rather than see a bare 500
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }

    const failed = result.outcome === 'failed' || result.outcome === 'aborted';

    return Response.json(
      {
        outcome: result.outcome,
        occurrenceId: result.occurrenceId,
        durationMs: result.durationMs,
        ...(result.error ? { error: result.error.message } : {}),
      },
      { status: failed ? 500 : 200 },
    );
  }
}

/**
 * Compares a bearer token with the secret in constant time.
 *
 * Both sides are hashed first, so the comparison always walks the same number
 * of bytes and the length of the secret does not leak either.
 *
 * @param authorization - The `Authorization` header
 * @param secret - The expected secret
 * @returns True when the header carries the secret
 */
export async function matchesSecret(authorization: string | undefined, secret: string): Promise<boolean> {
  const token = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1] ?? '';
  const encoder = new TextEncoder();
  const [given, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(token)),
    crypto.subtle.digest('SHA-256', encoder.encode(secret)),
  ]);
  const a = new Uint8Array(given);
  const b = new Uint8Array(expected);
  let difference = 0;

  for (let index = 0; index < a.length; index++) {
    difference |= a[index] ^ b[index];
  }

  return difference === 0 && token !== '';
}
