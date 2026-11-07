import type { Project } from './Project';

/**
 * Types of the recipes `vercube init` and `vercube add` apply to a project.
 */
export namespace RecipeTypes {
  /**
   * What a recipe adds: a module (queue, auth, ...) or a deploy target, which
   * is applied after every module.
   */
  export type Kind = 'module' | 'deploy';

  /**
   * A question a recipe asks before it is applied, answered by a prompt in a
   * terminal or by a flag (`--queue rabbitmq`) anywhere else.
   */
  export interface Prompt {
    /** Key of the answer in `ctx.answers`. */
    name: string;

    /** Flag that answers it without a prompt, such as `queue` for `--queue`. */
    flag: string;

    /** The question. */
    message: string;

    /** The choices. */
    options: { value: string; label: string; hint?: string }[];

    /** The answer when `--yes` is set or nothing is asked. */
    default: string;
  }

  /**
   * Dependencies a recipe adds to the package.json of the application,
   * `{ name: range }`. `@vercube/*` packages are pinned to the version of the
   * CLI applying the recipe, whatever range is given here.
   */
  export type Dependencies = Record<string, string>;

  /**
   * A docker compose service the module needs to run locally, such as Redis.
   */
  export type ComposeService = Record<string, unknown>;

  /**
   * What a recipe receives when it is applied.
   */
  export interface Context<Answers extends Record<string, string> = Record<string, string>> {
    /** The project, with the idempotent editing helpers. */
    project: Project;

    /** The answers to the recipe's prompts. */
    answers: Answers;

    /** Ids of every recipe applied in this run, so one can adapt to another. */
    selected: ReadonlySet<string>;

    /** The version `@vercube/*` packages are pinned to. */
    version: string;
  }

  /**
   * One module or deploy target, applied to a project by `vercube init` and
   * `vercube add`. Applying a recipe twice must change nothing.
   */
  export interface Recipe<Answers extends Record<string, string> = Record<string, string>> {
    /** Short id used on the command line: `--modules queue`, `vercube add queue`. */
    id: string;

    /** Name shown in the prompt. */
    label: string;

    /** One line shown next to the name. */
    hint?: string;

    /** Module or deploy target. */
    kind?: Kind;

    /** Recipes this one needs; selected automatically and applied first. */
    requires?: string[] | ((answers: Answers) => string[]);

    /** Recipes this one is applied after when both are selected, without needing them. */
    after?: string[];

    /** Questions to answer before applying it. */
    prompts?: Prompt[];

    /**
     * Whether the recipe can be applied to a project, such as a deploy target
     * that only fits the API template. Returns the reason it cannot.
     */
    unsupported?: (project: Project) => string | undefined;

    /** Applies the recipe. */
    apply: (ctx: Context<Answers>) => void | Promise<void>;
  }

  /**
   * What applying the recipes changed, for the summary.
   */
  export interface Summary {
    /** Recipes applied, in order. */
    applied: string[];

    /** Recipes added because a selected one requires them. */
    implied: string[];

    /** Files created, relative to the project root. */
    created: string[];

    /** Files changed, relative to the project root. */
    updated: string[];

    /** Packages added to a package.json. */
    dependencies: string[];

    /** Docker compose services added. */
    services: string[];

    /** One-line notes recipes left for the summary. */
    notes: string[];
  }
}
