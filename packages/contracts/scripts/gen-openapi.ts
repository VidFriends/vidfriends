// Generates packages/contracts/openapi.json from the Zod route definitions (ADR-0006, NFR-MAINT-01).
// `--check` exits non-zero when the committed file is stale (CI drift check).
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { API_PREFIX, ERROR_STATUS, ErrorEnvelope, allRoutes, type RouteDef } from '../src/index.js';

const registry = new OpenAPIRegistry();
registry.registerComponent('securitySchemes', 'cookie', {
  type: 'apiKey',
  in: 'cookie',
  name: 'vf_session',
});
registry.registerComponent('securitySchemes', 'bearer', { type: 'http', scheme: 'bearer' });

const genericErrors = ['validation_failed', 'internal_error'] as const;

function errorResponses(route: RouteDef) {
  const codes = new Set<string>([...genericErrors, ...(route.errors ?? [])]);
  if (route.auth !== 'public') codes.add('unauthorized');
  if (route.auth === 'admin') codes.add('forbidden');
  if (route.method !== 'get' && route.auth !== 'public') codes.add('csrf_failed');
  const byStatus = new Map<number, string[]>();
  for (const code of codes) {
    const status = ERROR_STATUS[code as keyof typeof ERROR_STATUS];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  return Object.fromEntries(
    [...byStatus.entries()]
      .sort(([a], [b]) => a - b)
      .map(([status, list]) => [
        String(status),
        {
          description: `Error: ${list.sort().join(', ')}`,
          content: { 'application/json': { schema: ErrorEnvelope } },
        },
      ]),
  );
}

for (const route of allRoutes) {
  const success: Record<string, unknown> = {};
  for (const status of [route.status, ...(route.altStatus ?? [])]) {
    success[String(status)] = route.response
      ? { description: 'OK', content: { 'application/json': { schema: route.response } } }
      : { description: status === 302 ? 'Redirect to a short-lived signed URL' : 'No content' };
  }
  registry.registerPath({
    operationId: route.id,
    method: route.method,
    path: `${API_PREFIX}${route.path}`,
    summary: route.summary,
    tags: [route.tag],
    'x-auth': route.auth,
    security: route.auth === 'public' ? [] : [{ cookie: [] }, { bearer: [] }],
    request: {
      ...(route.params ? { params: route.params } : {}),
      ...(route.query ? { query: route.query } : {}),
      ...(route.body
        ? { body: { content: { 'application/json': { schema: route.body as z.ZodType } } } }
        : {}),
    },
    responses: { ...success, ...errorResponses(route) },
  } as Parameters<typeof registry.registerPath>[0]);
}

const doc = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'VidFriends API',
    version: '1.0.0',
    license: { name: 'MIT', identifier: 'MIT' },
    description: 'Generated from packages/contracts. Do not edit by hand.',
  },
});

const out = JSON.stringify(doc, null, 2) + '\n';
const file = fileURLToPath(new URL('../openapi.json', import.meta.url));
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(file, 'utf8');
  } catch {
    // missing file is stale
  }
  if (current !== out) {
    console.error(
      'packages/contracts/openapi.json is stale. Run `pnpm --filter @vidfriends/contracts gen` and commit.',
    );
    process.exit(1);
  }
} else {
  writeFileSync(file, out);
}
