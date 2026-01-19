import { rolldown } from 'rolldown';
import type { ConfigTypes } from '@vercube/core';
import { getRolldownConfig } from './Config';

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

  for (const output of outputs) {
    await build.write(output);
  }
}
