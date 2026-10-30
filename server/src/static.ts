import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import type { Context } from 'hono';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Serves the built Mini App, falling back to index.html for client-side routes. */
export function serveWebapp(root: string) {
  return async (c: Context) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.text('Bad request', 400);
    }

    const file = resolve(root, `.${pathname}`);
    if (file.startsWith(root + sep) && (await isFile(file))) {
      // Vite fingerprints everything in /assets, so those can be cached forever.
      return send(file, pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
    if (extname(pathname)) return c.notFound();

    const index = join(root, 'index.html');
    if (!(await isFile(index))) return c.text('The Mini App has not been built yet — run "npm run build".', 503);
    return send(index, 'no-cache');
  };
}

async function send(file: string, cacheControl: string): Promise<Response> {
  return new Response(await readFile(file), {
    headers: {
      'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': cacheControl,
    },
  });
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
