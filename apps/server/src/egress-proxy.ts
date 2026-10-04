// Entrypoint of the optional filtering egress proxy (ADR-0023): `node dist/egress-proxy.js`.
// It needs no database or secrets; set FETCH_PROXY_URL=http://egress-proxy:3128 on the worker.
import { createEgressProxy } from './egress/proxy.js';

const port = Number(process.env.EGRESS_PROXY_PORT ?? 3128);
const allowedPorts = (process.env.EGRESS_ALLOWED_PORTS ?? '80,443')
  .split(',')
  .map((p) => Number(p.trim()))
  .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);

const server = createEgressProxy({
  allowedPorts,
  log: (entry) => process.stdout.write(`${JSON.stringify({ msg: 'egress', ...entry })}\n`),
});
server.listen(port, '0.0.0.0', () => {
  process.stdout.write(
    `${JSON.stringify({ msg: 'egress proxy listening', port, allowed_ports: allowedPorts })}\n`,
  );
});
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
