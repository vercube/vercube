import { defineEventHandler } from 'nitro/h3';

export default defineEventHandler({
  fetch: async (event) => {
    const app = globalThis.__vercubeApp__;
    if (!app) {
      throw new Error('Vercube app is not initialized');
    }
    return app.fetch(event);
  },
});
