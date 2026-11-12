import { authRecipe } from './Modules/Auth';
import { awsLambdaRecipe } from './Modules/AwsLambda';
import { azureFunctionsRecipe } from './Modules/AzureFunctions';
import { cacheRecipe } from './Modules/Cache';
import { devtoolsRecipe } from './Modules/Devtools';
import { queueRecipe } from './Modules/Queue';
import { rateLimitRecipe } from './Modules/RateLimit';
import { schedulerRecipe } from './Modules/Scheduler';
import { schemaRecipe } from './Modules/Schema';
import { storageRecipe } from './Modules/Storage';
import { telemetryRecipe } from './Modules/Telemetry';
import { testingRecipe } from './Modules/Testing';
import { websocketsRecipe } from './Modules/Websockets';
import type { RecipeTypes } from './RecipeTypes';

/**
 * The recipes of the Vercube modules and deploy targets, in the order the
 * prompt lists them and the order they are applied in when nothing else
 * decides it.
 */
export const RECIPES: RecipeTypes.Recipe<any>[] = [
  schemaRecipe,
  authRecipe,
  storageRecipe,
  cacheRecipe,
  rateLimitRecipe,
  queueRecipe,
  schedulerRecipe,
  websocketsRecipe,
  telemetryRecipe,
  devtoolsRecipe,
  testingRecipe,
  awsLambdaRecipe,
  azureFunctionsRecipe,
];
