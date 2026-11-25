import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildUserscript } from './build.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const HARNESS_FILE = path.join(ROOT_DIR, 'test/fixture/ai-search-harness.html');
const PORT = Number(process.env.PORT || 4174);

export function createDevLoaderScript({ port = PORT } = {}) {
  const bundleUrl = `http://127.0.0.1:${port}/dist/google-ai-search-shortcuts.user.js`;
  return `// ==UserScript==
// @name         Google AI Search Keyboard Shortcuts (Local Dev)
// @namespace    https://github.com/hron/google-ai-search-tampermonkey#dev
// @version      0.0.0-dev
// @description  Live local dev loader for Google AI Search Keyboard Shortcuts (fetches a fresh build on every page load via GM_xmlhttpRequest, bypassing Tampermonkey @require caching).
// @author       Aleksei Gusev
// @match        https://www.google.com/search*
// @match        https://google.com/search*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const DEV_URL = '${bundleUrl}';

  if (typeof GM_xmlhttpRequest !== 'function') {
    console.error('[GAISM Dev] GM_xmlhttpRequest is unavailable. Check @grant metadata.');
    return;
  }

  GM_xmlhttpRequest({
    method: 'GET',
    url: DEV_URL + '?t=' + Date.now(),
    nocache: true,
    onload(res) {
      if (res.status !== 200) {
        console.error('[GAISM Dev] Failed to fetch dev bundle:', res.status, DEV_URL);
        return;
      }
      const buildHash = res.responseHeaders?.match(/^x-gaism-build-hash:\\s*(.+)$/im)?.[1]?.trim() || 'unknown';
      const gmAddStyle = typeof GM_addStyle === 'function' ? GM_addStyle : undefined;
      const pageCloneInto = typeof cloneInto === 'function' ? cloneInto : undefined;
      try {
        new Function('GM_addStyle', 'cloneInto', res.responseText + '\\n//# sourceURL=' + DEV_URL)(
          gmAddStyle,
          pageCloneInto,
        );
        console.info('[GAISM Dev] Loaded fresh build (' + buildHash + ', ' + res.responseText.length + 'B) from ' + DEV_URL);
      } catch (err) {
        console.error('[GAISM Dev] Failed to execute dev bundle:', err);
      }
    },
    onerror(err) {
      console.warn('[GAISM Dev] Local dev server is not reachable at ' + DEV_URL + '. Run \`npm run dev\`.', err);
    },
  });
})();
`;
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    if (urlPath === '/') {
      if (!fs.existsSync(HARNESS_FILE)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      fs.createReadStream(HARNESS_FILE).pipe(res);
      return;
    }

    if (urlPath === '/dev-loader.user.js') {
      const loader = createDevLoaderScript({ port: PORT });
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
      res.end(loader);
      return;
    }

    if (urlPath === '/dist/google-ai-search-shortcuts.user.js') {
      try {
        const { bundle } = buildUserscript({ write: true, log: false });
        const hash = crypto.createHash('sha256').update(bundle).digest('hex').slice(0, 8);
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Access-Control-Allow-Origin': '*',
          'X-Gaism-Build-Hash': hash,
        });
        res.end(bundle);
        console.log(`[dev] Served fresh build (${hash}, ${bundle.length} bytes)`);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Build failed: ${err.message}`);
        console.error('[dev] Build failed:', err);
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Google AI Search dev server listening at http://127.0.0.1:${PORT}/`);
    console.log(`  1-click Tampermonkey dev loader: http://127.0.0.1:${PORT}/dev-loader.user.js`);
    console.log(`  Live-rebuilt userscript bundle:  http://127.0.0.1:${PORT}/dist/google-ai-search-shortcuts.user.js`);
    console.log(`  Local DOM test harness:          http://127.0.0.1:${PORT}/`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
