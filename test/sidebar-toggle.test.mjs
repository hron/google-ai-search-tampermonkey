import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIDEBAR_TOGGLE_FEATURE_ID,
  createSidebarToggleFeature,
  findSidebarToggleButton,
} from '../src/features/sidebar-toggle.js';

function createFakeNode(
  tag,
  { attrs = {}, classes = [], textContent = '', disabled = false, hidden = false } = {},
) {
  const children = [];
  const classSet = new Set(classes);
  const attrMap = new Map(Object.entries(attrs));
  const listeners = new Map();

  const el = {
    tagName: tag.toUpperCase(),
    children,
    parentElement: null,
    ownerDocument: null,
    textContent,
    disabled,
    hidden,
    clickedCount: 0,
    classList: {
      add(...names) {
        for (const n of names) classSet.add(n);
      },
      remove(...names) {
        for (const n of names) classSet.delete(n);
      },
      contains(name) {
        return classSet.has(name);
      },
    },
    setAttribute(k, v) {
      attrMap.set(k, String(v));
      if (k === 'disabled') el.disabled = true;
      if (k === 'hidden') el.hidden = true;
    },
    getAttribute(k) {
      return attrMap.has(k) ? attrMap.get(k) : null;
    },
    removeAttribute(k) {
      attrMap.delete(k);
      if (k === 'disabled') el.disabled = false;
      if (k === 'hidden') el.hidden = false;
    },
    hasAttribute(k) {
      return attrMap.has(k);
    },
    appendChild(child) {
      if (child.parentElement) {
        const idx = child.parentElement.children.indexOf(child);
        if (idx >= 0) child.parentElement.children.splice(idx, 1);
      }
      child.parentElement = el;
      if (el.ownerDocument) setOwnerDocDeep(child, el.ownerDocument);
      children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx >= 0) {
        children.splice(idx, 1);
        child.parentElement = null;
      }
      return child;
    },
    remove() {
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
    },
    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === el) return true;
        cur = cur.parentElement;
      }
      return false;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      if (!listeners.has(type)) return;
      listeners.set(type, listeners.get(type).filter((entry) => entry !== fn));
    },
    dispatchEvent(event) {
      const targetEvent = { target: el, ...event };
      for (const fn of listeners.get(targetEvent.type) ?? []) {
        fn(targetEvent);
      }
      return targetEvent;
    },
    click() {
      el.clickedCount += 1;
      el.dispatchEvent(createFakeEvent('click', { target: el }));
    },
    matches(selector) {
      return matchesSelectorList(el, selector);
    },
    closest(selector) {
      let cur = el;
      while (cur) {
        if (cur.matches && cur.matches(selector)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    querySelector(selector) {
      return el.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const results = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (matchesSelectorList(child, selector)) {
            results.push(child);
          }
          visit(child);
        }
      };
      visit(el);
      return results;
    },
  };

  return el;
}

function setOwnerDocDeep(node, doc) {
  node.ownerDocument = doc;
  for (const child of node.children) {
    setOwnerDocDeep(child, doc);
  }
}

function matchesSimple(el, token) {
  if (!el) return false;
  let rest = token.trim();
  if (!rest) return false;

  if (rest.includes(':not([disabled])')) {
    if (el.disabled || el.hasAttribute('disabled')) return false;
    rest = rest.replace(':not([disabled])', '');
  }
  if (rest.includes(':not([type="hidden"])')) {
    if (el.getAttribute('type') === 'hidden') return false;
    rest = rest.replace(':not([type="hidden"])', '');
  }

  const attrRegex = /\[([^\]=^$*]+)(?:(\^|\$|\*)?="([^"]*)"(\s+i)?)?\]/g;
  let m;
  while ((m = attrRegex.exec(rest)) !== null) {
    const [, attrName, op, expected, caseInsensitive] = m;
    const rawActual = el.getAttribute(attrName);
    if (expected === undefined) {
      if (rawActual === null) return false;
    } else {
      const actual = caseInsensitive && rawActual !== null ? rawActual.toLowerCase() : rawActual;
      const exp = caseInsensitive ? expected.toLowerCase() : expected;
      if (op === '^') {
        if (actual === null || !actual.startsWith(exp)) return false;
      } else if (op === '$') {
        if (actual === null || !actual.endsWith(exp)) return false;
      } else if (op === '*') {
        if (actual === null || !actual.includes(exp)) return false;
      } else if (actual !== exp) {
        return false;
      }
    }
  }
  rest = rest.replace(attrRegex, '');

  const classMatches = rest.match(/\.[A-Za-z0-9_-]+/g) || [];
  for (const cls of classMatches) {
    if (!el.classList.contains(cls.slice(1))) return false;
  }
  rest = rest.replace(/\.[A-Za-z0-9_-]+/g, '');

  if (rest && rest !== '*') {
    if (el.tagName !== rest.toUpperCase()) return false;
  }
  return true;
}

