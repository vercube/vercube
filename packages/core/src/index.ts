import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3';
import { listen } from 'listhen';
import { Get } from './Decorators/Http/Get';
import { Container, initializeContainer } from '@cube/di';
import { RouterRegistry } from './Services/Router/RouterRegistry';
import { HooksService } from './Services/Hooks/HooksService';
import { Listen } from './Decorators/Hooks/Listen';
import { RouterBeforeInitHook } from './Hooks/Router/RouterBeforeInitHook';

class X {

  @Get('/test')
  public get() {
    console.log('test');
    return { message: '⚡️ Tadaa!' };
  }

  @Listen(RouterBeforeInitHook)
  public onBeforeInit() {
    console.log('Before init');
  }

}

// Create an app instance
const app = createApp();

// define container
const container = new Container({});
container.bindInstance(Container, container);
container.bind(RouterRegistry);
container.bind(HooksService);
container.bind(X);

initializeContainer(container);

const router = createRouter()
  .get(
    '/',
    defineEventHandler((event) => {
      console.log('Request received:', event);
      return { message: '⚡️ Tadaa!' };
    }),
  );

app.use(router);

async function init() {

  console.log(container.get(X));

  container.get(RouterRegistry).init();

  await listen(toNodeListener(app), { port: 3000 });
}

export default {
  init,
}