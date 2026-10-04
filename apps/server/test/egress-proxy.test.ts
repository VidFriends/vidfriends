// M7-T19: ADR-0023 / TDD §5: the bundled egress proxy only lets yt-dlp reach public addresses on
// allowed ports, connects to the address it checked, and logs host and verdict only.
import { createServer, type Server } from 'node:http';
import { connect as netConnect, createServer as createTcpServer, type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEgressProxy } from '../src/egress/proxy.js';

const PUBLIC = '93.184.216.34';
const DNS: Record<string, string[]> = {
  'video.example': [PUBLIC],
  'internal.example': ['10.0.0.5'],
  'rebind.example': [PUBLIC, '127.0.0.1'],
};

let target: Server;
let echo: ReturnType<typeof createTcpServer>;
let proxy: Server;
let proxyPort: number;
const connectedTo: string[] = [];
const logs: unknown[] = [];

beforeAll(async () => {
  target = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain', 'x-seen-host': req.headers.host ?? '' });
    res.end(`hello ${req.url}`);
  });
  await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
  echo = createTcpServer((s) => s.pipe(s));
  await new Promise<void>((r) => echo.listen(0, '127.0.0.1', r));
  const targetPort = (target.address() as AddressInfo).port;
  const echoPort = (echo.address() as AddressInfo).port;
  proxy = createEgressProxy({
    lookup: async (host) => (DNS[host] ?? []).map((address) => ({ address, family: 4 })),
    // Pretend the public address is reachable: route it to the local test servers.
    connect: (port, address) => {
      connectedTo.push(`${address}:${port}`);
      return netConnect(port === 443 ? echoPort : targetPort, '127.0.0.1');
    },
    log: (e) => logs.push(e),
  });
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
  proxyPort = (proxy.address() as AddressInfo).port;
});
afterAll(async () => {
  await new Promise((r) => proxy.close(r));
  await new Promise((r) => target.close(r));
  await new Promise((r) => echo.close(r));
});

/** Sends a CONNECT and returns the status line plus anything echoed back for `payload`. */
function tunnel(authority: string, payload = 'ping'): Promise<{ status: string; echoed: string }> {
  return new Promise((resolve, reject) => {
    const s = netConnect(proxyPort, '127.0.0.1');
    let buf = '';
    let status = '';
    s.on('data', (d) => {
      buf += d.toString();
      if (!status && buf.includes('\r\n\r\n')) {
        status = buf.split('\r\n')[0]!;
        buf = buf.slice(buf.indexOf('\r\n\r\n') + 4);
        if (status.includes(' 200 ')) s.write(payload);
      }
      if (status.includes(' 200 ') && buf.length >= payload.length) {
        s.end();
        resolve({ status, echoed: buf });
      }
    });
    s.on('end', () => resolve({ status, echoed: buf }));
    s.on('error', reject);
    s.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
  });
}

/** A plain-http request through the proxy (absolute-form). */
async function viaProxy(url: string) {
  return new Promise<{ status: number; body: string; host: string }>((resolve, reject) => {
    const s = netConnect(proxyPort, '127.0.0.1');
    let data = '';
    s.on('data', (d) => (data += d.toString()));
    s.on('end', () => {
      const [head, body] = data.split('\r\n\r\n');
      const host = /x-seen-host: (.*)/i.exec(head ?? '')?.[1]?.trim() ?? '';
      resolve({ status: Number(head!.split(' ')[1]), body: body ?? '', host });
    });
    s.on('error', reject);
    const host = new URL(url).host;
    s.write(
      `GET ${url} HTTP/1.1\r\nHost: ${host}\r\nProxy-Connection: close\r\nConnection: close\r\n\r\n`,
    );
  });
}

describe('egress proxy (ADR-0023)', () => {
  it('tunnels https to a public host through the address it checked', async () => {
    connectedTo.length = 0;
    const res = await tunnel('video.example:443');
    expect(res.status).toContain(' 200 ');
    expect(res.echoed).toBe('ping');
    expect(connectedTo).toEqual([`${PUBLIC}:443`]);
  });

  it('forwards plain http with the original Host header and the query kept out of the log', async () => {
    logs.length = 0;
    const res = await viaProxy('http://video.example/watch?token=secret123');
    expect(res.status).toBe(200);
    expect(res.body).toContain('hello /watch?token=secret123');
    expect(res.host).toBe('video.example');
    expect(JSON.stringify(logs)).not.toContain('secret123');
    expect(logs).toEqual([{ host: 'video.example', port: 80, allowed: true }]);
  });

  it('refuses private, rebinding, literal and metadata addresses without connecting', async () => {
    connectedTo.length = 0;
    for (const authority of [
      'internal.example:443',
      'rebind.example:443',
      '127.0.0.1:443',
      '[::1]:443',
      '169.254.169.254:443',
      'nowhere.example:443',
    ]) {
      const res = await tunnel(authority);
      expect(res.status, authority).toContain(' 403 ');
    }
    expect((await viaProxy('http://169.254.169.254/latest/meta-data')).status).toBe(403);
    expect((await viaProxy('http://internal.example/')).status).toBe(403);
    expect(connectedTo).toEqual([]);
  });

  it('refuses ports that are not allowed, and non-proxy requests', async () => {
    expect((await tunnel('video.example:22')).status).toContain(' 403 ');
    expect((await viaProxy('http://video.example:8080/')).status).toBe(403);
    const res = await fetch(`http://127.0.0.1:${proxyPort}/somewhere`);
    expect(res.status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${proxyPort}/healthz`)).status).toBe(200);
  });
});
