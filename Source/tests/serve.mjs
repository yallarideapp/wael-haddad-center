import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT || 8765);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    let path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    const info = await stat(path);
    if (!info.isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(path).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404); response.end();
  }
});
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Source preview: http://127.0.0.1:${port}/`));
