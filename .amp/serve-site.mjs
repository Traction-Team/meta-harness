// Static server for the Metafab homepage on the Box: / is the page, /assets/* its files.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';

const root = join(import.meta.dirname, '..');
const page = join(root, 'prototype/mark-two/index.html');
const assets = join(root, 'assets');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path === '/' || path === '/index.html' ? page : join(root, path);
    if (file !== page && !file.startsWith(assets + sep)) throw new Error('not found');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
