import { defineEventHandler } from 'nitro/h3';

export default defineEventHandler({
  fetch: async (event) => {
    const app = (globalThis as any).__vercubeApp__;
    return app.fetch(event);
  },
});
