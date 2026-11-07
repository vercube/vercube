import { defineRecipe } from '../Apply';
import { VERSIONS } from './Versions';

const TRIGGER = `import { azureFunctionsHandler } from '@/index';
import { app } from '@azure/functions';
import type { HttpRequest, HttpResponseInit } from '@azure/functions';

export async function httpTrigger(request: HttpRequest): Promise<HttpResponseInit> {
  return azureFunctionsHandler(request);
}

app.http('httpTrigger', {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  authLevel: 'anonymous',
  route: '{*proxy}',
  handler: httpTrigger,
});
`;

const HOST_JSON = `{
  "version": "2.0",
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  },
  "extensions": {
    "http": {
      "routePrefix": ""
    }
  }
}
`;

const LOCAL_SETTINGS = `{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": "UseDevelopmentStorage=true"
  }
}
`;

export const azureFunctionsRecipe = defineRecipe({
  id: 'azure-functions',
  label: 'Azure Functions',
  kind: 'deploy',
  apply: ({ project }) => {
    project.addDependencies({ '@vercube/serverless': 'latest', '@azure/functions': VERSIONS.azureFunctions });
    // app.listen() stays: \`vercube dev\` needs it, and it binds nothing on Azure
    project.addToEntry(
      'export const azureFunctionsHandler: ServerlessHandler<HttpRequest, HttpResponseInit> = toServerlessHandler(app);',
      {
        imports: {
          toServerlessHandler: '@vercube/serverless/azure-functions',
          ServerlessHandler: { from: '@vercube/serverless', type: true },
          HttpRequest: { from: '@azure/functions', type: true },
          HttpResponseInit: { from: '@azure/functions', type: true },
        },
      },
    );
    project.createFile('src/functions/httpTrigger.ts', TRIGGER);
    project.createFile('host.json', HOST_JSON);
    project.createFile('local.settings.json', LOCAL_SETTINGS);
    project.addLines('.gitignore', ['local.settings.json']);
    project.setConfig('build', "{ entry: ['./src/index.ts', './src/functions/httpTrigger.ts'] }");
    project.updateJson('package.json', (pkg) => {
      if (pkg.main === 'dist/*.mjs') {
        return false;
      }

      pkg.main = 'dist/*.mjs';

      return true;
    });
    project.addScript('start:functions', 'vercube build && func start');
    project.note('Run the functions locally with `start:functions` (needs Azure Functions Core Tools)');
  },
});
