import { type App, createApp, type RequestHandler } from '@vercube/core';
import { ClockController } from './controller/ClockController';
import { TodoController } from './controller/TodoController';

const app: App = await createApp({
  setup: (app) => {
    app.container.bind(TodoController);
    app.container.bind(ClockController);
  },
});

await app.listen();

export default {
  fetch: app.fetch.bind(app) as RequestHandler,
};
