import { BaseCommand, Command } from '@vercube/cli/toolkit';
import { DbMigrateCommand } from './DbMigrate';
import { DbSeedCommand } from './DbSeed';

/**
 * Parent command that groups database-related subcommands.
 * Without a subcommand, citty prints help automatically.
 *
 * @example
 * ```sh
 * vercube db --help
 * vercube db migrate
 * vercube db seed --env test
 * ```
 */
@Command({
  name: 'db',
  description: 'Database utilities',
  subCommands: [DbMigrateCommand, DbSeedCommand],
})
export class DbCommand extends BaseCommand {
  public override async run(): Promise<void> {}
}
