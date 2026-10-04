// Contract integrity (NFR-MAINT-01): unique ids, well-formed paths, declared path params.
import { describe, expect, it } from 'vitest';
import { allRoutes, ERROR_STATUS, fillPath, pathParamNames } from '../src/index.js';

describe('route definitions', () => {
  it('have unique operation ids and unique method+path pairs', () => {
    const ids = allRoutes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = allRoutes.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('declare every path parameter in their params schema, and nothing else', () => {
    for (const route of allRoutes) {
      const inPath = pathParamNames(route.path).sort();
      const declared = Object.keys(route.params?.shape ?? {}).sort();
      expect(declared, route.id).toEqual(inPath);
    }
  });

  it('only use known error codes and have bodies only on unsafe methods', () => {
    for (const route of allRoutes) {
      for (const code of route.errors ?? [])
        expect(ERROR_STATUS[code], `${route.id}: ${code}`).toBeDefined();
      if (route.method === 'get') expect(route.body, route.id).toBeUndefined();
      expect(route.path.startsWith('/'), route.id).toBe(true);
    }
  });

  it('fills path parameters with encoding', () => {
    expect(fillPath('/a/{id}/b', { id: 'x y/z' })).toBe('/a/x%20y%2Fz/b');
    expect(() => fillPath('/a/{id}', {})).toThrow();
  });
});
