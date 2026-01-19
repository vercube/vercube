import type { DevKitTypes } from '../Types/DevKitTypes';
import { getBuildFunc } from '../Utils/Utils';

/**
 * Builds the application using the given application instance.
 * @param {DevKitTypes.App} app - The application instance.
 * @returns {Promise<void>} A promise that resolves when the build is complete.
 */
export async function build(app: DevKitTypes.App): Promise<void> {
  // get bundler "build" func based on config
  const bundler = app?.config?.build?.bundler ?? 'rolldown';
  const build = getBuildFunc(bundler);

  await build(app?.config?.build);
}
