import { createApp } from '@cube/core';
import { useContainer } from './Boot/Container';
import { CustomPlugin } from './Plugins/CustomPlugin';
import { RedisPlugin } from '@cube/plugin-redis';

async function main() {
  const app = await createApp();

  app.container.expand(useContainer);

  app.registerPlugin(CustomPlugin, { foo: 'bar' });
  app.registerPlugin(RedisPlugin, { host: 'redis', port: 0 });

  await app.listen({ port: 3001 });
}

main();
