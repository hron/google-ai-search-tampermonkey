import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT || 4174);

const ROUTES = {
  '/': {
    file: path.join(ROOT_DIR, 'test/fixture/ai-search-harness.html'),
    type: 'text/html; charset=utf-8',
  },
  '/dist/google-ai-search-shortcuts.user.js': {
    file: path.join(ROOT_DIR, 'dist/google-ai-search-shortcuts.user.js'),
    type: 'application/javascript; charset=utf-8',
  },
};

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const route = ROUTES[urlPath];
  if (!route || !fs.existsSync(route.file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'Content-Type': route.type, 'Cache-Control': 'no-store' });
  fs.createReadStream(route.file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Google AI Search shortcuts harness listening at http://127.0.0.1:${PORT}/`);
});
