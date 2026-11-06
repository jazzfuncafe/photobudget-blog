// Локальный просмотр блога как на сайте: /blog/* → docs/, /fonts и картинки → budget-v2/public
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(ROOT, '../budget-v2/public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.xml': 'application/xml; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript' };
const port = +(process.argv[2] || 8812);
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === '/blog') { res.writeHead(302, { location: '/blog/' }).end(); return; }
  let file = p.startsWith('/blog/') ? path.join(ROOT, 'docs', p.slice(6)) : path.join(SITE, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end('нет'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(fs.readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`блог: http://localhost:${port}/blog/`));
