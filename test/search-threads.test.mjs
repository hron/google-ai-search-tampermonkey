import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SEARCH_ACTIVE_ATTR,
  SEARCH_ACTIVE_ROW_ATTR,
  SEARCH_THREADS_FEATURE_ID,
  computeNextOptionIndex,
  createSearchThreadsFeature,
  findSearchThreadsUI,
  findSearchThreadOptions,
} from '../src/features/search-threads.js';

function createFakeNode(
  tag,
  {
    attrs = {},
    classes = [],
    textContent = '',
    scrollTop = 0,
    clientHeight = 400,
    scrollHeight = 400,
    overflowY = 'visible',
    rect = null,
    value = '',
    disabled = false,
    hidden = false,
  } = {},
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
    value,
    disabled,
    hidden,
    scrollTop,
    clientHeight,
    scrollHeight,
    _overflowY: overflowY,
    _rect: rect || { top: 0, bottom: 52, left: 0, right: 245, height: 52, width: 245 },
    clickedCount: 0,
    focusedCount: 0,
    selectedCount: 0,
    scrollIntoViewCalls: [],
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
      if (k === 'id') el.id = String(v);
      if (k === 'disabled') el.disabled = true;
      if (k === 'hidden') el.hidden = true;
    },
    getAttribute(k) {
      return attrMap.has(k) ? attrMap.get(k) : null;
    },
    removeAttribute(k) {
      attrMap.delete(k);
      if (k === 'id') el.id = '';
      if (k === 'disabled') el.disabled = false;
      if (k === 'hidden') el.hidden = false;
    },
    hasAttribute(k) {
      return attrMap.has(k);
    },
    get id() {
      return attrMap.get('id') || '';
    },
    set id(v) {
      if (v) attrMap.set('id', String(v));
      else attrMap.delete('id');
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
    addEventListener(type, fn, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, capture: Boolean(options?.capture ?? options) });
    },
    removeEventListener(type, fn) {
      if (!listeners.has(type)) return;
      listeners.set(type, listeners.get(type).filter((entry) => entry.fn !== fn));
    },
    dispatchEvent(event) {
      const targetEvent = { target: el, ...event };
      const list = listeners.get(targetEvent.type) ?? [];
      for (const { fn } of list) fn(targetEvent);
      return targetEvent;
    },
    focus() {
      el.focusedCount += 1;
      if (el.ownerDocument) {
        const prev = el.ownerDocument.activeElement;
        el.ownerDocument.activeElement = el;
        if (prev !== el) {
          el.ownerDocument.dispatchEvent(createFakeEvent('focusin', { target: el, relatedTarget: prev }));
        }
      }
    },
    select() {
      el.selectedCount += 1;
    },
    click() {
      el.clickedCount += 1;
      el.dispatchEvent(createFakeEvent('click', { target: el }));
    },
    getBoundingClientRect() {
      return { ...el._rect };
    },
    scrollIntoView(opts) {
      el.scrollIntoViewCalls.push(opts);
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
  };

  if (attrs.id) el.id = attrs.id;
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

