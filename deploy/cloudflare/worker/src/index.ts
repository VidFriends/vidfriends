// Cloudflare test instance (ADR-0021): this Worker owns vidfriends.app, runs the one VidFriends
// container (Postgres, SeaweedFS and the app inside) and keeps its backups in a private R2 bucket.
import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  VIDFRIENDS: DurableObjectNamespace<VidFriends>;
  BACKUPS: R2Bucket;
  PUBLIC_URL: string;
  APP_SECRET: string;
  POSTGRES_PASSWORD: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  BACKUP_TOKEN: string;
}

export class VidFriends extends Container<Env> {
  override defaultPort = 8080;
  override requiredPorts = [8080, 8333];
  // Waking up restores the backup first, so keep it running through quiet hours.
  override sleepAfter = '24h';
  override enableInternet = true;

  constructor(ctx: DurableObjectState<object>, env: Env) {
    super(ctx, env);
    this.envVars = {
      PUBLIC_URL: env.PUBLIC_URL,
      APP_SECRET: env.APP_SECRET,
      POSTGRES_PASSWORD: env.POSTGRES_PASSWORD,
      S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
      BACKUP_URL: `${env.PUBLIC_URL}/__backup`,
      BACKUP_TOKEN: env.BACKUP_TOKEN,
      // Only this Worker can reach the container, and it sets X-Forwarded-For itself.
      TRUSTED_PROXIES: '0.0.0.0/0,::/0',
    };
  }
}

const KEY = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}

/** The container's backup store: PUT and GET objects in the private R2 bucket. */
async function backups(request: Request, env: Env, key: string): Promise<Response> {
  const auth = request.headers.get('authorization') ?? '';
  if (!env.BACKUP_TOKEN || !(await sameSecret(auth, `Bearer ${env.BACKUP_TOKEN}`))) {
    return new Response('forbidden', { status: 403 });
  }
  if (!KEY.test(key) || key.includes('..') || key.length > 200) {
    return new Response('bad key', { status: 400 });
  }
  if (request.method === 'PUT') {
    await env.BACKUPS.put(key, request.body);
    return new Response(null, { status: 204 });
  }
  if (request.method === 'GET') {
    const object = await env.BACKUPS.get(key);
    if (!object) return new Response('not found', { status: 404 });
    return new Response(object.body, {
      headers: { 'content-length': String(object.size) },
    });
  }
  return new Response('method not allowed', { status: 405 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/__backup/')) {
      return backups(request, env, url.pathname.slice('/__backup/'.length));
    }
    if (url.hostname !== new URL(env.PUBLIC_URL).hostname) {
      return Response.redirect(`${env.PUBLIC_URL}${url.pathname}${url.search}`, 301);
    }
    // The client address comes from Cloudflare, never from the client (rate limits, audit log).
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') ?? '');
    headers.set('x-forwarded-proto', 'https');
    const forwarded = new Request(request, { headers });
    const container = getContainer(env.VIDFRIENDS, 'main');
    // Presigned media URLs go to the S3 gateway with the original Host (ADR-0015).
    if (url.pathname.startsWith('/media-store/')) {
      return container.containerFetch(forwarded, 8333);
    }
    return container.fetch(forwarded);
  },
} satisfies ExportedHandler<Env>;
