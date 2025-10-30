import { MCPTool, Tool } from '@vercube/mcp';
import { z } from 'zod/v3';

/**
 * Input schema for the weather tool.
 * Requires a location string describing where to fetch the weather.
 */
const inputSchema: z.ZodObject<{
  location: z.ZodString;
}> = z.object({
  location: z.string().describe('The location to get the weather for'),
});

/**
 * Output schema for the weather tool.
 * Returns the requested location and its temperature.
 */
const outputSchema: z.ZodObject<{
  location: z.ZodString;
  temperature: z.ZodNumber;
}> = z.object({
  location: z.string().describe('The location to get the weather for'),
  temperature: z.number().describe('The temperature in the location'),
});

/**
 * Tool implementation that provides a simple weather lookup interface.
 */
export class WeatherTool extends Tool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> {
  @MCPTool({
    name: 'getWeather',
    description: 'Get the weather for a location',
    inputSchema,
    outputSchema,
  })
  /**
   * Execute the weather lookup.
   * @param args - Input matching {@link inputSchema.shape} with a `location`.
   * @param _extra - Optional execution context or metadata.
   * @returns An object matching {@link outputSchema.shape} containing `location` and `temperature`.
   */
  public async execute(args: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> {
    return {
      location: args.location,
      temperature: 0,
    };
  }
}
