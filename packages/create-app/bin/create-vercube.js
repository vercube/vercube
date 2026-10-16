#!/usr/bin/env node
// `init` goes right after the binary, so `create vercube my-app --force` reaches
// the CLI as `init my-app --force` rather than `my-app --force init`
process.argv.splice(2, 0, 'init');
await import('@vercube/cli');
