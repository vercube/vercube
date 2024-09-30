/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Plugin } from 'rollup';
import { findStaticImports } from 'mlly';
import MagicString from 'magic-string';


/**
 * A Rollup plugin that converts CommonJS modules to ESM.
 * This plugin is copied from the Unbind project.
 * @see https://github.com/unjs/unbuild/blob/main/src/builders/rollup/plugins/cjs.ts
 *
 * @param _opts - The plugin options.
 * @returns The Rollup plugin instance.
 */
export function RollupCJSPlugin(_opts?: any): Plugin {
  return {
    name: 'unbuild-cjs',
    renderChunk(code, _chunk, opts) {
      if (opts.format === 'es') {
        return CJSToESM(code);
      }
      return null;
    },
  } as Plugin;
}

const CJSyntaxRe = /__filename|__dirname|require\(|require\.resolve\(/;

const CJSShim = `

// -- Unbuild CommonJS Shims --
import __cjs_url__ from 'url';
import __cjs_path__ from 'path';
import __cjs_mod__ from 'module';
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require = __cjs_mod__.createRequire(import.meta.url);
`;

// Shim __dirname, __filename and require
function CJSToESM(code: string): { code: string; map: any } | null {
  if (code.includes(CJSShim) || !CJSyntaxRe.test(code)) {
    return null;
  }

  const lastESMImport = findStaticImports(code).pop();
  const indexToAppend = lastESMImport ? lastESMImport.end : 0;
  const s = new MagicString(code);
  s.appendRight(indexToAppend, CJSShim);

  return {
    code: s.toString(),
    map: s.generateMap(),
  };
}
