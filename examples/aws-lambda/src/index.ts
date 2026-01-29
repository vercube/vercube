import { useContainer } from '@/boot/Container';
import { type App, createApp } from '@vercube/core';
import { toServerlessHandler } from '@vercube/serverless/aws-lambda';
import type { ServerlessHandler } from '@vercube/serverless';

const app: App = await createApp();
app.container.expand(useContainer);

export const handler: ServerlessHandler = toServerlessHandler(app);