function createFakeAiSearchEnv({
  search = '?udm=50&q=test',
  aiModeDom = true,
  threadCount = 5,
  rowHeight = 52,
  viewportHeight = 156,
  locale = 'en',
} = {}) {
  const winListeners = new Map();
  const docListeners = new Map();

  const html = createFakeNode('html');
  const head = createFakeNode('head');
  const body = createFakeNode('body', { classes: ['srp', 'P4Yedd'] });
  html.appendChild(head);
  html.appendChild(body);

  const main = createFakeNode('div', { attrs: { role: 'main' }, classes: ['WzWwpc', 'YNk70c'] });
  const inputPlate = createFakeNode('div', {
    attrs: aiModeDom ? { 'data-xid': 'aim-mars-input-plate' } : {},
    classes: ['UAbVe'],
  });
  const promptInput = createFakeNode('textarea', {
    classes: aiModeDom ? ['ITIRGe'] : ['gLFyf'],
    attrs: aiModeDom ? { 'aria-label': 'Ask anything', placeholder: 'Ask anything' } : { name: 'q' },
  });
  inputPlate.appendChild(promptInput);
  main.appendChild(inputPlate);
  body.appendChild(main);

  const rail = createFakeNode('div', { classes: ['rail'] });
  const openSidebarBtn = createFakeNode('button', {
    classes: ['ONx74b'],
    attrs: {
      jsname: 'JIu0P',
      'aria-label': locale === 'en' ? 'Open sidebar' : 'Открыть боковую панель',
      jsaction: 'click:&KJJZid_b|Mrjwi',
    },
  });
  if (aiModeDom) {
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
      winListeners.set(type, winListeners.get(type).filter((e) => e.fn !== fn));
    },
    dispatchEvent(event) {
      const list = winListeners.get(event.type) ?? [];
      for (const { fn } of list) fn(event);
    },
    getComputedStyle(el) {
      return {
        overflowY: el._overflowY || 'visible',
        display: el.hidden ? 'none' : 'block',
        visibility: 'visible',
      };
    },
  };

  const doc = {
    activeElement: promptInput,
    documentElement: html,
    head,
    body,
    defaultView,
    location: defaultView.location,
    createElement(tag) {
      const node = createFakeNode(tag);
      node.ownerDocument = doc;
      return node;
    },
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

  function closeSidebar() {
    if (sidebarState) {
      sidebarState.nav.remove();
      sidebarState = null;
    }
    body.classList.remove('K9MSg');
    if (aiModeDom && !rail.children.includes(openSidebarBtn)) {
      rail.appendChild(openSidebarBtn);
    }
  }

  function mountSidebar({ inSearchMode = false, titles = null, loading = false } = {}) {
    if (sidebarState) {
      closeSidebar();
    }
    openSidebarBtn.remove();
    body.classList.add('K9MSg');

    const nav = createFakeNode('div', {
      classes: ['ho072b', 'j2vKLc'],
      attrs: {
        role: 'navigation',
        'data-xid': 'BVEPif',
        'aria-label': locale === 'en' ? 'AI Mode history' : 'История режима ИИ',
        tabindex: '-1',
      },
    });

    const closeSidebarBtn = createFakeNode('button', {
      classes: ['OxKcRe'],
      attrs: {
        'aria-label': locale === 'en' ? 'Close sidebar' : 'Закрыть боковую панель',
      },
    });
    closeSidebarBtn.addEventListener('click', closeSidebar);
    nav.appendChild(closeSidebarBtn);

    const headerSlot = createFakeNode('div', { classes: ['header-slot'] });
    nav.appendChild(headerSlot);

    const outerScroll = createFakeNode('div', {
      classes: ['XOpo9c'],
      scrollTop: 0,
      clientHeight: viewportHeight + 60,
      scrollHeight: viewportHeight + 60,
      overflowY: 'auto',
    });
    const viewport = createFakeNode('div', {
      classes: ['cIl10d'],
      scrollTop: 0,
      clientHeight: viewportHeight,
      scrollHeight: viewportHeight,
      overflowY: 'auto',
      rect: { top: 100, bottom: 100 + viewportHeight, left: 0, right: 261, height: viewportHeight, width: 261 },
    });
    const threadsViewContainer = createFakeNode('div', {
      attrs: { id: 'aim-lhs-panel-threads-view-container' },
      classes: ['TSe88'],
    });
    const threadsView = createFakeNode('div', {
      attrs: { 'data-xid': 'aim-threads-view', 'data-lhs-content-ready': '' },
      classes: ['nSqbM'],
    });
    const listRoot = createFakeNode('div', {
      attrs: { 'data-xid': 'threads-list-root', role: 'list' },
      classes: ['BqVL3e'],
    });

    threadsView.appendChild(listRoot);
    threadsViewContainer.appendChild(threadsView);
    viewport.appendChild(threadsViewContainer);
    outerScroll.appendChild(viewport);
    nav.appendChild(outerScroll);
    body.appendChild(nav);

    const state = {
      nav,
      closeSidebarBtn,
      headerSlot,
      viewport,
      threadsView,
      listRoot,
      newThreadBtn: null,
      searchThreadsBtn: null,
      searchHeader: null,
      exitSearchBtn: null,
      searchInput: null,
      clearBtn: null,
      buttons: [],
      rows: [],
      menuButtons: [],
      enterSearchMode,
      exitSearchMode,
      populateThreads,
      showLoadingShimmer,
    };

    function populateThreads(newTitles) {
      listRoot.children.length = 0;
      state.buttons = [];
      state.rows = [];
      state.menuButtons = [];

      newTitles.forEach((title, i) => {
        const threadId = `thread-${i + 1}`;
        const listitem = createFakeNode('div', {
          classes: ['j8c53'],
          attrs: { role: 'listitem', 'aria-posinset': String(i + 1), 'aria-setsize': String(newTitles.length) },
        });
        const dh = createFakeNode('div', { classes: ['DHVRqe'], attrs: { role: 'presentation' } });
        const yh = createFakeNode('div', { classes: ['YHsVn'] });
        const row = createFakeNode('div', { classes: ['u987h'], attrs: { role: 'presentation' } });
        const btn = createFakeNode('button', {
          classes: ['qqMZif'],
          attrs: {
            id: `BAyyLe${threadId}`,
            'data-thread-id': threadId,
            'aria-label': `${title}, ${i + 1} of ${newTitles.length}`,
          },
          textContent: title,
        });
        btn.getBoundingClientRect = () => ({
          top: 100 + i * rowHeight - viewport.scrollTop,
          bottom: 100 + (i + 1) * rowHeight - viewport.scrollTop,
          left: 8,
          right: 245,
          height: rowHeight,
          width: 237,
        });
        const menuSlot = createFakeNode('div', { classes: ['MW5ipb'], attrs: { role: 'presentation' } });
        const menuBtn = createFakeNode('button', {
          classes: ['fMed7'],
          attrs: { role: 'button', 'aria-label': `more options for ${title}` },
        });
        menuSlot.appendChild(menuBtn);
        row.appendChild(btn);
        row.appendChild(menuSlot);
        yh.appendChild(row);
        dh.appendChild(yh);
        listitem.appendChild(dh);
        listRoot.appendChild(listitem);

        state.buttons.push(btn);
        state.rows.push(row);
        state.menuButtons.push(menuBtn);
      });

      viewport.scrollHeight = Math.max(viewportHeight, newTitles.length * rowHeight);
      return state.buttons;
    }

    function showLoadingShimmer() {
      listRoot.children.length = 0;
      state.buttons = [];
      state.rows = [];
      state.menuButtons = [];
      const ul = createFakeNode('ul', { classes: ['BqVL3e', 'VZRWNb'] });
      for (let i = 0; i < 3; i += 1) {
        const li = createFakeNode('li', { classes: ['wDPpFb'] });
        li.appendChild(createFakeNode('div', { classes: ['Knyvjf'] }));
        ul.appendChild(li);
      }
      listRoot.appendChild(ul);
    }

    function renderDefaultHeader() {
      headerSlot.children.length = 0;
      state.searchHeader = null;
      state.exitSearchBtn = null;
      state.searchInput = null;
      state.clearBtn = null;

      const actionBar = createFakeNode('div', { classes: ['FBq0Sd'] });
      const newThreadBtn = createFakeNode('button', {
        classes: ['L9tyXb'],
        attrs: { jsaction: 'click:&KJJZid_b|WIC9ce' },
        textContent: locale === 'en' ? 'New thread' : 'Новая ветка',
      });
      const searchThreadsBtn = createFakeNode('button', {
        classes: ['L9tyXb'],
        attrs: { jsaction: 'click:&KJJZid_b|MR4M8b' },
        textContent: locale === 'en' ? 'Search threads' : 'Поиск веток',
      });
      searchThreadsBtn.addEventListener('click', () => enterSearchMode());

      actionBar.appendChild(newThreadBtn);
      actionBar.appendChild(searchThreadsBtn);
      headerSlot.appendChild(actionBar);

      state.newThreadBtn = newThreadBtn;
      state.searchThreadsBtn = searchThreadsBtn;
    }

    function enterSearchMode({ showLoading = false, initialTitles = null } = {}) {
      headerSlot.children.length = 0;
      state.newThreadBtn = null;
      state.searchThreadsBtn = null;

      const searchHeader = createFakeNode('div', { classes: ['uTGOrc'] });
      const exitSearchBtn = createFakeNode('button', {
        classes: ['Amkkpc'],
        attrs: {
          jsaction: 'click:.CLIENT',
          'aria-label': locale === 'en' ? 'Exit search' : 'Выйти из поиска',
        },
      });
      exitSearchBtn.addEventListener('click', exitSearchMode);

      const searchInput = createFakeNode('input', {
        classes: ['LudIE'],
        attrs: {
          type: 'text',
          placeholder: locale === 'en' ? 'Search threads' : 'Поиск веток',
          jsaction: 'input:.CLIENT;focus:.CLIENT',
        },
      });
      const clearBtn = createFakeNode('button', {
        classes: ['Amkkpc'],
        attrs: {
          'aria-label': locale === 'en' ? 'Clear text' : 'Очистить',
          role: 'button',
          tabindex: '0',
        },
      });

      searchHeader.appendChild(exitSearchBtn);
      searchHeader.appendChild(searchInput);
      searchHeader.appendChild(clearBtn);
      headerSlot.appendChild(searchHeader);

      state.searchHeader = searchHeader;
      state.exitSearchBtn = exitSearchBtn;
      state.searchInput = searchInput;
      state.clearBtn = clearBtn;

      if (showLoading) {
        showLoadingShimmer();
      } else {
        const list =
          initialTitles ||
          titles ||
          Array.from({ length: threadCount }, (_, i) => `Thread Title ${i + 1}`);
        populateThreads(list);
      }
      searchInput.focus();
    }

    function exitSearchMode() {
      renderDefaultHeader();
    }

    renderDefaultHeader();
    if (inSearchMode) {
      enterSearchMode({ showLoading: loading, initialTitles: titles });
    } else {
      const list = titles || Array.from({ length: threadCount }, (_, i) => `Thread Title ${i + 1}`);
      populateThreads(list);
    }

    sidebarState = state;
    return state;
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
    head,
    defaultView,
    promptInput,
    openSidebarBtn,
    mountSidebar,
    closeSidebar,
    getSidebar: () => sidebarState,
    dispatchKey,
  };
}

