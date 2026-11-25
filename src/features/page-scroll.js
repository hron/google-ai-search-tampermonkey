import {
  SIDEBAR_SELECTOR,
  createDocumentScrollerOptions,
  findThreadScroller,
  isAiModePage,
  isPromptInputElement,
} from '../lib/dom.js';
import { createSmoothPageScroller } from '../lib/scrolling.js';

export const PAGE_SCROLL_FEATURE_ID = 'page-scroll';

const PAGE_SCROLL_OVERLAY_SELECTOR =
  '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]';
const PAGE_SCROLL_EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function getPageScrollElementNode(node) {
  if (!node) return null;
  if (typeof node.closest === 'function') return node;
  return node.parentElement && typeof node.parentElement.closest === 'function'
    ? node.parentElement
    : null;
}

function isInsidePageScrollOverlay(el) {
  return Boolean(el && el.closest(PAGE_SCROLL_OVERLAY_SELECTOR));
}

function isInsideSidebar(el) {
  return Boolean(el && el.closest(SIDEBAR_SELECTOR));
}

function isPageScrollEditableControl(el) {
  if (!el) return false;
  if (PAGE_SCROLL_EDITABLE_TAGS.has(el.tagName)) return true;
  if (el.isContentEditable === true) return true;
  if (typeof el.getAttribute === 'function') {
    const ce = el.getAttribute('contenteditable');
    if (ce === 'true' || ce === '') return true;
    if (el.getAttribute('role') === 'textbox') return true;
  }
  return false;
}

function hasNestedVerticalScroller(el, threadScroller) {
  let cur = el;
  while (cur && cur !== threadScroller) {
    if (
      typeof cur.scrollHeight === 'number' &&
      typeof cur.clientHeight === 'number' &&
      cur.scrollHeight > cur.clientHeight + 1
    ) {
      const view = cur.ownerDocument?.defaultView;
      let overflowY = null;
      try {
        overflowY = view?.getComputedStyle?.(cur)?.overflowY || null;
      } catch {
        overflowY = null;
      }
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
        return true;
      }
    }
    cur = cur.parentElement;
  }
  return false;
}

function shouldHandlePageScroll(event, doc, scroller) {
  if (!event || (event.key !== 'PageUp' && event.key !== 'PageDown')) {
    return false;
  }
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing) {
    return false;
  }
  if (!isAiModePage(doc)) {
    return false;
  }
  if (!scroller) return false;
  if (
    typeof scroller.scrollHeight === 'number' &&
    typeof scroller.clientHeight === 'number' &&
    scroller.scrollHeight <= scroller.clientHeight + 1
  ) {
    return false;
  }

  const activeEl = getPageScrollElementNode(doc.activeElement);
  const targetEl = getPageScrollElementNode(event.target);

  if (isInsidePageScrollOverlay(activeEl) || isInsidePageScrollOverlay(targetEl)) {
    return false;
  }

  if (isInsideSidebar(activeEl) || isInsideSidebar(targetEl)) {
    return false;
  }

  if (isPromptInputElement(activeEl) || isPromptInputElement(targetEl)) {
    return true;
  }

  if (isPageScrollEditableControl(activeEl) || isPageScrollEditableControl(targetEl)) {
    return false;
  }

  if (
    hasNestedVerticalScroller(activeEl, scroller) ||
    hasNestedVerticalScroller(targetEl, scroller)
  ) {
    return false;
  }

  if (!activeEl || activeEl === doc.body || activeEl === doc.documentElement) {
    return true;
  }

  return Boolean(activeEl.closest('[role="main"]') || activeEl === scroller);
}

export function createPageScrollFeature({ doc = document } = {}) {
  const view = doc.defaultView || null;
  const keyTarget = view || doc;
  const pageScroller = createSmoothPageScroller(createDocumentScrollerOptions(doc));

  function handleKeyDown(event) {
    const scroller = findThreadScroller(doc);
    if (!shouldHandlePageScroll(event, doc, scroller)) {
      return;
    }

    const direction = event.key === 'PageUp' ? -1 : 1;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    if (!event.repeat || !pageScroller.isActive()) {
      pageScroller.press(direction);
    }
  }

  function handleKeyUp(event) {
    if (event.key === 'PageUp') {
      pageScroller.release(-1);
    } else if (event.key === 'PageDown') {
      pageScroller.release(1);
    }
  }

  function handleWindowBlur() {
    pageScroller.stop();
  }

  function init() {
    keyTarget.addEventListener('keydown', handleKeyDown, true);
    keyTarget.addEventListener('keyup', handleKeyUp, true);
    keyTarget.addEventListener('blur', handleWindowBlur);
  }

  function destroy() {
    pageScroller.stop();
    keyTarget.removeEventListener('keydown', handleKeyDown, true);
    keyTarget.removeEventListener('keyup', handleKeyUp, true);
    keyTarget.removeEventListener('blur', handleWindowBlur);
  }

  return {
    id: PAGE_SCROLL_FEATURE_ID,
    init,
    destroy,
  };
}
