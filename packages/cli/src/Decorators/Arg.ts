import type { CliTypes } from '../Types/CliTypes';

export const COMMAND_ARGS_KEY = '__commandArgs';

interface ArgOptions {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * Property decorator for positional CLI arguments.
 * The value is injected from parsed CLI input before `run()` is called.
 *
 * @param options - argument configuration
 * @returns property decorator
 *
 * @example
 * ```ts
 * @Arg({ name: 'query', description: 'Phrase to search for' })
 * public query: string;
 * ```
 */
export function Arg(options: ArgOptions): Function {
  return (target: any, propertyKey: string) => {
    if (!target[COMMAND_ARGS_KEY]) {
      target[COMMAND_ARGS_KEY] = [];
    }

    const def: CliTypes.ArgDef = {
      kind: 'positional',
      property: propertyKey,
      name: options.name,
      description: options.description,
      required: options.required,
    };

    target[COMMAND_ARGS_KEY].push(def);

    Object.defineProperty(target, propertyKey, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: undefined,
    });
  };
}
