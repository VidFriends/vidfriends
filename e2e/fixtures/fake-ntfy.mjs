// A stand-in ntfy server for E2E (M7-T11): accepts any POST to a topic.
import { createServer } from 'node:http';

createServer((req, res) => {
  req.resume();
  req.on('end', () => res.writeHead(req.method === 'POST' ? 200 : 404).end('{}'));
}).listen(8090, '0.0.0.0');