function matchesCompoundDescendant(el, selector) {
  const parts = selector.trim().match(/(?:\[[^\]]*\]|[^\s\[])+/g) || [];
  if (parts.length === 0) return false;
  if (!matchesSimple(el, parts[parts.length - 1])) return false;
  let cur = el.parentElement;
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    let matched = false;
    while (cur) {
      if (matchesSimple(cur, parts[i])) {
        matched = true;
        cur = cur.parentElement;
        break;
      }
      cur = cur.parentElement;
    }
    if (!matched) return false;
  }
  return true;
}

function matchesSelectorList(el, selectorList) {
  return selectorList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((part) => matchesCompoundDescendant(el, part));
}

function createFakeEvent(type, props = {}) {
  return {
    type,
    key: '',
    code: '',
    keyCode: 0,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
    },
    ...props,
  };
}

function createFakeSidebarEnv({
  search = '?udm=50&q=test',
  aiModeDom = true,
  includeOpenButton = true,
  locale = 'en',
  scrambleObfuscated = false,
} = {}) {
  const cls = (names) =>
    scrambleObfuscated
      ? names.map((_, i) => `rnd_${i}_${Math.random().toString(36).slice(2, 6)}`)
      : names;

  const winListeners = new Map();
  const html = createFakeNode('html');
  const body = createFakeNode('body');
  html.appendChild(body);

  const inputPlate = createFakeNode('div', {
    attrs: aiModeDom ? { 'data-xid': 'aim-mars-input-plate' } : {},
  });
  const promptInput = createFakeNode('textarea', {
    classes: aiModeDom ? cls(['ITIRGe']) : ['gLFyf'],
    attrs: aiModeDom ? { 'aria-label': 'Ask anything' } : { name: 'q' },
  });
  inputPlate.appendChild(promptInput);
  body.appendChild(inputPlate);

  const rail = createFakeNode('div', { classes: ['collapsed-rail'] });
  const openAttrs = {
    'aria-label': locale === 'en' ? 'Open sidebar' : 'Открыть боковую панель',
  };
  if (!scrambleObfuscated || locale !== 'en') {
    openAttrs.jsname = 'JIu0P';
  }
  const openSidebarBtn = createFakeNode('button', {
    classes: cls(['ONx74b']),
    attrs: openAttrs,
  });
  if (aiModeDom && includeOpenButton) {
    rail.appendChild(openSidebarBtn);
    body.appendChild(rail);
  }

  let sidebarState = null;

  const defaultView = {
    location: { search, pathname: '/search' },
    addEventListener(type, fn, options) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push({ fn, capture: Boolean(options?.capture ?? options) });
    },
    removeEventListener(type, fn) {
      if (!winListeners.has(type)) return;
      winListeners.set(
        type,
        winListeners.get(type).filter((entry) => entry.fn !== fn),
      );
    },
    dispatchEvent(event) {
      for (const { fn } of winListeners.get(event.type) ?? []) {
        fn(event);
      }
    },
    getComputedStyle(el) {
      return {
        display: el.hidden ? 'none' : 'block',
        visibility: 'visible',
      };
    },
  };

  const doc = {
    activeElement: promptInput,
    documentElement: html,
    body,
    defaultView,
    location: defaultView.location,
    querySelector(sel) {
      return html.querySelector(sel);
    },
    querySelectorAll(sel) {
      return html.querySelectorAll(sel);
    },
  };

  setOwnerDocDeep(html, doc);

  function closeSidebar() {
    if (sidebarState) {
      sidebarState.nav.remove();
      sidebarState = null;
    }
    if (aiModeDom && includeOpenButton && !rail.children.includes(openSidebarBtn)) {
      rail.appendChild(openSidebarBtn);
    }
  }

  function mountSidebar({ inSearchMode = false } = {}) {
    if (sidebarState) closeSidebar();
    openSidebarBtn.remove();

    const nav = createFakeNode('div', {
      classes: cls(['ho072b', 'j2vKLc']),
      attrs: {
        role: 'navigation',
        'data-xid': scrambleObfuscated ? 'SCRAMBLED' : 'BVEPif',
        'aria-label': locale === 'en' ? 'AI Mode history' : 'История режима ИИ',
      },
    });

    const closeSidebarBtn = createFakeNode('button', {
      classes: cls(['OxKcRe']),
      attrs: {
        'aria-label': locale === 'en' ? 'Close sidebar' : 'Закрыть боковую панель',
      },
    });
    closeSidebarBtn.addEventListener('click', closeSidebar);
    nav.appendChild(closeSidebarBtn);

    let exitSearchBtn = null;
    let searchInput = null;
    let clearBtn = null;
    if (inSearchMode) {
      const searchBar = createFakeNode('div', { classes: cls(['uTGOrc']) });
      exitSearchBtn = createFakeNode('button', {
        attrs: { 'aria-label': locale === 'en' ? 'Exit search' : 'Выйти из поиска' },
      });
      searchInput = createFakeNode('input', {
        attrs: { type: 'text', placeholder: locale === 'en' ? 'Search threads' : 'Поиск веток' },
      });
      clearBtn = createFakeNode('button', {
        attrs: { 'aria-label': locale === 'en' ? 'Clear text' : 'Очистить' },
      });
      searchBar.appendChild(exitSearchBtn);
      searchBar.appendChild(searchInput);
      searchBar.appendChild(clearBtn);
      nav.appendChild(searchBar);
    }

    const listRoot = createFakeNode('div', {
      attrs: { 'data-xid': 'threads-list-root', role: 'list' },
    });
    const threadBtn = createFakeNode('button', {
      attrs: { 'data-thread-id': 'thread-1', 'aria-label': 'Thread 1' },
    });
    listRoot.appendChild(threadBtn);
    nav.appendChild(listRoot);
    body.appendChild(nav);

    sidebarState = { nav, closeSidebarBtn, exitSearchBtn, searchInput, clearBtn, threadBtn };
    return sidebarState;
  }

  openSidebarBtn.addEventListener('click', () => {
    mountSidebar({ inSearchMode: false });
  });

  const dispatchKey = (type, props) => {
    const ev = createFakeEvent(type, props);
    defaultView.dispatchEvent(ev);
    return ev;
  };

  return {
    doc,
    body,
    rail,
    promptInput,
    openSidebarBtn,
    mountSidebar,
    closeSidebar,
    getSidebar: () => sidebarState,
    dispatchKey,
  };
}

