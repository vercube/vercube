import type { CliTypes } from '../Types/CliTypes';

export const COMMAND_META_KEY = '__commandMeta';

/**
 * Class decorator that marks a class as a CLI command.
 * Stores command metadata on the prototype so `CommandRegistry` can discover it.
 *
 * @param meta - command configuration (name, description, optional subcommands)
 * @returns class decorator
 *
 * @example
 * ```ts
 * @Command({ name: 'build', description: 'Build the project' })
 * export class BuildCommand extends BaseCommand { ... }
 * ```
 */
export function Command(meta: CliTypes.CommandMeta): Function {
  return (target: any) => {
    target.prototype[COMMAND_META_KEY] = meta;
  };
}
