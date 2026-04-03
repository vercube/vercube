<div align="center">
  <a href="https://vercube.dev/"><img src="../../.github/assets/logo.png" alt="Vercube logo" width="200"></a>
</div>

# Vercube CLI Commands Example

This example demonstrates how to create custom CLI commands for a Vercube project using the class-based command system with decorators.

## What's Included

| Command                | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `vercube greet <name>` | Greeting command - shows `@Arg`, `@Flag` and `@Inject` usage |
| `vercube db migrate`   | Migration subcommand - shows `--dry-run` flag                |
| `vercube db seed`      | Seed subcommand - shows environment flag                     |
| `vercube db`           | Parent command - shows `subCommands` composition             |

## 🚀 Quick Start

```sh
pnpm i
```

### Run a simple greeting

```sh
pnpm greet
# → vercube greet World

vercube greet World --times 3 --uppercase
```

### Run database commands

```sh
pnpm db:migrate
# → vercube db migrate

vercube db migrate --dry-run
vercube db seed --env test
```

## Project Structure

```
src/
└── Commands/
    ├── Greet.ts       # Simple command with @Arg, @Flag, @Inject
    ├── Db.ts          # Parent command with subCommands
    ├── DbMigrate.ts   # Subcommand with --dry-run flag
    └── DbSeed.ts      # Subcommand with --env flag
vercube.config.ts      # Registers commands under cli.commands
```

## How It Works

Commands are registered in `vercube.config.ts` under the `cli.commands` field.
At runtime the CLI loads this file via [jiti](https://npmjs.com/package/jiti)
(zero build required) and merges the user commands into the citty command tree
alongside the built-in `build`, `dev`, `init`, and `fetch` commands.
