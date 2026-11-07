import { defineRecipe } from '../Apply';
import { VERSIONS } from './Versions';

const SERVERLESS_YML = `service: vercube-api
frameworkVersion: '4'

provider:
  name: aws
  runtime: nodejs22.x
  region: eu-central-1
  environment:
    NODE_ENV: production
    # the handler serves requests, app.listen() must not bind a port
    VERCUBE_LISTEN: '0'

plugins:
  - serverless-offline

package:
  patterns:
    - dist/**
    - vercube.config.ts

functions:
  api:
    handler: dist/index.handler
    events:
      - http: { path: /, method: ANY, cors: true }
      - http: { path: /{proxy+}, method: ANY, cors: true }

custom:
  serverless-offline:
    noPrependStageInUrl: true
    httpPort: 3000
    lambdaPort: 3002
`;

export const awsLambdaRecipe = defineRecipe({
  id: 'aws-lambda',
  label: 'AWS Lambda',
  kind: 'deploy',
  apply: ({ project }) => {
    project.addDependencies({ '@vercube/serverless': 'latest' });
    project.addDependencies({ serverless: VERSIONS.serverless, 'serverless-offline': VERSIONS.serverlessOffline }, { dev: true });
    // app.listen() stays: \`vercube dev\` needs it, and it binds nothing on Lambda
    project.addToEntry('export const handler: ServerlessHandler = toServerlessHandler(app);', {
      imports: {
        toServerlessHandler: '@vercube/serverless/aws-lambda',
        ServerlessHandler: { from: '@vercube/serverless', type: true },
      },
    });
    project.createFile('serverless.yml', SERVERLESS_YML);
    project.addScript('offline', 'vercube build && serverless offline');
    project.addScript('deploy', 'vercube build && serverless deploy');
    project.addLines('.gitignore', ['.serverless']);
    project.note('Run the Lambda locally with `offline`, deploy it with `deploy`');
  },
});
