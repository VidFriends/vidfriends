// A software WebAuthn authenticator for tests (ADR-0018): creates ES256 discoverable credentials
// with user verification and answers assertions, producing the same JSON a browser would.
// Test-only: private keys live in memory.
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

type Json = Record<string, unknown>;

interface StoredCredential {
  id: string;
  privateKey: KeyObject;
  userHandle: string;
  rpId: string;
  counter: number;
}

// Minimal CBOR encoder (RFC 8949): unsigned/negative integers, byte and text strings, maps.
function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 0x100) return Buffer.from([(major << 5) | 24, n]);
  if (n < 0x10000) {
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}

type Cbor = number | string | Uint8Array | Map<number | string, Cbor> | { [k: string]: Cbor };

function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === 'string') {
    const s = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, s.length), s]);
  }
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), value]);
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
  return Buffer.concat([
    head(5, entries.length),
    ...entries.flatMap(([k, v]) => [cbor(k), cbor(v)]),
  ]);
}

const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest();

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

export class SoftAuthenticator {
  readonly credentials: StoredCredential[] = [];

  constructor(readonly origin: string) {}

  /** Answers `navigator.credentials.create()` for creation options JSON from the server. */
  create(options: Json): Json {
    const rp = options.rp as { id?: string };
    const user = options.user as { id: string };
    const rpId = rp.id ?? new URL(this.origin).hostname;
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const credId = randomBytes(16);
    const cose = new Map<number, Cbor>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, Buffer.from(jwk.x, 'base64url')],
      [-3, Buffer.from(jwk.y, 'base64url')],
    ]);
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(credId.length);
    const authData = Buffer.concat([
      sha256(rpId),
      Buffer.from([FLAG_UP | FLAG_UV | FLAG_AT]),
      Buffer.alloc(4), // counter 0
      Buffer.alloc(16), // AAGUID
      lenBuf,
      credId,
      cbor(cose),
    ]);
    const clientData = JSON.stringify({
      type: 'webauthn.create',
      challenge: options.challenge,
      origin: this.origin,
      crossOrigin: false,
    });
    const id = b64url(credId);
    this.credentials.push({ id, privateKey, userHandle: user.id, rpId, counter: 0 });
    return {
      id,
      rawId: id,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(Buffer.from(clientData)),
        attestationObject: b64url(cbor({ fmt: 'none', attStmt: {}, authData })),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  /**
   * Answers `navigator.credentials.get()`. Uses the given credential, else the first allowed one,
   * else (discoverable sign-in) the most recently created one.
   */
  get(options: Json, credentialId?: string): Json {
    const allow = (options.allowCredentials as { id: string }[] | undefined)?.map((c) => c.id);
    const cred =
      this.credentials.find((c) => c.id === credentialId) ??
      (allow?.length
        ? this.credentials.find((c) => allow.includes(c.id))
        : this.credentials[this.credentials.length - 1]);
    if (!cred) throw new Error('no matching credential');
    cred.counter += 1;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(cred.counter);
    const authData = Buffer.concat([
      sha256((options.rpId as string | undefined) ?? cred.rpId),
      Buffer.from([FLAG_UP | FLAG_UV]),
      counter,
    ]);
    const clientData = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: options.challenge,
        origin: this.origin,
        crossOrigin: false,
      }),
    );
    const signature = sign(
      'sha256',
      Buffer.concat([authData, sha256(clientData)]),
      cred.privateKey,
    );
    return {
      id: cred.id,
      rawId: cred.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(clientData),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
        userHandle: cred.userHandle,
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }
}
