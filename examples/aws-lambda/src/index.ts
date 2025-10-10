import { createApp } from '@vercube/core';
import { toServerlessHandler } from '@vercube/serverless/aws-lambda';
import { useContainer } from '@/boot/Container';
import type { ServerlessHandler } from '@vercube/serverless';

const app = await createApp();
app.container.expand(useContainer);

export const handler: ServerlessHandler = toServerlessHandler(app);
