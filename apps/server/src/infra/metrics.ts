// Prometheus metrics on an internal port (NFR-OPS-03, TDD §6): HTTP latency, job outcomes and
// durations, queue depth, stored bytes. Labels never contain ids or user input.
import { createServer, type Server } from 'node:http';
import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'vidfriends_' });

export const httpDuration = new client.Histogram({
  name: 'vidfriends_http_request_duration_seconds',
  help: 'HTTP request duration by route pattern',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const jobsTotal = new client.Counter({
  name: 'vidfriends_jobs_total',
  help: 'Jobs processed by queue and outcome',
  labelNames: ['queue', 'outcome'] as const,
  registers: [registry],
});

export const jobDuration = new client.Histogram({
  name: 'vidfriends_job_duration_seconds',
  help: 'Job duration by queue',
  labelNames: ['queue'] as const,
  buckets: [0.1, 0.5, 1, 5, 15, 60, 300, 900],
  registers: [registry],
});

export function registerGauge(
  name: string,
  help: string,
  collect: () => Promise<number | Record<string, number>>,
  label?: string,
) {
  return new client.Gauge({
    name,
    help,
    labelNames: label ? [label] : [],
    registers: [registry],
    async collect() {
      const value = await collect().catch(() => null);
      if (value === null) return;
      if (typeof value === 'number') this.set(value);
      else for (const [k, v] of Object.entries(value)) this.set({ [label as string]: k }, v);
    },
  });
}

export function startMetricsServer(port: number, host = '0.0.0.0'): Server {
  const server = createServer(async (req, res) => {
    if (req.url !== '/metrics') {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });
  server.listen(port, host);
  return server;
}
