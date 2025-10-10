import { azureFunctionsHandler } from '@/index';
import { app, HttpRequest } from '@azure/functions';
import type { HttpResponseInit } from '@azure/functions';

export async function httpTrigger(request: HttpRequest): Promise<HttpResponseInit> {
  return await azureFunctionsHandler(request);
}

app.http('httpTrigger', {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  authLevel: 'anonymous',
  route: '{*proxy}',
  handler: httpTrigger,
});
