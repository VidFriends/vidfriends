// NFR-I18N-01 (M7-T14): every language has every English key with the same placeholders.
import { describe, expect, it } from 'vitest';
import en from './en.json';
import es from './es.json';
import { detectLanguage } from './index';

/** Every string in a catalog by its path (objects and arrays, e.g. the privacy sections). */
function flatten(tree: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof tree === 'string') return out.set(prefix, tree);
  if (tree && typeof tree === 'object') {
    for (const [k, v] of Object.entries(tree)) {
      for (const [kk, vv] of flatten(v, prefix ? `${prefix}.${k}` : k)) out.set(kk, vv);
    }
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  const base = flatten(en);
  for (const [name, catalog] of [['es', es]] as const) {
    const other = flatten(catalog);
    it(`${name} has every English key and no extra ones (plural _many aside)`, () => {
      expect([...base.keys()].filter((k) => !other.has(k))).toEqual([]);
      expect([...other.keys()].filter((k) => !base.has(k) && !k.endsWith('_many'))).toEqual([]);
    });
    it(`${name} keeps every placeholder`, () => {
      const wrong = [...base].filter(
        ([k, v]) => other.has(k) && placeholders(v).join() !== placeholders(other.get(k)!).join(),
      );
      expect(wrong.map(([k]) => k)).toEqual([]);
    });
  }

  it('follows the browser language when it is supported', () => {
    expect(detectLanguage(['es-MX', 'en'])).toBe('es');
    expect(detectLanguage(['fr-FR', 'en-GB'])).toBe('en');
    expect(detectLanguage(['de'])).toBe('en');
  });
});
