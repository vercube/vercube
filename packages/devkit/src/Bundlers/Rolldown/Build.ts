import { join } from 'node:path';
import { consola } from 'consola';
import { colors } from 'consola/utils';
import { rolldown, type OutputChunk } from 'rolldown';
import { getRolldownConfig } from './Config';
import type { ConfigTypes } from '@vercube/core';

/**
 * Builds the application using Rolldown bundler
 *
 * @async
 * @function build
 * @param {ConfigTypes.BuildOptions} ctx - The build context and configuration options
 * @returns {Promise<void>} A promise that resolves when the build is complete
 * @description This function takes build options, configures Rolldown bundler,
 * executes the build process, and writes the output to the specified location(s).
 */
export async function build(ctx: ConfigTypes.BuildOptions): Promise<void> {
  // Get bundler options from configuration
  const bundlerConfig = await getRolldownConfig(ctx);

  // Execute build process using rolldown bundler
  const build = await rolldown({ ...bundlerConfig });

  // Process and write output to destination
  const outputs = Array.isArray(bundlerConfig.output) ? bundlerConfig.output : [bundlerConfig.output];

  consola.info(`📦 Building \`${ctx.entry || '<no name>'}\``);

  let results: OutputChunk[] = [];

  for (const output of outputs) {
    const { output: result } = await build.write(output);
    results.push(...(result as OutputChunk[]));
  }

  for (const result of results.filter((o) => o.type === 'chunk')) {
    consola.success({
      tag: 'build',
      message: colors.gray(
        `Built ${colors.cyan(join(ctx?.output?.dir ?? '', result?.fileName ?? ''))} - ${(Buffer.byteLength(result?.code ?? '') / 1024).toFixed(2)}kb`,
      ),
    });
  }
}
