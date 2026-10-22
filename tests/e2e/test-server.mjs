import { createServer } from 'node:http';

const page = (title) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1></body></html>`;

const server = createServer((request, response) => {
  const path = request.url ?? '/';
  const titles = { '/a': 'Page A', '/b': 'Page B', '/keep': 'Keep' };
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(page(titles[path] ?? 'Fallback'));
});

server.listen(4173, '127.0.0.1', () => console.log('e2e server on http://127.0.0.1:4173'));
