import { COMMAND_ARGS_KEY } from '../Decorators/Arg';
import { COMMAND_META_KEY } from '../Decorators/Command';
import type { BaseCommand } from '../BaseCommand';
import type { CliTypes } from '../Types/CliTypes';

/**
 * Reads `@Command` metadata from a class prototype.
 *
 * @param CommandClass - command class constructor to inspect
 * @returns command metadata stored by the `@Command` decorator
 * @throws if the class is not decorated with `@Command`
 */
export function getCommandMeta(CommandClass: new () => unknown): CliTypes.CommandMeta {
  const meta: CliTypes.CommandMeta | undefined = (CommandClass as any).prototype[COMMAND_META_KEY];

  if (!meta) {
    throw new Error(`[CommandRegistry] Class "${CommandClass.name}" is missing the @Command decorator.`);
  }

  return meta;
}

/**
 * Reads all `@Arg` / `@Flag` definitions from a class prototype.
 *
 * @param CommandClass - command class constructor to inspect
 * @returns array of arg/flag definitions, or `[]` if none exist
 */
export function getArgDefs(CommandClass: new () => unknown): CliTypes.ArgDef[] {
  return (CommandClass as any).prototype[COMMAND_ARGS_KEY] ?? [];
}

/**
 * Converts `ArgDef` entries into a citty-compatible args record.
 *
 * @param defs - arg/flag definitions to convert
 * @returns record of citty argument descriptors keyed by name
 */
export function buildCittyArgs(defs: CliTypes.ArgDef[]): Record<string, any> {
  const args: Record<string, any> = {};

  for (const def of defs) {
    if (def.kind === 'positional') {
      args[def.name] = {
        type: 'positional',
        description: def.description,
        required: def.required,
      };
    } else {
      // citty only supports 'string' | 'boolean' flag types - map 'number' to 'string'
      // and let injectArgs handle the numeric conversion.
      args[def.name] = {
        type: def.valueType === 'boolean' ? 'boolean' : 'string',
        description: def.description,
        default: def.valueType === 'number' ? String(def.default ?? '') : def.default,
        required: def.required,
      };
    }
  }

  return args;
}

/**
 * Injects parsed citty arg values into command instance properties
 * using the mappings defined by `@Arg` / `@Flag` decorators.
 * Handles `number` coercion for flags with `valueType: 'number'`.
 *
 * @param instance - command instance to inject into
 * @param parsedArgs - parsed arg values from citty
 * @param defs - arg/flag definitions describing the property mapping
 */
export function injectArgs(instance: BaseCommand, parsedArgs: Record<string, unknown>, defs: CliTypes.ArgDef[]): void {
  for (const def of defs) {
    if (def.name in parsedArgs) {
      const raw = parsedArgs[def.name];
      (instance as any)[def.property] = def.valueType === 'number' && typeof raw === 'string' ? Number(raw) : raw;
    }
  }
}
