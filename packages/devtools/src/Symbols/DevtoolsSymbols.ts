import { Identity } from '@vercube/di';
import type { IOC } from '@vercube/di';

/**
 * Container key holding the resolved {@link DevtoolsTypes.ResolvedOptions}.
 */
export const $DevtoolsOptions: IOC.Identity = Identity('DevtoolsOptions');

/**
 * Container key holding the merged application config.
 */
export const $DevtoolsAppConfig: IOC.Identity = Identity('DevtoolsAppConfig');
