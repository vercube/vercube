import { Container } from '@vercube/di';
import { defineCommand } from 'citty';
import { BaseCommand } from './BaseCommand';
import { buildCittyArgs, getArgDefs, getCommandMeta, injectArgs } from './Utils/CommandUtils';
import type { CommandDef } from 'citty';

/**
 * Registry that stores command classes and transforms them into citty CommandDefs.
 * Both built-in and user-defined commands are registered here before the CLI runs.
 */
export class CommandRegistry {
  private readonly fCommands: Map<string, new () => unknown> = new Map();

  /**
   * Registers a command class decorated with `@Command`.
   *
   * @param CommandClass - class to register
   * @throws if the class is missing the `@Command` decorator
   */
  public register(CommandClass: new () => unknown): void {
    const meta = getCommandMeta(CommandClass);
    this.fCommands.set(meta.name, CommandClass);
  }

  /**
   * Converts a single command class into a citty `CommandDef`.
   * Recursively processes subcommands defined in `@Command({ subCommands })`.
   *
   * @param CommandClass - command class to convert
   * @param container - CLI DI container used to resolve instances
   * @returns citty CommandDef ready to pass to `defineCommand` / `runMain`
   */
  public toCommandDef(CommandClass: new () => unknown, container: Container): CommandDef {
    const meta = getCommandMeta(CommandClass);
    const argDefs = getArgDefs(CommandClass);

    const subCommands: Record<string, () => CommandDef> = {};

    if (meta.subCommands) {
      for (const SubCmd of meta.subCommands) {
        const subMeta = getCommandMeta(SubCmd as new () => unknown);
        subCommands[subMeta.name] = () => this.toCommandDef(SubCmd as new () => unknown, container);
      }
    }

    return defineCommand({
      meta: { name: meta.name, description: meta.description },
      args: buildCittyArgs(argDefs),
      subCommands: Object.keys(subCommands).length > 0 ? subCommands : undefined,
      run: async (ctx) => {
        const instance = container.resolve(CommandClass as new () => BaseCommand) as BaseCommand;
        (instance as any).container = container;
        injectArgs(instance, ctx.args as Record<string, unknown>, argDefs);
        await instance.run();
      },
    }) as CommandDef;
  }

  /**
   * Builds the full citty subcommands map from all registered commands.
   *
   * @param container - CLI DI container used when executing commands
   * @returns record mapping command names to lazy `CommandDef` factories
   */
  public buildCittyTree(container: Container): Record<string, () => CommandDef> {
    const tree: Record<string, () => CommandDef> = {};

    for (const CommandClass of this.fCommands.values()) {
      const meta = getCommandMeta(CommandClass);
      tree[meta.name] = () => this.toCommandDef(CommandClass, container);
    }

    return tree;
  }
}
