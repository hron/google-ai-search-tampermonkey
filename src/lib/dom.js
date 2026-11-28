export const AI_MODE_MARKER_SELECTOR =
  'div[data-xid="aim-mars-input-plate"], div[data-xid="aim-zero-state-input-plate"], div[data-xid="aim-mars-turn-root"], div[data-xid="aim-zero-state"], [role="navigation"][aria-label="AI Mode history"], nav[aria-label="AI Mode history"], [data-xid="BVEPif"][role="navigation"]';

export const PROMPT_INPUT_SELECTOR =
  'div[data-xid$="-input-plate"] textarea, div[data-xid$="-input-plate"] [contenteditable="true"], textarea[aria-label="Ask anything"], textarea.ITIRGe';

export const SIDEBAR_SELECTOR =
  '[role="navigation"][aria-label="AI Mode history"], nav[aria-label="AI Mode history"], [role="navigation"][data-xid="BVEPif"]';

export const OPEN_SIDEBAR_BUTTON_SELECTOR =
  'button[aria-label="Open sidebar"]:not([disabled]), button[jsname="JIu0P"]:not([disabled]), button.ONx74b:not([disabled])';

const SIDEBAR_CONTENT_MARKER_SELECTOR =
  '[data-xid="threads-list-root"], [data-xid="aim-threads-view"]';

const SIDEBAR_THREAD_LIST_SELECTOR =
  '[data-xid="threads-list-root"], [data-xid="aim-threads-view"], [role="list"]';

const SIDEBAR_SEARCH_INPUT_SELECTOR =
  'input[type="search"], input[placeholder*="Search" i]:not([type="hidden"]), input[type="text"]:not([type="hidden"])';

// User prompt bubbles inside the AI Mode conversation thread
export const USER_PROMPT_SELECTOR = '.ilZyRc.R7mRQb, .Ax52xb';

export function isElementHidden(el, stopAt) {
  let cur = el;
  while (cur) {
    if (cur.hidden === true) return true;
    if (typeof cur.getAttribute === 'function') {
      if (cur.getAttribute('aria-hidden') === 'true') return true;
      if (cur.getAttribute('hidden') !== null) return true;
    }
    const view = cur.ownerDocument?.defaultView;
    if (view && typeof view.getComputedStyle === 'function') {
      try {
        const style = view.getComputedStyle(cur);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) {
          return true;
        }
      } catch {
        // Ignore computed style errors on detached/mocked nodes
      }
    }
    if (cur === stopAt) break;
    cur = cur.parentElement;
  }
  return false;
}

export function isSidebarElement(el) {
  if (!el) return false;
  if (typeof el.matches === 'function' && el.matches(SIDEBAR_SELECTOR)) return true;
  const isNav =
    el.tagName === 'NAV' ||
    (typeof el.getAttribute === 'function' && el.getAttribute('role') === 'navigation');
  if (!isNav) return false;
  return Boolean(
    typeof el.querySelector === 'function' && el.querySelector(SIDEBAR_CONTENT_MARKER_SELECTOR),
  );
}

export function findSidebarElement(doc = document) {
  if (!doc || typeof doc.querySelector !== 'function') return null;
  const direct = doc.querySelector(SIDEBAR_SELECTOR);
  if (direct) return direct;
  if (typeof doc.querySelectorAll !== 'function') return null;
  for (const nav of doc.querySelectorAll('[role="navigation"], nav')) {
    if (isSidebarElement(nav)) return nav;
  }
  return null;
}

export function findVisibleSidebarElement(doc = document) {
  const sidebar = findSidebarElement(doc);
  if (!sidebar || isElementHidden(sidebar, sidebar)) return null;
  return sidebar;
}

export function isInsideSidebarElement(el) {
  if (!el || typeof el.closest !== 'function') return false;
  if (el.closest(SIDEBAR_SELECTOR)) return true;
  const nav = el.closest('[role="navigation"], nav');
  return Boolean(nav && isSidebarElement(nav));
}

export function isInsideSidebarThreadList(el) {
  return Boolean(el && typeof el.closest === 'function' && el.closest(SIDEBAR_THREAD_LIST_SELECTOR));
}

export function findSidebarSearchInput(container) {
  if (!container || typeof container.querySelector !== 'function') return null;
  const direct = container.querySelector(SIDEBAR_SEARCH_INPUT_SELECTOR);
  if (direct) return direct;
  if (typeof container.querySelectorAll !== 'function') return null;
  return (
    Array.from(container.querySelectorAll('input')).find((el) => {
      const type = (el.getAttribute?.('type') || 'text').toLowerCase();
      return type === 'text' || type === 'search';
    }) || null
  );
}

export function findOpenSidebarButton(doc = document) {
  if (!doc || typeof doc.querySelector !== 'function') return null;
  if (typeof doc.querySelectorAll === 'function') {
    for (const btn of doc.querySelectorAll(OPEN_SIDEBAR_BUTTON_SELECTOR)) {
      if (!isElementHidden(btn)) return btn;
    }
    return null;
  }
  const btn = doc.querySelector(OPEN_SIDEBAR_BUTTON_SELECTOR);
  return btn && !isElementHidden(btn) ? btn : null;
}