describe('computeNextOptionIndex', () => {
  it('returns -1 when option list is empty', () => {
    assert.equal(computeNextOptionIndex(0, 0, 1), -1);
    assert.equal(computeNextOptionIndex(-1, 0, -1), -1);
  });

  it('moves forward and backward and wraps on non-repeat boundary taps', () => {
    assert.equal(computeNextOptionIndex(0, 4, 1, { wrap: true }), 1);
    assert.equal(computeNextOptionIndex(3, 4, 1, { wrap: true }), 0);
    assert.equal(computeNextOptionIndex(0, 4, -1, { wrap: true }), 3);
    assert.equal(computeNextOptionIndex(2, 4, -1, { wrap: true }), 1);
  });

  it('clamps at boundaries when wrap is false (held key repeat / PageUp / PageDown)', () => {
    assert.equal(computeNextOptionIndex(3, 4, 1, { wrap: false }), 3);
    assert.equal(computeNextOptionIndex(0, 4, -1, { wrap: false }), 0);
    assert.equal(computeNextOptionIndex(1, 5, 10, { wrap: false }), 4);
    assert.equal(computeNextOptionIndex(3, 5, -10, { wrap: false }), 0);
  });
});

describe('search-threads DOM discovery', () => {
  it('finds locale-independent Search threads UI and excludes secondary row menu buttons', () => {
    const env = createFakeAiSearchEnv({ threadCount: 3, locale: 'ru' });
    const sidebar = env.mountSidebar({ inSearchMode: true });

    const found = findSearchThreadsUI(env.doc);
    assert.ok(found);
    assert.equal(found.container, sidebar.nav);
    assert.equal(found.input, sidebar.searchInput);

    const options = findSearchThreadOptions(found.container, found.input);
    assert.equal(options.length, 3);
    assert.deepEqual(options, sidebar.buttons);
    for (const menuBtn of sidebar.menuButtons) {
      assert.equal(options.includes(menuBtn), false);
    }
  });

  it('returns null when sidebar is open in default mode (not searching) and empty options during shimmer loading', () => {
    const env = createFakeAiSearchEnv({ threadCount: 3 });
    const sidebar = env.mountSidebar({ inSearchMode: false });
    assert.equal(findSearchThreadsUI(env.doc), null);

    sidebar.enterSearchMode({ showLoading: true });
    const found = findSearchThreadsUI(env.doc);
    assert.ok(found);
    assert.deepEqual(findSearchThreadOptions(found.container, found.input), []);
  });
});

