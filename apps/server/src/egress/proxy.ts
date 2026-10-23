// Filtering egress proxy for yt-dlp (TDD §5, ADR-0023). yt-dlp follows redirects itself, so the
// app's pre-fetch check cannot see every hop; with FETCH_PROXY_URL pointing here, every request it
// makes (redirects included) is checked: the host must resolve only to public addresses, the
// port must be allowed, and the connection goes to the address that was checked (no rebinding).
import { lookup as dnsLookup } from 'node:dns/promises';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { connect as netConnect, isIP, type Socket } from 'node:net';
import { isPublicAddress } from '../modules/videos/url.js';

export interface EgressProxyOptions {
  /** Ports a request may go to (default 80 and 443). */
  allowedPorts?: readonly number[];
  lookup?: (host: string) => Promise<{ address: string; family: number }[]>;
  isAllowedAddress?: (address: string) => boolean;
  connect?: (port: number, address: string) => Socket;
  /** Gets host:port and the verdict only, never paths or queries (rule 9). */
  log?: (entry: { host: string; port: number; allowed: boolean; reason?: string }) => void;
  idleTimeoutMs?: number;
  maxConnections?: number;
}

export class EgressRefused extends Error {
  constructor(readonly reason: string) {
    super(`egress refused: ${reason}`);
  }
}

const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

export function createEgressProxy(options: EgressProxyOptions = {}): Server {
  const allowedPorts = new Set(options.allowedPorts ?? [80, 443]);
  const lookup =
    options.lookup ?? ((host: string) => dnsLookup(host, { all: true, verbatim: true }));
  const isAllowedAddress = options.isAllowedAddress ?? isPublicAddress;
  const connect = options.connect ?? ((port: number, address: string) => netConnect(port, address));
  const log = options.log ?? (() => {});
  const idleTimeoutMs = options.idleTimeoutMs ?? 120_000;

  /** Resolves and checks a destination; returns the one address to connect to. */
  async function resolve(host: string, port: number): Promise<string> {
    if (!allowedPorts.has(port)) throw new EgressRefused('port_not_allowed');
    const bare = host.replace(/^\[|\]$/g, '');
    let addresses: string[];
    if (isIP(bare)) addresses = [bare];
    else {
      try {
        addresses = (await lookup(bare)).map((a) => a.address);
      } catch {
        throw new EgressRefused('dns_failed');
      }
    }
    if (!addresses.length) throw new EgressRefused('dns_empty');
    // Every address must be public, as in the app's own check (DNS rebinding aware).
    if (!addresses.every(isAllowedAddress)) throw new EgressRefused('private_address');
    return addresses[0]!;
  }

  function refuse(host: string, port: number, err: unknown) {
    const reason = err instanceof EgressRefused ? err.reason : 'error';
    log({ host, port, allowed: false, reason });
    return reason;
  }

  const server = createServer((req, res) => void handleHttp(req, res));
  server.maxConnections = options.maxConnections ?? 256;

  async function handleHttp(req: IncomingMessage, res: ServerResponse) {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    let target: URL;
    try {
      target = new URL(req.url ?? '');
    } catch {
      res.writeHead(400).end('absolute-form request required');
      return;
    }
    if (target.protocol !== 'http:' || target.username || target.password) {
      res.writeHead(400).end('only plain http is forwarded; use CONNECT for https');
      return;
    }
    const port = Number(target.port || 80);
    let address: string;
    try {
      address = await resolve(target.hostname, port);
    } catch (err) {
      res.writeHead(403).end(`refused: ${refuse(target.hostname, port, err)}`);
      return;
    }
    log({ host: target.hostname, port, allowed: true });
    const headers: Record<string, string | string[] | undefined> = {
      ...req.headers,
      host: target.host,
    };
    for (const h of HOP_BY_HOP) delete headers[h];
    const upstream = httpRequest(
      {
        host: address,
        port,
        // The checked address, through the same connector as CONNECT tunnels.
        createConnection: () => connect(port, address),
        method: req.method,
        path: `${target.pathname}${target.search}`,
        headers,
        setHost: false,
      },
      (up) => {
        const out = { ...up.headers };
        for (const h of HOP_BY_HOP) delete out[h];
        res.writeHead(up.statusCode ?? 502, out);
        up.pipe(res);
      },
    );
    upstream.setTimeout(idleTimeoutMs, () => upstream.destroy(new Error('upstream timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502).end('upstream failed');
      else res.destroy();
    });
    req.pipe(upstream);
  }

  server.on('connect', (req: IncomingMessage, client: Socket, head: Buffer) => {
    void (async () => {
      const m = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(req.url ?? '');
      if (!m) {
        client.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }
      const host = m[1]!;
      const port = Number(m[2]);
      let address: string;
      try {
        address = await resolve(host, port);
      } catch (err) {
        const reason = refuse(host, port, err);
        client.end(`HTTP/1.1 403 Forbidden\r\ncontent-type: text/plain\r\n\r\nrefused: ${reason}`);
        return;
      }
      log({ host, port, allowed: true });
      const upstream = connect(port, address);
      const fail = () => {
        upstream.destroy();
        client.destroy();
      };
      upstream.setTimeout(idleTimeoutMs, fail);
      client.setTimeout(idleTimeoutMs, fail);
      upstream.on('error', () => {
        if (client.writable) client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      });
      client.on('error', fail);
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
    })();
  });
  return server;
}