export function findCloseSidebarButton(sidebar) {
  if (!sidebar || typeof sidebar.querySelector !== 'function') return null;
  const byAria = sidebar.querySelector('button[aria-label="Close sidebar"]:not([disabled])');
  if (byAria && !isElementHidden(byAria, sidebar)) return byAria;

  // Structural fallback (locale-independent): first enabled icon/aria-labeled
  // button in the sidebar header outside the thread list and search input bar.
  if (typeof sidebar.querySelectorAll === 'function') {
    const searchInput = findSidebarSearchInput(sidebar);
    const searchBar = searchInput?.parentElement || null;
    for (const btn of sidebar.querySelectorAll('button[aria-label]:not([disabled])')) {
      if (isElementHidden(btn, sidebar)) continue;
      if (btn.getAttribute?.('data-thread-id')) continue;
      if (isInsideSidebarThreadList(btn)) continue;
      if (searchBar && searchBar.contains?.(btn)) continue;
      return btn;
    }
  }

  const byClass = sidebar.querySelector('button.OxKcRe:not([disabled])');
  return byClass && !isElementHidden(byClass, sidebar) ? byClass : null;
}

export function toPageOptions(obj, doc = document) {
  const view = doc?.defaultView;
  if (typeof cloneInto === 'function' && view) {
    try {
      return cloneInto(obj, view);
    } catch {
      return obj;
    }
  }
  return obj;
}

export function isAiModePage(doc = document) {
  if (!doc) return false;
  const search = doc.defaultView?.location?.search ?? doc.location?.search ?? '';
  if (search) {
    try {
      if (new URLSearchParams(search).get('udm') === '50') {
        return true;
      }
    } catch {
      // Ignore malformed search strings
    }
  }
  if (typeof doc.querySelector === 'function') {
    return Boolean(doc.querySelector(AI_MODE_MARKER_SELECTOR));
  }
  return false;
}

export function findPromptInput(doc = document) {
  if (!doc || typeof doc.querySelector !== 'function') return null;
  return doc.querySelector(PROMPT_INPUT_SELECTOR);
}

export function resolvePromptInputElement(node) {
  if (!node) return null;
  const el = typeof node.closest === 'function' ? node : node.parentElement;
  if (!el || typeof el.closest !== 'function') return null;
  return el.closest(PROMPT_INPUT_SELECTOR);
}

export function isPromptInputElement(node) {
  return Boolean(resolvePromptInputElement(node));
}

export function focusElement(el, doc = document, { select = false } = {}) {
  if (!el || typeof el.focus !== 'function') return;
  try {
    el.focus(toPageOptions({ preventScroll: true }, doc));
  } catch {
    el.focus();
  }
  if (select && typeof el.select === 'function') {
    try {
      el.select();
    } catch {
      // Ignore selection errors on non-selectable elements
    }
  }
}

function isVerticallyScrollableElement(el, doc) {
  if (!el) return false;
  if (
    typeof el.scrollHeight !== 'number' ||
    typeof el.clientHeight !== 'number' ||
    el.scrollHeight <= el.clientHeight + 1
  ) {
    return false;
  }
  const view = el.ownerDocument?.defaultView || doc?.defaultView;
  let overflowY = null;
  try {
    overflowY = view?.getComputedStyle?.(el)?.overflowY || null;
  } catch {
    overflowY = null;
  }
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
}

export function findThreadScroller(doc = document) {
  if (!doc) return null;

  if (typeof doc.querySelector === 'function') {
    const turnRoot = doc.querySelector('[data-xid="aim-mars-turn-root"]');
    if (isVerticallyScrollableElement(turnRoot, doc)) {
      return turnRoot;
    }

    const mainEl = doc.querySelector('[role="main"]');
    if (isVerticallyScrollableElement(mainEl, doc)) {
      return mainEl;
    }
  }

  return doc.scrollingElement || doc.documentElement || doc.body || null;
}

function isDocumentScroller(scroller, doc) {
  return scroller === doc.scrollingElement || scroller === doc.documentElement || scroller === doc.body;
}

/**
 * Returns the positions of user prompts in the scroller's scrollTop coordinates.
 */
export function findUserPromptOffsets(doc = document, scroller = findThreadScroller(doc)) {
  if (!doc || !scroller || typeof doc.querySelectorAll !== 'function') return [];
  let baseTop = 0;
  if (!isDocumentScroller(scroller, doc) && typeof scroller.getBoundingClientRect === 'function') {
    baseTop = scroller.getBoundingClientRect().top || 0;
  }
  const scrollTop = scroller.scrollTop || 0;
  const offsets = [];
  for (const el of Array.from(doc.querySelectorAll(USER_PROMPT_SELECTOR))) {
    if (typeof el.getBoundingClientRect !== 'function') continue;
    const rect = el.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) continue;
    offsets.push(rect.top - baseTop + scrollTop);
  }
  return offsets;
}

export function createDocumentScrollerOptions(doc = document) {
  const view = doc?.defaultView || null;
  return {
    getScroller: () => findThreadScroller(doc),
    requestFrame:
      view && typeof view.requestAnimationFrame === 'function'
        ? (cb) => view.requestAnimationFrame(cb)
        : null,
    cancelFrame:
      view && typeof view.cancelAnimationFrame === 'function'
        ? (id) => view.cancelAnimationFrame(id)
        : null,
    prefersReducedMotion: () => {
      try {
        return Boolean(view?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
      } catch {
        return false;
      }
    },
  };
}

export function injectStyles(css, styleId, doc = document) {
  if (typeof GM_addStyle === 'function') {
    try {
      const added = GM_addStyle(css);
      if (!added || added.sheet || !doc?.head) {
        return;
      }
    } catch {
      // Fall through to manual <style> injection
    }
  }
  if (!doc || typeof doc.querySelector !== 'function') return;
  if (doc.querySelector(`style[data-gaism-style-id="${styleId}"]`)) return;

  const styleEl = doc.createElement('style');
  styleEl.setAttribute('data-gaism-style-id', styleId);
  styleEl.textContent = css;
  const container = doc.head || doc.documentElement || doc.body;
  if (container && typeof container.appendChild === 'function') {
    container.appendChild(styleEl);
  }
}
