import { defineEventHandler } from 'nitro/h3';

export default defineEventHandler((event) => {
  return {
    message: 'Hello, world!',
  };
});
