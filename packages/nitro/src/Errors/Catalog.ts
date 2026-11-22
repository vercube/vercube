import { defineErrorCatalog } from '@vercube/di';

/**
 * The errors of the Nitro module.
 */
export const NitroErrors = defineErrorCatalog('VERCUBE_NITRO', {
  HEALTH_TOKEN_IN_BUILD: {
    message:
      'vercubeNitro: health.token would be baked into the server build. Set runtimeConfig.vercube.healthToken instead (NITRO_VERCUBE_HEALTH_TOKEN at runtime).',
    why: 'The options of `vercubeNitro()` are written into the server bundle as JSON, so a `health.token` passed there would be readable by anyone who has the build output.',
    fix: 'Remove `token` from the `health` option of `vercubeNitro()` and set `runtimeConfig.vercube.healthToken` in `nitro.config.ts`, or the `NITRO_VERCUBE_HEALTH_TOKEN` environment variable where the server runs.',
  },
  HEALTH_CHECKS_IN_BUILD: {
    message:
      'vercubeNitro: health.checks cannot be passed through the build. Register them with app.health.register() in the setupFile.',
    why: 'The options of `vercubeNitro()` are written into the server bundle as JSON, and the functions of `health.checks` do not survive that.',
    fix: 'Remove `checks` from the `health` option of `vercubeNitro()` and call `app.health.register()` for each check in the file the `setupFile` option points to.',
  },
  APP_NOT_INITIALIZED: {
    message: 'Vercube app is not initialized',
    why: 'A request reached the Vercube route handler before the Nitro plugin that creates the application had finished, or after that plugin failed. The handler finds the application on `globalThis.__vercubeApp__`, which the plugin sets.',
    fix: 'Read the server log for the error thrown while the application started, usually in the file the `setupFile` option of `vercubeNitro()` points to, and check that `vercubeNitro()` is listed in `modules` in `nitro.config.ts`.',
  },
  EXPERIMENTAL_DECORATORS_DISABLED: {
    message: ({ file }: { file: string }) =>
      `Vercube requires "experimentalDecorators" to be enabled in your tsconfig (${file}). ` +
      'Please add "experimentalDecorators": true to your compilerOptions.',
    why: 'Vercube controllers and services are written with legacy TypeScript decorators, and the tsconfig Nitro builds with does not turn them on. The build would emit code in which `@Controller()` and `@Inject()` do nothing.',
    fix: 'Add `"experimentalDecorators": true` to `compilerOptions` in the tsconfig named in the message.',
  },
  BUILDER_NOT_ROLLDOWN: {
    message: 'Vercube Nitro module requires the rolldown builder',
    why: 'The module transforms decorators and wires the discovered controllers in through Rolldown, and Nitro is configured with another builder.',
    fix: "Set `builder: 'rolldown'` in `nitro.config.ts`.",
  },
});
