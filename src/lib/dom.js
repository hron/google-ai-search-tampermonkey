export const AI_MODE_MARKER_SELECTOR =
  'div[data-xid="aim-mars-input-plate"], div[data-xid="aim-zero-state-input-plate"], div[data-xid="aim-mars-turn-root"], div[data-xid="aim-zero-state"], [data-xid="BVEPif"][role="navigation"]';

export const PROMPT_INPUT_SELECTOR =
  'div[data-xid$="-input-plate"] textarea, div[data-xid$="-input-plate"] [contenteditable="true"], textarea.ITIRGe, textarea[aria-label="Ask anything"]';

export const SIDEBAR_SELECTOR =
  '[role="navigation"][data-xid="BVEPif"], [role="navigation"][aria-label="AI Mode history"], nav[aria-label="AI Mode history"]';

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
