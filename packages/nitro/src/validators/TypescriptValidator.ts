import { readFileSync } from 'node:fs';
import type { Nitro } from 'nitro/types';

/**
 * Validates the typescript options for experimentalDecorators
 * @param nitro - The nitro instance
 * @returns void
 */
export function validateTypescript(nitro: Nitro): void {
  // check typescript options for experimentalDecorators
  const tsConfig = nitro.options.typescript;

  if (typeof tsConfig?.tsConfig === 'string') {
    // tsConfig is a path - read and validate
    const tsConfigContent = JSON.parse(readFileSync(tsConfig.tsConfig, 'utf8'));
    if (!tsConfigContent.compilerOptions?.experimentalDecorators) {
      throw new Error(
        `Vercube requires "experimentalDecorators" to be enabled in your tsconfig (${tsConfig.tsConfig}). ` +
          'Please add "experimentalDecorators": true to your compilerOptions.',
      );
    }
  } else if (typeof tsConfig?.tsConfig === 'object' && tsConfig.tsConfig !== null) {
    // tsConfig is an object - add experimentalDecorators
    tsConfig.tsConfig.compilerOptions = {
      ...tsConfig.tsConfig.compilerOptions,
      experimentalDecorators: true,
    };
  }
}
