/* eslint-disable @typescript-eslint/no-unused-vars */
import { resolve } from 'node:path';
import { build as rolldownBuild, watch as rolldownWatch } from '../Bundlers/Rolldown';
import type { DevKitTypes } from '../Types/DevKitTypes';
import type { App } from '@vercube/core';

/**
 * Returns the appropriate build function based on the specified bundler
 * @param {string} bundler - The bundler to use ('rollup' or 'rolldown')
 * @returns {DevKitTypes.BuildFunc} The build function for the specified bundler
 */
export function getBuildFunc(bundler: string): DevKitTypes.BuildFunc {
  return rolldownBuild;
}

/**
 * Returns the appropriate watch function based on the specified bundler
 * @param {string} bundler - The bundler to use ('rollup' or 'rolldown')
 * @returns {DevKitTypes.WatchFunc} The watch function for the specified bundler
 */
export function getWatchFunc(bundler: string): DevKitTypes.WatchFunc {
  return rolldownWatch;
}

/**
 * Returns the server application instance
 * @param {DevKitTypes.App} app - The application instance
 * @returns {App} The server application instance
 */
export async function getServerAppInstance(app: DevKitTypes.App): Promise<App> {
  const x = resolve(process.cwd(), app.config.build?.output?.dir ?? 'dist', 'index.mjs');

  process.env.VERCUBE_CLI_MODE = 'true';
  const { default: serverApp } = await import(x);
  delete process.env.VERCUBE_CLI_MODE;

  if (!serverApp) {
    throw new Error(`Server application instance not found at ${x}`);
  }

  return serverApp;
}
