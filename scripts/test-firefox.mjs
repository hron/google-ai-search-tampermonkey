import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const HARNESS_PATH = path.join(ROOT_DIR, 'test/fixture/ai-search-harness.html');
const DIST_PATH = path.join(ROOT_DIR, 'dist/google-ai-search-shortcuts.user.js');

if (!fs.existsSync(DIST_PATH)) {
  console.error('dist/google-ai-search-shortcuts.user.js not found. Run `npm run build` first.');
  process.exit(1);
}

const harnessHtml = fs.readFileSync(HARNESS_PATH, 'utf8');
const userscriptJs = fs.readFileSync(DIST_PATH, 'utf8');

const regularSearchHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Regular Google Search</title></head>
<body style="height: 3000px; margin: 0;">
  <textarea name="q" aria-label="Search" style="position: fixed; top: 20px; left: 20px; width: 400px; height: 40px;">weather</textarea>
  <script src="/dist/google-ai-search-shortcuts.user.js"></script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/' || urlPath === '/search') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(harnessHtml);
    return;
  }
  if (urlPath === '/regular-search') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(regularSearchHtml);
    return;
  }
  if (urlPath === '/csp') {
    const stripped = harnessHtml
      .replace('<script src="/dist/google-ai-search-shortcuts.user.js"></script>', '')
      .replace('<style>', '<style nonce="testnonce">')
      .replace('<script>', '<script nonce="testnonce">');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'nonce-testnonce'; style-src 'nonce-testnonce';",
    });
    res.end(stripped);
    return;
  }
  if (urlPath === '/dist/google-ai-search-shortcuts.user.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(userscriptJs);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port: httpPort } = server.address();
const bidiPort = 9300 + Math.floor(Math.random() * 500);

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'gaism-firefox-'));
const profileDir = path.join(tmpBase, 'profile');
const homeDir = path.join(tmpBase, 'home');
const extDir = path.join(tmpBase, 'ext');
fs.mkdirSync(profileDir, { recursive: true });
fs.mkdirSync(homeDir, { recursive: true });
fs.mkdirSync(extDir, { recursive: true });

fs.writeFileSync(
  path.join(extDir, 'manifest.json'),
  JSON.stringify(
    {
      manifest_version: 2,
      name: 'GAISM Firefox E2E Loader',
      version: '0.1',
      browser_specific_settings: { gecko: { id: 'gaism-e2e@example.com' } },
      permissions: ['<all_urls>'],
      content_scripts: [
        {
          matches: ['http://127.0.0.1/csp*'],
          js: ['gm-shim.js', 'google-ai-search-shortcuts.user.js'],
          run_at: 'document_idle',
        },
      ],
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  path.join(extDir, 'gm-shim.js'),
  `window.GM_addStyle = function(css) {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
  };`,
);
fs.writeFileSync(path.join(extDir, 'google-ai-search-shortcuts.user.js'), userscriptJs);

const ff = spawn(
  'firefox',
  [
    '--headless',
    '--no-remote',
    '--profile',
    profileDir,
    '--remote-debugging-port',
    String(bidiPort),
    'about:blank',
  ],
  { env: { ...process.env, HOME: homeDir }, stdio: ['ignore', 'pipe', 'pipe'] },
);

let stderrLog = '';
ff.stderr.on('data', (c) => {
  stderrLog += c.toString();
});
ff.stdout.on('data', (c) => {
  stderrLog += c.toString();
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Firefox BiDi timeout:\n${stderrLog}`)), 15000);
  const poll = () => {
    if (stderrLog.includes(`ws://127.0.0.1:${bidiPort}`)) {
      clearTimeout(timer);
      resolve();
    } else {
      setTimeout(poll, 100);
    }
  };
  poll();
});

