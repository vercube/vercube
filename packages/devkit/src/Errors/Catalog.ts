import { defineErrorCatalog } from '@vercube/core';

/**
 * The errors of the development kit.
 */
export const DevkitErrors = defineErrorCatalog('VERCUBE_DEVKIT', {
  ROUTES_NOT_REPORTED: {
    message: 'The application did not report its routes',
    why: 'The built application was run to read its routes for the `@vercube/client` route map, and its answer had no `routes` section. The `@vercube/core` the application was built with is older than this CLI and does not know that section.',
    fix: 'Install the same version of every `@vercube/*` package, and check it with `pnpm why @vercube/core`. Set `build.typegen` to `false` in `vercube.config.ts` when the route map is not needed.',
    create: (message) => new TypeError(message),
  },
});
