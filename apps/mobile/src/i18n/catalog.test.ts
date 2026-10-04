// NFR-I18N-01 (M7-T14): every language has every English key with the same placeholders.
import en from './en.json';
import es from './es.json';
import { detectLanguage } from './index';

// jest.mock calls are hoisted above the imports.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  const base = flatten(en as Tree);
  const other = flatten(es as Tree);
  it('es has every English key and no extra ones (plural _many aside)', () => {
    expect([...base.keys()].filter((k) => !other.has(k))).toEqual([]);
    expect([...other.keys()].filter((k) => !base.has(k) && !k.endsWith('_many'))).toEqual([]);
  });
  it('es keeps every placeholder', () => {
    const wrong = [...base].filter(
      ([k, v]) => other.has(k) && placeholders(v).join() !== placeholders(other.get(k)!).join(),
    );
    expect(wrong.map(([k]) => k)).toEqual([]);
  });
  it('follows the phone language when it is supported', () => {
    expect(detectLanguage(['es-419', 'en-US'])).toBe('es');
    expect(detectLanguage(['pt-BR'])).toBe('en');
  });
});
