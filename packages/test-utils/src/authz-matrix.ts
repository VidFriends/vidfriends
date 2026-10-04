// Authorization matrix harness (SDD §3, NFR-SEC-01). Every contract route that takes an id must
// be listed with an expected status for each persona; `missingRoutes` makes CI fail otherwise.
import { allRoutes, pathParamNames, type RouteDef } from '@vidfriends/contracts';
import type { CallOptions, TestClient } from './client.js';

export const PERSONAS = [
  'owner', // created the resource / is the acting participant
  'participant', // the other party of a share or conversation
  'friend', // accepted friend of the owner, not a participant
  'stranger', // member with no relationship to the owner
  'blocked', // member the owner has blocked
  'suspended', // suspended member (session must be rejected)
  'admin', // instance admin (never a participant)
  'anonymous', // no session
] as const;
export type Persona = (typeof PERSONAS)[number];

export type Expectation = number | readonly number[];

export interface MatrixCase<R extends RouteDef = RouteDef> {
  route: R;
  /** Optional label when one route has several cases. */
  name?: string;
  /** Creates a fresh target for one persona's call and returns the request to make. */
  prepare(persona: Persona): Promise<CallOptions<R>>;
  expect: Record<Persona, Expectation>;
}

export function matrixCase<R extends RouteDef>(c: MatrixCase<R>): MatrixCase<RouteDef> {
  return c as unknown as MatrixCase<RouteDef>;
}

/** Routes whose path carries an identifier and therefore need object-level authorization tests. */
export function idBearingRoutes(routes: readonly RouteDef[] = allRoutes): RouteDef[] {
  return routes.filter((r) => pathParamNames(r.path).length > 0);
}

/** Route ids that take an id but have no matrix case. */
export function missingRoutes(
  cases: readonly MatrixCase[],
  routes: readonly RouteDef[] = allRoutes,
): string[] {
  const covered = new Set(cases.map((c) => c.route.id));
  return idBearingRoutes(routes)
    .map((r) => r.id)
    .filter((id) => !covered.has(id));
}

export interface MatrixFailure {
  route: string;
  persona: Persona;
  expected: Expectation;
  actual: number;
  body: unknown;
}

/** Runs every case for every persona and returns all mismatches (empty means pass). */
export async function runMatrix(
  cases: readonly MatrixCase[],
  clientFor: (persona: Persona) => TestClient,
): Promise<MatrixFailure[]> {
  const failures: MatrixFailure[] = [];
  for (const c of cases) {
    for (const persona of PERSONAS) {
      const options = await c.prepare(persona);
      const res = await clientFor(persona).call(c.route, options);
      const expected = c.expect[persona];
      const ok = Array.isArray(expected)
        ? (expected as readonly number[]).includes(res.status)
        : res.status === expected;
      if (!ok) {
        failures.push({
          route: c.name ? `${c.route.id} (${c.name})` : c.route.id,
          persona,
          expected,
          actual: res.status,
          body: res.body,
        });
      }
    }
  }
  return failures;
}
