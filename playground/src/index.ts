import { createApp } from '@cube/core';
import { useContainer } from './Boot/Container';
import { CustomPlugin } from './Plugins/CustomPlugin';

async function main() {
  const app = await createApp();

  app.container.expand(useContainer);

  app.registerPlugin(CustomPlugin, { foo: 'bar' });

  await app.listen({ port: 3001 });
}

main();