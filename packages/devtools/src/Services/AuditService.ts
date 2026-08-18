import { Inject } from '@vercube/di';
import { getBootstrapProfile } from './BootstrapProfiler';
import { GraphCollector } from './GraphCollector';
import { RequestRecorder } from './RequestRecorder';
import { RouteCollector } from './RouteCollector';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/** Bootstrap self time (ms) above which a service is flagged as slow. */
const SLOW_BOOTSTRAP_MS = 25;

/** Request duration (ms) above which an endpoint is flagged as slow. */
const SLOW_REQUEST_MS = 500;

/** Severity weights used to compute the 0-100 health score. */
const SEVERITY_WEIGHT: Record<DevtoolsTypes.AuditSeverity, number> = {
  error: 12,
  warning: 5,
  info: 1,
};

/**
 * Runs static and runtime checks and reports findings with a health score.
 */
export class AuditService {
  @Inject(GraphCollector)
  private readonly gGraph!: GraphCollector;

  @Inject(RouteCollector)
  private readonly gRoutes!: RouteCollector;

  @Inject(RequestRecorder)
  private readonly gRequests!: RequestRecorder;

  /**
   * Executes every audit rule.
   * @returns findings ordered by severity, with a health score
   */
  public run(): DevtoolsTypes.AuditReport {
    const graph = this.gGraph.collect();
    const routes = this.gRoutes.collect().filter((route) => !route.internal);

    const issues: DevtoolsTypes.AuditIssue[] = [
      ...this.checkCycles(graph),
      ...this.checkUnboundDependencies(graph),
      ...this.checkUnusedServices(graph),
      ...this.checkDuplicateRoutes(routes),
      ...this.checkUnvalidatedInput(routes),
      ...this.checkSlowBootstrap(),
      ...this.checkRuntime(),
    ];

    const order: DevtoolsTypes.AuditSeverity[] = ['error', 'warning', 'info'];
    issues.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

    const counts: Record<DevtoolsTypes.AuditSeverity, number> = { error: 0, warning: 0, info: 0 };
    let penalty = 0;

    for (const issue of issues) {
      counts[issue.severity]++;
      penalty += SEVERITY_WEIGHT[issue.severity];
    }

    return { issues, counts, score: Math.max(0, 100 - penalty) };
  }

  /**
   * Flags dependency cycles.
   * @param graph dependency graph snapshot
   * @returns findings, one per cycle
   */
  private checkCycles(graph: DevtoolsTypes.Graph): DevtoolsTypes.AuditIssue[] {
    return graph.cycles.map((cycle) => ({
      rule: 'di/circular-dependency',
      severity: 'warning' as const,
      title: 'Circular dependency',
      detail: `${[...cycle, cycle[0]].join(' → ')}. The container resolves this by constructing instances before injecting them, but a cycle usually points at a missing abstraction.`,
      targets: cycle,
    }));
  }

  /**
   * Flags `@Inject` declarations pointing at unbound keys.
   * @param graph dependency graph snapshot
   * @returns findings, one per unbound dependency
   */
  private checkUnboundDependencies(graph: DevtoolsTypes.Graph): DevtoolsTypes.AuditIssue[] {
    const issues: DevtoolsTypes.AuditIssue[] = [];

    for (const node of graph.nodes) {
      for (const dependency of node.dependencies) {
        if (dependency.bound) {
          continue;
        }

        issues.push({
          rule: dependency.optional ? 'di/unbound-optional-dependency' : 'di/unbound-dependency',
          severity: dependency.optional ? 'info' : 'error',
          title: dependency.optional ? 'Optional dependency is not bound' : 'Unresolved dependency',
          detail: `${node.name}.${dependency.property} injects ${dependency.name}, which is not registered in the container.${
            dependency.optional ? ' It will always resolve to null.' : ' Resolving this service will throw.'
          }`,
          targets: [node.name, dependency.name],
        });
      }
    }

    return issues;
  }

  /**
   * Flags singletons that were registered but never constructed.
   * @param graph dependency graph snapshot
   * @returns a single grouped finding, or nothing
   */
  private checkUnusedServices(graph: DevtoolsTypes.Graph): DevtoolsTypes.AuditIssue[] {
    const unused = graph.nodes.filter(
      (node) => !node.instantiated && node.dependents === 0 && node.role !== 'framework' && node.kind !== 'transient',
    );

    if (unused.length === 0) {
      return [];
    }

    return [
      {
        rule: 'di/unused-service',
        severity: 'info',
        title: `${unused.length} service${unused.length === 1 ? '' : 's'} never instantiated`,
        detail:
          'These services are bound in the container but nothing has ever resolved them. They may be dead bindings, or simply not exercised yet.',
        targets: unused.map((node) => node.name),
      },
    ];
  }