describe('sidebar-toggle feature (Ctrl+B)', () => {
  it('does nothing on Ctrl+B when not on an AI Mode page', () => {
    const env = createFakeSidebarEnv({ search: '?q=weather', aiModeDom: false });
    const feature = createSidebarToggleFeature({ doc: env.doc });
    assert.equal(feature.id, SIDEBAR_TOGGLE_FEATURE_ID);
    feature.init();

    const ev = env.dispatchKey('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, target: env.promptInput });
    assert.equal(ev.defaultPrevented, false);
    assert.equal(env.openSidebarBtn.clickedCount, 0);
    assert.equal(env.getSidebar(), null);

    feature.destroy();
  });

  it('toggles the sidebar open and closed by clicking the existing Open/Close sidebar buttons on Ctrl+B and Cmd+B', () => {
    const env = createFakeSidebarEnv();
    const feature = createSidebarToggleFeature({ doc: env.doc });
    feature.init();

    // Collapsed -> Ctrl+B clicks Open sidebar button
    const openEv = env.dispatchKey('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, target: env.promptInput });
    assert.equal(openEv.defaultPrevented, true);
    assert.equal(openEv.propagationStopped, true);
    assert.equal(openEv.immediatePropagationStopped, true);
    assert.equal(env.openSidebarBtn.clickedCount, 1);
    const sidebar = env.getSidebar();
    assert.ok(sidebar, 'sidebar should open via native Open sidebar button click');

    // Expanded -> Ctrl+B clicks Close sidebar button
    const closeEv = env.dispatchKey('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, target: env.promptInput });
    assert.equal(closeEv.defaultPrevented, true);
    assert.equal(closeEv.propagationStopped, true);
    assert.equal(sidebar.closeSidebarBtn.clickedCount, 1);
    assert.equal(env.getSidebar(), null, 'sidebar should close via native Close sidebar button click');

    // Cmd+B (macOS) also toggles open
    const cmdOpenEv = env.dispatchKey('keydown', { key: 'b', code: 'KeyB', metaKey: true, target: env.promptInput });
    assert.equal(cmdOpenEv.defaultPrevented, true);
    assert.equal(env.openSidebarBtn.clickedCount, 2);
    assert.ok(env.getSidebar());

    feature.destroy();
  });

  it('closes via Close sidebar button even when sidebar is in Search threads mode (not Exit search)', () => {
    const env = createFakeSidebarEnv();
    const sidebar = env.mountSidebar({ inSearchMode: true });
    const feature = createSidebarToggleFeature({ doc: env.doc });
    feature.init();

    const ev = env.dispatchKey('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, target: sidebar.searchInput });
    assert.equal(ev.defaultPrevented, true);
    assert.equal(sidebar.closeSidebarBtn.clickedCount, 1);
    assert.equal(sidebar.exitSearchBtn.clickedCount, 0);
    assert.equal(env.getSidebar(), null);

    feature.destroy();
  });

  it('supports non-Latin keyboard layouts (code KeyB), uppercase B, non-English locales, and scrambled classes', () => {
    for (const locale of ['en', 'ru']) {
      const env = createFakeSidebarEnv({ locale, scrambleObfuscated: true });
      const feature = createSidebarToggleFeature({ doc: env.doc });
      feature.init();

      // Cyrillic layout where key is 'и' and physical code is 'KeyB'
      const openEv = env.dispatchKey('keydown', { key: 'и', code: 'KeyB', ctrlKey: true, target: env.promptInput });
      assert.equal(openEv.defaultPrevented, true, `${locale}: Ctrl+KeyB opens sidebar`);
      const sidebar = env.getSidebar();
      assert.ok(sidebar, `${locale}: sidebar should be open`);

      // CapsLock active (key: 'B', shiftKey: false)
      const closeEv = env.dispatchKey('keydown', { key: 'B', code: 'KeyB', ctrlKey: true, target: env.promptInput });
      assert.equal(closeEv.defaultPrevented, true, `${locale}: Ctrl+B closes sidebar`);
      assert.equal(sidebar.closeSidebarBtn.clickedCount, 1);
      assert.equal(env.getSidebar(), null, `${locale}: sidebar should be closed`);

      feature.destroy();
    }
  });

  it('ignores extra modifiers (Ctrl+Shift+B, Ctrl+Alt+B, Ctrl+Meta+B), plain b, and IME composition', () => {
    const env = createFakeSidebarEnv();
    const feature = createSidebarToggleFeature({ doc: env.doc });
    feature.init();

    for (const props of [
      { key: 'b', code: 'KeyB' },
      { key: 'B', code: 'KeyB', ctrlKey: true, shiftKey: true },
      { key: 'b', code: 'KeyB', ctrlKey: true, altKey: true },
      { key: 'b', code: 'KeyB', ctrlKey: true, metaKey: true },
      { key: 'b', code: 'KeyB', altKey: true },
      { key: 'b', code: 'KeyB', ctrlKey: true, isComposing: true },
      { key: 'b', code: 'KeyB', ctrlKey: true, keyCode: 229 },
    ]) {
      const ev = env.dispatchKey('keydown', { target: env.promptInput, ...props });
      assert.equal(ev.defaultPrevented, false, `must not intercept ${JSON.stringify(props)}`);
    }

    assert.equal(env.openSidebarBtn.clickedCount, 0);
    assert.equal(env.getSidebar(), null);
    feature.destroy();
  });

  it('consumes repeat keydowns while Ctrl+B is held without toggling back', () => {
    const env = createFakeSidebarEnv();
    const feature = createSidebarToggleFeature({ doc: env.doc });
    feature.init();

    const first = env.dispatchKey('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, repeat: false });
    assert.equal(first.defaultPrevented, true);
    const sidebar = env.getSidebar();
    assert.ok(sidebar);

    const repeated = env.dispatchKey('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, repeat: true });
    assert.equal(repeated.defaultPrevented, true, 'repeat must still be prevented so browser shortcut does not fire');
    assert.equal(sidebar.closeSidebarBtn.clickedCount, 0, 'repeat must not immediately toggle sidebar back');
    assert.ok(env.getSidebar());

    feature.destroy();
  });

  it('does not intercept Ctrl+B when no sidebar toggle button exists on the page', () => {
    const env = createFakeSidebarEnv({ includeOpenButton: false });
    const feature = createSidebarToggleFeature({ doc: env.doc });
    feature.init();

    assert.equal(findSidebarToggleButton(env.doc), null);
    const ev = env.dispatchKey('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, target: env.promptInput });
    assert.equal(ev.defaultPrevented, false);

    feature.destroy();
  });

  it('skips hidden sidebar elements and hidden toggle buttons', () => {
    const env = createFakeSidebarEnv();
    const hiddenOpen = createFakeNode('button', {
      classes: ['ONx74b'],
      attrs: { 'aria-label': 'Open sidebar' },
      hidden: true,
    });
    env.rail.children.unshift(hiddenOpen);
    hiddenOpen.parentElement = env.rail;
    hiddenOpen.ownerDocument = env.doc;

    assert.equal(findSidebarToggleButton(env.doc), env.openSidebarBtn);

    // A hidden sidebar container should be treated as collapsed
    const sidebar = env.mountSidebar();
    sidebar.nav.hidden = true;
    env.rail.appendChild(env.openSidebarBtn);
    assert.equal(findSidebarToggleButton(env.doc), env.openSidebarBtn);
  });

  it('removes its keydown listener on destroy()', () => {
    const env = createFakeSidebarEnv();
    const feature = createSidebarToggleFeature({ doc: env.doc });
    feature.init();
    feature.destroy();

    const ev = env.dispatchKey('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, target: env.promptInput });
    assert.equal(ev.defaultPrevented, false);
    assert.equal(env.openSidebarBtn.clickedCount, 0);
  });
});
