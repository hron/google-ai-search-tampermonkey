import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { createDevLoaderScript } from '../scripts/dev-server.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const DIST_PATH = path.join(ROOT_DIR, 'dist/google-ai-search-shortcuts.user.js');
const META_PATH = path.join(ROOT_DIR, 'dist/google-ai-search-shortcuts.meta.js');
const PKG_PATH = path.join(ROOT_DIR, 'package.json');

const REPO_URL = 'https://github.com/hron/google-ai-search-tampermonkey';

describe('built userscript artifact', () => {
  it('exists with a valid Tampermonkey metadata header and valid JS syntax', () => {
    assert.ok(fs.existsSync(DIST_PATH), 'dist/google-ai-search-shortcuts.user.js must exist after build');
    const source = fs.readFileSync(DIST_PATH, 'utf8');
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));

    assert.match(source, /\/\/ ==UserScript==/);
    assert.match(source, /\/\/ @name\s+Google AI Search Keyboard Shortcuts/);
    assert.match(source, new RegExp(`// @namespace\\s+${REPO_URL.replaceAll('/', '\\/')}$`, 'm'));
    assert.match(source, new RegExp(`// @version\\s+${pkg.version.replaceAll('.', '\\.')}$`, 'm'));
    assert.match(source, /\/\/ @author\s+Aleksei Gusev$/m);
    assert.match(source, new RegExp(`// @homepageURL\\s+${REPO_URL.replaceAll('/', '\\/')}$`, 'm'));
    assert.match(
      source,
      new RegExp(`// @supportURL\\s+${REPO_URL.replaceAll('/', '\\/')}\\/issues$`, 'm'),
    );
    assert.match(
      source,
      new RegExp(
        `// @downloadURL\\s+${REPO_URL.replaceAll('/', '\\/')}\\/releases\\/latest\\/download\\/google-ai-search-shortcuts\\.user\\.js$`,
        'm',
      ),
    );
    assert.match(
      source,
      new RegExp(
        `// @updateURL\\s+${REPO_URL.replaceAll('/', '\\/')}\\/releases\\/latest\\/download\\/google-ai-search-shortcuts\\.meta\\.js$`,
        'm',
      ),
    );
    assert.match(source, /\/\/ @match\s+https:\/\/www\.google\.com\/search\*/);
    assert.match(source, /\/\/ @match\s+https:\/\/google\.com\/search\*/);
    assert.match(source, /\/\/ @grant\s+GM_addStyle/);
    assert.match(source, /\/\/ ==\/UserScript==/);

    // Must not contain top-level ESM import/export statements
    assert.doesNotMatch(source, /^\s*(import|export)\s/m);

    // Must parse cleanly as a classic browser script
    assert.doesNotThrow(() => new vm.Script(source, { filename: 'google-ai-search-shortcuts.user.js' }));
  });

  it('emits a standalone .meta.js matching the userscript header without script body', () => {
    assert.ok(fs.existsSync(META_PATH), 'dist/google-ai-search-shortcuts.meta.js must exist after build');
    const userSource = fs.readFileSync(DIST_PATH, 'utf8');
    const metaSource = fs.readFileSync(META_PATH, 'utf8');

    const headerMatch = userSource.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m);
    assert.ok(headerMatch, 'userscript must contain metadata header block');
    assert.equal(metaSource, `${headerMatch[0]}\n`);
    assert.doesNotMatch(metaSource, /\(function\s*\(\)/);
  });

  it('generates a valid live-reload Tampermonkey dev loader using GM_xmlhttpRequest', () => {
    const loader = createDevLoaderScript({ port: 4174 });
    assert.match(loader, /\/\/ @name\s+Google AI Search Keyboard Shortcuts \(Local Dev\)$/m);
    assert.match(loader, /\/\/ @namespace\s+https:\/\/github\.com\/hron\/google-ai-search-tampermonkey#dev$/m);
    assert.match(loader, /\/\/ @grant\s+GM_addStyle$/m);
    assert.match(loader, /\/\/ @grant\s+GM_xmlhttpRequest$/m);
    assert.match(loader, /\/\/ @connect\s+127\.0\.0\.1$/m);
    assert.doesNotMatch(loader, /\/\/ @require\s/m, 'must not use cached @require');
    assert.doesNotThrow(() => new vm.Script(loader, { filename: 'dev-loader.user.js' }));
  });
});
