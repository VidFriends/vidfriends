// Passkeys for E2E (ADR-0018). Each persona's authenticator lives in Node (SoftAuthenticator from
// test-utils); a page bridge answers `navigator.credentials.create/get` with it, so the web app's
// real ceremonies run in every Playwright browser and the API helpers sign in with the same key.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { SoftAuthenticator } from '@vidfriends/test-utils/authenticator';

/** A persona's authenticator. No signature counter, like synced passkeys. */
export const authenticator = (baseURL: string) =>
  new SoftAuthenticator(new URL(baseURL).origin, { counter: false });

const adminFile = join(import.meta.dirname, '..', '.stack', 'admin-passkey.json');

/** Keeps the admin's passkey (created in the setup test) for later tests. Test data only. */
export function saveAdminPasskey(auth: SoftAuthenticator) {
  mkdirSync(dirname(adminFile), { recursive: true });
  writeFileSync(adminFile, JSON.stringify(auth.export()), { mode: 0o600 });
}

export function adminAuthenticator(baseURL: string): SoftAuthenticator {
  return authenticator(baseURL).import(JSON.parse(readFileSync(adminFile, 'utf8')));
}

type Json = Record<string, unknown>;

/**
 * Makes the page's WebAuthn calls use `auth`. Call before navigating. Replaces any earlier
 * authenticator on the same context.
 */
export async function usePasskeys(target: Page | BrowserContext, auth: SoftAuthenticator) {
  const context = 'context' in target ? target.context() : target;
  const state = context as BrowserContext & { __vfAuth?: SoftAuthenticator };
  const first = !state.__vfAuth;
  state.__vfAuth = auth;
  if (!first) return;
  await context.exposeBinding('__vfWebAuthn', (_source, kind: 'create' | 'get', options: Json) =>
    kind === 'create' ? state.__vfAuth!.create(options) : state.__vfAuth!.get(options),
  );
  await context.addInitScript(bridge);
}

// Runs in the page: converts options to JSON, asks Node, converts the answer back.
function bridge() {
  const b64url = (buf: ArrayBuffer | ArrayBufferView) => {
    const bytes =
      buf instanceof ArrayBuffer
        ? new Uint8Array(buf)
        : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const fromB64url = (s: string) => {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  };
  const toJson = (v: unknown): unknown => {
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return b64url(v as ArrayBuffer);
    if (Array.isArray(v)) return v.map(toJson);
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJson(x)]));
    return v;
  };
  type Answer = {
    id: string;
    type: string;
    authenticatorAttachment: string;
    response: Record<string, string | string[]>;
  };
  const call = (window as unknown as { __vfWebAuthn: (k: string, o: unknown) => Promise<Answer> })
    .__vfWebAuthn;
  const credential = (a: Answer) => {
    const response: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a.response)) {
      if (k === 'transports') response.getTransports = () => v;
      else response[k] = fromB64url(v as string);
    }
    return {
      id: a.id,
      rawId: fromB64url(a.id),
      type: a.type,
      authenticatorAttachment: a.authenticatorAttachment,
      response,
      getClientExtensionResults: () => ({}),
    };
  };
  const credentials = navigator.credentials;
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      ...credentials,
      create: async (o: { publicKey: unknown }) =>
        credential(await call('create', toJson(o.publicKey))),
      get: async (o: { publicKey: unknown }) => {
        try {
          return credential(await call('get', toJson(o.publicKey)));
        } catch {
          throw new DOMException('No passkey for this site', 'NotAllowedError');
        }
      },
    },
  });
}
