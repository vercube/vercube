import { builtinModules } from 'node:module';
import { defineConfig } from 'tsdown';
// @ts-expect-error - allowImportingTsExtensions is enabled in tsconfig.json TSDown does not support it
import { getPackageEntries, getPackageJson } from './scripts/utils.ts';

// get entries as auto-detected from package.json export field
const entries = await getPackageEntries(process.cwd());

// get package.json
const packageJson = await getPackageJson(process.cwd());

// return config for tsdown
export default defineConfig({
  entry: Object.values(entries),
  fixedExtension: true,
  dts: true,
  external: [
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.optionalDependencies ?? {}),
  ],
});
