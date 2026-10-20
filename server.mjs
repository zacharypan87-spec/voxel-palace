/* 九重宫阙 · 本地静态服务器
   用法：node server.mjs [--port 5173]
   浏览器打开 http://127.0.0.1:5173
*/
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argPort = process.argv.find((a) => a.startsWith('--port='));
const PORT = Number(argPort ? argPort.split('=')[1] : process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const abs = path.normalize(path.join(ROOT, rel));
    if (!abs.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(abs).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not Found');
      return;
    }
    const buf = await readFile(abs);
    res.writeHead(200, {
      'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'content-length': buf.length,
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('Server Error: ' + err.message);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[九重宫阙] http://127.0.0.1:${PORT}`);
});
