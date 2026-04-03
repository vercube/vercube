import type { Container } from '@vercube/di';

/**
 * Base class for all CLI commands.
 *
 * Extend this class and decorate with `@Command` to register a command.
 * Dependencies can be injected via `@Inject` from `@vercube/di`.
 *
 * @example
 * ```ts
 * @Command({ name: 'deploy', description: 'Deploy application' })
 * export class DeployCommand extends BaseCommand {
 *   @Inject(MyService)
 *   private myService!: MyService;
 *
 *   public override async run(): Promise<void> {
 *     await this.myService.deploy();
 *   }
 * }
 * ```
 */
export abstract class BaseCommand {
  /**
   * CLI DI container, injected by CommandRegistry before `run()`.
   * Prefer `@Inject` decorators over accessing this directly.
   */
  protected container!: Container;

  /**
   * Execute the command logic. Called after arg/flag injection and DI resolution.
   * @returns promise that resolves when the command is done
   */
  public abstract run(): Promise<void>;
}
