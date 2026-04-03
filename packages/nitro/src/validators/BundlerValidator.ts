import type { Nitro } from 'nitro/types';

/**
 * Validates the bundler options for the nitro instance
 * @param nitro - The nitro instance
 * @returns void
 */
export function validateBundler(nitro: Nitro): void {
  if (nitro.options.builder !== 'rolldown') {
    throw new Error('Vercube Nitro module requires the rolldown builder');
  }
}
