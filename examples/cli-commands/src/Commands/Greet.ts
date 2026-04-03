import { Arg, BaseCommand, Command, Flag } from '@vercube/cli/toolkit';
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';

/**
 * Simple greeting command demonstrating `@Arg`, `@Flag` and `@Inject` usage.
 *
 * @example
 * ```sh
 * vercube greet World
 * vercube greet World --times 3
 * vercube greet World --uppercase
 * ```
 */
@Command({
  name: 'greet',
  description: 'Print a greeting message',
})
export class GreetCommand extends BaseCommand {
  @Inject(Logger)
  private logger: Logger;

  /** Name to greet. */
  @Arg({ name: 'name', description: 'Name to greet', required: true })
  public name: string;

  /** How many times to repeat the greeting. */
  @Flag({ name: 'times', description: 'How many times to greet', default: 1 })
  public times: number;

  /** Print the greeting in uppercase. */
  @Flag({ name: 'uppercase', description: 'Print greeting in uppercase', default: false })
  public uppercase: boolean;

  /**
   * @returns resolves after all greetings have been printed
   */
  public override async run(): Promise<void> {
    const message = `Hello, ${this.name}!`;
    const output = this.uppercase ? message.toUpperCase() : message;

    for (let i = 0; i < this.times; i++) {
      this.logger.info(output);
    }
  }
}