const ws = new WebSocket(`ws://127.0.0.1:${bidiPort}/session`);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.type === 'error') reject(new Error(`${msg.error}: ${msg.message}`));
    else resolve(msg.result);
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function verifyAiModeScenario(context, url, label) {
  await send('browsingContext.navigate', { context, url, wait: 'complete' });
  await new Promise((r) => setTimeout(r, 350));

  const evalJson = async (expr) => {
    const r = await send('script.evaluate', {
      expression: `JSON.stringify(${expr})`,
      target: { context },
      awaitPromise: true,
    });
    if (r.type === 'exception') {
      throw new Error(`Exception in ${label}: ${JSON.stringify(r.exceptionDetails)}`);
    }
    return JSON.parse(r.result.value);
  };

  const getState = () =>
    evalJson(`(() => {
      const scroller = document.scrollingElement || document.documentElement;
      return {
        activeAria: document.activeElement?.getAttribute?.('aria-label') || null,
        scrollTop: Math.round(scroller.scrollTop),
        maxScroll: Math.round(scroller.scrollHeight - scroller.clientHeight),
      };
    })()`);

  const press = async (key, shift = false, waitMs = 200) => {
    const actions = [];
    if (shift) actions.push({ type: 'keyDown', value: '\uE008' });
    actions.push({ type: 'keyDown', value: key });
    actions.push({ type: 'keyUp', value: key });
    if (shift) actions.push({ type: 'keyUp', value: '\uE008' });
    await send('input.performActions', { context, actions: [{ type: 'key', id: 'kbd', actions }] });
    await new Promise((r) => setTimeout(r, waitMs));
  };

  const pressCtrl = async (key, waitMs = 250) => {
    await send('input.performActions', {
      context,
      actions: [
        {
          type: 'key',
          id: 'kbd',
          actions: [
            { type: 'keyDown', value: '\uE009' },
            { type: 'keyDown', value: key },
            { type: 'keyUp', value: key },
            { type: 'keyUp', value: '\uE009' },
          ],
        },
      ],
    });
    await new Promise((r) => setTimeout(r, waitMs));
  };

  const typeText = async (text, waitMs = 150) => {
    const actions = [];
    for (const ch of text) {
      actions.push({ type: 'keyDown', value: ch });
      actions.push({ type: 'keyUp', value: ch });
    }
    await send('input.performActions', { context, actions: [{ type: 'key', id: 'kbd', actions }] });
    await new Promise((r) => setTimeout(r, waitMs));
  };

  const initial = await getState();
  assert.ok(initial.maxScroll > 400, `${label}: document must overflow`);

  // Click prompt textarea ("Ask anything")
  const rect = await evalJson(`document.querySelector('textarea.ITIRGe').getBoundingClientRect()`);
  await send('input.performActions', {
    context,
    actions: [
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x: Math.round(rect.left + 20), y: Math.round(rect.top + 10) },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  });
  await new Promise((r) => setTimeout(r, 150));

  // PageUp while prompt textarea is focused -> scrolls document smoothly without leaving textarea
  const beforeInputPageUp = await getState();
  assert.equal(beforeInputPageUp.activeAria, 'Ask anything', `${label}: textarea focused before PageUp`);
  await press('\uE00E', false, 90);
  const midInputPageUp = await getState();
  await new Promise((r) => setTimeout(r, 550));
  const afterInputPageUp = await getState();
  assert.equal(afterInputPageUp.activeAria, 'Ask anything', `${label}: textarea stays focused on PageUp`);
  assert.ok(
    afterInputPageUp.scrollTop < beforeInputPageUp.scrollTop - 150,
    `${label}: PageUp while textarea focused scrolls up a page (${beforeInputPageUp.scrollTop} -> ${afterInputPageUp.scrollTop})`,
  );
  assert.ok(
    midInputPageUp.scrollTop < beforeInputPageUp.scrollTop &&
      midInputPageUp.scrollTop > afterInputPageUp.scrollTop,
    `${label}: PageUp animates smoothly (start=${beforeInputPageUp.scrollTop}, mid=${midInputPageUp.scrollTop}, end=${afterInputPageUp.scrollTop})`,
  );

  // PageDown while textarea is focused -> smoothly scrolls back down
  await press('\uE00F', false, 550);
  const afterInputPageDown = await getState();
  assert.equal(afterInputPageDown.activeAria, 'Ask anything', `${label}: textarea stays focused on PageDown`);
  assert.ok(
    afterInputPageDown.scrollTop > afterInputPageUp.scrollTop + 150,
    `${label}: PageDown scrolls down a page (${afterInputPageUp.scrollTop} -> ${afterInputPageDown.scrollTop})`,
  );

  // Rapid double-tap PageUp accumulates smoothly beyond a single page
  const singlePageDelta = beforeInputPageUp.scrollTop - afterInputPageUp.scrollTop;
  await press('\uE00E', false, 60);
  await press('\uE00E', false, 650);
  const afterDoublePageUp = await getState();
  assert.equal(afterDoublePageUp.activeAria, 'Ask anything', `${label}: textarea stays focused after rapid PageUp`);
  assert.ok(
    afterInputPageDown.scrollTop - afterDoublePageUp.scrollTop > singlePageDelta * 1.25,
    `${label}: rapid PageUp taps accumulate smoothly (moved ${afterInputPageDown.scrollTop - afterDoublePageUp.scrollTop}px vs single ${singlePageDelta}px)`,
  );

  // Shift+PageDown ignored (preserves text selection)
  await press('\uE00F', true, 200);
  const afterShiftPageDown = await getState();
  assert.equal(
    afterShiftPageDown.scrollTop,
    afterDoublePageUp.scrollTop,
    `${label}: Shift+PageDown must not hijack page scroll`,
  );

  // Hold PageDown back down smoothly while textarea is focused
  await send('input.performActions', {
    context,
    actions: [{ type: 'key', id: 'kbd', actions: [{ type: 'keyDown', value: '\uE00F' }] }],
  });
  await new Promise((r) => setTimeout(r, 700));
  await send('input.performActions', {
    context,
    actions: [{ type: 'key', id: 'kbd', actions: [{ type: 'keyUp', value: '\uE00F' }] }],
  });
  await new Promise((r) => setTimeout(r, 450));
  const afterHoldPageDown = await getState();
  assert.equal(afterHoldPageDown.activeAria, 'Ask anything', `${label}: textarea stays focused after held PageDown`);
  assert.ok(
    afterHoldPageDown.scrollTop > afterDoublePageUp.scrollTop + singlePageDelta * 1.2,
    `${label}: holding PageDown scrolls continuously (${afterDoublePageUp.scrollTop} -> ${afterHoldPageDown.scrollTop})`,
  );

  // --- Ctrl+K Search Threads E2E ---
  const getSearchState = () =>
    evalJson(`(() => {
      const sidebar = document.querySelector('[role="navigation"][data-xid="BVEPif"]');
      const input = sidebar ? sidebar.querySelector('input.LudIE') : null;
      const viewport = sidebar ? sidebar.querySelector('.cIl10d') : null;
      const buttons = sidebar ? Array.from(sidebar.querySelectorAll('button[data-thread-id]')) : [];
      const activeIdx = buttons.findIndex((b) => b.getAttribute('data-gaism-search-active') === 'true');
      const activeEl = activeIdx >= 0 ? buttons[activeIdx] : null;
      const activeRow = activeEl ? activeEl.closest('.u987h') : null;
      const inactiveBtn = buttons.find((_, i) => i !== activeIdx);
      const inactiveRow = inactiveBtn ? inactiveBtn.closest('.u987h') : null;
      const vRect = viewport ? viewport.getBoundingClientRect() : null;
      const aRect = activeEl ? activeEl.getBoundingClientRect() : null;
      const scroller = document.scrollingElement || document.documentElement;
      return {
        sidebarOpen: Boolean(sidebar),
        searchOpen: Boolean(input),
        inputFocused: Boolean(input && document.activeElement === input),
        promptFocused: Boolean(document.activeElement && document.activeElement.matches('textarea.ITIRGe')),
        inputValue: input ? input.value : null,
        selectionStart: input ? input.selectionStart : null,
        ariaActiveDescendant: input ? input.getAttribute('aria-activedescendant') : null,
        optionCount: buttons.length,
        activeIdx,
        activeId: activeEl ? activeEl.id : null,
        activeThreadId: activeEl ? activeEl.getAttribute('data-thread-id') : null,
        activeRowMarked: Boolean(activeRow && activeRow.getAttribute('data-gaism-search-active-row') === 'true'),
        activeRowBg: activeRow ? getComputedStyle(activeRow).backgroundColor : null,
        inactiveRowBg: inactiveRow ? getComputedStyle(inactiveRow).backgroundColor : null,
        viewportScrollTop: viewport ? Math.round(viewport.scrollTop) : 0,
        activeInViewport: Boolean(vRect && aRect && aRect.top >= vRect.top - 2 && aRect.bottom <= vRect.bottom + 2),
        pageScrollTop: Math.round(scroller.scrollTop),
        lastOpenedThreadId: window.__lastOpenedThreadId || null,
      };
    })()`);

  // Press Ctrl+K from collapsed sidebar -> async opens sidebar -> async enters Search threads -> highlights index 0
  await pressCtrl('k', 300);
  const searchOpen = await getSearchState();
  assert.equal(searchOpen.sidebarOpen, true, `${label}: Ctrl+K opens collapsed sidebar`);
  assert.equal(searchOpen.searchOpen, true, `${label}: Ctrl+K activates Search threads`);
  assert.equal(searchOpen.inputFocused, true, `${label}: search input is focused`);
  assert.equal(searchOpen.activeIdx, 0, `${label}: top thread auto-highlighted`);
  assert.equal(searchOpen.activeRowMarked, true, `${label}: visual .u987h row marked active`);
  assert.equal(searchOpen.ariaActiveDescendant, searchOpen.activeId, `${label}: aria-activedescendant synced`);
  assert.notEqual(searchOpen.activeRowBg, searchOpen.inactiveRowBg, `${label}: active row has distinct highlight`);

  // ArrowDown x10 -> navigates down, scrolls sidebar viewport, keeps focus in search input
  for (let i = 0; i < 10; i += 1) {
    await press('\uE015', false, 60);
  }
  const afterSearchDown = await getSearchState();
  assert.equal(afterSearchDown.activeIdx, 10, `${label}: ArrowDown x10 selects index 10`);
  assert.equal(afterSearchDown.inputFocused, true, `${label}: search input keeps focus after ArrowDown`);
  assert.ok(afterSearchDown.viewportScrollTop > 0, `${label}: sidebar viewport scrolled to show index 10`);
  assert.equal(afterSearchDown.activeInViewport, true, `${label}: active option stays visible in viewport`);

  // PageUp inside search moves selection up without scrolling main document
  const pageScrollBefore = afterSearchDown.pageScrollTop;
  await press('\uE00E', false, 100);
  const afterSearchPgUp = await getSearchState();
  assert.ok(afterSearchPgUp.activeIdx < 10, `${label}: PageUp moves thread selection up`);
  assert.equal(afterSearchPgUp.inputFocused, true, `${label}: search input keeps focus after PageUp`);
  assert.equal(afterSearchPgUp.pageScrollTop, pageScrollBefore, `${label}: PageUp in search does not scroll main page`);

  // Type 'orbit' without re-focusing -> filters threads and resets selection to index 0
  await typeText('orbit', 150);
  const afterTyping = await getSearchState();
  assert.equal(afterTyping.inputFocused, true, `${label}: search input stays focused while typing`);
  assert.equal(afterTyping.inputValue, 'orbit', `${label}: typing updates search value`);
  assert.equal(afterTyping.optionCount, 4, `${label}: filtered thread count matches`);
  assert.equal(afterTyping.activeIdx, 0, `${label}: typing resets selection to index 0`);

  // Move caret left twice, press ArrowDown -> selects 2nd match without moving text caret
  await press('\uE012', false, 50);
  await press('\uE012', false, 50);
  await press('\uE015', false, 80);
  const afterMidEditArrow = await getSearchState();
  assert.equal(afterMidEditArrow.activeIdx, 1, `${label}: ArrowDown selects 2nd filtered match`);
  assert.equal(afterMidEditArrow.inputFocused, true, `${label}: focus stays in search input`);
  assert.equal(afterMidEditArrow.selectionStart, 3, `${label}: ArrowDown must not move text caret`);

  // Enter -> opens selected filtered thread (thread-3) and collapses the Ctrl+K-opened sidebar
  await press('\uE006', false, 200);
  const afterEnter = await getSearchState();
  assert.equal(afterEnter.lastOpenedThreadId, 'thread-3', `${label}: Enter opened highlighted thread`);
  assert.equal(afterEnter.sidebarOpen, false, `${label}: Ctrl+K-opened sidebar collapses after Enter`);
  assert.equal(afterEnter.promptFocused, true, `${label}: focus returns to main prompt textarea`);

  // Ctrl+K then Escape -> collapses Ctrl+K-opened sidebar and returns focus to prompt (surviving async focus steal)
  await pressCtrl('k', 300);
  assert.equal((await getSearchState()).searchOpen, true, `${label}: Ctrl+K re-opens search`);
  await press('\uE00C', false, 260);
  const afterEsc = await getSearchState();
  assert.equal(afterEsc.sidebarOpen, false, `${label}: Escape collapses Ctrl+K-opened sidebar`);
  assert.equal(afterEsc.promptFocused, true, `${label}: Escape restores focus to prompt textarea`);

  // Manually open sidebar first, then Ctrl+K -> Escape exits search while keeping sidebar open and prompt focused
  await evalJson(`(() => { document.querySelector('button[jsname="JIu0P"]').click(); return true; })()`);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal((await getSearchState()).sidebarOpen, true, `${label}: sidebar manually opened`);
  await pressCtrl('k', 250);
  assert.equal((await getSearchState()).searchOpen, true, `${label}: Ctrl+K enters search from open sidebar`);
  await press('\uE00C', false, 260);
  const afterEscPinned = await getSearchState();
  assert.equal(afterEscPinned.searchOpen, false, `${label}: Escape exits search mode`);
  assert.equal(afterEscPinned.sidebarOpen, true, `${label}: manually opened sidebar stays open after Escape`);
  assert.equal(afterEscPinned.promptFocused, true, `${label}: focus returns to prompt after Escape`);

  console.log(`PASS: ${label}`);
}