describe('search-threads feature (Ctrl+K & keyboard navigation)', () => {
  it('does nothing on Ctrl+K when not on an AI Mode page', () => {
    const env = createFakeAiSearchEnv({ search: '?q=weather', aiModeDom: false });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    assert.equal(feature.id, SEARCH_THREADS_FEATURE_ID);
    feature.init();

    const ev = env.dispatchKey('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, target: env.promptInput });
    assert.equal(ev.defaultPrevented, false);
    assert.equal(env.getSidebar(), null);

    feature.destroy();
  });

  it('Ctrl+K opens collapsed sidebar, clicks Search threads, focuses input, and highlights top match (even on non-Latin layout)', () => {
    const env = createFakeAiSearchEnv({ threadCount: 4, locale: 'ru' });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    feature.init();

    // Simulate Cyrillic layout where key is 'л' but physical code is 'KeyK'
    const ev = env.dispatchKey('keydown', { key: 'л', code: 'KeyK', ctrlKey: true, target: env.promptInput });
    assert.equal(ev.defaultPrevented, true);
    assert.equal(ev.propagationStopped, true);

    const sidebar = env.getSidebar();
    assert.ok(sidebar, 'Ctrl+K should open the collapsed sidebar');
    assert.ok(sidebar.searchInput, 'Ctrl+K should enter Search threads mode');
    assert.equal(env.doc.activeElement, sidebar.searchInput, 'search input should be focused');
    assert.equal(sidebar.buttons[0].getAttribute(SEARCH_ACTIVE_ATTR), 'true');
    assert.equal(sidebar.rows[0].getAttribute(SEARCH_ACTIVE_ROW_ATTR), 'true');
    assert.equal(sidebar.buttons[0].getAttribute('aria-selected'), 'true');
    assert.equal(sidebar.searchInput.getAttribute('aria-activedescendant'), sidebar.buttons[0].id);

    // Pressing Ctrl+K again while focused in search toggles it closed and restores collapsed sidebar + prompt focus
    const closeEv = env.dispatchKey('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, target: sidebar.searchInput });
    assert.equal(closeEv.defaultPrevented, true);
    assert.equal(env.getSidebar(), null, 'sidebar opened via Ctrl+K should collapse on toggle');
    assert.equal(env.doc.activeElement, env.promptInput, 'focus should return to prompt textarea');

    feature.destroy();
  });

  it('keeps sidebar open when Escape/Ctrl+K closes search if user already had sidebar expanded beforehand', () => {
    const env = createFakeAiSearchEnv({ threadCount: 3 });
    const sidebar = env.mountSidebar({ inSearchMode: false });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    feature.init();

    env.doc.activeElement = env.promptInput;
    const openEv = env.dispatchKey('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, target: env.promptInput });
    assert.equal(openEv.defaultPrevented, true);
    assert.ok(sidebar.searchInput);
    assert.equal(env.doc.activeElement, sidebar.searchInput);

    const escEv = env.dispatchKey('keydown', { key: 'Escape', target: sidebar.searchInput });
    assert.equal(escEv.defaultPrevented, true);
    assert.equal(sidebar.searchInput, null, 'Escape should exit search mode');
    assert.ok(env.getSidebar(), 'sidebar that was already open should stay open');
    assert.equal(env.doc.activeElement, env.promptInput, 'focus should return to prompt textarea');

    feature.destroy();
  });

  it('re-focuses search input on Ctrl+K when search mode is open in sidebar but focus moved back to main prompt', () => {
    const env = createFakeAiSearchEnv({ threadCount: 3 });
    const sidebar = env.mountSidebar({ inSearchMode: true });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    feature.init();

    env.doc.activeElement = env.promptInput;
    const ev = env.dispatchKey('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, target: env.promptInput });
    assert.equal(ev.defaultPrevented, true);
    assert.equal(env.doc.activeElement, sidebar.searchInput);
    assert.equal(sidebar.searchInput.selectedCount, 1);

    feature.destroy();
  });

  it('navigates threads with ArrowDown and ArrowUp without blurring search input', () => {
    const env = createFakeAiSearchEnv({ threadCount: 4 });
    const sidebar = env.mountSidebar({ inSearchMode: true });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    feature.init();

    const down1 = env.dispatchKey('keydown', { key: 'ArrowDown', target: sidebar.searchInput });
    assert.equal(down1.defaultPrevented, true);
    assert.equal(down1.propagationStopped, true);
    assert.equal(env.doc.activeElement, sidebar.searchInput);
    assert.equal(sidebar.buttons[0].getAttribute(SEARCH_ACTIVE_ATTR), null);
    assert.equal(sidebar.rows[0].getAttribute(SEARCH_ACTIVE_ROW_ATTR), null);
    assert.equal(sidebar.buttons[1].getAttribute(SEARCH_ACTIVE_ATTR), 'true');
    assert.equal(sidebar.rows[1].getAttribute(SEARCH_ACTIVE_ROW_ATTR), 'true');
    assert.equal(sidebar.searchInput.getAttribute('aria-activedescendant'), sidebar.buttons[1].id);

    // ArrowUp wraps to bottom from index 0 on single tap
    env.dispatchKey('keydown', { key: 'ArrowUp', target: sidebar.searchInput });
    assert.equal(sidebar.buttons[0].getAttribute(SEARCH_ACTIVE_ATTR), 'true');
    env.dispatchKey('keydown', { key: 'ArrowUp', target: sidebar.searchInput });
    assert.equal(sidebar.buttons[3].getAttribute(SEARCH_ACTIVE_ATTR), 'true');

    // Held repeat at bottom clamps
    env.dispatchKey('keydown', { key: 'ArrowDown', repeat: true, target: sidebar.searchInput });
    assert.equal(sidebar.buttons[3].getAttribute(SEARCH_ACTIVE_ATTR), 'true');

    // Fresh tap at bottom wraps to top
    env.dispatchKey('keydown', { key: 'ArrowDown', repeat: false, target: sidebar.searchInput });
    assert.equal(sidebar.buttons[0].getAttribute(SEARCH_ACTIVE_ATTR), 'true');

    feature.destroy();
  });

  it('does not intercept typing, ArrowLeft/Right, Home/End, modifiers, or IME composition', () => {
    const env = createFakeAiSearchEnv({ threadCount: 3 });
    const sidebar = env.mountSidebar({ inSearchMode: true });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    feature.init();

    for (const keyProps of [
      { key: 'a' },
      { key: 'Backspace' },
      { key: 'ArrowLeft' },
      { key: 'ArrowRight' },
      { key: 'Home' },
      { key: 'End' },
      { key: 'ArrowDown', shiftKey: true },
      { key: 'ArrowUp', ctrlKey: true },
      { key: 'ArrowDown', metaKey: true },
      { key: 'ArrowDown', altKey: true },
      { key: 'ArrowDown', isComposing: true },
      { key: 'Enter', isComposing: true },
    ]) {
      const ev = env.dispatchKey('keydown', { target: sidebar.searchInput, ...keyProps });
      assert.equal(ev.defaultPrevented, false, `should not intercept ${JSON.stringify(keyProps)}`);
    }

    assert.equal(sidebar.buttons[0].getAttribute(SEARCH_ACTIVE_ATTR), 'true');
    assert.equal(env.doc.activeElement, sidebar.searchInput);
    feature.destroy();
  });

  it('activates highlighted thread on Enter while focused in search input, but not when Exit/Clear/Close is focused', () => {
    const env = createFakeAiSearchEnv({ threadCount: 3 });
    const sidebar = env.mountSidebar({ inSearchMode: true });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    feature.init();

    env.dispatchKey('keydown', { key: 'ArrowDown', target: sidebar.searchInput });
    assert.equal(sidebar.buttons[1].getAttribute(SEARCH_ACTIVE_ATTR), 'true');

    // Tabbed to Exit search or Clear text -> Enter works natively on button
    env.doc.activeElement = sidebar.clearBtn;
    const clearEnter = env.dispatchKey('keydown', { key: 'Enter', target: sidebar.clearBtn });
    assert.equal(clearEnter.defaultPrevented, false);
    assert.equal(sidebar.buttons[1].clickedCount, 0);

    // Focused in search input -> Enter clicks selected thread button
    env.doc.activeElement = sidebar.searchInput;
    const inputEnter = env.dispatchKey('keydown', { key: 'Enter', target: sidebar.searchInput });
    assert.equal(inputEnter.defaultPrevented, true);
    assert.equal(inputEnter.propagationStopped, true);
    assert.equal(sidebar.buttons[1].clickedCount, 1);

    feature.destroy();
  });

  it('scrolls sidebar viewport to keep active thread visible on ArrowDown, PageDown, and PageUp', () => {
    const env = createFakeAiSearchEnv({ threadCount: 10, rowHeight: 52, viewportHeight: 156 });
    const sidebar = env.mountSidebar({ inSearchMode: true });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    feature.init();

    // 3 rows fit in 156px viewport. Moving to index 3 scrolls viewport down.
    env.dispatchKey('keydown', { key: 'ArrowDown', target: sidebar.searchInput });
    env.dispatchKey('keydown', { key: 'ArrowDown', target: sidebar.searchInput });
    env.dispatchKey('keydown', { key: 'ArrowDown', target: sidebar.searchInput });
    assert.equal(sidebar.buttons[3].getAttribute(SEARCH_ACTIVE_ATTR), 'true');
    assert.ok(sidebar.viewport.scrollTop > 0);

    const beforePgDown = sidebar.viewport.scrollTop;
    const pgDown = env.dispatchKey('keydown', { key: 'PageDown', target: sidebar.searchInput });
    assert.equal(pgDown.defaultPrevented, true);
    assert.ok(sidebar.viewport.scrollTop > beforePgDown);

    const pgUp = env.dispatchKey('keydown', { key: 'PageUp', target: sidebar.searchInput });
    assert.equal(pgUp.defaultPrevented, true);
    assert.equal(env.doc.activeElement, sidebar.searchInput);

    feature.destroy();
  });

  it('resets selection to index 0 after query change (including shimmer loading) while preserving selection on infinite scroll', () => {
    const env = createFakeAiSearchEnv({ threadCount: 5 });
    const sidebar = env.mountSidebar({ inSearchMode: true });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    feature.init();

    env.dispatchKey('keydown', { key: 'ArrowDown', target: sidebar.searchInput });
    env.dispatchKey('keydown', { key: 'ArrowDown', target: sidebar.searchInput });
    const thirdBtn = sidebar.buttons[2];
    assert.equal(thirdBtn.getAttribute(SEARCH_ACTIVE_ATTR), 'true');

    // Infinite scroll appends another listitem -> preserve selection!
    const extraItem = createFakeNode('div', { classes: ['j8c53'], attrs: { role: 'listitem' } });
    const extraRow = createFakeNode('div', { classes: ['u987h'] });
    const extraBtn = createFakeNode('button', {
      classes: ['qqMZif'],
      attrs: { id: 'BAyyLethread-6', 'data-thread-id': 'thread-6' },
      textContent: 'Thread Title 6',
    });
    extraRow.appendChild(extraBtn);
    extraItem.appendChild(extraRow);
    sidebar.listRoot.appendChild(extraItem);
    feature.sync();
    assert.equal(thirdBtn.getAttribute(SEARCH_ACTIVE_ATTR), 'true', 'infinite scroll must preserve selection');

    // User types query -> shimmer loading -> filtered results arrive -> index 0 highlighted
    sidebar.searchInput.value = 'rust';
    sidebar.searchInput.dispatchEvent(createFakeEvent('input'));
    sidebar.showLoadingShimmer();
    feature.sync();
    assert.equal(feature.getActiveOption(), null);

    const filteredBtns = sidebar.populateThreads(['Rust async', 'Rust traits']);
    feature.sync();
    assert.equal(filteredBtns[0].getAttribute(SEARCH_ACTIVE_ATTR), 'true');
    assert.equal(sidebar.searchInput.getAttribute('aria-activedescendant'), filteredBtns[0].id);

    feature.destroy();
  });

  it('syncs selection on real pointermove without stationary cursor stealing keyboard selection', () => {
    const env = createFakeAiSearchEnv({ threadCount: 4 });
    const sidebar = env.mountSidebar({ inSearchMode: true });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    feature.init();

    sidebar.nav.dispatchEvent(
      createFakeEvent('pointermove', { clientX: 120, clientY: 220, target: sidebar.buttons[2] }),
    );
    assert.equal(sidebar.buttons[2].getAttribute(SEARCH_ACTIVE_ATTR), 'true');
    assert.equal(env.doc.activeElement, sidebar.searchInput);

    env.dispatchKey('keydown', { key: 'ArrowDown', target: sidebar.searchInput });
    assert.equal(sidebar.buttons[3].getAttribute(SEARCH_ACTIVE_ATTR), 'true');

    // Stationary cursor (same clientX/clientY) must not steal selection back
    sidebar.nav.dispatchEvent(
      createFakeEvent('pointermove', { clientX: 120, clientY: 220, target: sidebar.buttons[2] }),
    );
    assert.equal(sidebar.buttons[3].getAttribute(SEARCH_ACTIVE_ATTR), 'true');

    feature.destroy();
  });

  it('recovers focus to search input when user clicks scroll viewport and presses ArrowDown', () => {
    const env = createFakeAiSearchEnv({ threadCount: 4 });
    const sidebar = env.mountSidebar({ inSearchMode: true });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    feature.init();

    env.doc.activeElement = sidebar.viewport;
    const ev = env.dispatchKey('keydown', { key: 'ArrowDown', target: sidebar.viewport });
    assert.equal(ev.defaultPrevented, true);
    assert.equal(sidebar.buttons[1].getAttribute(SEARCH_ACTIVE_ATTR), 'true');
    assert.equal(env.doc.activeElement, sidebar.searchInput);

    feature.destroy();
  });

  it('restores focus to prompt textarea even when Google asynchronously steals focus on Close sidebar or Exit search', async () => {
    // Case 1: Collapsed sidebar -> Ctrl+K -> Escape; Google clears focus to body then focuses Open sidebar after transition
    const env1 = createFakeAiSearchEnv({ threadCount: 3 });
    const feature1 = createSearchThreadsFeature({ doc: env1.doc, observe: false });
    feature1.init();

    env1.dispatchKey('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, target: env1.promptInput });
    const sidebar1 = env1.getSidebar();
    assert.ok(sidebar1?.searchInput);

    sidebar1.closeSidebarBtn.addEventListener('click', () => {
      // Simulate Google's collapse behavior: immediately drops focus to body, then focuses Open sidebar after transition
      env1.doc.activeElement = env1.body;
      setTimeout(() => {
        env1.openSidebarBtn.focus();
      }, 20);
    });

    env1.dispatchKey('keydown', { key: 'Escape', target: sidebar1.searchInput });
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(
      env1.doc.activeElement,
      env1.promptInput,
      'focus must return to prompt textarea after async Close sidebar transition',
    );
    feature1.destroy();

    // Case 2: Already-open sidebar -> Ctrl+K -> Escape; Google asynchronously focuses "Search threads" button
    const env2 = createFakeAiSearchEnv({ threadCount: 3 });
    const sidebar2 = env2.mountSidebar({ inSearchMode: false });
    const feature2 = createSearchThreadsFeature({ doc: env2.doc, observe: false });
    feature2.init();

    env2.doc.activeElement = env2.promptInput;
    env2.dispatchKey('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, target: env2.promptInput });
    assert.ok(sidebar2.searchInput);

    sidebar2.exitSearchBtn.addEventListener('click', () => {
      setTimeout(() => {
        sidebar2.searchThreadsBtn?.focus();
      }, 15);
    });

    env2.dispatchKey('keydown', { key: 'Escape', target: sidebar2.searchInput });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(
      env2.doc.activeElement,
      env2.promptInput,
      'focus must return to prompt textarea after async Exit search focus steal',
    );
    feature2.destroy();
  });

  it('cancels Escape focus restoration immediately if the user clicks or presses Tab elsewhere', async () => {
    const env = createFakeAiSearchEnv({ threadCount: 3 });
    const feature = createSearchThreadsFeature({ doc: env.doc, observe: false });
    feature.init();

    env.dispatchKey('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, target: env.promptInput });
    const sidebar = env.getSidebar();
    env.dispatchKey('keydown', { key: 'Escape', target: sidebar.searchInput });
    assert.equal(env.doc.activeElement, env.promptInput);

    // User clicks Open sidebar intentionally -> must not be overridden back to prompt
    env.doc.dispatchEvent(createFakeEvent('pointerdown', { target: env.openSidebarBtn }));
    env.openSidebarBtn.focus();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(env.doc.activeElement, env.openSidebarBtn);

    feature.destroy();
  });
});
