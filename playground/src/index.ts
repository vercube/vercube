import { createApp } from '@vercube/core';
import { useContainer } from './Boot/Container';

const app = await createApp();
app.container.expand(useContainer);

await app.listen();