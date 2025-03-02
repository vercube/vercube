import type { ConfigTypes } from '@vercube/core';
import { rollup } from 'rollup';
import { getRollupConfig } from './Config';

/**
 * Builds the application using Rollup bundler
 * 
 * @async
 * @function build
 * @param {ConfigTypes.BuildOptions} ctx - The build context and configuration options
 * @returns {Promise<void>} A promise that resolves when the build is complete
 * @description This function takes build options, configures Rollup bundler,
 * executes the build process, and writes the output to the specified location(s).
 */
export async function build(ctx: ConfigTypes.BuildOptions): Promise<void> {
  // Get bundler options from configuration
  const bundlerConfig = await getRollupConfig(ctx);

  // Execute build process using rollup bundler
  const build = await rollup({ ...bundlerConfig });

  // Process and write output to destination
  const outputs = Array.isArray(bundlerConfig.output) ? bundlerConfig.output : [bundlerConfig.output];

  if (outputs.length === 0) {
    return;
  }

  for (const output of outputs) {
    await build.write(output!);
  }
}