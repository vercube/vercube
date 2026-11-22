import { NitroErrors } from '../Errors/Catalog';
import type { Nitro } from 'nitro/types';

/**
 * Validates the bundler options for the nitro instance
 * @param nitro - The nitro instance
 * @returns void
 */
export function validateBundler(nitro: Nitro): void {
  if (nitro.options.builder !== 'rolldown') {
    throw NitroErrors.BUILDER_NOT_ROLLDOWN();
  }
}
