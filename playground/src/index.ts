import { createApp } from '@cube/core';
import { useContainer } from './Boot/Container';
import { CustomPlugin } from './Plugins/CustomPlugin';
import { RedisPlugin } from '@cube/redis'

async function main() {
  const app = await createApp();

  app.container.expand(useContainer);

  app.registerPlugin(CustomPlugin, { foo: 'bar' });
  app.registerPlugin(RedisPlugin, { foo: 'redis' });

  await app.listen({ port: 3001 });
}

main();
