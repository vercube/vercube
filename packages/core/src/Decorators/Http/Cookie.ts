import { BaseDecorator, createDecorator } from '@vercube/di';
import { initializeMetadata, initializeMetadataMethod, setMetadataArg } from '../../Utils/Utils';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { ValidationTypes } from '../../Types/ValidationTypes';

export interface CookieDecoratorOptions {
  /**
   * Schema the value is validated against. A request that fails it is answered
   * with 400, and the handler receives what the schema parsed.
   */
  validationSchema?: ValidationTypes.Schema;
}

interface CookieDecoratorParams extends CookieDecoratorOptions {
  name?: string;
}

/**
 * Registers a handler parameter that reads request cookies: one of them when
 * the decorator has a name, all of them otherwise.
 *
 * @extends {BaseDecorator<CookieDecoratorParams>}
 */
class CookieDecorator extends BaseDecorator<CookieDecoratorParams, MetadataTypes.Metadata> {
  /**
   * Called when the decorator is created. Adds the cookie argument to the
   * metadata of the method.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);
    const { name, validationSchema } = this.options;

    setMetadataArg(method, {
      idx: this.propertyIndex,
      ...(name === undefined ? { type: 'cookies' } : { type: 'cookie', data: { name } }),
      validate: validationSchema ? true : false,
      validationSchema,
    });
  }
}

/**
 * Injects a request cookie into a handler parameter.
 *
 * With a name the parameter receives the decoded value of that cookie, or
 * `undefined` when it was not sent, so a parameter default applies. Without a
 * name it receives every cookie as an object, the same as `@Cookies()`.
 *
 * @example
 * ```ts
 * @Get('/me')
 * me(@Cookie('session') session?: string, @Cookie('theme', { validationSchema: z.enum(['light', 'dark']) }) theme = 'light') {}
 * ```
 *
 * @param {string} [name] - The cookie to read. All cookies when left out.
 * @param {CookieDecoratorOptions} [options] - A schema to validate the value against.
 * @returns {Function} The parameter decorator.
 */
export function Cookie(name?: string, options?: CookieDecoratorOptions): Function {
  const params: CookieDecoratorParams = { name, validationSchema: options?.validationSchema };

  return createDecorator(CookieDecorator, params);
}

/**
 * Injects every request cookie into a handler parameter, as an object of
 * decoded values by name. The object is empty when the request has none.
 *
 * @example
 * ```ts
 * @Get('/prefs')
 * prefs(@Cookies() cookies: Record<string, string>) {}
 * ```
 *
 * @param {CookieDecoratorOptions} [options] - A schema to validate the object against.
 * @returns {Function} The parameter decorator.
 */
export function Cookies(options?: CookieDecoratorOptions): Function {
  const params: CookieDecoratorParams = { validationSchema: options?.validationSchema };

  return createDecorator(CookieDecorator, params);
}
