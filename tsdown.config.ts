import { defineConfig } from 'tsdown';
import { resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { getPackageEntries } from './scripts/utils';

// get entries as auto-detected from package.json export field
const entries = await getPackageEntries(process.cwd());

// get package.json
const packageJson = await import(resolve(process.cwd(), 'package.json'), { with: { type: 'json' } });

// return config for tsdown
export default defineConfig({
  entry: Object.values(entries),
  fixedExtension: true,
  dts: true,
  external: [
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
    ...Object.keys(packageJson?.dependencies ?? {}),
  ],
});