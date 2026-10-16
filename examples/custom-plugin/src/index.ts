import { createApp, type App, type RequestHandler } from '@vercube/core';

const app: App = await createApp();

await app.listen();

export default {
  fetch: app.fetch.bind(app) as RequestHandler,
};
