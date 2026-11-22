import { defineEventHandler } from 'nitro/h3';
import { NitroErrors } from '../Errors/Catalog';

export default defineEventHandler({
  fetch: async (event) => {
    const app = globalThis.__vercubeApp__;
    if (!app) {
      throw NitroErrors.APP_NOT_INITIALIZED();
    }
    return app.fetch(event);
  },
});
