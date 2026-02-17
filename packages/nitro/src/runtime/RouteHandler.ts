import { useNitroApp } from 'nitro/app';
import { defineEventHandler } from 'nitro/h3';

export default defineEventHandler((event) => {
  const container = useNitroApp().__vercubeContainer__;

  console.log(container);

  return { message: 'Hello, world!' };
});
