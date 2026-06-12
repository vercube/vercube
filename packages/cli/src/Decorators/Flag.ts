import { COMMAND_ARGS_KEY } from './Arg';
import type { CliTypes } from '../Types/CliTypes';

interface FlagOptions {
  name: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  /** Explicit citty value type. Inferred from `default` when omitted. */
  type?: 'string' | 'boolean' | 'number';
}

/**
 * Property decorator for named CLI flags (`--name value`).
 * The value type is inferred from `default` when `type` is not set.
 * The parsed value is injected before `run()` is called.
 *
 * @param options - flag configuration
 * @returns property decorator
 *
 * @example
 * ```ts
 * @Flag({ name: 'limit', description: 'Max results', default: 10 })
 * public limit: number;
 *
 * @Flag({ name: 'json', description: 'Output as JSON', default: false })
 * public json: boolean;
 * ```
 */
export function Flag(options: FlagOptions): Function {
  return (target: any, propertyKey: string) => {
    if (!target[COMMAND_ARGS_KEY]) {
      target[COMMAND_ARGS_KEY] = [];
    }

    const def: CliTypes.ArgDef = {
      kind: 'flag',
      property: propertyKey,
      name: options.name,
      description: options.description,
      default: options.default,
      required: options.required,
      valueType: options.type ?? inferType(options.default),
    };

    target[COMMAND_ARGS_KEY].push(def);

    Object.defineProperty(target, propertyKey, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: options.default,
    });
  };
}

/**
 * Infers the citty arg type from a default value.
 *
 * @param value - default value to inspect
 * @returns corresponding citty arg type string
 */
function inferType(value: unknown): CliTypes.ArgDef['valueType'] {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
}
