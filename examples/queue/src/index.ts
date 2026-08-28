import { useContainer } from '@/boot/Container';
import { createApp, type App, type RequestHandler } from '@vercube/core';

// plugins are registered in vercube.config.ts
const app: App = await createApp();
app.container.expand(useContainer);

if (import.meta.main) {
  await app.listen();
}

export default {
  fetch: app.fetch.bind(app) as RequestHandler,
};