async function verifyRegularSearchUntouched(context, url, label) {
  await send('browsingContext.navigate', { context, url, wait: 'complete' });
  await new Promise((r) => setTimeout(r, 250));

  const res = await send('script.evaluate', {
    expression: `JSON.stringify((() => {
      const ta = document.querySelector('textarea[name="q"]');
      ta.focus();
      const pgEv = new KeyboardEvent('keydown', { key: 'PageDown', cancelable: true, bubbles: true });
      ta.dispatchEvent(pgEv);
      const kEv = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, cancelable: true, bubbles: true });
      ta.dispatchEvent(kEv);
      return {
        pageDownPrevented: pgEv.defaultPrevented,
        ctrlKPrevented: kEv.defaultPrevented,
      };
    })())`,
    target: { context },
    awaitPromise: true,
  });
  const state = JSON.parse(res.result.value);
  assert.equal(state.pageDownPrevented, false, `${label}: PageDown must not be hijacked on regular search`);
  assert.equal(state.ctrlKPrevented, false, `${label}: Ctrl+K must not be hijacked on regular search`);
  console.log(`PASS: ${label}`);
}

try {
  await send('session.new', { capabilities: {} });
  const tree = await send('browsingContext.getTree');
  const context = tree.contexts[0].context;

  await verifyAiModeScenario(
    context,
    `http://127.0.0.1:${httpPort}/search?udm=50&q=orbital`,
    'Firefox Direct Page (AI Mode)',
  );
  await verifyRegularSearchUntouched(
    context,
    `http://127.0.0.1:${httpPort}/regular-search?q=weather`,
    'Firefox Regular Google Search Guard',
  );

  await send('webExtension.install', { extensionData: { type: 'path', path: extDir } });
  await verifyAiModeScenario(
    context,
    `http://127.0.0.1:${httpPort}/csp?udm=50&q=orbital`,
    'Firefox WebExtension Content Script + Strict CSP',
  );
  console.log('All Firefox E2E tests passed.');
} finally {
  ws.close();
  ff.kill();
  server.close();
  fs.rmSync(tmpBase, { recursive: true, force: true });
}
