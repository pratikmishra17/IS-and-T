import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Browser protections on every page (the dev server sends the same ones; see "headers" in angular.json):
 * - Content-Security-Policy: the page may only load scripts, styles, images and data from this site,
 *   so injected HTML can't pull in or run someone else's script; and no other site may frame it.
 * - X-Frame-Options: the same "never inside a frame" for older browsers (stops clickjacking).
 * - X-Content-Type-Options: the browser must trust our content types instead of guessing them.
 * - Referrer-Policy: links to other sites don't reveal which page of the app they came from.
 * - Permissions-Policy: the app never needs the camera, microphone or location.
 * - Strict-Transport-Security, over HTTPS only: browsers use HTTPS for this site from then on.
 */
function contentSecurityPolicy(scriptHashes: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes}`.trim(),
    "style-src 'self' 'unsafe-inline'", // Angular adds each component's styles as a <style> element
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * The build puts one small script inside the page itself (Angular's event-dispatch contract, which
 * replays clicks made before the app finished loading). Rather than allow inline scripts in general,
 * allow exactly that one, by its SHA-256 hash: any other inline script, such as an injected one, is
 * still blocked. Worked out on the first request (during the build there is no page to read yet).
 */
let policy: string | undefined;
function currentPolicy(): string {
  if (policy === undefined) {
    let hashes = '';
    try {
      const page = readFileSync(join(import.meta.dirname, 'index.server.html'), 'utf8');
      hashes = [...page.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map(([, body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`)
        .join(' ');
    } catch {
      // no built page here (the build itself running this file): nothing inline to allow
    }
    policy = contentSecurityPolicy(hashes);
  }
  return policy;
}

app.disable('x-powered-by'); // don't advertise the server software
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', currentPolicy());
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
