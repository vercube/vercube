import { createApp } from '@vercube/core';
import { toServerlessHandler } from '@vercube/serverless/azure-functions';
import { useContainer } from '@/boot/Container';
import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import type { ServerlessHandler } from '@vercube/serverless';

const app = await createApp();
app.container.expand(useContainer);

export const azureFunctionsHandler: ServerlessHandler<HttpRequest, HttpResponseInit> = toServerlessHandler(app);
