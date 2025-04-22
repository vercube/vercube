import { createApp } from '@vercube/core';
import { toH3 } from '@vercube/h3';
import { useContainer } from './Boot/Container';
import { H3, serve } from 'h3';

const h3app = new H3();

async function main() {
  const app = await createApp();

  app.container.expand(useContainer);

  h3app.all('/api/**', toH3(app));

  await serve(h3app, { port: 3000 })
    .ready()
    .then((server) => {
      console.log(`🚀 Server ready at ${server.url}`);
    });
}

await main();