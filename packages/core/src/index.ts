import { createApp, toNodeListener } from 'h3';
import { listen } from 'listhen';
import { Get } from './Decorators/Http/Get';
import { Container, initializeContainer } from '@cube/di';
import { RouterRegistry } from './Services/Router/RouterRegistry';
import { HooksService } from './Services/Hooks/HooksService';
import { Controller } from './Decorators/Http/Controller';
import { MetadataResolver } from './Services/Metadata/MetadataResolver';

@Controller('/api')
class X {

  @Get('/test')
  public async get(): Promise<unknown> {
    return { message: '⚡️ Tadaa!' };
  }

}

// Create an app instance
const app = createApp();

// define container
const container = new Container({});
container.bindInstance(Container, container);
container.bind(RouterRegistry);
container.bind(HooksService);
container.bind(MetadataResolver);
container.bind(X);

initializeContainer(container);

async function init() {

  container.get(RouterRegistry).init();
  app.use(container.get(RouterRegistry).router);

  await listen(toNodeListener(app), { port: 3000 });
}

export default {
  init,
}