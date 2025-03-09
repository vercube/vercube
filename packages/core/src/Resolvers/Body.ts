import { BadRequestError } from '../Errors/Http/BadRequestError';
import { RouterTypes } from '../Types/RouterTypes';

export async function resolveRequestBody(event: RouterTypes.RouterEvent): Promise<unknown> {
  const text = await event.request.text();
  if (!text) {
    return undefined;
  }

  // TODO: add support for more content types
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError('Invalid JSON body');
  }
}