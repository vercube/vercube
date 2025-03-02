import { rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { builtinModules } from 'node:module';
import type { PromiseExecutor, ExecutorContext } from '@nx/devkit';
import type { RolldownExecutorSchema } from './schema';
import UnpluginIsolatedDecl from 'unplugin-isolated-decl/rolldown';
import { rolldown, type OutputOptions } from 'rolldown';
import { mkdirSync } from 'node:fs';

/**
 * Executor for rolling down configurations and dependencies
 * @param {RolldownExecutorSchema} options - Configuration options for the rolldown executor
 * @returns {Promise<{success: boolean}>} A promise that resolves to an object indicating execution success
 */

export default async function rolldownExecutor(options: RolldownExecutorSchema, context: ExecutorContext): ReturnType<PromiseExecutor> {
  const projectRoot = context.projectsConfigurations.projects?.[context.projectName ?? '']?.root;

  if (!projectRoot) {
    throw new Error(`Project root not found for project ${context.projectName}`);
  }

  const pkg = await import(resolve(context.root, projectRoot, 'package.json'));

  // remove old dist folder before building
  await rm(join(projectRoot, 'dist'), { recursive: true, force: true });

  try {
    // Process all export entries from package.json
    const exports = pkg.exports;
    
    if (!exports) {
      throw new Error('No exports found in package.json');
    }

    const entries: Record<string, string> = {};
    const outputPaths: Record<string, { cjs: string, esm: string }> = {};

    // Parse exports field to get input and output paths
    for (const [exportPath, exportInfo] of Object.entries(exports)) {
      // Skip non-object exports
      if (typeof exportInfo !== 'object') continue;
      
      // Determine the source file from the export path
      let sourcePath: string;
      if (exportPath === '.') {
        sourcePath = 'index.ts';
      } else {
        // For paths like "./providers", get "Providers/index.ts"
        sourcePath = exportPath.slice(2) + '/index.ts'; // Remove ./ and add index.ts
        // Capitalize first letter of each path segment for proper directory matching
        sourcePath = sourcePath.split('/').map(segment => {
          if (segment === 'index.ts') return segment;
          return segment.charAt(0).toUpperCase() + segment.slice(1);
        }).join('/');
      }
      
      // Full path to the source file
      const fullSourcePath = resolve(context.root, projectRoot, 'src', sourcePath);
      
      // Store the input file path for rolldown
      entries[exportPath] = fullSourcePath;
      
      // Store output paths for both formats
      outputPaths[exportPath] = {
        // @ts-expect-error
        cjs: resolve(context.root, projectRoot, exportInfo?.require?.replace('./dist/', 'dist/')),
        // @ts-expect-error
        esm: resolve(context.root, projectRoot, exportInfo.import.replace('./dist/', 'dist/')),
      };
    }
    
    // Build each entry point
    for (const [exportPath, inputPath] of Object.entries(entries)) {      
      const buildResult = await rolldown({
        input: [inputPath],
        resolve: {
          tsconfigFilename: resolve(context.root, 'tsconfig.json'),
        },
        external: [
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
          ...Object.keys(pkg?.dependencies ?? {}),
        ],
        plugins: [
          UnpluginIsolatedDecl({
            transformer: 'oxc',
            patchCjsDefaultExport: true,
          }),
        ],
      });

      // Ensure output directories exist
      mkdirSync(dirname(outputPaths[exportPath].cjs), { recursive: true });
      mkdirSync(dirname(outputPaths[exportPath].esm), { recursive: true });

      // Write CJS format
      await buildResult.write({
        format: 'cjs' as OutputOptions['format'],
        file: outputPaths[exportPath].cjs,
      });

      // Write ESM format
      await buildResult.write({
        format: 'esm' as OutputOptions['format'],
        file: outputPaths[exportPath].esm,
      });

      await buildResult.close();
    }

    return { success: true };

  } catch (error_) {
    console.error('Build failed:', error_);
    return {
      success: false,
    };
  }
}