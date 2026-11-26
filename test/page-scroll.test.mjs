import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PAGE_SCROLL_FEATURE_ID,
  createPageScrollFeature,
} from '../src/features/page-scroll.js';
import {
  ARROW_SCROLL_STEP_PX,
  PROMPT_SCROLL_MARGIN_PX,
  computePageStep,
} from '../src/lib/scrolling.js';

function createFakeElement(
  tag,
  {
    attrs = {},
    classes = [],
    scrollTop = 0,
    clientHeight = 800,
    scrollHeight = 800,
    overflowY = 'visible',
    value = '',
    textContent = '',
  } = {},
) {
  const children = [];
  const classSet = new Set(classes);
  const attrMap = new Map(Object.entries(attrs));

  const el = {
    tagName: tag.toUpperCase(),
    children,
    parentElement: null,
    ownerDocument: null,
    scrollTop,
    clientHeight,
    scrollHeight,
    value,
    textContent,
    _overflowY: overflowY,
    scrollCalls: [],
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
    },
    getAttribute(k) {
      return attrMap.has(k) ? attrMap.get(k) : null;
    },
    hasAttribute(k) {
      return attrMap.has(k);
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
      const all = el.querySelectorAll(selector);
      return all[0] || null;
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
    appendChild(child) {
      child.parentElement = el;
      if (el.ownerDocument) setOwnerDocDeep(child, el.ownerDocument);
      children.push(child);
      return child;
    },
    scrollBy({ top, behavior }) {
      el.scrollCalls.push({ method: 'scrollBy', top, behavior });
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + top));
    },
    scrollTo({ top, behavior }) {
      el.scrollCalls.push({ method: 'scrollTo', top, behavior });
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.max(0, Math.min(max, top));
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

  const attrRegex = /\[([^\]=^$*]+)(?:(\^|\$|\*)?="([^"]*)")?\]/g;
  let m;
  while ((m = attrRegex.exec(rest)) !== null) {
    const [, attrName, op, expected] = m;
    const actual = el.getAttribute(attrName);
    if (expected === undefined) {
      if (actual === null) return false;
    } else if (op === '^') {
      if (actual === null || !actual.startsWith(expected)) return false;
    } else if (op === '$') {
      if (actual === null || !actual.endsWith(expected)) return false;
    } else if (op === '*') {
      if (actual === null || !actual.includes(expected)) return false;
    } else if (actual !== expected) {
      return false;
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
  const parts = selector.trim().split(/\s+/);
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

function createFakeAiSearchPageEnv({
  search = '?udm=50&q=quicksort&mtid=abc',
  aiModeDom = true,
  initialScrollTop = 1500,
  clientHeight = 800,
  scrollHeight = 4000,
  internalScroller = false,
} = {}) {
  const winListeners = new Map();
  const docListeners = new Map();
  const frames = new Map();
  let nowMs = 0;
  let nextId = 1;

  const html = createFakeElement('html', {
    scrollTop: internalScroller ? 0 : initialScrollTop,
    clientHeight,
    scrollHeight: internalScroller ? clientHeight : scrollHeight,
  });
  const body = createFakeElement('body', { classes: ['srp', 'P4Yedd'] });
  const main = createFakeElement('div', {
    attrs: { role: 'main' },
    classes: ['WzWwpc', 'YNk70c'],
  });
  const turnRoot = createFakeElement('div', {
    attrs: aiModeDom ? { 'data-xid': 'aim-mars-turn-root' } : {},
    classes: ['qJYHHd', 'VET7dc', 'mp0vvc'],
    scrollTop: internalScroller ? initialScrollTop : 0,
    clientHeight,
    scrollHeight: internalScroller ? scrollHeight : clientHeight,
    overflowY: internalScroller ? 'auto' : 'visible',
  });
  const inputPlate = createFakeElement('div', {
    attrs: aiModeDom ? { 'data-xid': 'aim-mars-input-plate' } : {},
    classes: ['UAbVe', 'Uu3Gac'],
  });
  const textareaWrapper = createFakeElement('div', {
    classes: ['Txyg0d'],
    clientHeight: 48,
    scrollHeight: 120,
    overflowY: 'auto',
  });
  const input = createFakeElement('textarea', {
    classes: aiModeDom ? ['ITIRGe'] : ['gLFyf'],
    attrs: aiModeDom
      ? { 'aria-label': 'Ask anything', placeholder: 'Ask anything' }
      : { name: 'q', 'aria-label': 'Search' },
  });
  const otherTextarea = createFakeElement('textarea', { attrs: { 'aria-label': 'Feedback' } });
  const dialog = createFakeElement('div', { attrs: { role: 'dialog', 'aria-modal': 'true' } });
  const dialogButton = createFakeElement('button');
  const sidebar = createFakeElement('div', {
    attrs: aiModeDom
      ? { role: 'navigation', 'data-xid': 'BVEPif', 'aria-label': 'AI Mode history' }
      : { role: 'navigation' },
    classes: ['ho072b', 'j2vKLc'],
  });
  const sidebarScroll = createFakeElement('div', {
    classes: ['cIl10d'],
    clientHeight: 600,
    scrollHeight: 1600,
    overflowY: 'auto',
  });
  const sidebarButton = createFakeElement('button', { attrs: { 'data-thread-id': 't-1' } });
  const scrollableCode = createFakeElement('pre', {
    clientHeight: 200,
    scrollHeight: 900,
    overflowY: 'auto',
  });

  textareaWrapper.appendChild(input);
  inputPlate.appendChild(textareaWrapper);
  turnRoot.appendChild(otherTextarea);
  turnRoot.appendChild(scrollableCode);
  main.appendChild(turnRoot);
  main.appendChild(inputPlate);
  dialog.appendChild(dialogButton);
  sidebarScroll.appendChild(sidebarButton);
  sidebar.appendChild(sidebarScroll);
  body.appendChild(sidebar);
  body.appendChild(main);
  body.appendChild(dialog);
  html.appendChild(body);

  const defaultView = {
    location: { search, pathname: '/search' },
    addEventListener(type, fn, options) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push({ fn, capture: Boolean(options?.capture ?? options) });
    },
    removeEventListener(type, fn) {
      if (!winListeners.has(type)) return;
      winListeners.set(type, winListeners.get(type).filter((e) => e.fn !== fn));
    },
    dispatchEvent(event) {
      const list = winListeners.get(event.type) ?? [];
      for (const { fn } of list) fn(event);
    },
    requestAnimationFrame(cb) {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    getComputedStyle(el) {
      return { overflowY: el._overflowY || 'visible' };
    },
  };

  const doc = {
    activeElement: input,
    body,
    documentElement: html,
    scrollingElement: html,
    defaultView,
    location: defaultView.location,
    querySelector(sel) {
      return html.querySelector(sel);
    },
    querySelectorAll(sel) {
      return html.querySelectorAll(sel);
    },
    addEventListener(type, fn, options) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push({ fn, capture: Boolean(options?.capture ?? options) });
    },
    removeEventListener(type, fn) {
      if (!docListeners.has(type)) return;
      docListeners.set(type, docListeners.get(type).filter((e) => e.fn !== fn));
    },
    dispatchEvent(event) {
      const list = docListeners.get(event.type) ?? [];
      for (const { fn } of list) fn(event);
    },
  };

  setOwnerDocDeep(html, doc);

  const scroller = internalScroller ? turnRoot : html;

  const dispatchKey = (type, props) => {
    const ev = createFakeEvent(type, props);
    defaultView.dispatchEvent(ev);
    return ev;
  };

  const advanceMs = (totalMs, stepMs = 16.6667) => {
    const steps = Math.round(totalMs / stepMs);
    for (let i = 0; i < steps; i += 1) {
      if (frames.size === 0) break;
      nowMs += stepMs;
      const pending = Array.from(frames.entries());
      frames.clear();
      for (const [, cb] of pending) cb(nowMs);
    }
  };

  return {
    doc,
    html,
    body,
    main,
    turnRoot,
    inputPlate,
    scroller,
    input,
    otherTextarea,
    dialogButton,
    sidebarButton,
    scrollableCode,
    frames,
    dispatchKey,
    advanceMs,
  };
}

describe('page-scroll feature (Google Search AI Mode)', () => {
  it('smoothly scrolls document.scrollingElement on PageUp and PageDown while prompt textarea stays focused', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 1500, clientHeight: 800, scrollHeight: 4000 });
    const feature = createPageScrollFeature({ doc: env.doc });
    assert.equal(feature.id, PAGE_SCROLL_FEATURE_ID);
    feature.init();

    const pageStep = computePageStep(env.scroller);
    env.doc.activeElement = env.input;

    const upEv = env.dispatchKey('keydown', { key: 'PageUp', target: env.input });
    env.dispatchKey('keyup', { key: 'PageUp', target: env.input });
    assert.equal(upEv.defaultPrevented, true);
    assert.equal(upEv.propagationStopped, true);
    assert.equal(env.doc.activeElement, env.input, 'prompt textarea must stay focused');

    env.advanceMs(100);
    assert.ok(
      env.scroller.scrollTop < 1500 - 100 && env.scroller.scrollTop > 1500 - pageStep + 100,
      `PageUp should animate smoothly, got ${env.scroller.scrollTop}`,
    );

    env.advanceMs(700);
    assert.equal(env.scroller.scrollTop, 1500 - pageStep);
    assert.equal(env.frames.size, 0);

    const downEv = env.dispatchKey('keydown', { key: 'PageDown', target: env.input });
    env.dispatchKey('keyup', { key: 'PageDown', target: env.input });
    assert.equal(downEv.defaultPrevented, true);
    assert.equal(env.doc.activeElement, env.input);

    env.advanceMs(800);
    assert.equal(env.scroller.scrollTop, 1500);

    feature.destroy();
  });

  it('prefers internal aim-mars-turn-root overflow container when it is the active vertical scroller', () => {
    const env = createFakeAiSearchPageEnv({
      initialScrollTop: 1200,
      clientHeight: 700,
      scrollHeight: 3500,
      internalScroller: true,
    });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    const ev = env.dispatchKey('keydown', { key: 'PageUp', target: env.input });
    env.dispatchKey('keyup', { key: 'PageUp', target: env.input });
    assert.equal(ev.defaultPrevented, true);

    env.advanceMs(800);
    assert.equal(env.turnRoot.scrollTop, 1200 - computePageStep(env.turnRoot));
    assert.equal(env.html.scrollTop, 0);

    feature.destroy();
  });

  it('does nothing on regular Google Search pages (non-AI Mode)', () => {
    const env = createFakeAiSearchPageEnv({
      search: '?q=weather',
      aiModeDom: false,
      initialScrollTop: 1200,
    });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    const ev = env.dispatchKey('keydown', { key: 'PageUp', target: env.input });
    assert.equal(ev.defaultPrevented, false);
    assert.equal(env.scroller.scrollTop, 1200);

    feature.destroy();
  });

  it('ignores PageUp/PageDown with modifier keys (Shift, Ctrl, Alt, Meta) or IME composition', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 1200 });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    for (const mods of [
      { shiftKey: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { isComposing: true },
    ]) {
      const ev = env.dispatchKey('keydown', { key: 'PageUp', target: env.input, ...mods });
      assert.equal(ev.defaultPrevented, false);
    }

    assert.equal(env.frames.size, 0);
    assert.equal(env.scroller.scrollTop, 1200);

    feature.destroy();
  });

  it('does not hijack PageUp/PageDown in dialogs, sidebar, other textareas, or nested scrollable code blocks', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 1200 });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    for (const el of [env.otherTextarea, env.dialogButton, env.sidebarButton, env.scrollableCode]) {
      env.doc.activeElement = el;
      const ev = env.dispatchKey('keydown', { key: 'PageUp', target: el });
      assert.equal(ev.defaultPrevented, false, `should not hijack PageUp on ${el.tagName}`);
    }

    assert.equal(env.scroller.scrollTop, 1200);
    feature.destroy();
  });

  it('smoothly scrolls thread when body is focused (e.g. after clicking in the response)', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 1200 });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    env.doc.activeElement = env.body;
    const ev = env.dispatchKey('keydown', { key: 'PageUp', target: env.body });
    env.dispatchKey('keyup', { key: 'PageUp', target: env.body });
    assert.equal(ev.defaultPrevented, true);

    env.advanceMs(800);
    assert.equal(env.scroller.scrollTop, 1200 - computePageStep(env.scroller));

    feature.destroy();
  });

  it('does not preventDefault when page has no scrollable overflow', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 0, clientHeight: 800, scrollHeight: 800 });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    const ev = env.dispatchKey('keydown', { key: 'PageUp', target: env.input });
    assert.equal(ev.defaultPrevented, false);

    feature.destroy();
  });

  it('cleans up listeners and cancels in-flight animation on destroy()', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 1500 });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    env.dispatchKey('keydown', { key: 'PageUp', target: env.input });
    env.advanceMs(50);
    assert.ok(env.frames.size > 0);

    feature.destroy();
    assert.equal(env.frames.size, 0);

    const ev = env.dispatchKey('keydown', { key: 'PageUp', target: env.input });
    assert.equal(ev.defaultPrevented, false);
  });

  it('smoothly scrolls document.scrollingElement on ArrowUp and ArrowDown while empty prompt textarea stays focused', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 1500, clientHeight: 800, scrollHeight: 4000 });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    env.doc.activeElement = env.input;
    env.input.value = '';

    const upEv = env.dispatchKey('keydown', { key: 'ArrowUp', target: env.input });
    env.dispatchKey('keyup', { key: 'ArrowUp', target: env.input });
    assert.equal(upEv.defaultPrevented, true);
    assert.equal(upEv.propagationStopped, true);
    assert.equal(env.doc.activeElement, env.input, 'prompt textarea must stay focused');

    env.advanceMs(66);
    assert.ok(
      env.scroller.scrollTop < 1500 - 10 && env.scroller.scrollTop > 1500 - ARROW_SCROLL_STEP_PX + 10,
      `ArrowUp should animate smoothly, got ${env.scroller.scrollTop}`,
    );

    env.advanceMs(600);
    assert.equal(env.scroller.scrollTop, 1500 - ARROW_SCROLL_STEP_PX);
    assert.equal(env.frames.size, 0);

    const downEv = env.dispatchKey('keydown', { key: 'ArrowDown', target: env.input });
    env.dispatchKey('keyup', { key: 'ArrowDown', target: env.input });
    assert.equal(downEv.defaultPrevented, true);
    assert.equal(env.doc.activeElement, env.input);

    env.advanceMs(600);
    assert.equal(env.scroller.scrollTop, 1500);
    assert.equal(env.frames.size, 0);

    feature.destroy();
  });

  it('prefers internal aim-mars-turn-root overflow container for ArrowUp/ArrowDown', () => {
    const env = createFakeAiSearchPageEnv({
      initialScrollTop: 1200,
      clientHeight: 700,
      scrollHeight: 3500,
      internalScroller: true,
    });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    const ev = env.dispatchKey('keydown', { key: 'ArrowUp', target: env.input });
    env.dispatchKey('keyup', { key: 'ArrowUp', target: env.input });
    assert.equal(ev.defaultPrevented, true);

    env.advanceMs(600);
    assert.equal(env.turnRoot.scrollTop, 1200 - ARROW_SCROLL_STEP_PX);
    assert.equal(env.html.scrollTop, 0);

    feature.destroy();
  });

  it('scrolls continuously while holding ArrowDown in empty prompt textarea and stops cleanly on release or blur', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 500, clientHeight: 800, scrollHeight: 4000 });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    env.dispatchKey('keydown', { key: 'ArrowDown', target: env.input });
    env.advanceMs(500);
    const heldPos = env.scroller.scrollTop;
    assert.ok(
      heldPos > 500 + ARROW_SCROLL_STEP_PX * 2,
      `holding ArrowDown should scroll continuously, got ${heldPos}`,
    );

    env.dispatchKey('keyup', { key: 'ArrowDown', target: env.input });
    env.advanceMs(600);
    assert.ok(env.scroller.scrollTop > heldPos, 'should coast slightly after ArrowDown release');
    assert.equal(env.frames.size, 0);

    // Window blur cancels an active arrow scroll
    env.dispatchKey('keydown', { key: 'ArrowUp', target: env.input });
    env.advanceMs(50);
    assert.ok(env.frames.size > 0);
    env.doc.defaultView.dispatchEvent({ type: 'blur' });
    assert.equal(env.frames.size, 0);

    feature.destroy();
  });

  it('does not hijack ArrowUp/ArrowDown when prompt textarea contains text (preserves text editing)', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 1200 });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    env.doc.activeElement = env.input;
    env.input.value = 'line 1\nline 2';

    const upEv = env.dispatchKey('keydown', { key: 'ArrowUp', target: env.input });
    const downEv = env.dispatchKey('keydown', { key: 'ArrowDown', target: env.input });
    assert.equal(upEv.defaultPrevented, false);
    assert.equal(downEv.defaultPrevented, false);
    assert.equal(env.frames.size, 0);
    assert.equal(env.scroller.scrollTop, 1200);

    // PageUp still works even when prompt has text
    const pgEv = env.dispatchKey('keydown', { key: 'PageUp', target: env.input });
    env.dispatchKey('keyup', { key: 'PageUp', target: env.input });
    assert.equal(pgEv.defaultPrevented, true);
    env.advanceMs(800);
    assert.equal(env.scroller.scrollTop, 1200 - computePageStep(env.scroller));

    feature.destroy();
  });

  it('supports empty contenteditable prompt input and ignores non-empty or aria-expanded prompt inputs', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 1200 });
    const ceInput = createFakeElement('div', {
      attrs: { contenteditable: 'true' },
      textContent: '',
    });
    env.inputPlate.appendChild(ceInput);

    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    env.doc.activeElement = ceInput;
    const ev1 = env.dispatchKey('keydown', { key: 'ArrowUp', target: ceInput });
    env.dispatchKey('keyup', { key: 'ArrowUp', target: ceInput });
    assert.equal(ev1.defaultPrevented, true);
    env.advanceMs(600);
    assert.equal(env.scroller.scrollTop, 1200 - ARROW_SCROLL_STEP_PX);

    ceInput.textContent = 'some draft text';
    const ev2 = env.dispatchKey('keydown', { key: 'ArrowUp', target: ceInput });
    assert.equal(ev2.defaultPrevented, false);

    // aria-expanded="true" (e.g. open suggestion popup) must not be hijacked
    env.doc.activeElement = env.input;
    env.input.value = '';
    env.input.setAttribute('aria-expanded', 'true');
    const ev3 = env.dispatchKey('keydown', { key: 'ArrowDown', target: env.input });
    assert.equal(ev3.defaultPrevented, false);

    feature.destroy();
  });

  it('ignores ArrowUp/ArrowDown with modifiers, IME composition, outside prompt input, non-AI pages, or non-overflowing pages', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 1200 });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    // Modifiers & IME on prompt input
    for (const mods of [
      { shiftKey: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { isComposing: true },
    ]) {
      const ev = env.dispatchKey('keydown', { key: 'ArrowUp', target: env.input, ...mods });
      assert.equal(ev.defaultPrevented, false);
    }

    // Outside prompt input (body, other textarea, dialog, sidebar, scrollable code block)
    for (const el of [env.body, env.otherTextarea, env.dialogButton, env.sidebarButton, env.scrollableCode]) {
      env.doc.activeElement = el;
      const ev = env.dispatchKey('keydown', { key: 'ArrowDown', target: el });
      assert.equal(ev.defaultPrevented, false, `should not hijack ArrowDown on ${el.tagName}`);
    }

    assert.equal(env.scroller.scrollTop, 1200);
    feature.destroy();

    // Regular Google Search page
    const regularEnv = createFakeAiSearchPageEnv({
      search: '?q=weather',
      aiModeDom: false,
      initialScrollTop: 1200,
    });
    const regularFeature = createPageScrollFeature({ doc: regularEnv.doc });
    regularFeature.init();
    const regEv = regularEnv.dispatchKey('keydown', { key: 'ArrowUp', target: regularEnv.input });
    assert.equal(regEv.defaultPrevented, false);
    regularFeature.destroy();

    // Non-overflowing page
    const flatEnv = createFakeAiSearchPageEnv({ initialScrollTop: 0, clientHeight: 800, scrollHeight: 800 });
    const flatFeature = createPageScrollFeature({ doc: flatEnv.doc });
    flatFeature.init();
    const flatEv = flatEnv.dispatchKey('keydown', { key: 'ArrowDown', target: flatEnv.input });
    assert.equal(flatEv.defaultPrevented, false);
    flatFeature.destroy();
  });

  it('stops in-flight page scroll when ArrowUp/ArrowDown starts and vice versa', () => {
    const env = createFakeAiSearchPageEnv({ initialScrollTop: 1500, clientHeight: 800, scrollHeight: 4000 });
    const feature = createPageScrollFeature({ doc: env.doc });
    feature.init();

    env.dispatchKey('keydown', { key: 'PageUp', target: env.input });
    env.dispatchKey('keyup', { key: 'PageUp', target: env.input });
    env.advanceMs(66);
    const midPageUp = env.scroller.scrollTop;
    assert.ok(midPageUp < 1500);

    // Immediately switch to ArrowDown: only 1 rAF loop should remain active and move down from midPageUp
    env.dispatchKey('keydown', { key: 'ArrowDown', target: env.input });
    env.dispatchKey('keyup', { key: 'ArrowDown', target: env.input });
    assert.equal(env.frames.size, 1, 'only one scroll animation loop should run at a time');
    env.advanceMs(600);
    assert.equal(env.scroller.scrollTop, Math.round(midPageUp + ARROW_SCROLL_STEP_PX));
    assert.equal(env.frames.size, 0);

    feature.destroy();
  });

  describe('Ctrl+Alt+[ / Ctrl+Alt+] prompt navigation', () => {
    const PROMPT_OFFSETS = [200, 1200, 2400, 3600];
    const SCROLLER_RECT_TOP = 120;

    function addPrompts(env, offsets = PROMPT_OFFSETS) {
      const isInternal = env.scroller === env.turnRoot;
      env.turnRoot.getBoundingClientRect = () => ({ top: SCROLLER_RECT_TOP, width: 900, height: 700 });
      for (const offset of offsets) {
        const prompt = createFakeElement('div', { classes: ['ilZyRc', 'R7mRQb'] });
        prompt.getBoundingClientRect = () => ({
          top: (isInternal ? SCROLLER_RECT_TOP : 0) + offset - env.scroller.scrollTop,
          width: 500,
          height: 40,
        });
        env.turnRoot.appendChild(prompt);
      }
    }

    const jumpKey = (env, dir, props = {}) =>
      env.dispatchKey('keydown', {
        key: dir < 0 ? '[' : ']',
        code: dir < 0 ? 'BracketLeft' : 'BracketRight',
        ctrlKey: true,
        altKey: true,
        target: env.input,
        ...props,
      });

    const aligned = (offset) => offset - PROMPT_SCROLL_MARGIN_PX;

    it('smoothly scrolls to the previous / next prompt while the prompt input is focused', () => {
      const env = createFakeAiSearchPageEnv({ initialScrollTop: 1500, clientHeight: 800, scrollHeight: 6000 });
      addPrompts(env);
      const feature = createPageScrollFeature({ doc: env.doc });
      feature.init();

      const ev = jumpKey(env, -1);
      assert.equal(ev.defaultPrevented, true);
      assert.equal(ev.propagationStopped, true);
      assert.equal(env.doc.activeElement, env.input);

      env.advanceMs(50);
      const mid = env.scroller.scrollTop;
      assert.ok(mid < 1500 && mid > aligned(1200), `expected smooth mid-flight scrollTop, got ${mid}`);
      env.advanceMs(1500);
      assert.equal(env.scroller.scrollTop, aligned(1200));
      assert.equal(env.frames.size, 0);

      jumpKey(env, 1);
      env.advanceMs(1500);
      assert.equal(env.scroller.scrollTop, aligned(2400));

      feature.destroy();
    });

    it('works with text in the prompt and accumulates rapid presses from the in-flight target', () => {
      const env = createFakeAiSearchPageEnv({ initialScrollTop: 0, clientHeight: 800, scrollHeight: 6000 });
      addPrompts(env);
      env.input.value = 'draft question';
      const feature = createPageScrollFeature({ doc: env.doc });
      feature.init();

      jumpKey(env, 1);
      env.advanceMs(33);
      jumpKey(env, 1, { repeat: true });
      env.advanceMs(33);
      jumpKey(env, 1);
      env.advanceMs(1500);
      assert.equal(env.scroller.scrollTop, aligned(2400));

      feature.destroy();
    });

    it('supports the internal turn-root scroller and falls back to the edges past the first / last prompt', () => {
      const env = createFakeAiSearchPageEnv({
        initialScrollTop: 3700,
        clientHeight: 700,
        scrollHeight: 6000,
        internalScroller: true,
      });
      addPrompts(env);
      const feature = createPageScrollFeature({ doc: env.doc });
      feature.init();

      jumpKey(env, 1);
      env.advanceMs(1500);
      assert.equal(env.turnRoot.scrollTop, 6000 - 700);

      jumpKey(env, -1);
      env.advanceMs(1500);
      assert.equal(env.turnRoot.scrollTop, aligned(3600));
      assert.equal(env.html.scrollTop, 0);

      env.turnRoot.scrollTop = 100;
      jumpKey(env, -1);
      env.advanceMs(1500);
      assert.equal(env.turnRoot.scrollTop, 0);

      feature.destroy();
    });

    it('works in any context on an AI Mode page, not only when the prompt input is focused', () => {
      const env = createFakeAiSearchPageEnv({ initialScrollTop: 1500, clientHeight: 800, scrollHeight: 6000 });
      addPrompts(env);
      const feature = createPageScrollFeature({ doc: env.doc });
      feature.init();

      for (const el of [
        env.body,
        env.otherTextarea,
        env.dialogButton,
        env.sidebarButton,
        env.scrollableCode,
      ]) {
        env.scroller.scrollTop = 1500;
        env.doc.activeElement = el;
        const ev = jumpKey(env, 1, { target: el });
        assert.equal(ev.defaultPrevented, true, `should handle Ctrl+Alt+] on ${el.tagName}`);
        assert.equal(ev.propagationStopped, true, `should stop propagation on ${el.tagName}`);
        assert.equal(env.doc.activeElement, el, `should preserve focus on ${el.tagName}`);
        env.advanceMs(1500);
        assert.equal(env.scroller.scrollTop, aligned(2400), `should scroll to next prompt from ${el.tagName}`);

        const prevEv = jumpKey(env, -1, { target: el });
        assert.equal(prevEv.defaultPrevented, true, `should handle Ctrl+Alt+[ on ${el.tagName}`);
        env.advanceMs(1500);
        assert.equal(env.scroller.scrollTop, aligned(1200), `should scroll to previous prompt from ${el.tagName}`);
      }

      feature.destroy();
    });

    it('ignores the shortcut with extra modifiers, without Ctrl+Alt, during IME composition, or on non-AI pages', () => {
      const env = createFakeAiSearchPageEnv({ initialScrollTop: 1500, scrollHeight: 6000 });
      addPrompts(env);
      const feature = createPageScrollFeature({ doc: env.doc });
      feature.init();

      for (const props of [
        { ctrlKey: false },
        { altKey: false },
        { shiftKey: true },
        { metaKey: true },
        { isComposing: true },
      ]) {
        const ev = jumpKey(env, 1, props);
        assert.equal(ev.defaultPrevented, false, JSON.stringify(props));
      }

      assert.equal(env.frames.size, 0);
      assert.equal(env.scroller.scrollTop, 1500);
      feature.destroy();

      const plain = createFakeAiSearchPageEnv({ search: '?q=weather', aiModeDom: false, scrollHeight: 6000 });
      const plainFeature = createPageScrollFeature({ doc: plain.doc });
      plainFeature.init();
      assert.equal(jumpKey(plain, 1).defaultPrevented, false);
      plainFeature.destroy();
    });

    it('stops an in-flight prompt glide when PageUp/ArrowUp scrolling starts', () => {
      const env = createFakeAiSearchPageEnv({ initialScrollTop: 1500, scrollHeight: 6000 });
      addPrompts(env);
      const feature = createPageScrollFeature({ doc: env.doc });
      feature.init();

      jumpKey(env, 1);
      env.advanceMs(50);
      env.dispatchKey('keydown', { key: 'PageUp', target: env.input });
      env.dispatchKey('keyup', { key: 'PageUp', target: env.input });
      env.advanceMs(1500);
      assert.ok(env.scroller.scrollTop < aligned(2400) - 100, `glide should be cancelled, got ${env.scroller.scrollTop}`);
      assert.equal(env.frames.size, 0);

      feature.destroy();
    });
  });
});
