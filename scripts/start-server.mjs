import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';

const port = Number(process.env.PORT ?? 4173);
const distDirectory = resolve('dist');
const indexFile = resolve(distDirectory, 'index.html');
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json'],
  ['.woff2', 'font/woff2'],
]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}
if (!existsSync(indexFile)) {
  throw new Error('Production build is missing. Run npm run build first.');
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  let filePath = resolve(distDirectory, `.${pathname}`);
  const relativePath = relative(distDirectory, filePath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  let fileStats;
  try {
    fileStats = statSync(filePath);
  } catch {
    fileStats = undefined;
  }

  if (!fileStats?.isFile()) {
    if (extname(pathname)) {
      response.writeHead(404).end('Not found');
      return;
    }
    filePath = indexFile;
    fileStats = statSync(filePath);
  }

  response.writeHead(200, {
    'Content-Length': fileStats.size,
    'Content-Type': contentTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(filePath)
    .on('error', () => {
      if (!response.headersSent) response.writeHead(500).end('Could not read file');
      else response.destroy();
    })
    .pipe(response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`WildSense is listening on port ${port}`);
});
