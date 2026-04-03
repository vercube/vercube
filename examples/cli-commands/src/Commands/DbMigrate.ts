import { BaseCommand, Command, Flag } from '@vercube/cli/toolkit';
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';

/**
 * Runs pending database migrations.
 * Shows how to use flags and DI in a subcommand.
 *
 * @example
 * ```sh
 * vercube db migrate
 * vercube db migrate --dry-run
 * ```
 */
@Command({
  name: 'migrate',
  description: 'Run pending database migrations',
})
export class DbMigrateCommand extends BaseCommand {
  @Inject(Logger)
  private logger: Logger;

  /** Preview which migrations would run without applying them. */
  @Flag({ name: 'dry-run', description: 'Preview migrations without applying them', default: false })
  public dryRun: boolean;

  /**
   * @returns resolves when migrations are done (or preview printed)
   */
  public override async run(): Promise<void> {
    if (this.dryRun) {
      this.logger.info('[dry-run] Would apply: 001_create_users.sql, 002_add_posts.sql');
      return;
    }

    this.logger.info('Running migrations...');
    this.logger.info('✔ 001_create_users.sql');
    this.logger.info('✔ 002_add_posts.sql');
    this.logger.info('All migrations applied.');
  }
}
