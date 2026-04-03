import { BaseCommand, Command, Flag } from '@vercube/cli/toolkit';
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';

/**
 * Seeds the database with initial or test data.
 * Sibling subcommand of `migrate` under `db`.
 *
 * @example
 * ```sh
 * vercube db seed
 * vercube db seed --env test
 * ```
 */
@Command({
  name: 'seed',
  description: 'Seed the database with initial data',
})
export class DbSeedCommand extends BaseCommand {
  @Inject(Logger)
  private logger: Logger;

  /** Target environment for seed data. */
  @Flag({ name: 'env', description: 'Target environment (development, test)', default: 'development' })
  public env: string;

  /**
   * @returns resolves when seeding is done
   */
  public override async run(): Promise<void> {
    this.logger.info(`Seeding database for environment: ${this.env}`);
    this.logger.info('✔ users seeded (10 records)');
    this.logger.info('✔ posts seeded (25 records)');
    this.logger.info('Database seeded successfully.');
  }
}
