export namespace CliTypes {
  /**
   * Metadata stored by the `@Command` decorator on a class prototype.
   */
  export interface CommandMeta {
    /** Command name used on the CLI (`vercube <name>`). */
    name: string;
    /** Short description shown in `--help`. */
    description: string;
    /** Optional child command classes. */
    subCommands?: (new () => unknown)[];
  }

  /**
   * Single arg/flag definition stored by `@Arg` / `@Flag` decorators.
   */
  export interface ArgDef {
    /** Whether this is a positional arg or a named flag. */
    kind: 'positional' | 'flag';
    /** Property name on the command class instance. */
    property: string;
    /** Name used in the CLI (citty arg key). */
    name: string;
    /** Short description shown in `--help`. */
    description?: string;
    /** Default value. */
    default?: unknown;
    /** Whether the arg/flag is required. */
    required?: boolean;
    /** For flags: the value type used by citty. */
    valueType?: 'string' | 'boolean' | 'number';
  }
}