  /**
   * Flags identical method/path pairs registered more than once.
   * @param routes route snapshot
   * @returns findings, one per duplicated route
   */
  private checkDuplicateRoutes(routes: DevtoolsTypes.RouteInfo[]): DevtoolsTypes.AuditIssue[] {
    const byId = new Map<string, DevtoolsTypes.RouteInfo[]>();

    for (const route of routes) {
      byId.set(route.id, [...(byId.get(route.id) ?? []), route]);
    }

    return [...byId.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([id, group]) => ({
        rule: 'router/duplicate-route',
        severity: 'error' as const,
        title: 'Duplicate route',
        detail: `${id} is registered ${group.length} times (${group.map((route) => `${route.controller}.${route.handler}`).join(', ')}). Only the first registration is reachable.`,
        targets: group.map((route) => `${route.controller}.${route.handler}`),
      }));
  }

  /**
   * Flags request bodies that reach a handler without schema validation.
   * @param routes route snapshot
   * @returns a single grouped finding, or nothing
   */
  private checkUnvalidatedInput(routes: DevtoolsTypes.RouteInfo[]): DevtoolsTypes.AuditIssue[] {
    const offenders = routes.filter((route) =>
      route.args.some((arg) => (arg.type === 'body' || arg.type === 'query-params') && !arg.validated),
    );

    if (offenders.length === 0) {
      return [];
    }

    return [
      {
        rule: 'validation/missing-schema',
        severity: 'warning',
        title:
          offenders.length === 1 ? '1 route accepts unvalidated input' : `${offenders.length} routes accept unvalidated input`,
        detail:
          'A @Body() or @QueryParams() argument is passed to the handler without a validation schema. Attach one so malformed payloads are rejected before your code runs.',
        targets: offenders.map((route) => `${route.method} ${route.path}`),
      },
    ];
  }

  /**
   * Flags services that dominate bootstrap time.
   * @returns findings, one per slow service
   */
  private checkSlowBootstrap(): DevtoolsTypes.AuditIssue[] {
    const profile = getBootstrapProfile();

    return profile.hotspots
      .filter((hotspot) => hotspot.selfMs >= SLOW_BOOTSTRAP_MS)
      .slice(0, 5)
      .map((hotspot) => ({
        rule: 'bootstrap/slow-service',
        severity: 'warning' as const,
        title: 'Slow service construction',
        detail: `${hotspot.name} spent ${hotspot.selfMs}ms in its own constructor and injection phase. Move blocking work out of construction and into an @Init() hook or a lazy getter.`,
        targets: [hotspot.name],
      }));
  }

  /**
   * Flags failing and slow endpoints from recorded traffic.
   * @returns findings derived from the request buffer
   */
  private checkRuntime(): DevtoolsTypes.AuditIssue[] {
    const records = this.gRequests.records;

    if (records.length === 0) {
      return [];
    }

    const issues: DevtoolsTypes.AuditIssue[] = [];
    const failing = records.filter((record) => record.status >= 500);

    if (failing.length > 0) {
      issues.push({
        rule: 'runtime/server-errors',
        severity: 'error',
        title: `${failing.length} request${failing.length === 1 ? '' : 's'} failed with a server error`,
        detail: 'Requests returned a 5xx status. Open the request timeline to see which span threw.',
        targets: [...new Set(failing.map((record) => `${record.method} ${record.path}`))],
      });
    }

    const slow = records.filter((record) => record.durationMs >= SLOW_REQUEST_MS);

    if (slow.length > 0) {
      issues.push({
        rule: 'runtime/slow-requests',
        severity: 'warning',
        title: `${slow.length} slow request${slow.length === 1 ? '' : 's'}`,
        detail: `Requests took longer than ${SLOW_REQUEST_MS}ms. The timeline breaks the duration down per middleware and handler.`,
        targets: [...new Set(slow.map((record) => `${record.method} ${record.path}`))],
      });
    }

    return issues;
  }
}
