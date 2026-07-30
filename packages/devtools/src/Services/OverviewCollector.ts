import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalMiddlewareRegistry, PluginsRegistry } from '@vercube/core';
import { Inject } from '@vercube/di';
import { AuditService } from './AuditService';
import { getBootstrapProfile } from './BootstrapProfiler';
import { GraphCollector } from './GraphCollector';
import { RequestRecorder } from './RequestRecorder';
import { RouteCollector } from './RouteCollector';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/** Cached `package.json` lookup for the process lifetime. */
let cachedPackage: { name: string; version: string | null } | null | undefined;

/**
 * Assembles the high-level snapshot shown on the overview screen.
 */
export class OverviewCollector {
  @Inject(GraphCollector)
  private readonly gGraph!: GraphCollector;

  @Inject(RouteCollector)
  private readonly gRoutes!: RouteCollector;

  @Inject(RequestRecorder)
  private readonly gRequests!: RequestRecorder;

  @Inject(AuditService)
  private readonly gAudit!: AuditService;

  @Inject(PluginsRegistry)
  private readonly gPlugins!: PluginsRegistry;

  @Inject(GlobalMiddlewareRegistry)
  private readonly gGlobalMiddlewares!: GlobalMiddlewareRegistry;

  /** Development mode flag, provided by the plugin at registration time. */
  private fDev: boolean = false;

  /** Production mode flag, provided by the plugin at registration time. */
  private fProduction: boolean = false;

  /**
   * Records the application mode so the overview can report it.
   * @param dev whether the app runs in development mode
   * @param production whether the app runs in production mode
   */
  public setMode(dev: boolean, production: boolean): void {
    this.fDev = dev;
    this.fProduction = production;
  }

  /**
   * Builds the overview snapshot.
   * @returns application identity, counts, health and traffic summary
   */
  public collect(): DevtoolsTypes.Overview {
    const graph = this.gGraph.collect();
    const routes = this.gRoutes.collect();
    const pkg = this.readPackage();
    const audit = this.gAudit.run();

    // Middlewares are resolved per route; the route table is the source of truth.
    const middlewares = new Set(routes.flatMap((route) => route.middlewares.map((middleware) => middleware.name)));

    return {
      name: pkg?.name ?? 'Vercube application',
      version: pkg?.version ?? null,
      runtime: this.detectRuntime(),
      dev: this.fDev,
      production: this.fProduction,
      uptime: Math.round(this.readUptime()),
      memory: this.readMemory(),
      counts: {
        services: graph.nodes.length,
        controllers: graph.nodes.filter((node) => node.role === 'controller').length,
        middlewares: middlewares.size,
        plugins: this.gPlugins.plugins.length,
        routes: routes.filter((route) => !route.internal).length,
        cycles: graph.cycles.length,
        issues: audit.issues.length,
      },
      score: audit.score,
      plugins: this.gPlugins.plugins.map((plugin) => ({ name: plugin.name })),
      globalMiddlewares: this.gGlobalMiddlewares.middlewares.map((m) => m.middleware?.name ?? 'Middleware'),
      bootstrapMs: getBootstrapProfile().totalMs,
      requests: this.gRequests.stats(),
    };
  }

  /**
   * Detects the JavaScript runtime the application is served by.
   * @returns runtime name and version
   */
  private detectRuntime(): DevtoolsTypes.Overview['runtime'] {
    const global = globalThis as {
      Bun?: { version: string };
      Deno?: { version: { deno: string } };
      process?: { versions?: Record<string, string> };
    };

    if (global.Bun) {
      return { name: 'bun', version: global.Bun.version };
    }

    if (global.Deno) {
      return { name: 'deno', version: global.Deno.version.deno };
    }

    return { name: 'node', version: global.process?.versions?.node ?? 'unknown' };
  }

  /**
   * Reads the application `package.json` from the working directory, if present.
   * @returns package name and version, or `null`
   */
  private readPackage(): { name: string; version: string | null } | null {
    if (cachedPackage !== undefined) {
      return cachedPackage;
    }

    try {
      const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
      const parsed = JSON.parse(raw) as { name?: string; version?: string };
      cachedPackage = { name: parsed.name ?? 'Vercube application', version: parsed.version ?? null };
    } catch {
      cachedPackage = null;
    }

    return cachedPackage;
  }

  /**
   * @returns process uptime in seconds, or 0 when unavailable
   */
  private readUptime(): number {
    const uptime = (globalThis as { process?: { uptime?: () => number } }).process?.uptime;
    return typeof uptime === 'function' ? uptime() : 0;
  }

  /**
   * @returns heap and RSS usage in bytes, or `null` when unavailable
   */
  private readMemory(): DevtoolsTypes.Overview['memory'] {
    const usage = (globalThis as { process?: { memoryUsage?: () => NodeJS.MemoryUsage } }).process?.memoryUsage;

    if (typeof usage !== 'function') {
      return null;
    }

    const { heapUsed, heapTotal, rss } = usage();
    return { heapUsed, heapTotal, rss };
  }
}
