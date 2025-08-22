import { Router, createApp } from '../packages/core/dist/index.mjs';

class SimpleController {
  index() {
    return 'Hello World';
  }
}

const app = await createApp();
app.container.get(Router).addRoute({
  path: '/',
  method: 'GET',
  handler: {
    instance: new SimpleController(),
    propertyName: 'index',
  },
});

app.listen();
