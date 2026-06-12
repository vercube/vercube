import { defineHandler } from 'nitro';

export default defineHandler((event) => {
  event.context.test = 'test';
});
