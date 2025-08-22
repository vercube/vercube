import { createApp } from "../../src";
import { MockController } from "./MockController.mock";

export const createTestApp = async () => {
  const app = await createApp();

  app.container.expand((container) => {
    container.bind(MockController);
  });

  return app;
}